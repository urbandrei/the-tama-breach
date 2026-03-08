import * as THREE from 'three';
import { TaskBase, TaskState } from './task-base.js';
import { GameState } from '../core/constants.js';
import { dampedLerp } from '../utils/math-utils.js';
import { BillboardSprite } from '../sprites/billboard-sprite.js';
import { PERSONALITIES, EGG_FRAMES } from '../tamagotchi/personality.js';

const CONTAINMENT_POSITIONS = {
  contain_a: [-7.5, 0, 19],
  contain_b: [7.5, 0, 19],
  contain_c: [-7.5, 0, -19],
  contain_d: [7.5, 0, -19],
};
const ROOM_LABELS = {
  contain_a: 'Containment A',
  contain_b: 'Containment B',
  contain_c: 'Containment C',
  contain_d: 'Containment D',
};

const CART_FOLLOW_DISTANCE = 1.5;
const CART_LERP_SPEED = 6;
const ARRIVAL_DISTANCE = 3.0;

const EGG_STAGE_COUNT = 4;   // 0=still, 1=small crack, 2=big crack+wiggle, 3=hatched
const EGG_DEFAULT_TIME = 180;  // default 3 minutes total hatch cycle
const WIGGLE_SPEED = 6.0;
const WIGGLE_AMPLITUDE = 0.08;

export class TaskTransport extends TaskBase {
  constructor(game, config) {
    super(game, config);
    this._targetPosition = new THREE.Vector3(...(config.targetPosition || [7.5, 0, 19]));
    this._cart = null;
    this._cartTargetPos = new THREE.Vector3();
    this._cartYaw = 0;
    this._parked = false;
    this._cartTrigger = null;
    this._keyHandler = null;

    // Preview / egg state
    this._previewCart = null;
    this._eggSprite = null;
    this._eggTimer = 0;
    this._eggStage = -1;
    this._eggTotalTime = config.eggHatchTime || EGG_DEFAULT_TIME;
    this._transportTamaId = null;
    this._glassContainer = null;
    this._wiggleTimer = 0;
    this._targetRoomId = null;

    // Cart cleanup after hatch escape
    this._cartCleanupPending = false;
    this._cleanupTamaId = null;
    this._cleanupTimer = 0;
  }

  // --- Preview mode (cart visible at loading dock before task starts) ---

  createPreview(transportTamaId) {
    this.resetPreview();

    this._transportTamaId = transportTamaId;

    // Set dynamic target from personality's assigned room
    const personality = PERSONALITIES[transportTamaId];
    if (personality && CONTAINMENT_POSITIONS[personality.roomId]) {
      this._targetRoomId = personality.roomId;
      this._targetPosition.set(...CONTAINMENT_POSITIONS[personality.roomId]);
    }

    this._previewCart = this._buildCartGeometry();
    this._glassContainer = this._addGlassContainer(this._previewCart);
    this._eggSprite = this._addEggSprite(this._previewCart);

    // Position at loading dock trigger
    const [tx, , tz] = this.config.triggerPosition || [0, 1.4, -8];
    this._previewCart.position.set(tx, 0, tz);

    this._eggTimer = 0;
    this._eggStage = -1;
    this._wiggleTimer = 0;
    this._applyEggStage(0);

    this.game.scene.add(this._previewCart);
  }

  updatePreview(dt) {
    if (!this._previewCart) return;

    // Cart cleanup pending — wait for creature to leave elevator area
    if (this._cartCleanupPending) {
      this._cleanupTimer += dt;
      const cm = this.game.creatureManager;
      const creature = cm?.creatures.get(this._cleanupTamaId);
      const cartPos = this._previewCart.position;
      let shouldCleanup = this._cleanupTimer > 8; // fallback: 8s max

      if (creature?.ai) {
        const dx = creature.ai.x - cartPos.x;
        const dz = creature.ai.z - cartPos.z;
        if (Math.sqrt(dx * dx + dz * dz) > 5) shouldCleanup = true;
      }

      if (shouldCleanup) {
        this._cartCleanupPending = false;
        this._cleanupTamaId = null;
        this._cleanupTimer = 0;
        this.resetPreview();
        // Close elevator doors (delivery mode kept them open)
        const em = this.game.elevatorManager;
        if (em) em._deliveryMode = false;
      }
      return;
    }

    this._updateEgg(dt);
    if (this._eggSprite) {
      this._eggSprite.update(dt);
    }

    // If egg hatches in preview (player never picked it up), escape from cart
    if (this._eggStage >= EGG_STAGE_COUNT - 1 && this._previewCart && this.state === TaskState.PENDING) {
      const tamaId = this._transportTamaId; // save BEFORE any cleanup
      const cartPos = this._previewCart.position.clone();

      this.state = TaskState.FAILED;
      this.removeTrigger();

      // Remove egg + glass from cart, but keep cart mesh visible
      if (this._eggSprite) {
        this._eggSprite.dispose();
        this._eggSprite = null;
      }
      if (this._glassContainer && this._previewCart) {
        this._previewCart.remove(this._glassContainer);
        this._disposeGroup(this._glassContainer);
        this._glassContainer = null;
      }

      // Spawn creature at cart position
      this.game.emit('containment:breach', {
        tamaId,
        roomId: null,
        cartEscape: true,
        spawnPos: { x: cartPos.x, z: cartPos.z },
      });
      this.game.emit('task:failed', {
        taskId: this.id,
        type: this.type,
        reason: 'cart_hatch',
      });

      // Wait for creature to leave before cleaning up cart
      this._cartCleanupPending = true;
      this._cleanupTamaId = tamaId;
      this._cleanupTimer = 0;
    }
  }

