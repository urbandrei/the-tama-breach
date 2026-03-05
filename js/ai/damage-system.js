/**
 * 2-hit damage system.
 * HEALTHY → WOUNDED (knockback + wound vignette) → DEAD (player:died)
 * Heals back to HEALTHY after 15s with no creature chasing.
 */

export const HealthState = Object.freeze({
  HEALTHY: 'healthy',
  WOUNDED: 'wounded',
  DEAD: 'dead',
});

const KNOCKBACK_FORCE = 12;
const HEAL_SAFE_DURATION = 15;

export class DamageSystem {
  constructor(game) {
    this.game = game;
    this.state = HealthState.HEALTHY;
    this._safeDuration = 0;

    // Wound overlay
    this._woundOverlay = document.createElement('div');
    this._woundOverlay.id = 'wound-overlay';
    document.getElementById('ui-root').appendChild(this._woundOverlay);

    // Hit flash overlay
    this._hitFlash = document.createElement('div');
    this._hitFlash.id = 'hit-flash';
    document.getElementById('ui-root').appendChild(this._hitFlash);
  }

  /**
   * Called when a creature reaches the player.
   * @param {object} creaturePos - {x, z}
   * @returns {'hit'|'kill'|'dead'} result of the hit
   */
  onHit(creaturePos) {
    if (this.state === HealthState.DEAD) return 'dead';

    const player = this.game.player;

    if (this.state === HealthState.HEALTHY) {
      // First hit: wound + knockback
      this.state = HealthState.WOUNDED;
      this._safeDuration = 0;

      // Knockback away from creature
      const dx = player.position.x - creaturePos.x;
      const dz = player.position.z - creaturePos.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (dist > 0.01) {
        player._velocity.x = (dx / dist) * KNOCKBACK_FORCE;
        player._velocity.z = (dz / dist) * KNOCKBACK_FORCE;
      }

      // Camera shake
      player.cameraEffects.shake(0.2, 1.0);

      // Red flash
      this._hitFlash.classList.add('active');
      setTimeout(() => this._hitFlash.classList.remove('active'), 300);

      // Persistent wound vignette
      this._woundOverlay.classList.add('active');

      return 'hit';
    }

    if (this.state === HealthState.WOUNDED) {
      // Second hit: death
      this.state = HealthState.DEAD;

      // Red flash
      this._hitFlash.classList.add('active');

      // Freeze player (temporary until death screen is implemented)
      player.movementEnabled = false;
      player.mouseLookEnabled = false;

      this.game.emit('player:died', {});
      return 'kill';
    }

    return 'dead';
  }

  /**
   * Update heal timer.
   * @param {number} dt
   * @param {boolean} anyChasing - true if any creature is in CHASE state
   */
  update(dt, anyChasing) {
    if (this.state !== HealthState.WOUNDED) return;

    if (anyChasing) {
      this._safeDuration = 0;
    } else {
      this._safeDuration += dt;
      if (this._safeDuration >= HEAL_SAFE_DURATION) {
        this.state = HealthState.HEALTHY;
        this._safeDuration = 0;
        this._woundOverlay.classList.remove('active');
      }
    }
  }

  reset() {
    this.state = HealthState.HEALTHY;
    this._safeDuration = 0;
    this._woundOverlay.classList.remove('active');
    this._hitFlash.classList.remove('active');
  }

  getState() {
    return this.state;
  }
}
