import * as THREE from 'three';
import { TaskBase, TaskState } from './task-base.js';
import { GameState } from '../core/constants.js';
import { BillboardSprite } from '../sprites/billboard-sprite.js';

const CARRY_LOCAL_X = 0.2;
const CARRY_LOCAL_Y = -0.25;
const CARRY_LOCAL_Z = -0.8;
const CARRY_BOB_SPEED = 8.0;
const CARRY_BOB_AMPLITUDE = 0.015;
const CARRY_LERP_SPEED = 30;
const DROP_HEIGHT = 0.4;

const ITEM_SPRITES = {
  food: {
    lines: [
      '  ___  ',
      ' /   \\ ',
      '|FOOD |',
      ' \\___/ ',
    ],
    color: '#dd8833',
    label: 'Food bowl',
  },
  water: {
    lines: [
      '  ___  ',
      ' | ~ | ',
      ' |H2O| ',
      ' |___| ',
    ],
    color: '#5588cc',
    label: 'Water container',
  },
  toy: {
    lines: [
      '  /\\  ',
      ' /  \\ ',
      ' \\TOY/',
      '  \\/  ',
    ],
    color: '#cc44cc',
    label: 'Toy',
  },
};

export class TaskFetchItem extends TaskBase {
  constructor(game, config) {
    super(game, config);
    this._itemType = config.itemType; // 'food', 'water', 'toy'
    this._sourcePosition = new THREE.Vector3(...config.sourcePosition);
    this._destinationPosition = new THREE.Vector3(...(config.destinationPosition || [0, 0, 0]));

    this._carrying = false;
    this._itemSprite = null;
    this._droppedPosition = null;
    this._dropTrigger = null;
    this._destTrigger = null;
    this._keyHandler = null;

    // Glass front info for destination trigger placement (set by NightManager)
    this._destRoomId = null;
    this._destGlassZ = null;
    this._destGlassFacing = null;
    this._destRoomCenterX = null;

    // Placed item sprite (persists after completion)
    this._placedSprite = null;
    this._carryBobTimer = 0;
  }

  get isEscortActive() {
    return this._carrying;
  }

  getEscortTarget() {
    return { x: this._destinationPosition.x, z: this._destinationPosition.z };
  }

  setDestination(x, y, z) {
    this._destinationPosition.set(x, y, z);
  }

  setDestinationRoom(roomCenterX, glassFront) {
    this._destRoomCenterX = roomCenterX;
    this._destGlassZ = glassFront.z;
    this._destGlassFacing = glassFront.facing;
  }

  shouldShowOnMap() {
    if (this.state === 'active') return true;
    return super.shouldShowOnMap();
  }

  get _mapPosition() {
    if (this._carrying) return { x: this._destinationPosition.x, z: this._destinationPosition.z };
    if (this._droppedPosition) return { x: this._droppedPosition.x, z: this._droppedPosition.z };
    return this._propWorldPos || null;
  }

  // Override start — no overlay, no player freeze
  start() {
    if (this.state !== TaskState.PENDING && this.state !== TaskState.FAILED) return;
    if (this.game.state !== GameState.PLAYING) return;

    // Mutual exclusion: can't pick up while pushing cart
    if (this.game.player.isPushingCart) return;

    this.state = TaskState.ACTIVE;
    this._carrying = true;
    this.game.player.isCarryingItem = true;

    // Hide interact prompt
    const prompt = document.getElementById('interact-prompt');
    if (prompt) prompt.classList.remove('visible');

    // Remove source trigger + highlight
    this.removeTrigger();

    // Remove drop trigger if re-picking up
    this._removeDropTrigger();

    // Create carried item sprite
    this._createItemSprite();

    // Position sprite in front of player immediately
    this._updateItemPosition(0, true);

    // Add Q key handler for drop
    this._addKeyHandler();

    // Create destination trigger
    this._createDestTrigger();

    this.game.emit('task:started', { taskId: this.id, type: this.type, roomId: this.roomId });
  }

  complete() {
    if (this.state !== TaskState.ACTIVE) return;

    this.state = TaskState.COMPLETED;
    this._carrying = false;
    this.game.player.isCarryingItem = false;
    this._removeKeyHandler();
    this._removeDropTrigger();
    this._removeDestTrigger();
    this.removeTrigger();

    // Place item sprite inside the habitat instead of removing it
    this._placeItemInHabitat();

    this.game.emit('task:completed', { taskId: this.id, type: this.type, roomId: this.roomId, itemType: this._itemType });
  }