  resetPreview() {
    if (this._eggSprite) {
      this._eggSprite.dispose();
      this._eggSprite = null;
    }
    if (this._previewCart) {
      this._disposeGroup(this._previewCart);
      this.game.scene.remove(this._previewCart);
      this._previewCart = null;
    }
    this._glassContainer = null;
    this._eggTimer = 0;
    this._eggStage = -1;
    this._transportTamaId = null;
    this._wiggleTimer = 0;
    this._targetRoomId = null;
    this._cartCleanupPending = false;
    this._cleanupTamaId = null;
    this._cleanupTimer = 0;
  }

  getTargetInfo() {
    if (!this._targetRoomId) return null;
    return {
      position: [this._targetPosition.x, 0, this._targetPosition.z],
      label: ROOM_LABELS[this._targetRoomId] || 'Containment',
    };
  }

  // --- Egg progression ---

  _updateEgg(dt) {
    if (!this._eggSprite) return;

    this._eggTimer += dt;
    const stageTime = this._eggTotalTime / EGG_STAGE_COUNT;
    const newStage = Math.min(EGG_STAGE_COUNT - 1, Math.floor(this._eggTimer / stageTime));

    if (newStage !== this._eggStage) {
      this._applyEggStage(newStage);
    }

    // Wiggle during stage 2
    if (this._eggStage === 2) {
      this._wiggleTimer += dt;
      this._eggSprite.sprite.material.rotation = Math.sin(this._wiggleTimer * WIGGLE_SPEED) * WIGGLE_AMPLITUDE;
    } else {
      this._eggSprite.sprite.material.rotation = 0;
    }
  }

  _applyEggStage(stage) {
    this._eggStage = stage;
    if (!this._eggSprite) return;

    if (stage <= 2) {
      // Egg frames (stages 0-2)
      this._eggSprite.setAnimation([EGG_FRAMES[stage]], '#88ccff', 999);
    } else {
      // Stage 3: hatched
      // If cart is parked/abandoned during active task, creature escapes from cart
      if (this.state === TaskState.ACTIVE && this._parked && this._cart) {
        this._cartHatchEscape();
        return;
      }

      // Normal hatch — show creature's idle sprite
      const personality = PERSONALITIES[this._transportTamaId];
      if (personality) {
        this._eggSprite.setDirectionalAnimation(
          personality.sprite.idle,
          '#00ff41',
          0.8,
        );
      }
    }
  }

  _cartHatchEscape() {
    const cartPos = this._cart.position.clone();

    // Fail the transport task
    this.state = TaskState.FAILED;
    this._removeKeyHandler();
    this._removeCartTrigger();
    this.game.player.isPushingCart = false;

    // Clean up cart
    this._removeCart();

    // Emit breach with cart position so creature spawns there
    this.game.emit('containment:breach', {
      tamaId: this._transportTamaId,
      roomId: null,
      cartEscape: true,
      spawnPos: { x: cartPos.x, z: cartPos.z },
    });

    this.game.emit('task:failed', {
      taskId: this.id,
      type: this.type,
      reason: 'cart_hatch',
    });
  }

  // --- Cart geometry ---

