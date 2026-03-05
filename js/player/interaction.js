import * as THREE from 'three';
import { INTERACT_RANGE, GameState } from '../core/constants.js';
import { keybindings } from '../core/keybindings.js';

export class Interaction {
  constructor(game, camera) {
    this.game = game;
    this.camera = camera;
    this._raycaster = new THREE.Raycaster();
    this._raycaster.far = INTERACT_RANGE;
    this._currentTarget = null;
    this._promptEl = document.getElementById('interact-prompt');
    this.interactables = [];

    // Hold-to-interact state
    this._holdTarget = null;
    this._holdTimer = 0;
  }

  addInteractable(mesh) {
    this.interactables.push(mesh);
  }

  removeInteractable(mesh) {
    const idx = this.interactables.indexOf(mesh);
    if (idx !== -1) this.interactables.splice(idx, 1);
  }

  update(dt) {
    // Skip interaction prompts when device or task overlay is active
    if (this.game.state === GameState.DEVICE_OPEN || !this.game.player.movementEnabled) {
      this._currentTarget = null;
      this._holdTarget = null;
      this._holdTimer = 0;
      this._hidePrompt();
      return;
    }

    // Cast ray from camera center forward
    this._raycaster.setFromCamera(new THREE.Vector2(0, 0), this.camera);
    const hits = this._raycaster.intersectObjects(this.interactables, false);

    if (hits.length > 0) {
      const hit = hits[0];
      const interactable = hit.object.userData.interactable;
      if (interactable) {
        // Skip if condition check fails (e.g. player doesn't have required item)
        const condition = hit.object.userData._checkCondition;
        if (typeof condition === 'function' && !condition()) {
          this._currentTarget = null;
          this._holdTarget = null;
          this._holdTimer = 0;
          this._hidePrompt();
          return;
        }

        this._currentTarget = { object: hit.object, data: interactable };

        // Hold-to-interact mode
        const iKey = keybindings.getKey('interact');
        if (interactable.holdDuration) {
          if (this.game.input.isKeyDown(iKey)) {
            // Track hold target — reset if target changed
            if (this._holdTarget !== hit.object) {
              this._holdTarget = hit.object;
              this._holdTimer = 0;
            }
            this._holdTimer += dt;
            const pct = Math.min(this._holdTimer / interactable.holdDuration, 1);
            const bar = this._holdProgressBar(pct);
            this._showPrompt(`[E] ${bar} ${interactable.holdText || 'Hold...'}`);

            if (this._holdTimer >= interactable.holdDuration) {
              this._holdTarget = null;
              this._holdTimer = 0;
              if (typeof interactable.interact === 'function') {
                interactable.interact();
              }
            }
          } else {
            // E not held — show base prompt, reset hold
            this._holdTarget = null;
            this._holdTimer = 0;
            this._showPrompt(interactable.promptText || '[E] Interact');
          }
          return;
        }

        // Standard instant interact
        this._showPrompt(interactable.promptText || '[E] Interact');
        if (this.game.input.isKeyPressed(iKey)) {
          if (typeof interactable.interact === 'function') {
            interactable.interact();
          }
        }
        return;
      }
    }

    this._currentTarget = null;
    this._holdTarget = null;
    this._holdTimer = 0;
    this._hidePrompt();
  }

  _holdProgressBar(pct) {
    const filled = Math.round(pct * 8);
    return '\u2588'.repeat(filled) + '\u2591'.repeat(8 - filled);
  }

  _showPrompt(text) {
    if (this._promptEl) {
      this._promptEl.textContent = text;
      this._promptEl.classList.add('visible');
    }
  }

  _hidePrompt() {
    if (this._promptEl) {
      this._promptEl.classList.remove('visible');
    }
  }
}
