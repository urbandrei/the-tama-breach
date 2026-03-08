/**
 * Dev panel — press + to toggle. Debug shortcuts for rapid testing.
 */
export class DevPanel {
  constructor(game) {
    this.game = game;
    this._visible = false;
    this._el = null;

    this._buildUI();

    document.addEventListener('keydown', (e) => {
      if (e.code === 'Equal') {
        e.preventDefault();
        this._toggle();
      }
    });
  }

  _toggle() {
    this._visible = !this._visible;
    this._el.style.display = this._visible ? 'flex' : 'none';
    if (this._visible) {
      this.game.input.releasePointerLock();
    }
  }

  _buildUI() {
    const el = document.createElement('div');
    el.id = 'dev-panel';
    el.style.cssText = `
      position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
      z-index: 9999; display: none;
      flex-direction: column; gap: 8px;
      background: rgba(0, 0, 0, 0.92);
      border: 2px solid #00ff41;
      padding: 20px 28px;
      font-family: 'Press Start 2P', monospace;
      min-width: 260px;
    `;

    const title = document.createElement('div');
    title.textContent = 'DEV PANEL';
    title.style.cssText = `
      color: #00ff41; font-size: 12px; text-align: center;
      margin-bottom: 8px; text-shadow: 0 0 8px rgba(0,255,65,0.4);
    `;
    el.appendChild(title);

    this._addButton(el, 'Skip to Night', () => this._skipToNight());
    this._addButton(el, 'Trigger Escape', () => this._triggerEscape());
    this._addButton(el, 'Drain Battery 10%', () => this._drainBattery());

    const hint = document.createElement('div');
    hint.textContent = 'Press + to close';
    hint.style.cssText = `
      color: #00ff4180; font-size: 6px; text-align: center; margin-top: 8px;
    `;
    el.appendChild(hint);

    document.body.appendChild(el);
    this._el = el;
  }

  _addButton(parent, label, onClick) {
    const btn = document.createElement('button');
    btn.textContent = label;
    btn.style.cssText = `
      display: block; width: 100%;
      padding: 10px 16px;
      background: none;
      border: 1px solid #00ff41;
      color: #00ff41;
      font-family: 'Press Start 2P', monospace;
      font-size: 8px;
      cursor: pointer;
      transition: background 0.15s;
    `;
    btn.addEventListener('mouseenter', () => {
      btn.style.background = 'rgba(0, 255, 65, 0.15)';
    });
    btn.addEventListener('mouseleave', () => {
      btn.style.background = 'none';
    });
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      onClick();
    });
    parent.appendChild(btn);
  }

  _skipToNight() {
    const nm = this.game.nightManager;
    const dm = this.game.deviceManager;

    // Add nibbles as delivered so it appears in containment
    nm._deliveredTamaIds.add('nibbles');

    // Full night setup (sets nightConfig, resets all systems, shows briefing)
    nm._startNightIntro();

    // Dismiss the briefing UI that _startNightIntro just opened
    if (dm._briefingMode) dm.hideBriefing();

    // Skip elevator descent — go directly to gameplay
    nm._beginNight();

    // Position player in front of Containment A (not inside elevator)
    this.game.player.position.set(-7.5, 1.7, 15);
    this.game.player.yaw.rotation.y = Math.PI; // face north toward containment

    // Close panel
    this._toggle();
  }

  _drainBattery() {
    const dm = this.game.deviceManager;
    if (!dm) return;
    dm.battery = 10;
    console.log('[DevPanel] Battery set to 10%');
    this._toggle();
  }

  _triggerEscape() {
    const tm = this.game.tamagotchiManager;
    if (!tm) return;

    // Find first active contained tama
    const tama = tm._tamaList.find(
      (t) => t.active && t.state !== 'escaped' && t.state !== 'recaptured',
    );

    if (!tama) {
      console.warn('[DevPanel] No active contained tama found');
      return;
    }

    // Break the glass — next update() triggers breach automatically
    tama.containment.glassHealth = 0;
    console.log(`[DevPanel] Broke glass on ${tama.id}`);

    // Close panel
    this._toggle();
  }
}
