import * as THREE from 'three';
import {
  PLAYER_SPEED, PLAYER_SPRINT_MULTIPLIER, PLAYER_JUMP_FORCE, PLAYER_GRAVITY,
  PLAYER_STAND_HEIGHT, PLAYER_CROUCH_HEIGHT, PLAYER_CROUCH_SPEED_MULTIPLIER,
  PLAYER_CART_SPEED_MULTIPLIER, PLAYER_ACCELERATION, PLAYER_DECELERATION,
  PLAYER_MAX_STAMINA, PLAYER_STAMINA_DRAIN, PLAYER_STAMINA_REGEN, PLAYER_STAMINA_REGEN_DELAY,
  MOUSE_SENSITIVITY, PITCH_MIN, PITCH_MAX,
} from '../core/constants.js';
import { dampedLerp, clamp } from '../utils/math-utils.js';
import { keybindings } from '../core/keybindings.js';
import { CameraEffects } from './camera-effects.js';
import { Flashlight } from './flashlight.js';
import { Interaction } from './interaction.js';

export class PlayerController {
  constructor(game) {
    this.game = game;
    this.input = game.input;
    this.physics = game.physics;

    // Yaw (horizontal rotation) - parent object
    this.yaw = new THREE.Object3D();
    this.yaw.position.set(0, PLAYER_STAND_HEIGHT, 0);
    game.scene.add(this.yaw);

    // Pitch (vertical rotation) - child of yaw
    this.pitch = new THREE.Object3D();
    this.yaw.add(this.pitch);

    // Camera attached to pitch
    this.pitch.add(game.camera);

    // Movement state
    this._velocity = new THREE.Vector3();
    this._verticalVelocity = 0;
    this._isGrounded = false;
    this._isSprinting = false;
    this._isCrouching = false;
    this._currentHeight = PLAYER_STAND_HEIGHT;
    this._targetHeight = PLAYER_STAND_HEIGHT;
    this._moveSpeed = 0;

    // Stamina
    this._stamina = PLAYER_MAX_STAMINA;
    this._staminaRegenDelay = 0;

    // Exhaustion vignette overlay
    this._exhaustOverlay = document.createElement('div');
    this._exhaustOverlay.id = 'exhaust-overlay';
    document.getElementById('ui-root').appendChild(this._exhaustOverlay);

    // Flags for other systems
    this.deviceOpen = false;
    this.isPushingCart = false;
    this.isCarryingItem = false;
    this.movementEnabled = true;
    this.mouseLookEnabled = true;

    // Sub-systems
    this.cameraEffects = new CameraEffects(game.camera);
    this.flashlight = new Flashlight(game, this.pitch);
    this.interaction = new Interaction(game, game.camera);
  }

  get position() {
    return this.yaw.position;
  }

  get forward() {
    const dir = new THREE.Vector3(0, 0, -1);
    dir.applyQuaternion(this.yaw.quaternion);
    return dir;
  }

  get isGrounded() {
    return this._isGrounded;
  }

  get isSprinting() {
    return this._isSprinting;
  }

  get isCrouching() {
    return this._isCrouching;
  }

  get stamina() {
    return this._stamina;
  }

  update(dt) {
    this._handleMouseLook(dt);
    this._handleMovement(dt);
    this._handleCrouch(dt);
    this._handleJump();
    this._applyGravity(dt);
    this._applyHeight(dt);

    this.cameraEffects.update(dt, this._moveSpeed, this._isSprinting, this._isCrouching, this._isGrounded);
    this.flashlight.update(this.input, dt);
    this.interaction.update(dt);
  }

  _handleMouseLook(dt) {
    if (!this.mouseLookEnabled || this.deviceOpen) return;
    if (!this.input.isPointerLocked) return;

    const delta = this.input.getMouseDelta();
    this.yaw.rotation.y -= delta.x * MOUSE_SENSITIVITY;
    this.pitch.rotation.x -= delta.y * MOUSE_SENSITIVITY;
    this.pitch.rotation.x = clamp(this.pitch.rotation.x, PITCH_MIN, PITCH_MAX);
  }

