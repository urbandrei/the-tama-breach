import * as THREE from 'three';
import { GameState } from '../core/constants.js';
import { keybindings } from '../core/keybindings.js';
import { DeviceRenderer } from './device-renderer.js';

const BATTERY_MAX = 100;
const BATTERY_DRAIN_ACTIVE = 1.0;  // %/s when device is open
const BATTERY_DRAIN_IDLE = 0.05;   // %/s when device is closed
const BATTERY_CHARGE_RATE = 5.0;   // %/s when charging

export class DeviceManager {
  constructor(game) {
    this.game = game;
    this.isOpen = false;
    this._briefingMode = false;
    this.renderer = new DeviceRenderer(game);

    // Battery
    this.battery = BATTERY_MAX;
    this._isCharging = false;
    this._chargeTrigger = null;

    this._tabPending = false;

    // Own keydown listener for Tab — must preventDefault to stop browser focus cycling
    this._onKeyDown = (e) => {
      if (e.code === keybindings.getKey('device')) {
        e.preventDefault();
        this._tabPending = true;
      }
    };
    document.addEventListener('keydown', this._onKeyDown);
  }

  /** Place charging station interaction in command center. Call after facility is built. */
  placeChargeTrigger() {
    // Command center: center [-19.25, -5], size [8.5, 10]
    // Place near the desk at the back
    const trigger = new THREE.Mesh(
      new THREE.BoxGeometry(1.2, 1.5, 0.6),
      new THREE.MeshBasicMaterial({ visible: false })
    );
    trigger.position.set(-17.25, 1.0, -7);

    trigger.userData.interactable = {
      promptText: '[E] Charge Device',
      interact: () => this._toggleCharging(),
    };
    trigger.userData._checkCondition = () => this.battery < BATTERY_MAX;

    this.game.scene.add(trigger);
    this.game.player.interaction.addInteractable(trigger);
    this._chargeTrigger = trigger;
  }

  update(dt) {
    if (this._tabPending) {
      this._tabPending = false;
      if (!this._briefingMode) this._toggle();
    }

    // Battery drain/charge (only during gameplay states)
    if (this.game.state === GameState.PLAYING || this.game.state === GameState.DEVICE_OPEN) {
      if (this._isCharging) {
        this.battery = Math.min(BATTERY_MAX, this.battery + BATTERY_CHARGE_RATE * dt);
        // Stop charging if player moves away
        const px = this.game.player.position.x;
        const pz = this.game.player.position.z;
        const dist = Math.sqrt((px - (-17.25)) ** 2 + (pz - (-7)) ** 2);
        if (dist > 3.0) {
          this._isCharging = false;
        }
        if (this.battery >= BATTERY_MAX) {
          this._isCharging = false;
        }
      } else if (this.isOpen) {
        this.battery = Math.max(0, this.battery - BATTERY_DRAIN_ACTIVE * dt);
        if (this.battery <= 0) {
          this._close();
        }
      } else {
        this.battery = Math.max(0, this.battery - BATTERY_DRAIN_IDLE * dt);
      }
    }

    // Update battery indicator
    this.renderer.updateBattery(this.battery);

    if (this.isOpen) {
      this.renderer.update(dt);
    }
  }

  _toggleCharging() {
    this._isCharging = !this._isCharging;
  }

  /** Show briefing on device (used by NightManager for elevator intro). */
  showBriefing(title, body, buttonText, onAction) {
    this._briefingMode = true;
    this.isOpen = true;
    this.renderer.showBriefing(title, body, buttonText, () => {
      this.hideBriefing();
      onAction();
    });

    // Activate software cursor if pointer lock is active (keeps cursor confined to device)
    const frame = document.getElementById('device-frame');
    if (frame && this.game.softwareCursor && this.game.input.isPointerLocked) {
      this.game.softwareCursor.activate(frame);
    }
  }

  hideBriefing() {
    this._briefingMode = false;
    this.isOpen = false;

    // Deactivate software cursor
    if (this.game.softwareCursor) {
      this.game.softwareCursor.deactivate();
    }

    this.renderer.hideBriefing();
  }

  _toggle() {
    if (this.isOpen) {
      this._close();
    } else {
      this._open();
    }
  }

  _open() {
    if (this.game.state !== GameState.PLAYING) return;
    if (this.battery <= 0) return; // Dead battery — refuse to open
    this.isOpen = true;
    this.game.state = GameState.DEVICE_OPEN;
    this.game.player.deviceOpen = true;

    // Hide interact prompt
    const prompt = document.getElementById('interact-prompt');
    if (prompt) prompt.classList.remove('visible');

    this.renderer.show();

    // Activate software cursor (pointer lock keeps cursor confined to device)
    const frame = document.getElementById('device-frame');
    if (frame && this.game.softwareCursor && this.game.input.isPointerLocked) {
      this.game.softwareCursor.activate(frame);
    }

    this.game.emit('device:open');
  }

  _close() {
    this.isOpen = false;
    this.game.state = GameState.PLAYING;
    this.game.player.deviceOpen = false;

    // Deactivate software cursor
    if (this.game.softwareCursor) {
      this.game.softwareCursor.deactivate();
    }

    this.renderer.hide();
    this.game.emit('device:close');
  }
}
