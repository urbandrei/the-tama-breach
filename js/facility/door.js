import * as THREE from 'three';
import { DOOR_WIDTH, DOOR_HEIGHT, WALL_THICKNESS } from './layout-data.js';
import { dampedLerp } from '../utils/math-utils.js';

const DOOR_THICKNESS = 0.12;
const SLIDE_DISTANCE = DOOR_WIDTH + 0.1;
const OPEN_SPEED = 6;
const AUTO_CLOSE_TIME = 5;

const doorMat = new THREE.MeshStandardMaterial({
  color: 0x777788,
  roughness: 0.4,
  metalness: 0.6,
});

const frameMat = new THREE.MeshStandardMaterial({
  color: 0x555566,
  roughness: 0.5,
  metalness: 0.5,
});

export class Door {
  constructor(worldX, worldZ, wallSide, game = null) {
    this.game = game;
    this.group = new THREE.Group();
    this.group.name = 'door';
    this.colliders = [];

    this._openAmount = 0;
    this._targetOpen = 0;
    this._autoCloseTimer = 0;
    this.locked = false;

    // Orient door based on which wall it sits on
    // Door slides along the wall plane
    const isNS = wallSide === 'north' || wallSide === 'south';

    this.group.position.set(worldX, 0, worldZ);
    if (!isNS) {
      this.group.rotation.y = Math.PI / 2;
    }

    // Door frame posts (left and right)
    // Frame posts sit inside the doorway opening (inset from wall reveal face)
    const postGeo = new THREE.BoxGeometry(0.1, DOOR_HEIGHT, WALL_THICKNESS);
    const leftPost = new THREE.Mesh(postGeo, frameMat);
    leftPost.position.set(-DOOR_WIDTH / 2 + 0.05, DOOR_HEIGHT / 2, 0);
    this.group.add(leftPost);

    const rightPost = new THREE.Mesh(postGeo, frameMat);
    rightPost.position.set(DOOR_WIDTH / 2 - 0.05, DOOR_HEIGHT / 2, 0);
    this.group.add(rightPost);

    // Sliding panel
    this._panel = new THREE.Mesh(
      new THREE.BoxGeometry(DOOR_WIDTH, DOOR_HEIGHT, DOOR_THICKNESS),
      doorMat
    );
    this._panel.position.set(0, DOOR_HEIGHT / 2, 0);
    this._panel.castShadow = true;
    this._panel.receiveShadow = true;
    this.group.add(this._panel);

    // Panel collider (moves with panel)
    this._panelCollider = new THREE.Mesh(
      new THREE.BoxGeometry(DOOR_WIDTH, DOOR_HEIGHT, 0.3),
      new THREE.MeshBasicMaterial({ visible: false })
    );
    this._panelCollider.position.copy(this._panel.position);
    this.group.add(this._panelCollider);
    this.colliders.push(this._panelCollider);

    // Interaction trigger zone (invisible, wider than door)
    // DoubleSide so raycasts register even when camera is inside the volume
    this._trigger = new THREE.Mesh(
      new THREE.BoxGeometry(DOOR_WIDTH + 1.0, DOOR_HEIGHT, 2.0),
      new THREE.MeshBasicMaterial({ visible: false, side: THREE.DoubleSide })
    );
    this._trigger.position.set(0, DOOR_HEIGHT / 2, 0);
    this._trigger.userData.interactable = {
      promptText: '[E] Open Door',
      interact: () => this.toggle(),
    };
    this.group.add(this._trigger);
  }

  get trigger() {
    return this._trigger;
  }

  lock() {
    this.locked = true;
    this.close();
    this._trigger.userData.interactable.promptText = '[LOCKED]';
  }

  unlock() {
    this.locked = false;
    this._trigger.userData.interactable.promptText = '[E] Open Door';
  }

  toggle() {
    if (this.locked) return;
    if (this._targetOpen < 0.5) {
      this.open();
    } else {
      this.close();
    }
  }

  open() {
    if (this.locked) return;
    this._targetOpen = 1;
    this._autoCloseTimer = AUTO_CLOSE_TIME;
    this._trigger.userData.interactable.promptText = '[E] Close Door';
    this._emitNoise();
  }

  close() {
    this._targetOpen = 0;
    this._trigger.userData.interactable.promptText = this.locked ? '[LOCKED]' : '[E] Open Door';
    this._emitNoise();
  }

  _emitNoise() {
    if (this.game) {
      this.game.emit('door:noise', {
        x: this.group.position.x,
        z: this.group.position.z,
      });
    }
  }

  update(dt) {
    // Auto-close timer
    if (this._targetOpen > 0.5 && this._autoCloseTimer > 0) {
      this._autoCloseTimer -= dt;
      if (this._autoCloseTimer <= 0) {
        this.close();
      }
    }

    // Animate panel sliding
    if (Math.abs(this._openAmount - this._targetOpen) > 0.001) {
      this._openAmount = dampedLerp(this._openAmount, this._targetOpen, OPEN_SPEED, dt);
      const slideX = this._openAmount * SLIDE_DISTANCE;
      this._panel.position.x = slideX;
      this._panelCollider.position.x = slideX;
    }
  }
}
