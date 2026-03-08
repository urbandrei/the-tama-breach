import * as THREE from 'three';
import { PERSONALITIES, ROOM_TO_TAMA } from '../tamagotchi/personality.js';
import { rooms } from './layout-data.js';

const CONTAINMENT_ROOMS = ['contain_a', 'contain_b', 'contain_c', 'contain_d'];
const BASE_FAIL_INTERVAL = [60, 180]; // seconds before a camera can fail
const GRACE_PERIOD = 90; // seconds before cameras start failing
const REPAIR_HOLD_DURATION = 3.0; // seconds to hold E

const HIGHLIGHT_FADE_FAR = 15;
const HIGHLIGHT_FADE_NEAR = 5;

export class CameraSystem {
  constructor(game) {
    this.game = game;
    this.cameras = {};
    this._active = false;
    this._graceTimer = GRACE_PERIOD;
    this._difficultyScale = 1.0;
    this._repairTriggers = {}; // roomId -> trigger mesh
    this._activeRooms = new Set(CONTAINMENT_ROOMS); // rooms with creatures

    // Initialize per-room camera state
    for (const roomId of CONTAINMENT_ROOMS) {
      this.cameras[roomId] = {
        operational: true,
        failTimer: this._randomInterval(),
        propLed: null,
        propGroup: null,
        highlightEdges: [],
        highlightMeshes: [],
      };
    }
  }

  /** Set LED mesh + prop group references from camera props. */
  setCameraProps(cameraProps) {
    for (const [roomId, ref] of Object.entries(cameraProps)) {
      if (!this.cameras[roomId]) continue;
      if (ref.led) {
        this.cameras[roomId].propLed = ref.led;
      }
      if (ref.group) {
        this.cameras[roomId].propGroup = ref.group;
      }
    }
  }

  isCameraUp(roomId) {
    const cam = this.cameras[roomId];
    return cam ? cam.operational : true; // non-camera rooms always "up"
  }

  /** Returns positions of offline cameras for minimap dots. */
  getOfflineCameraPositions() {
    const result = [];
    for (const [roomId, cam] of Object.entries(this.cameras)) {
      if (cam.operational) continue;
      const trigger = this._repairTriggers[roomId];
      if (trigger) {
        result.push({ roomId, x: trigger.position.x, z: trigger.position.z });
      }
    }
    return result;
  }

  activate(difficultyScale = 1.0, occupiedRoomIds = null) {
    this._active = true;
    this._difficultyScale = difficultyScale;
    this._graceTimer = GRACE_PERIOD;
    this._activeRooms = occupiedRoomIds
      ? new Set(occupiedRoomIds)
      : new Set(CONTAINMENT_ROOMS);

    for (const [roomId, cam] of Object.entries(this.cameras)) {
      cam.operational = true;
      cam.failTimer = this._randomInterval();
      this._setLedColor(cam, true);
      this._removeHighlight(cam);
    }

    // Remove any leftover repair triggers
    this._removeAllTriggers();
  }

  deactivate() {
    this._active = false;
    this._removeAllTriggers();
    for (const cam of Object.values(this.cameras)) {
      this._removeHighlight(cam);
    }
  }

  reset() {
    this._active = false;
    this._graceTimer = GRACE_PERIOD;

    for (const [roomId, cam] of Object.entries(this.cameras)) {
      cam.operational = true;
      cam.failTimer = this._randomInterval();
      this._setLedColor(cam, true);
      this._removeHighlight(cam);
    }

    this._removeAllTriggers();
  }

  update(dt) {
    if (!this._active) return;

    if (this._graceTimer > 0) {
      this._graceTimer -= dt;
      return;
    }

    for (const [roomId, cam] of Object.entries(this.cameras)) {
      if (!this._activeRooms.has(roomId)) continue;
      if (cam.operational) {
        cam.failTimer -= dt;
        if (cam.failTimer <= 0) {
          this._takeOffline(roomId);
        }
      } else {
        // Update highlight fade based on player distance
        this._updateHighlight(cam);
      }
    }
  }

  _takeOffline(roomId) {
    const cam = this.cameras[roomId];
    cam.operational = false;
    this._setLedColor(cam, false);

    // Place repair trigger in the room
    this._placeRepairTrigger(roomId);

    // Add green highlight to camera prop
    this._createHighlight(cam);

    this.game.emit('camera:down', { roomId });
  }

  _bringOnline(roomId) {
    const cam = this.cameras[roomId];
    if (!cam || cam.operational) return;

    cam.operational = true;
    cam.failTimer = this._randomInterval();
    this._setLedColor(cam, true);

    // Remove repair trigger
    this._removeRepairTrigger(roomId);

    // Remove green highlight
    this._removeHighlight(cam);

    this.game.emit('camera:up', { roomId });
  }