  abort() {
    if (this.state !== TaskState.ACTIVE) return;

    this._carrying = false;
    this.game.player.isCarryingItem = false;
    this._removeKeyHandler();
    this._removeItemSprite();
    this._removeDropTrigger();
    this._removeDestTrigger();
    this.state = TaskState.PENDING;

    // Reset trigger to source position
    this.triggerPosition = [this._sourcePosition.x, 1.4, this._sourcePosition.z];
    this.placeTrigger();

    this.game.emit('task:aborted', { taskId: this.id, type: this.type, roomId: this.roomId });
  }

  /** Clean up placed item sprite (called on night reset). */
  cleanupPlacedSprite() {
    if (this._placedSprite) {
      this.game.scene.remove(this._placedSprite.sprite);
      this._placedSprite.dispose();
      this._placedSprite = null;
    }
  }

  update(dt) {
    if (this.state !== TaskState.ACTIVE) return;
    if (!this._carrying) return;

    this._updateItemPosition(dt, false);
  }

  // --- Item sprite ---

  _createItemSprite() {
    const info = ITEM_SPRITES[this._itemType];
    if (!info) return;

    this._itemSprite = new BillboardSprite(info.lines, info.color);
    this._itemSprite.sprite.scale.multiplyScalar(0.4);
    this.game.camera.add(this._itemSprite.sprite);
    this._itemSprite.sprite.position.set(CARRY_LOCAL_X, CARRY_LOCAL_Y, CARRY_LOCAL_Z);
  }

  _removeItemSprite() {
    if (!this._itemSprite) return;
    if (this._itemSprite.sprite.parent) {
      this._itemSprite.sprite.parent.remove(this._itemSprite.sprite);
    }
    this._itemSprite.dispose();
    this._itemSprite = null;
  }

  _updateItemPosition(dt, instant) {
    if (!this._itemSprite) return;

    const player = this.game.player;
    const sprite = this._itemSprite.sprite;

    // Walking bob
    if (player._moveSpeed > 0.5 && player.isGrounded) {
      this._carryBobTimer += dt * CARRY_BOB_SPEED;
    } else {
      this._carryBobTimer *= 0.9; // decay toward 0
    }
    const bobOffset = Math.sin(this._carryBobTimer) * CARRY_BOB_AMPLITUDE;

    const targetX = CARRY_LOCAL_X;
    const targetY = CARRY_LOCAL_Y + bobOffset;
    const targetZ = CARRY_LOCAL_Z;

    if (instant) {
      sprite.position.set(targetX, targetY, targetZ);
    } else {
      const t = 1 - Math.exp(-CARRY_LERP_SPEED * dt);
      sprite.position.x += (targetX - sprite.position.x) * t;
      sprite.position.y += (targetY - sprite.position.y) * t;
      sprite.position.z += (targetZ - sprite.position.z) * t;
    }
  }

  // --- Drop / pickup ---

