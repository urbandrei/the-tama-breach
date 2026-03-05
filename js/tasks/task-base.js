import * as THREE from 'three';
import { GameState } from '../core/constants.js';
import { clamp } from '../utils/math-utils.js';

const HIGHLIGHT_FADE_FAR = 15;  // fully invisible beyond this
const HIGHLIGHT_FADE_NEAR = 5;  // fully visible within this

export const TaskState = Object.freeze({
  PENDING: 'pending',
  ACTIVE: 'active',
  COMPLETED: 'completed',
  FAILED: 'failed',
});

export class TaskBase {
  constructor(game, config) {
    this.game = game;
    this.id = config.id;
    this.type = config.type;
    this.title = config.title;
    this.roomId = config.roomId;
    this.location = config.location;
    this.triggerPosition = config.triggerPosition;
    this.config = config;

    this.state = TaskState.PENDING;
    this._overlay = null;
    this._triggerMesh = null;
    this._escHandler = null;

    // Highlight visuals
    this._highlightMeshes = [];
    this._highlightEdges = [];
    this._highlightTimer = 0;
    this._interactableMeshes = [];  // prop meshes registered as interactables
    this._propWorldPos = null;
  }

  placeTrigger() {
    if (this._triggerMesh || this._interactableMeshes.length > 0) return;

    const [x, y, z] = this.triggerPosition;
    const interactData = {
      promptText: `[E] ${this.title}`,
      interact: () => this.start(),
    };

    this._createHighlight(x, y, z);

    const self = this;
    const checkCondition = () => self.shouldShowOnMap();

    // If highlight found prop meshes, use them as interactables directly
    if (this._highlightMeshes.length > 0) {
      for (const entry of this._highlightMeshes) {
        entry.mesh.userData.interactable = interactData;
        entry.mesh.userData._checkCondition = checkCondition;
        this.game.player.interaction.addInteractable(entry.mesh);
        this._interactableMeshes.push(entry.mesh);
      }
    } else {
      // Fallback: invisible trigger box when no props nearby
      const geo = new THREE.BoxGeometry(0.8, 1.6, 0.8);
      const mat = new THREE.MeshBasicMaterial({ visible: false });
      this._triggerMesh = new THREE.Mesh(geo, mat);
      this._triggerMesh.position.set(x, y, z);
      this._triggerMesh.userData.interactable = interactData;
      this._triggerMesh.userData._checkCondition = checkCondition;
      this.game.scene.add(this._triggerMesh);
      this.game.player.interaction.addInteractable(this._triggerMesh);
    }
  }

  _createHighlight(x, y, z) {
    const roomProps = this.game.facility && this.game.facility.roomProps[this.roomId];
    if (!roomProps || roomProps.length === 0) return;

    // Find nearest prop group to trigger position
    let nearest = null;
    let nearestDist = Infinity;
    const _pos = new THREE.Vector3();
    for (const group of roomProps) {
      group.getWorldPosition(_pos);
      const dx = _pos.x - x;
      const dz = _pos.z - z;
      const d = dx * dx + dz * dz;
      if (d < nearestDist) {
        nearestDist = d;
        nearest = group;
      }
    }
    if (!nearest) return;

    // Store prop world position for minimap dots
    nearest.getWorldPosition(_pos);
    this._propWorldPos = { x: _pos.x, z: _pos.z };

    // Clone materials on visible meshes for green glow + add edge lines
    nearest.traverse((child) => {
      if (!child.isMesh) return;
      if (!child.material || !child.material.visible) return;
      const originalMat = child.material;
      const cloned = originalMat.clone();
      this._highlightMeshes.push({ mesh: child, originalMat });
      child.material = cloned;

      // Green edge lines on each mesh
      const edgesGeo = new THREE.EdgesGeometry(child.geometry);
      const edgesMat = new THREE.LineBasicMaterial({
        color: 0x00ff41,
        transparent: true,
        opacity: 0,
      });
      const lines = new THREE.LineSegments(edgesGeo, edgesMat);
      lines.raycast = () => {}; // non-interactive
      child.add(lines);
      this._highlightEdges.push(lines);
    });
  }

  _removeHighlight() {
    for (const lines of this._highlightEdges) {
      lines.parent.remove(lines);
      lines.geometry.dispose();
      lines.material.dispose();
    }
    this._highlightEdges = [];
    for (const entry of this._highlightMeshes) {
      entry.mesh.material.dispose();
      entry.mesh.material = entry.originalMat;
    }
    this._highlightMeshes = [];
  }

  updateHighlight(dt, playerPos) {
    if (this._highlightMeshes.length === 0) return;

    this._highlightTimer += dt;

    // Distance-based fade
    const [tx, , tz] = this.triggerPosition;
    const dx = tx - playerPos.x;
    const dz = tz - playerPos.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    const fade = clamp((HIGHLIGHT_FADE_FAR - dist) / (HIGHLIGHT_FADE_FAR - HIGHLIGHT_FADE_NEAR), 0, 1);

    // Subtle green emissive tint (keeps original colors)
    for (const entry of this._highlightMeshes) {
      if (!entry.mesh.material.emissive) continue;
      entry.mesh.material.emissive.setHex(0x00ff41);
      entry.mesh.material.emissiveIntensity = 0.15 * fade;
    }

    // Edge lines
    for (const lines of this._highlightEdges) {
      lines.material.opacity = 0.6 * fade;
    }
  }

