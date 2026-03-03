import * as THREE from 'three';
import { INTERACT_RANGE, GameState } from '../core/constants.js';

export class Interaction {
  constructor(game, camera) {
    this.game = game;
    this.camera = camera;
    this._raycaster = new THREE.Raycaster();
    this._raycaster.far = INTERACT_RANGE;
    this._currentTarget = null;
    this._promptEl = document.getElementById('interact-prompt');
    this.interactables = [];
  }

  addInteractable(mesh) {
    this.interactables.push(mesh);
  }

  removeInteractable(mesh) {
    const idx = this.interactables.indexOf(mesh);
    if (idx !== -1) this.interactables.splice(idx, 1);
  }

  update() {
    // Skip interaction prompts when device or task overlay is active
    if (this.game.state === GameState.DEVICE_OPEN || !this.game.player.movementEnabled) {
      this._currentTarget = null;
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
        this._currentTarget = { object: hit.object, data: interactable };
        this._showPrompt(interactable.promptText || '[E] Interact');

        // Check for interact key
        if (this.game.input.isKeyPressed('KeyE')) {
          if (typeof interactable.interact === 'function') {
            interactable.interact();
          }
        }
        return;
      }
    }

    this._currentTarget = null;
    this._hidePrompt();
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
