import {
  CAMERA_FOV, CAMERA_FOV_SPRINT, CAMERA_FOV_CROUCH,
  HEAD_BOB_FREQUENCY, HEAD_BOB_AMPLITUDE_Y, HEAD_BOB_AMPLITUDE_X,
  HEAD_BOB_SPRINT_MULTIPLIER,
} from '../core/constants.js';
import { dampedLerp } from '../utils/math-utils.js';

export class CameraEffects {
  constructor(camera) {
    this.camera = camera;

    // Head bob
    this._bobTimer = 0;
    this._bobOffsetY = 0;
    this._bobOffsetX = 0;

    // FOV
    this._targetFOV = CAMERA_FOV;

    // Screenshake
    this._shakeIntensity = 0;
    this._shakeDuration = 0;
    this._shakeTimer = 0;
    this._shakeFrequency = 30;

    // Landing impact
    this._landingDip = 0;
    this._landingRecovery = 0;

    // Strafe tilt
    this._tiltTarget = 0;
    this._tiltCurrent = 0;
  }

  onJump() {
    // Small upward camera bump
  }

  onLand(fallSpeed) {
    this._landingDip = Math.min(fallSpeed * 0.02, 0.15);
    this._landingRecovery = 0;
  }

  shake(intensity, duration, frequency = 30) {
    this._shakeIntensity = intensity;
    this._shakeDuration = duration;
    this._shakeTimer = 0;
    this._shakeFrequency = frequency;
  }

  setStrafeTilt(strafeDir) {
    this._tiltTarget = strafeDir * 0.015; // subtle tilt: -1=left, 0=none, 1=right
  }

  update(dt, moveSpeed, isSprinting, isCrouching, isGrounded) {
    this._updateHeadBob(dt, moveSpeed, isSprinting, isGrounded);
    this._updateFOV(dt, isSprinting, isCrouching);
    this._updateShake(dt);
    this._updateLanding(dt);

    // Strafe tilt
    this._tiltCurrent = dampedLerp(this._tiltCurrent, this._tiltTarget, 8, dt);

    // Apply offsets to camera position
    this.camera.position.y = this._bobOffsetY + this._landingDip;
    this.camera.position.x = this._bobOffsetX;

    // Apply shake + tilt to camera rotation
    if (this._shakeTimer < this._shakeDuration) {
      const decay = 1 - (this._shakeTimer / this._shakeDuration);
      const t = this._shakeTimer * this._shakeFrequency;
      this.camera.rotation.z = Math.sin(t * 1.1) * this._shakeIntensity * decay * 0.5 + this._tiltCurrent;
    } else {
      this.camera.rotation.z = dampedLerp(this.camera.rotation.z, this._tiltCurrent, 10, dt);
    }
  }

  _updateHeadBob(dt, moveSpeed, isSprinting, isGrounded) {
    if (!isGrounded || moveSpeed < 0.5) {
      this._bobTimer = 0;
      this._bobOffsetY = dampedLerp(this._bobOffsetY, 0, 10, dt);
      this._bobOffsetX = dampedLerp(this._bobOffsetX, 0, 10, dt);
      return;
    }

    const speedFactor = Math.min(moveSpeed / 5, 1);
    const sprintMult = isSprinting ? HEAD_BOB_SPRINT_MULTIPLIER : 1;
    const freq = HEAD_BOB_FREQUENCY * sprintMult;

    this._bobTimer += dt * freq * speedFactor;

    this._bobOffsetY = Math.sin(this._bobTimer * 2) * HEAD_BOB_AMPLITUDE_Y * sprintMult * speedFactor;
    this._bobOffsetX = Math.cos(this._bobTimer) * HEAD_BOB_AMPLITUDE_X * sprintMult * speedFactor;
  }

  _updateFOV(dt, isSprinting, isCrouching) {
    if (isSprinting) {
      this._targetFOV = CAMERA_FOV_SPRINT;
    } else if (isCrouching) {
      this._targetFOV = CAMERA_FOV_CROUCH;
    } else {
      this._targetFOV = CAMERA_FOV;
    }

    this.camera.fov = dampedLerp(this.camera.fov, this._targetFOV, 5, dt);
    this.camera.updateProjectionMatrix();
  }

  _updateShake(dt) {
    if (this._shakeTimer < this._shakeDuration) {
      this._shakeTimer += dt;
    }
  }

  _updateLanding(dt) {
    if (this._landingDip < 0) {
      this._landingRecovery += dt;
      if (this._landingRecovery > 0.05) {
        this._landingDip = dampedLerp(this._landingDip, 0, 8, dt);
      }
    } else if (this._landingDip > 0) {
      // Apply the dip downward
      this._landingDip = -this._landingDip;
      this._landingRecovery = 0;
    }
  }
}