  _handleMovement(dt) {
    if (!this.movementEnabled) {
      this._velocity.set(0, 0, 0);
      this._moveSpeed = 0;
      return;
    }

    // Build input direction
    const inputDir = new THREE.Vector3();
    if (this.input.isKeyDown(keybindings.getKey('move_forward')) || this.input.isKeyDown('ArrowUp')) inputDir.z -= 1;
    if (this.input.isKeyDown(keybindings.getKey('move_back')) || this.input.isKeyDown('ArrowDown')) inputDir.z += 1;
    if (this.input.isKeyDown(keybindings.getKey('move_left')) || this.input.isKeyDown('ArrowLeft')) inputDir.x -= 1;
    if (this.input.isKeyDown(keybindings.getKey('move_right')) || this.input.isKeyDown('ArrowRight')) inputDir.x += 1;

    if (inputDir.lengthSq() > 0) {
      inputDir.normalize();
    }

    // Transform to world space (based on yaw only)
    inputDir.applyAxisAngle(new THREE.Vector3(0, 1, 0), this.yaw.rotation.y);

    // Sprint check (can't sprint with device open)
    const sprintKey = keybindings.getKey('sprint');
    const wantsSprint = this.input.isKeyDown(sprintKey) || this.input.isKeyDown('ShiftRight');
    this._isSprinting = wantsSprint && !this._isCrouching && !this.isPushingCart && !this.deviceOpen && this._stamina > 0;

    // Stamina drain/regen
    if (this._isSprinting && inputDir.lengthSq() > 0) {
      this._stamina = Math.max(0, this._stamina - PLAYER_STAMINA_DRAIN * dt);
      this._staminaRegenDelay = PLAYER_STAMINA_REGEN_DELAY;
      if (this._stamina <= 0) this._isSprinting = false;
    } else {
      this._staminaRegenDelay = Math.max(0, this._staminaRegenDelay - dt);
      if (this._staminaRegenDelay <= 0) {
        this._stamina = Math.min(PLAYER_MAX_STAMINA, this._stamina + PLAYER_STAMINA_REGEN * dt);
      }
    }

    // Exhaustion vignette
    const exhaustion = 1 - (this._stamina / PLAYER_MAX_STAMINA);
    if (exhaustion > 0.5) {
      this._exhaustOverlay.style.opacity = (exhaustion - 0.5) * 2;
    } else {
      this._exhaustOverlay.style.opacity = 0;
    }

    // Calculate target speed
    let targetSpeed = PLAYER_SPEED;
    if (this._isSprinting) targetSpeed *= PLAYER_SPRINT_MULTIPLIER;
    if (this._isCrouching) targetSpeed *= PLAYER_CROUCH_SPEED_MULTIPLIER;
    if (this.isPushingCart) targetSpeed *= PLAYER_CART_SPEED_MULTIPLIER;
    if (this.deviceOpen) targetSpeed *= PLAYER_CROUCH_SPEED_MULTIPLIER;

    // Accelerate/decelerate
    const targetVelocity = inputDir.multiplyScalar(targetSpeed);
    const accel = inputDir.lengthSq() > 0 ? PLAYER_ACCELERATION : PLAYER_DECELERATION;

    this._velocity.x = dampedLerp(this._velocity.x, targetVelocity.x, accel, dt);
    this._velocity.z = dampedLerp(this._velocity.z, targetVelocity.z, accel, dt);

    // Apply collision
    const resolvedMove = this.physics.moveWithCollision(
      this.yaw.position,
      this._velocity,
      dt
    );

    this.yaw.position.x += resolvedMove.x;
    this.yaw.position.z += resolvedMove.z;

    // Track actual move speed for head bob
    this._moveSpeed = Math.sqrt(resolvedMove.x * resolvedMove.x + resolvedMove.z * resolvedMove.z) / dt;
  }

  _handleCrouch(dt) {
    if (this.input.isKeyPressed(keybindings.getKey('crouch'))) {
      this._isCrouching = !this._isCrouching;
    }
    if (this._isSprinting) this._isCrouching = false;
    this._targetHeight = this._isCrouching ? PLAYER_CROUCH_HEIGHT : PLAYER_STAND_HEIGHT;
  }

  _handleJump() {
    if (!this._isGrounded) return;
    if (this._isCrouching) return;

    if (this.input.isKeyPressed(keybindings.getKey('jump'))) {
      this._verticalVelocity = PLAYER_JUMP_FORCE;
      this._isGrounded = false;
      this.cameraEffects.onJump();
    }
  }

  _applyGravity(dt) {
    this._verticalVelocity -= PLAYER_GRAVITY * dt;
    this.yaw.position.y += this._verticalVelocity * dt;

    const ground = this.physics.checkGrounded(this.yaw.position, this._currentHeight);

    if (ground.grounded && this._verticalVelocity <= 0) {
      const targetY = ground.groundY + this._currentHeight;
      if (this.yaw.position.y <= targetY) {
        const wasInAir = !this._isGrounded;
        const fallSpeed = Math.abs(this._verticalVelocity);

        this.yaw.position.y = targetY;
        this._verticalVelocity = 0;
        this._isGrounded = true;

        if (wasInAir && fallSpeed > 2) {
          this.cameraEffects.onLand(fallSpeed);
        }
      }
    } else if (!ground.grounded) {
      this._isGrounded = false;
    }
  }

  _applyHeight(dt) {
    this._currentHeight = dampedLerp(this._currentHeight, this._targetHeight, 10, dt);

    if (this._isGrounded) {
      const ground = this.physics.checkGrounded(this.yaw.position, this._currentHeight + 0.5);
      if (ground.grounded) {
        this.yaw.position.y = ground.groundY + this._currentHeight;
      }
    }
  }
}
