import * as THREE from 'three';
import { GameState, DEVICE_OPEN_PITCH, DEVICE_REARM_PITCH, DEVICE_CLOSE_BUFFER_PX, DEVICE_OPEN_COOLDOWN } from '../core/constants.js';
import { keybindings } from '../core/keybindings.js';
import { DeviceRenderer } from './device-renderer.js';
import { clamp } from '../utils/math-utils.js';

const BATTERY_MAX = 100;
const BATTERY_DRAIN_ACTIVE = 1.0;  // %/s when device is open
const BATTERY_DRAIN_IDLE = 0.05;   // %/s when device is closed
const BATTERY_CHARGE_RATE = 5.0;   // %/s when charging
const BATTERY_LOW_THRESHOLD = 20;  // % — triggers highlight + escort

const CHARGE_POS_X = -19.25;
const CHARGE_POS_Z = -7;

const HIGHLIGHT_FADE_FAR = 15;
const HIGHLIGHT_FADE_NEAR = 5;

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
    this._chargeBarEl = null; // visible charge progress bar (B4)

    // Desk highlight (green glow when battery low)
    this._deskHighlightMeshes = [];  // mesh references (no material cloning)
    this._deskHighlightEdges = [];   // LineSegments

    this._tabPending = false;

    // Look-down open state
    this._lookOpenArmed = true;
    this._closeCooldown = 0;
    this._onCursorMove = (e) => this._checkCursorAbove(e);

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
    // Trigger covers the center desk at (-19.25, -7)
    const trigger = new THREE.Mesh(
      new THREE.BoxGeometry(2.0, 1.5, 1.2),
      new THREE.MeshBasicMaterial({ visible: false })
    );
    trigger.position.set(CHARGE_POS_X, 0.75, CHARGE_POS_Z);

    trigger.userData.interactable = {
      promptText: '[E] Charge Device',
      interact: () => this._toggleCharging(),
    };
    trigger.userData._checkCondition = () => this.battery <= BATTERY_LOW_THRESHOLD;

    this.game.scene.add(trigger);
    this.game.player.interaction.addInteractable(trigger);
    this._chargeTrigger = trigger;

    // Find the center desk prop group (store reference for lazy highlight)
    this._deskPropGroup = this._findDeskProp();
  }

  _findDeskProp() {
    const roomProps = this.game.facility && this.game.facility.roomProps['command_center'];
    if (!roomProps || roomProps.length === 0) return null;

    let nearest = null;
    let nearestDist = Infinity;
    const _pos = new THREE.Vector3();
    for (const group of roomProps) {
      group.getWorldPosition(_pos);
      const dx = _pos.x - CHARGE_POS_X;
      const dz = _pos.z - CHARGE_POS_Z;
      const d = dx * dx + dz * dz;
      if (d < nearestDist) {
        nearestDist = d;
        nearest = group;
      }
    }
    return nearest;
  }

  _createDeskHighlight() {
    if (this._deskHighlightEdges.length > 0) return; // already active
    const group = this._deskPropGroup;
    if (!group) return;

    // Add edge lines only — don't clone materials so we don't interfere with task highlights
    group.traverse((child) => {
      if (!child.isMesh) return;
      if (!child.material || !child.material.visible) return;
      this._deskHighlightMeshes.push(child);

      const edgesGeo = new THREE.EdgesGeometry(child.geometry);
      const edgesMat = new THREE.LineBasicMaterial({
        color: 0x00ff41,
        transparent: true,
        opacity: 0,
      });
      const lines = new THREE.LineSegments(edgesGeo, edgesMat);
      lines.raycast = () => {};
      child.add(lines);
      this._deskHighlightEdges.push(lines);
    });
  }

  _removeDeskHighlight() {
    for (const lines of this._deskHighlightEdges) {
      lines.parent.remove(lines);
      lines.geometry.dispose();
      lines.material.dispose();
    }
    this._deskHighlightEdges = [];

    // Clear emissive on meshes (they may be task-cloned or original — either way safe)
    for (const mesh of this._deskHighlightMeshes) {
      if (mesh.material && mesh.material.emissive) {
        mesh.material.emissive.setHex(0x000000);
        mesh.material.emissiveIntensity = 0;
      }
    }
    this._deskHighlightMeshes = [];
  }

  update(dt) {
    // Look-down open cooldown
    if (this._closeCooldown > 0) this._closeCooldown -= dt;

    // Look-down open detection
    if (!this.isOpen && !this._briefingMode
        && this.game.state === GameState.PLAYING
        && this.battery > 0) {
      const pitch = this.game.player.pitch.rotation.x;
      // Re-arm when player looks up past threshold
      if (!this._lookOpenArmed && pitch > DEVICE_REARM_PITCH) {
        this._lookOpenArmed = true;
      }
      // Trigger open at pitch floor
      if (this._lookOpenArmed && this._closeCooldown <= 0
          && pitch <= DEVICE_OPEN_PITCH + 0.01) {
        this._lookOpenArmed = false;
        this._open();
      }
    }

    if (this._tabPending) {
      this._tabPending = false;
      if (!this._briefingMode) this._toggle();
    }

    // Battery drain/charge (only during gameplay states)
    if (this.game.state === GameState.PLAYING || this.game.state === GameState.DEVICE_OPEN) {
      if (this._isCharging) {
        this.battery = Math.min(BATTERY_MAX, this.battery + BATTERY_CHARGE_RATE * dt);
        // Update charge bar (B4)
        if (this._chargeBarEl) {
          const fill = this._chargeBarEl.querySelector('.charge-fill');
          if (fill) fill.style.width = `${Math.round(this.battery)}%`;
        }
        // Stop charging if player moves away
        const px = this.game.player.position.x;
        const pz = this.game.player.position.z;
        const dist = Math.sqrt((px - CHARGE_POS_X) ** 2 + (pz - CHARGE_POS_Z) ** 2);
        if (dist > 3.5) {
          this._isCharging = false;
          this._hideChargeBar();
        }
        if (this.battery >= BATTERY_MAX) {
          this._isCharging = false;
          this._hideChargeBar();
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

    // Desk highlight: green glow when battery low
    this._updateDeskHighlight(dt);

    if (this.isOpen) {
      this.renderer.update(dt);
    }
  }

  _updateDeskHighlight(_dt) {
    const shouldShow = this.battery <= BATTERY_LOW_THRESHOLD && !this._isCharging;

    if (shouldShow) {
      // Lazily create highlight when battery drops low
      if (this._deskHighlightMeshes.length === 0) this._createDeskHighlight();
      if (this._deskHighlightMeshes.length === 0) return; // prop claimed by task

      // Distance-based fade
      const px = this.game.player.position.x;
      const pz = this.game.player.position.z;
      const dx = CHARGE_POS_X - px;
      const dz = CHARGE_POS_Z - pz;
      const dist = Math.sqrt(dx * dx + dz * dz);
      const fade = clamp((HIGHLIGHT_FADE_FAR - dist) / (HIGHLIGHT_FADE_FAR - HIGHLIGHT_FADE_NEAR), 0, 1);

      for (const mesh of this._deskHighlightMeshes) {
        if (!mesh.material || !mesh.material.emissive) continue;
        mesh.material.emissive.setHex(0x00ff41);
        mesh.material.emissiveIntensity = 0.15 * fade;
      }
      for (const lines of this._deskHighlightEdges) {
        lines.material.opacity = 0.6 * fade;
      }
    } else if (this._deskHighlightMeshes.length > 0) {
      // Battery above threshold — tear down highlight, free desk for other tasks
      this._removeDeskHighlight();
    }
  }

  /** Escort interface for minimap — show path to charge station when battery low (B4). */
  get isEscortActive() {
    return this.battery <= BATTERY_LOW_THRESHOLD && !this._isCharging;
  }

  getEscortTarget() {
    return { x: CHARGE_POS_X, z: CHARGE_POS_Z };
  }

  _toggleCharging() {
    this._isCharging = !this._isCharging;
    if (this._isCharging) this._showChargeBar();
    else this._hideChargeBar();
  }

  _showChargeBar() {
    if (this._chargeBarEl) return;
    this._chargeBarEl = document.createElement('div');
    this._chargeBarEl.id = 'charge-bar';
    this._chargeBarEl.innerHTML = '<div class="charge-fill"></div><span class="charge-label">CHARGING...</span>';
    document.getElementById('ui-root').appendChild(this._chargeBarEl);
  }

  _hideChargeBar() {
    if (this._chargeBarEl) {
      this._chargeBarEl.remove();
      this._chargeBarEl = null;
    }
  }

  /** Show briefing on device (used by NightManager for elevator intro). */
  showBriefing(title, body, buttonText, onAction) {
    this._briefingMode = true;
    this.isOpen = true;
    this.renderer.showBriefing(title, body, buttonText, () => {
      this.hideBriefing();
      onAction();
    });

    // Release pointer lock and show OS cursor
    this.game.input.releasePointerLock();
    this.game.canvas.style.cursor = 'default';
  }

  hideBriefing() {
    this._briefingMode = false;
    this.isOpen = false;

    this.game.canvas.style.cursor = 'none';
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

    // Release pointer lock and show OS cursor
    this.game.input.releasePointerLock();
    this.game.canvas.style.cursor = 'default';

    // Click outside device → close (delay to ignore stale click from pointer lock release)
    clearTimeout(this._backdropClickTimer);
    this._backdropClickTimer = setTimeout(() => {
      if (this.isOpen && this.renderer._backdrop) {
        this.renderer._backdrop.addEventListener('click', () => this._close());
      }
    }, 200);

    // Listen for cursor moving above device to auto-close (delay to ignore stale mouse events from pointer lock release)
    clearTimeout(this._cursorListenTimer);
    this._cursorListenTimer = setTimeout(() => {
      if (this.isOpen) document.addEventListener('mousemove', this._onCursorMove);
    }, 200);

    this.game.emit('device:open');
  }

  _close() {
    if (!this.isOpen) return;

    // Remove listeners and prevent immediate re-trigger
    clearTimeout(this._cursorListenTimer);
    clearTimeout(this._backdropClickTimer);
    document.removeEventListener('mousemove', this._onCursorMove);
    this._lookOpenArmed = false;
    this._closeCooldown = DEVICE_OPEN_COOLDOWN;

    this.isOpen = false;
    this.game.state = GameState.PLAYING;
    this.game.player.deviceOpen = false;

    this.renderer.hide();

    // Re-acquire pointer lock and hide OS cursor
    this.game.canvas.style.cursor = 'none';
    this.game.input.requestPointerLock();

    this.game.emit('device:close');
  }

  _checkCursorAbove(e) {
    if (!this.isOpen || this._briefingMode) return;
    const container = this.renderer._container;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    if (e.clientY < rect.top - DEVICE_CLOSE_BUFFER_PX) {
      this._close();
    }
  }
}
