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
    this._cartYaw = 0;
    this._parked = false;
    this._cartTrigger = null;
    this._keyHandler = null;
  }

  start() {
    if (this.state !== TaskState.PENDING && this.state !== TaskState.FAILED) return;
    if (this.game.state !== GameState.PLAYING) return;

    this.state = TaskState.ACTIVE;
    // Stay in PLAYING state — allows device (Tab), flashlight (F), interactions
    this.game.player.isPushingCart = true;
    this._parked = false;

    // Hide interact prompt
    const prompt = document.getElementById('interact-prompt');
    if (prompt) prompt.classList.remove('visible');

    // Remove the placement trigger + highlight (player already found it)
    this.removeTrigger();

    this._createCart();
    this._addKeyHandler();

    this.game.emit('task:started', { taskId: this.id, type: this.type, roomId: this.roomId });
  }

  _addKeyHandler() {
    if (this._keyHandler) return;
    this._keyHandler = (e) => {
      if (e.code === 'KeyQ' && !this._parked && this.game.state === GameState.PLAYING) {
        this._parkCart();
      }
    };
    document.addEventListener('keydown', this._keyHandler);
  }

  _removeKeyHandler() {
    if (this._keyHandler) {
      document.removeEventListener('keydown', this._keyHandler);
      this._keyHandler = null;
    }
  }

  _createCart() {
    this._cart = new THREE.Group();

    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x444455, roughness: 0.5, metalness: 0.7 });
    const wheelMat = new THREE.MeshStandardMaterial({ color: 0x333344, roughness: 0.6, metalness: 0.5 });

    // Body — long axis along Z (forward/back)
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.8, 1.2), bodyMat);
    body.position.y = 0.6;
    this._cart.add(body);

    // Handle bar at back (+Z side, closest to player)
    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.5, 0.08), bodyMat);
    handle.position.set(0, 1.1, 0.6);
    this._cart.add(handle);

    // Wheels (4 small cylinders, axis along X for forward/back rolling)
    const wheelGeo = new THREE.CylinderGeometry(0.12, 0.12, 0.1, 8);
    const offsets = [
      [0.35, 0.15, 0.45],
      [0.35, 0.15, -0.45],
      [-0.35, 0.15, 0.45],
      [-0.35, 0.15, -0.45],
    ];
    for (const [wx, wy, wz] of offsets) {
      const wheel = new THREE.Mesh(wheelGeo, wheelMat);
      wheel.position.set(wx, wy, wz);
      wheel.rotation.z = Math.PI / 2;
      this._cart.add(wheel);
    }

    // Initialize cart yaw to match player
    this._cartYaw = this.game.player.yaw.rotation.y;

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

  _parkCart() {
    this.game.player.isPushingCart = false;
    this._parked = true;

    // Create interactable trigger on the parked cart
    this._cartTrigger = new THREE.Mesh(
      new THREE.BoxGeometry(2, 2, 2),
      new THREE.MeshBasicMaterial({ visible: false, side: THREE.DoubleSide })
    );
    this._cartTrigger.position.copy(this._cart.position);
    this._cartTrigger.position.y = 1.0;
    this._cartTrigger.userData.interactable = {
      promptText: '[E] Push cart',
      interact: () => this._resumeCart(),
    };
    this.game.scene.add(this._cartTrigger);
    this.game.player.interaction.addInteractable(this._cartTrigger);
  }

  _resumeCart() {
    this._removeCartTrigger();
    this._parked = false;
    this.game.player.isPushingCart = true;

    // Hide interact prompt immediately
    const prompt = document.getElementById('interact-prompt');
    if (prompt) prompt.classList.remove('visible');
  }

  _removeCartTrigger() {
    if (!this._cartTrigger) return;
    this.game.player.interaction.removeInteractable(this._cartTrigger);
    this.game.scene.remove(this._cartTrigger);
    this._cartTrigger.geometry.dispose();
    this._cartTrigger.material.dispose();
    this._cartTrigger = null;
  }

  _updateCartPosition(dt, instant = false) {
    if (!this._cart) return;

    const player = this.game.player;
    const forward = player.forward;
    const targetYaw = player.yaw.rotation.y;

    // Target: CART_FOLLOW_DISTANCE in front of player
    this._cartTargetPos.copy(player.position);
    this._cartTargetPos.x += forward.x * CART_FOLLOW_DISTANCE;
    this._cartTargetPos.z += forward.z * CART_FOLLOW_DISTANCE;
    this._cartTargetPos.y = 0;

    if (instant) {
      this._cart.position.copy(this._cartTargetPos);
      this._cartYaw = targetYaw;
    } else {
      this._cart.position.x = dampedLerp(this._cart.position.x, this._cartTargetPos.x, CART_LERP_SPEED, dt);
      this._cart.position.z = dampedLerp(this._cart.position.z, this._cartTargetPos.z, CART_LERP_SPEED, dt);

      // Ease rotation with shortest-path angle wrapping
      let angleDiff = targetYaw - this._cartYaw;
      while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
      while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
      this._cartYaw += angleDiff * (1 - Math.exp(-CART_LERP_SPEED * dt));
    }

    this._cart.rotation.y = this._cartYaw;
  }

  complete() {
    if (this.state !== TaskState.ACTIVE) return;

    this.state = TaskState.COMPLETED;
    this._removeCartTrigger();
    this._removeKeyHandler();
    this._removeCart();
    this.game.player.isPushingCart = false;
    this.removeTrigger();

    this.game.emit('task:completed', { taskId: this.id, type: this.type, roomId: this.roomId });
  }

  abort() {
    if (this.state !== TaskState.ACTIVE) return;

    this.game.player.isPushingCart = false;
    this._parked = false;
    this.state = TaskState.PENDING;

    this._removeKeyHandler();
    this._removeCartTrigger();

    // Leave cart at current position, create trigger there
    if (this._cart) {
      const cartPos = this._cart.position.clone();
      this._removeCart();

      this.removeTrigger();
      this.triggerPosition = [cartPos.x, 1.4, cartPos.z];
      this.placeTrigger();
    }

    this.game.emit('task:aborted', { taskId: this.id, type: this.type, roomId: this.roomId });
  }

  update(dt) {
    if (this.state !== TaskState.ACTIVE) return;
    if (this._parked) return;

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