  _addKeyHandler() {
    if (this._keyHandler) return;
    this._keyHandler = (e) => {
      if (e.code === 'KeyQ' && this._carrying && this.game.state === GameState.PLAYING) {
        this._dropItem();
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

  _dropItem() {
    this._carrying = false;
    this.game.player.isCarryingItem = false;

    // Place item at player's feet
    const pos = this.game.player.position;
    this._droppedPosition = new THREE.Vector3(pos.x, 0, pos.z);

    // Reparent sprite from camera to scene
    if (this._itemSprite) {
      const sprite = this._itemSprite.sprite;
      this.game.camera.remove(sprite);
      this.game.scene.add(sprite);
      sprite.position.set(pos.x, DROP_HEIGHT, pos.z);
    }

    // Remove destination trigger while dropped
    this._removeDestTrigger();

    // Create pickup trigger at drop location
    this._createDropTrigger();
  }

  _createDropTrigger() {
    this._removeDropTrigger();

    const geo = new THREE.BoxGeometry(1.5, 2, 1.5);
    const mat = new THREE.MeshBasicMaterial({ visible: false });
    this._dropTrigger = new THREE.Mesh(geo, mat);
    this._dropTrigger.position.copy(this._droppedPosition);
    this._dropTrigger.position.y = 1.0;

    const info = ITEM_SPRITES[this._itemType];
    this._dropTrigger.userData.interactable = {
      promptText: `[E] Pick up ${info ? info.label : 'item'}`,
      interact: () => this._pickUpItem(),
    };

    this.game.scene.add(this._dropTrigger);
    this.game.player.interaction.addInteractable(this._dropTrigger);
  }

  _removeDropTrigger() {
    if (!this._dropTrigger) return;
    this.game.player.interaction.removeInteractable(this._dropTrigger);
    this.game.scene.remove(this._dropTrigger);
    this._dropTrigger.geometry.dispose();
    this._dropTrigger.material.dispose();
    this._dropTrigger = null;
  }

  _pickUpItem() {
    // Mutual exclusion
    if (this.game.player.isPushingCart) return;

    this._removeDropTrigger();
    this._carrying = true;
    this.game.player.isCarryingItem = true;
    this._droppedPosition = null;

    // Reparent sprite from scene to camera
    if (this._itemSprite) {
      const sprite = this._itemSprite.sprite;
      this.game.scene.remove(sprite);
      this.game.camera.add(sprite);
    }

    // Re-add destination trigger
    this._createDestTrigger();

    // Re-add key handler if needed
    this._addKeyHandler();

    // Snap sprite to carry position
    this._updateItemPosition(0, true);

    // Hide interact prompt
    const prompt = document.getElementById('interact-prompt');
    if (prompt) prompt.classList.remove('visible');
  }

  // --- Destination trigger ---

  _createDestTrigger() {
    this._removeDestTrigger();

    const info = ITEM_SPRITES[this._itemType];

    // If we have glass front info, place trigger on observation side of glass
    if (this._destGlassZ != null && this._destRoomCenterX != null) {
      const offset = this._destGlassFacing === 'south' ? -1.0 : 1.0;
      const triggerZ = this._destGlassZ + offset;

      const geo = new THREE.BoxGeometry(8, 2, 2);
      const mat = new THREE.MeshBasicMaterial({ visible: false });
      this._destTrigger = new THREE.Mesh(geo, mat);
      this._destTrigger.position.set(this._destRoomCenterX, 1.0, triggerZ);
    } else {
      // Fallback: large box at destination center
      const geo = new THREE.BoxGeometry(4, 3, 4);
      const mat = new THREE.MeshBasicMaterial({ visible: false });
      this._destTrigger = new THREE.Mesh(geo, mat);
      this._destTrigger.position.set(
        this._destinationPosition.x, 1.5, this._destinationPosition.z
      );
    }

    this._destTrigger.userData.interactable = {
      promptText: `[E] Place ${info ? info.label.toLowerCase() : 'item'}`,
      interact: () => this.complete(),
    };
    // Only show prompt when carrying
    this._destTrigger.userData._checkCondition = () => this._carrying;

    this.game.scene.add(this._destTrigger);
    this.game.player.interaction.addInteractable(this._destTrigger);
  }

  // --- Place item in habitat ---

  _placeItemInHabitat() {
    if (!this._itemSprite) {
      this._removeItemSprite();
      return;
    }

    // Reparent from camera to scene for world-space placement
    const sprite = this._itemSprite.sprite;
    if (sprite.parent === this.game.camera) {
      this.game.camera.remove(sprite);
      this.game.scene.add(sprite);
    }

    // Calculate position inside the habitat (behind glass)
    if (this._destGlassZ != null && this._destRoomCenterX != null) {
      const intoHabitat = this._destGlassFacing === 'south' ? 2.0 : -2.0;
      const habitatZ = this._destGlassZ + intoHabitat;

      // Offset X by item type: food left, water center, toy right
      let offsetX = 0;
      if (this._itemType === 'food') offsetX = -3;
      else if (this._itemType === 'toy') offsetX = 3;

      this._itemSprite.sprite.position.set(
        this._destRoomCenterX + offsetX, 0.3, habitatZ
      );
    } else {
      // Fallback: place at destination
      this._itemSprite.sprite.position.set(
        this._destinationPosition.x, 0.3, this._destinationPosition.z
      );
    }

    // Transfer sprite to placed reference (persists in scene)
    this._placedSprite = this._itemSprite;
    this._itemSprite = null;
  }

  _removeDestTrigger() {
    if (!this._destTrigger) return;
    this.game.player.interaction.removeInteractable(this._destTrigger);
    this.game.scene.remove(this._destTrigger);
    this._destTrigger.geometry.dispose();
    this._destTrigger.material.dispose();
    this._destTrigger = null;
  }
}
