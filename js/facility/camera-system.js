import * as THREE from 'three';
import { PERSONALITIES, ROOM_TO_TAMA } from '../tamagotchi/personality.js';
import { rooms } from './layout-data.js';

const CONTAINMENT_ROOMS = ['contain_a', 'contain_b', 'contain_c', 'contain_d'];
const BASE_FAIL_INTERVAL = [60, 180]; // seconds before a camera can fail
const GRACE_PERIOD = 90; // seconds before cameras start failing
const REPAIR_HOLD_DURATION = 3.0; // seconds to hold E

export class CameraSystem {
  constructor(game) {
    this.game = game;
    this.cameras = {};
    this._active = false;
    this._graceTimer = GRACE_PERIOD;
    this._difficultyScale = 1.0;
    this._repairTriggers = {}; // roomId -> trigger mesh

    // Initialize per-room camera state
    for (const roomId of CONTAINMENT_ROOMS) {
      this.cameras[roomId] = {
        operational: true,
        failTimer: this._randomInterval(),
        propLed: null, // set by facility builder after props are created
      };
    }
  }

  /** Set LED mesh references from camera props. */
  setCameraProps(cameraProps) {
    for (const [roomId, led] of Object.entries(cameraProps)) {
      if (this.cameras[roomId]) {
        this.cameras[roomId].propLed = led;
      }
    }
  }

  isCameraUp(roomId) {
    const cam = this.cameras[roomId];
    return cam ? cam.operational : true; // non-camera rooms always "up"
  }

  activate(difficultyScale = 1.0) {
    this._active = true;
    this._difficultyScale = difficultyScale;
    this._graceTimer = GRACE_PERIOD;

    for (const cam of Object.values(this.cameras)) {
      cam.operational = true;
      cam.failTimer = this._randomInterval();
      this._setLedColor(cam, true);
    }

    // Remove any leftover repair triggers
    this._removeAllTriggers();
  }

  deactivate() {
    this._active = false;
    this._removeAllTriggers();
  }

  reset() {
    this._active = false;
    this._graceTimer = GRACE_PERIOD;

    for (const cam of Object.values(this.cameras)) {
      cam.operational = true;
      cam.failTimer = this._randomInterval();
      this._setLedColor(cam, true);
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
      if (!cam.operational) continue;

      cam.failTimer -= dt;
      if (cam.failTimer <= 0) {
        this._takeOffline(roomId);
      }
    }
  }

  _takeOffline(roomId) {
    const cam = this.cameras[roomId];
    cam.operational = false;
    this._setLedColor(cam, false);

    // Place repair trigger in the room
    this._placeRepairTrigger(roomId);

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

    this.game.emit('camera:up', { roomId });
  }

  _placeRepairTrigger(roomId) {
    if (this._repairTriggers[roomId]) return;

    const roomData = rooms.find(r => r.id === roomId);
    if (!roomData) return;

    const [cx, cz] = roomData.center;
    const [, d] = roomData.size;

    // Place trigger near the camera (opposite side from glass wall)
    // contain_a/b: glass on north, camera on south wall → trigger at south
    // contain_c/d: glass on south, camera on north wall → trigger at north
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

  _randomInterval() {
    const [min, max] = BASE_FAIL_INTERVAL;
    const scale = 1 / Math.max(this._difficultyScale, 0.5);
    return (min + Math.random() * (max - min)) * scale;
  }
}