  removeTrigger() {
    // Remove prop-based interactables
    for (const mesh of this._interactableMeshes) {
      delete mesh.userData.interactable;
      this.game.player.interaction.removeInteractable(mesh);
    }
    this._interactableMeshes = [];

    // Remove fallback invisible trigger
    if (this._triggerMesh) {
      this.game.player.interaction.removeInteractable(this._triggerMesh);
      this.game.scene.remove(this._triggerMesh);
      this._triggerMesh.geometry.dispose();
      this._triggerMesh.material.dispose();
      this._triggerMesh = null;
    }

    this._removeHighlight();
  }

  start() {
    if (this.state !== TaskState.PENDING && this.state !== TaskState.FAILED) return;
    if (this.game.state !== GameState.PLAYING) return;

    this.state = TaskState.ACTIVE;
    this.game.state = GameState.TASK_ACTIVE;
    this._freezePlayer();
    this._createOverlay();
    this.game.emit('task:started', { taskId: this.id, type: this.type, roomId: this.roomId });
  }

  complete() {
    if (this.state !== TaskState.ACTIVE) return;

    this.state = TaskState.COMPLETED;
    this._destroyOverlay();
    this._unfreezePlayer();
    this.removeTrigger();
    this.game.emit('task:completed', { taskId: this.id, type: this.type, roomId: this.roomId });
  }

  fail() {
    if (this.state !== TaskState.ACTIVE) return;

    this.state = TaskState.FAILED;
    this._destroyOverlay();
    this._unfreezePlayer();
    this.game.emit('task:failed', { taskId: this.id, type: this.type, roomId: this.roomId });
  }

  abort() {
    if (this.state !== TaskState.ACTIVE) return;

    this._destroyOverlay();
    this._unfreezePlayer();
    this.state = TaskState.PENDING;
    this.game.emit('task:aborted', { taskId: this.id, type: this.type, roomId: this.roomId });
  }

  update(_dt) {
    // Override in subclasses
  }

  shouldShowOnMap() {
    if (this.state === 'active') return true;

    // While carrying: hide non-active tasks (only destination matters)
    if (this.game.player.isCarryingItem) return false;

    // During breach: only show repair + infra tasks
    const cm = this.game.creatureManager;
    if (cm && cm.creatures.size > 0) {
      let breachActive = false;
      for (const [, c] of cm.creatures) {
        if (!c.returned) { breachActive = true; break; }
      }
      if (breachActive) {
        return this.id.startsWith('repair_') || this.id.startsWith('infra_repair_');
      }
    }

    return true;
  }

  getTaskData() {
    return {
      id: this.id,
      title: this.title,
      location: this.location,
      status: this.state,
      roomId: this.roomId,
      triggerPosition: this.triggerPosition,
      propWorldPos: this._propWorldPos,
    };
  }

  _freezePlayer() {
    this.game.player.movementEnabled = false;
    this.game.player.mouseLookEnabled = false;

    const prompt = document.getElementById('interact-prompt');
    if (prompt) prompt.classList.remove('visible');
  }

  _unfreezePlayer() {
    this.game.player.movementEnabled = true;
    this.game.player.mouseLookEnabled = true;
    if (this.game.state === GameState.TASK_ACTIVE) {
      this.game.state = GameState.PLAYING;
    }

    // Deactivate software cursor (task screen closing)
    if (this.game.softwareCursor) {
      this.game.softwareCursor.deactivate();
    }
  }

  _createOverlay() {
    if (this._overlay) return;

    // Backdrop captures clicks outside the task screen
    this._backdrop = document.createElement('div');
    this._backdrop.className = 'screen-backdrop task-backdrop';
    document.getElementById('ui-root').appendChild(this._backdrop);

    const overlay = document.createElement('div');
    overlay.className = 'task-overlay';
    this._overlay = overlay;

    this._buildUI(overlay);

    document.getElementById('ui-root').appendChild(overlay);

    // Activate software cursor if pointer lock is active (keeps cursor confined to task screen)
    if (this.game.softwareCursor && this.game.input.isPointerLocked) {
      this.game.softwareCursor.activate(overlay);
    }

    // ESC to abort
    this._escHandler = (e) => {
      if (e.code === 'Escape') {
        e.preventDefault();
        this.abort();
      }
    };
    document.addEventListener('keydown', this._escHandler);
  }

  _destroyOverlay() {
    if (this._escHandler) {
      document.removeEventListener('keydown', this._escHandler);
      this._escHandler = null;
    }

    if (this._backdrop) {
      this._backdrop.remove();
      this._backdrop = null;
    }

    if (this._overlay) {
      this._overlay.remove();
      this._overlay = null;
    }
  }

  // Abstract — override in subclasses
  _buildUI(_container) {}
}
