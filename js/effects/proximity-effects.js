/**
 * Per-specimen visual effects triggered by nearby escaped creatures.
 * - Void: fog/darkness overlay
 * - Glitch: screen tear strips
 * - Feral: red edge pulse
 * - Nibbles: audio-only (no visual)
 */

const EFFECT_RANGE = 12;  // max distance for full effect
const FADE_SPEED = 3;     // opacity lerp speed

export class ProximityEffects {
  constructor(game) {
    this.game = game;

    // Create overlay elements
    this._voidOverlay = document.createElement('div');
    this._voidOverlay.id = 'void-overlay';
    document.getElementById('ui-root').appendChild(this._voidOverlay);

    this._glitchOverlay = document.createElement('div');
    this._glitchOverlay.id = 'glitch-overlay';
    // Create 5 tear strips
    for (let i = 0; i < 5; i++) {
      const tear = document.createElement('div');
      tear.className = 'glitch-tear';
      this._glitchOverlay.appendChild(tear);
    }
    document.getElementById('ui-root').appendChild(this._glitchOverlay);

    this._feralOverlay = document.createElement('div');
    this._feralOverlay.id = 'feral-overlay';
    document.getElementById('ui-root').appendChild(this._feralOverlay);

    this._voidOpacity = 0;
    this._glitchOpacity = 0;
    this._feralOpacity = 0;
    this._glitchTimer = 0;
  }

  update(dt) {
    const cm = this.game.creatureManager;
    if (!cm) return;

    const px = this.game.player.position.x;
    const pz = this.game.player.position.z;

    let voidTarget = 0;
    let glitchTarget = 0;
    let feralTarget = 0;

    for (const [tamaId, creature] of cm.creatures) {
      if (creature.returned) continue;
      const ai = creature.ai;
      if (!ai) continue;

      const dx = ai.x - px;
      const dz = ai.z - pz;
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (dist > EFFECT_RANGE) continue;

      const intensity = 1 - (dist / EFFECT_RANGE);

      switch (tamaId) {
        case 'void':
          voidTarget = Math.max(voidTarget, intensity);
          break;
        case 'glitch':
          glitchTarget = Math.max(glitchTarget, intensity);
          break;
        case 'feral':
          feralTarget = Math.max(feralTarget, intensity);
          break;
        // nibbles: no visual effect
      }
    }

    // Lerp opacities
    this._voidOpacity += (voidTarget - this._voidOpacity) * Math.min(FADE_SPEED * dt, 1);
    this._glitchOpacity += (glitchTarget - this._glitchOpacity) * Math.min(FADE_SPEED * dt, 1);
    this._feralOpacity += (feralTarget - this._feralOpacity) * Math.min(FADE_SPEED * dt, 1);

    // Apply
    this._voidOverlay.style.opacity = this._voidOpacity.toFixed(3);

    // Glitch tear animation
    if (this._glitchOpacity > 0.05) {
      this._glitchOverlay.style.opacity = this._glitchOpacity.toFixed(3);
      this._glitchTimer += dt;
      if (this._glitchTimer > 0.08) {
        this._glitchTimer = 0;
        const tears = this._glitchOverlay.children;
        for (let i = 0; i < tears.length; i++) {
          if (Math.random() < this._glitchOpacity * 0.6) {
            const t = tears[i];
            t.style.display = 'block';
            t.style.top = (Math.random() * 100) + '%';
            t.style.height = (2 + Math.random() * 8) + 'px';
            t.style.transform = `translateX(${(Math.random() - 0.5) * 10}px)`;
          } else {
            tears[i].style.display = 'none';
          }
        }
      }
    } else {
      this._glitchOverlay.style.opacity = '0';
    }

    // Feral pulsing
    if (this._feralOpacity > 0.05) {
      const pulse = 0.5 + Math.sin(Date.now() * 0.005) * 0.5;
      this._feralOverlay.style.opacity = (this._feralOpacity * pulse).toFixed(3);
    } else {
      this._feralOverlay.style.opacity = '0';
    }

    // Void fog effect — increase scene fog density
    if (this.game.scene.fog) {
      const baseDensity = 0.003;
      const voidBoost = this._voidOpacity * 0.015;
      this.game.scene.fog.density = baseDensity + voidBoost;
    }
  }
}
