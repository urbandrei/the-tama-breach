import * as THREE from 'three';
import { TaskBase, TaskState } from './task-base.js';
import { GameState } from '../core/constants.js';
import { dampedLerp } from '../utils/math-utils.js';

const CART_FOLLOW_DISTANCE = 1.5;
const CART_LERP_SPEED = 6;
const ARRIVAL_DISTANCE = 3.0;

export class TaskTransport extends TaskBase {
  constructor(game, config) {
    super(game, config);
    this._targetPosition = new THREE.Vector3(...(config.targetPosition || [30, 0, 40]));
    this._cart = null;
    this._cartTargetPos = new THREE.Vector3();
    this._escHandler = null;
  }

  start() {
    if (this.state !== TaskState.PENDING && this.state !== TaskState.FAILED) return;
    if (this.game.state !== GameState.PLAYING) return;

    this.state = TaskState.ACTIVE;
    this.game.state = GameState.TASK_ACTIVE;
    this.game.player.isPushingCart = true;

    // Hide interact prompt
    const prompt = document.getElementById('interact-prompt');
    if (prompt) prompt.classList.remove('visible');

    this._createCart();

    this.game.emit('task:started', { taskId: this.id, type: this.type, roomId: this.roomId });

    // ESC to abort (no overlay, but we still want escape key)
    this._escHandler = (e) => {
      if (e.code === 'Escape') {
        e.preventDefault();
        this.abort();
      }
    };
    document.addEventListener('keydown', this._escHandler);
  }

  _createCart() {
    this._cart = new THREE.Group();

    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x444455, roughness: 0.5, metalness: 0.7 });
    const wheelMat = new THREE.MeshStandardMaterial({ color: 0x333344, roughness: 0.6, metalness: 0.5 });

    // Body
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.8, 0.8), bodyMat);
    body.position.y = 0.6;
    this._cart.add(body);

    // Handle
    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.5, 0.6), bodyMat);
    handle.position.set(-0.6, 1.1, 0);
    this._cart.add(handle);

    // Wheels (4 small cylinders)
    const wheelGeo = new THREE.CylinderGeometry(0.12, 0.12, 0.1, 8);
    const offsets = [
      [0.45, 0.15, 0.35],
      [0.45, 0.15, -0.35],
      [-0.45, 0.15, 0.35],
      [-0.45, 0.15, -0.35],
    ];
    for (const [wx, wy, wz] of offsets) {
      const wheel = new THREE.Mesh(wheelGeo, wheelMat);
      wheel.position.set(wx, wy, wz);
      wheel.rotation.x = Math.PI / 2;
      this._cart.add(wheel);
    }

    // Position cart in front of player
    this._updateCartPosition(0, true);
    this.game.scene.add(this._cart);
  }

  _removeCart() {
    if (!this._cart) return;
    this.game.scene.remove(this._cart);
    this._cart.traverse((child) => {
      if (child.isMesh) {
        child.geometry.dispose();
        child.material.dispose();
      }
    });
    this._cart = null;
  }

  _updateCartPosition(dt, instant = false) {
    if (!this._cart) return;

    const player = this.game.player;
    const forward = player.forward;

    // Target: CART_FOLLOW_DISTANCE in front of player
    this._cartTargetPos.copy(player.position);
    this._cartTargetPos.x += forward.x * CART_FOLLOW_DISTANCE;
    this._cartTargetPos.z += forward.z * CART_FOLLOW_DISTANCE;
    this._cartTargetPos.y = 0;

    if (instant) {
      this._cart.position.copy(this._cartTargetPos);
    } else {
      this._cart.position.x = dampedLerp(this._cart.position.x, this._cartTargetPos.x, CART_LERP_SPEED, dt);
      this._cart.position.z = dampedLerp(this._cart.position.z, this._cartTargetPos.z, CART_LERP_SPEED, dt);
    }

    // Face the direction the player is looking (yaw only)
    this._cart.rotation.y = player.yaw.rotation.y;
  }

  complete() {
    if (this.state !== TaskState.ACTIVE) return;

    this.state = TaskState.COMPLETED;
    this._removeCart();
    this.game.player.isPushingCart = false;
    this.game.state = GameState.PLAYING;
    this.removeTrigger();

    if (this._escHandler) {
      document.removeEventListener('keydown', this._escHandler);
      this._escHandler = null;
    }

    this.game.emit('task:completed', { taskId: this.id, type: this.type, roomId: this.roomId });
  }

  abort() {
    if (this.state !== TaskState.ACTIVE) return;

    this.game.player.isPushingCart = false;
    this.game.state = GameState.PLAYING;
    this.state = TaskState.PENDING;

    if (this._escHandler) {
      document.removeEventListener('keydown', this._escHandler);
      this._escHandler = null;
    }

    // Leave cart at current position and create new trigger there
    if (this._cart) {
      const cartPos = this._cart.position.clone();
      this._removeCart();

      // Re-place trigger at cart's dropped position
      this.removeTrigger();
      this.triggerPosition = [cartPos.x, 1.4, cartPos.z];
      this.placeTrigger();
    }

    this.game.emit('task:aborted', { taskId: this.id, type: this.type, roomId: this.roomId });
  }

  update(dt) {
    if (this.state !== TaskState.ACTIVE) return;

    this._updateCartPosition(dt, false);

    // Check arrival
    if (this._cart) {
      const dx = this._cart.position.x - this._targetPosition.x;
      const dz = this._cart.position.z - this._targetPosition.z;
      const dist = Math.sqrt(dx * dx + dz * dz);

      if (dist < ARRIVAL_DISTANCE) {
        this.complete();
      }
    }
  }
}