  _buildCartGeometry() {
    const cart = new THREE.Group();

    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x444455, roughness: 0.5, metalness: 0.7 });
    const wheelMat = new THREE.MeshStandardMaterial({ color: 0x333344, roughness: 0.6, metalness: 0.5 });

    // Body
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.8, 1.2), bodyMat);
    body.position.y = 0.6;
    cart.add(body);

    // Handle bar
    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.5, 0.08), bodyMat);
    handle.position.set(0, 1.1, 0.6);
    cart.add(handle);

    // Wheels
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
      cart.add(wheel);
    }

    return cart;
  }

  _addGlassContainer(cart) {
    const glassMat = new THREE.MeshStandardMaterial({
      color: 0x88ccff,
      transparent: true,
      opacity: 0.15,
      roughness: 0.1,
      metalness: 0.3,
      side: THREE.DoubleSide,
    });
    const glass = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.7, 1.0), glassMat);
    glass.position.y = 1.35;
    glass.userData.isGlass = true;
    cart.add(glass);
    return glass;
  }

  _addEggSprite(cart) {
    const sprite = new BillboardSprite(EGG_FRAMES[0], '#88ccff');
    sprite.setAnimation([EGG_FRAMES[0]], '#88ccff', 999);
    sprite.sprite.position.set(0, 1.35, 0);
    sprite.sprite.scale.multiplyScalar(0.6);
    cart.add(sprite.sprite);
    return sprite;
  }

  _disposeGroup(group) {
    group.traverse((child) => {
      if (child.isMesh) {
        child.geometry.dispose();
        child.material.dispose();
      }
      if (child.isSprite) {
        child.material.map?.dispose();
        child.material.dispose();
      }
    });
  }

  // --- Task lifecycle ---

  /** Override: highlight the cart mesh, not the nearest room prop (elevator). */
  placeTrigger() {
    if (this._triggerMesh || this._interactableMeshes.length > 0) return;

    const interactData = {
      promptText: `[E] ${this.title}`,
      interact: () => this.start(),
    };

    if (this._previewCart) {
      this._highlightCart(interactData);
    } else {
      // Fallback: invisible trigger box
      const [x, y, z] = this.triggerPosition;
      const geo = new THREE.BoxGeometry(2, 2, 2);
      const mat = new THREE.MeshBasicMaterial({ visible: false });
      this._triggerMesh = new THREE.Mesh(geo, mat);
      this._triggerMesh.position.set(x, y, z);
      this._triggerMesh.userData.interactable = interactData;
      this.game.scene.add(this._triggerMesh);
      this.game.player.interaction.addInteractable(this._triggerMesh);
    }
  }

  _highlightCart(interactData) {
    // Green edge highlights on cart meshes
    this._previewCart.traverse((child) => {
      if (!child.isMesh || !child.material?.visible) return;
      if (child.userData.isGlass) return;

      const originalMat = child.material;
      const cloned = originalMat.clone();
      this._highlightMeshes.push({ mesh: child, originalMat });
      child.material = cloned;

      const edgesGeo = new THREE.EdgesGeometry(child.geometry);
      const edgesMat = new THREE.LineBasicMaterial({
        color: 0x00ff41,
        transparent: true,
        opacity: 0,
      });
      const lines = new THREE.LineSegments(edgesGeo, edgesMat);
      lines.raycast = () => {};
      child.add(lines);
      this._highlightEdges.push(lines);
    });

    // Bounding box for easier raycasting
    const box = new THREE.Box3().setFromObject(this._previewCart);
    if (!box.isEmpty()) {
      const size = new THREE.Vector3();
      const center = new THREE.Vector3();
      box.getSize(size);
      box.getCenter(center);
      const margin = 0.3;
      const geo = new THREE.BoxGeometry(
        size.x + margin * 2, size.y + margin * 2, size.z + margin * 2
      );
      const mat = new THREE.MeshBasicMaterial({ visible: false });
      this._boundingBoxMesh = new THREE.Mesh(geo, mat);
      this._boundingBoxMesh.position.copy(center);
      this._boundingBoxMesh.userData.interactable = interactData;
      this.game.scene.add(this._boundingBoxMesh);
      this.game.player.interaction.addInteractable(this._boundingBoxMesh);
      this._interactableMeshes.push(this._boundingBoxMesh);
    }

    this._propWorldPos = { x: this._previewCart.position.x, z: this._previewCart.position.z };
  }

  // --- Escort interface (for minimap path) ---

  get isEscortActive() {
    return this.state === TaskState.ACTIVE && !this._parked;
  }

  getEscortTarget() {
    return { x: this._targetPosition.x, z: this._targetPosition.z };
  }

  start() {
    if (this.state !== TaskState.PENDING && this.state !== TaskState.FAILED) return;
    if (this.game.state !== GameState.PLAYING) return;

    // Mutual exclusion: can't push cart while carrying item
    if (this.game.player.isCarryingItem) return;

    this.state = TaskState.ACTIVE;
    this.game.player.isPushingCart = true;
    this._parked = false;

    // Hide interact prompt
    const prompt = document.getElementById('interact-prompt');
    if (prompt) prompt.classList.remove('visible');

    // Remove the placement trigger + highlight
    this.removeTrigger();

    // Take over preview cart or create new one
    if (this._previewCart) {
      this._cart = this._previewCart;
      this._previewCart = null;

      // Remove glass container
      if (this._glassContainer) {
        this._cart.remove(this._glassContainer);
        this._glassContainer.geometry.dispose();
        this._glassContainer.material.dispose();
        this._glassContainer = null;
      }
    } else {
      this._cart = this._buildCartGeometry();
      this.game.scene.add(this._cart);
    }

    // Initialize cart yaw to match player
    this._cartYaw = this.game.player.yaw.rotation.y;

    // Position cart in front of player
    this._updateCartPosition(0, true);
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

  _removeCart() {
    if (this._eggSprite) {
      this._eggSprite.dispose();
      this._eggSprite = null;
    }
    if (!this._cart) return;
    this._disposeGroup(this._cart);
    this.game.scene.remove(this._cart);
    this._cart = null;
    this._glassContainer = null;
  }

  _parkCart() {
    this.game.player.isPushingCart = false;
    this._parked = true;

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

    this.game.emit('task:completed', {
      taskId: this.id,
      type: this.type,
      roomId: this.roomId,
      transportTamaId: this._transportTamaId,
      eggElapsedTime: this._eggTimer,
    });
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
    this._updateEgg(dt);
    if (this._eggSprite) {
      this._eggSprite.update(dt);
    }

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
