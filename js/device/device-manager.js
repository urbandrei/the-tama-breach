import { GameState } from '../core/constants.js';
import { DeviceRenderer } from './device-renderer.js';

export class DeviceManager {
  constructor(game) {
    this.game = game;
    this.isOpen = false;
    this.renderer = new DeviceRenderer(game);

    this._tabPending = false;

    // Own keydown listener for Tab — must preventDefault to stop browser focus cycling
    this._onKeyDown = (e) => {
      if (e.code === 'Tab') {
        e.preventDefault();
        this._tabPending = true;
      }
    };
    document.addEventListener('keydown', this._onKeyDown);
  }

  update(dt) {
    if (this._tabPending) {
      this._tabPending = false;
      this._toggle();
    }

    if (this.isOpen) {
      this.renderer.update(dt);
    }
  }

  _toggle() {
    if (this.isOpen) {
      this._close();
    } else {
      this._open();
    }
  }

  _open() {
    if (this.game.state === GameState.TASK_ACTIVE) return;
    this.isOpen = true;
    this.game.state = GameState.DEVICE_OPEN;
    this.game.player.deviceOpen = true;
    this.game.input.releasePointerLock();

    // Hide interact prompt
    const prompt = document.getElementById('interact-prompt');
    if (prompt) prompt.classList.remove('visible');

    this.renderer.show();
    this.game.emit('device:open');
  }

  _close() {
    this.isOpen = false;
    this.game.state = GameState.PLAYING;
    this.game.player.deviceOpen = false;

    this.renderer.hide();
    this.game.input.requestPointerLock();
    this.game.emit('device:close');
  }
}