  _placeRepairTrigger(roomId) {
    if (this._repairTriggers[roomId]) return;

    const roomData = rooms.find(r => r.id === roomId);
    if (!roomData) return;

    const [cx, cz] = roomData.center;
    const [, d] = roomData.size;

    // Place trigger near the camera (opposite side from glass wall)
    const isNorth = roomId === 'contain_a' || roomId === 'contain_b';
    const triggerZ = isNorth ? cz - d / 2 + 1.5 : cz + d / 2 - 1.5;

    const trigger = new THREE.Mesh(
      new THREE.BoxGeometry(1.0, 1.5, 0.5),
      new THREE.MeshBasicMaterial({ visible: false })
    );
    trigger.position.set(cx + 4, 2.0, triggerZ);

    trigger.userData.interactable = {
      promptText: '[Hold E] Repair Camera',
      holdDuration: REPAIR_HOLD_DURATION,
      holdText: 'Repairing...',
      interact: () => this._bringOnline(roomId),
    };

    this.game.scene.add(trigger);
    this.game.player.interaction.addInteractable(trigger);
    this._repairTriggers[roomId] = trigger;
  }

  _removeRepairTrigger(roomId) {
    const trigger = this._repairTriggers[roomId];
    if (!trigger) return;

    this.game.player.interaction.removeInteractable(trigger);
    this.game.scene.remove(trigger);
    delete this._repairTriggers[roomId];
  }

  _removeAllTriggers() {
    for (const roomId of Object.keys(this._repairTriggers)) {
      this._removeRepairTrigger(roomId);
    }
  }

  _setLedColor(cam, operational) {
    if (!cam.propLed) return;
    const color = operational ? 0x00ff44 : 0xff2222;
    cam.propLed.material.color.setHex(color);
    cam.propLed.material.emissive.setHex(color);
  }

  // --- Green highlight (same pattern as TaskBase) ---

  _createHighlight(cam) {
    if (cam.highlightEdges.length > 0) return; // already active
    const group = cam.propGroup;
    if (!group) return;

    group.traverse((child) => {
      if (!child.isMesh) return;
      if (!child.material || !child.material.visible) return;

      // Clone material for emissive tinting
      const origMat = child.material;
      child.material = origMat.clone();
      cam.highlightMeshes.push({ mesh: child, original: origMat });

      // Edge lines
      const edgesGeo = new THREE.EdgesGeometry(child.geometry);
      const edgesMat = new THREE.LineBasicMaterial({
        color: 0x00ff41,
        transparent: true,
        opacity: 0,
      });
      const lines = new THREE.LineSegments(edgesGeo, edgesMat);
      lines.raycast = () => {};
      child.add(lines);
      cam.highlightEdges.push(lines);
    });
  }

  _removeHighlight(cam) {
    for (const lines of cam.highlightEdges) {
      if (lines.parent) lines.parent.remove(lines);
      lines.geometry.dispose();
      lines.material.dispose();
    }
    cam.highlightEdges = [];

    for (const { mesh, original } of cam.highlightMeshes) {
      if (mesh.material && mesh.material !== original) {
        mesh.material.dispose();
      }
      mesh.material = original;
    }
    cam.highlightMeshes = [];
  }

  _updateHighlight(cam) {
    if (cam.highlightEdges.length === 0) return;

    const px = this.game.player.position.x;
    const pz = this.game.player.position.z;
    const group = cam.propGroup;
    if (!group) return;

    const _pos = new THREE.Vector3();
    group.getWorldPosition(_pos);
    const dx = _pos.x - px;
    const dz = _pos.z - pz;
    const dist = Math.sqrt(dx * dx + dz * dz);
    const fade = Math.max(0, Math.min(1, (HIGHLIGHT_FADE_FAR - dist) / (HIGHLIGHT_FADE_FAR - HIGHLIGHT_FADE_NEAR)));

    for (const { mesh } of cam.highlightMeshes) {
      if (mesh.material && mesh.material.emissive) {
        mesh.material.emissive.setHex(0x00ff41);
        mesh.material.emissiveIntensity = 0.15 * fade;
      }
    }
    for (const lines of cam.highlightEdges) {
      lines.material.opacity = 0.6 * fade;
    }
  }

  _randomInterval() {
    const [min, max] = BASE_FAIL_INTERVAL;
    const scale = 1 / Math.max(this._difficultyScale, 0.5);
    return (min + Math.random() * (max - min)) * scale;
  }
}
