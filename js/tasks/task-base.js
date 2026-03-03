import * as THREE from 'three';
import { GameState } from '../core/constants.js';
import { BillboardSprite } from '../sprites/billboard-sprite.js';
import { clamp } from '../utils/math-utils.js';

const HIGHLIGHT_FADE_FAR = 15;  // fully invisible beyond this
const HIGHLIGHT_FADE_NEAR = 5;  // fully visible within this
const HIGHLIGHT_PULSE_SPEED = 3;
const WIREFRAME_SPIN_SPEED = 0.5;

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
    this._highlightBillboard = null;
    this._wireframe = null;
    this._wireframeMat = null;
    this._highlightTimer = 0;
  }

  placeTrigger() {
    if (this._triggerMesh) return;

    const geo = new THREE.BoxGeometry(0.8, 1.6, 0.8);
    const mat = new THREE.MeshBasicMaterial({ visible: false });
    this._triggerMesh = new THREE.Mesh(geo, mat);

    const [x, y, z] = this.triggerPosition;
    this._triggerMesh.position.set(x, y, z);

    this._triggerMesh.userData.interactable = {
      promptText: `[E] ${this.title}`,
      interact: () => this.start(),
    };

    this.game.scene.add(this._triggerMesh);
    this.game.player.interaction.addInteractable(this._triggerMesh);

    this._createHighlight(x, y, z);
  }

  _createHighlight(x, y, z) {
    // ASCII billboard marker floating above trigger
    this._highlightBillboard = new BillboardSprite(['[!]'], '#00ff41');
    this._highlightBillboard.sprite.scale.multiplyScalar(0.5);
    this._highlightBillboard.sprite.material.opacity = 0;
    this._highlightBillboard.setPosition(x, y + 1.2, z);
    this._highlightBillboard.addTo(this.game.scene);

    // Wireframe outline around trigger area
    const wireGeo = new THREE.BoxGeometry(0.8, 1.6, 0.8);
    const edges = new THREE.EdgesGeometry(wireGeo);
    this._wireframeMat = new THREE.LineBasicMaterial({
      color: 0x00ff41,
      transparent: true,
      opacity: 0,
    });
    this._wireframe = new THREE.LineSegments(edges, this._wireframeMat);
    this._wireframe.position.set(x, y, z);
    this._wireframe.frustumCulled = false;
    this.game.scene.add(this._wireframe);
  }

  _removeHighlight() {
    if (this._highlightBillboard) {
      this._highlightBillboard.removeFromParent();
      this._highlightBillboard.dispose();
      this._highlightBillboard = null;
    }
    if (this._wireframe) {
      this.game.scene.remove(this._wireframe);
      this._wireframe.geometry.dispose();
      this._wireframeMat.dispose();
      this._wireframe = null;
      this._wireframeMat = null;
    }
  }

  updateHighlight(dt, playerPos) {
    if (!this._highlightBillboard || !this._wireframe) return;

    this._highlightTimer += dt;

    // Distance-based fade
    const [tx, ty, tz] = this.triggerPosition;
    const dx = tx - playerPos.x;
    const dz = tz - playerPos.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    const fade = clamp((HIGHLIGHT_FADE_FAR - dist) / (HIGHLIGHT_FADE_FAR - HIGHLIGHT_FADE_NEAR), 0, 1);

    // Breathing pulse
    const pulse = 0.5 + 0.5 * Math.sin(this._highlightTimer * HIGHLIGHT_PULSE_SPEED);

    // Apply to billboard
    const billboardOpacity = fade * pulse;
    this._highlightBillboard.sprite.material.opacity = billboardOpacity;
    this._highlightBillboard.update(dt);

    // Apply to wireframe
    this._wireframeMat.opacity = fade * pulse * 0.7;
    this._wireframe.rotation.y += WIREFRAME_SPIN_SPEED * dt;
  }

  removeTrigger() {
    if (!this._triggerMesh) return;

    this.game.player.interaction.removeInteractable(this._triggerMesh);
    this.game.scene.remove(this._triggerMesh);
    this._triggerMesh.geometry.dispose();
    this._triggerMesh.material.dispose();
    this._triggerMesh = null;

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

  getTaskData() {
    return {
      id: this.id,
      title: this.title,
      location: this.location,
      status: this.state,
      roomId: this.roomId,
      triggerPosition: this.triggerPosition,
    };
  }

  _freezePlayer() {
    this.game.player.movementEnabled = false;
    this.game.player.mouseLookEnabled = false;
    this.game.input.releasePointerLock();

    const prompt = document.getElementById('interact-prompt');
    if (prompt) prompt.classList.remove('visible');
  }

  _unfreezePlayer() {
    this.game.player.movementEnabled = true;
    this.game.player.mouseLookEnabled = true;
    this.game.state = GameState.PLAYING;
    this.game.input.requestPointerLock();
  }

  _createOverlay() {
    if (this._overlay) return;

    const overlay = document.createElement('div');
    overlay.className = 'task-overlay';
    this._overlay = overlay;

    this._buildUI(overlay);

    document.getElementById('ui-root').appendChild(overlay);

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

    if (this._overlay) {
      this._overlay.remove();
      this._overlay = null;
    }
  }

  // Abstract — override in subclasses
  _buildUI(_container) {}
}
