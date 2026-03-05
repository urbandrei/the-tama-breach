import { keybindings } from '../core/keybindings.js';

const SETTINGS = [
  { id: 'master_volume', label: 'MASTER VOLUME', value: 80, min: 0, max: 100 },
  { id: 'music_volume', label: 'MUSIC VOLUME', value: 60, min: 0, max: 100 },
  { id: 'sfx_volume', label: 'SFX VOLUME', value: 80, min: 0, max: 100 },
  { id: 'sensitivity', label: 'MOUSE SENSITIVITY', value: 50, min: 10, max: 100 },
];

export class SettingsTab {
  constructor(game) {
    this.game = game;
    this._el = null;
    this._controlRows = {};
    this._rebindingAction = null;
    this._rebindHandler = null;
  }

  createElement() {
    if (this._el) return this._el;

    const root = document.createElement('div');
    root.className = 'settings-tab';

    // Sliders
    for (const s of SETTINGS) {
      const section = document.createElement('div');
      section.className = 'settings-section';

      const label = document.createElement('div');
      label.className = 'settings-label';
      label.textContent = s.label;

      const row = document.createElement('div');
      row.className = 'settings-slider-row';

      const slider = document.createElement('input');
      slider.type = 'range';
      slider.className = 'device-slider';
      slider.min = s.min;
      slider.max = s.max;
      slider.value = s.value;

      const val = document.createElement('span');
      val.className = 'settings-value';
      val.textContent = `${s.value}%`;

      slider.addEventListener('input', () => {
        val.textContent = `${slider.value}%`;
      });

      row.appendChild(slider);
      row.appendChild(val);
      section.appendChild(label);
      section.appendChild(row);
      root.appendChild(section);
    }

    // Controls section with rebinding
    const ctrlSection = document.createElement('div');
    ctrlSection.className = 'controls-section';

    const ctrlTitle = document.createElement('div');
    ctrlTitle.className = 'controls-title';
    ctrlTitle.textContent = 'CONTROLS (click to rebind)';
    ctrlSection.appendChild(ctrlTitle);

    this._controlRows = {};
    for (const action of keybindings.getActions()) {
      const row = document.createElement('div');
      row.className = 'control-row rebindable';

      const actionLabel = document.createElement('span');
      actionLabel.textContent = keybindings.getActionLabel(action);

      const keyLabel = document.createElement('span');
      keyLabel.className = 'control-key';
      keyLabel.textContent = keybindings.getLabel(action);

      row.appendChild(actionLabel);
      row.appendChild(keyLabel);
      row.addEventListener('click', () => this._startRebind(action));
      ctrlSection.appendChild(row);

      this._controlRows[action] = { row, keyLabel };
    }

    // Reset button
    const resetBtn = document.createElement('button');
    resetBtn.className = 'tama-btn';
    resetBtn.textContent = 'RESET DEFAULTS';
    resetBtn.style.marginTop = '8px';
    resetBtn.addEventListener('click', () => {
      keybindings.resetAll();
      this._refreshKeyLabels();
    });
    ctrlSection.appendChild(resetBtn);

    root.appendChild(ctrlSection);
    this._el = root;
    return root;
  }

  _startRebind(action) {
    // Cancel previous rebind if any
    this._cancelRebind();

    this._rebindingAction = action;
    const entry = this._controlRows[action];
    entry.row.classList.add('rebinding');
    entry.keyLabel.textContent = '...';

    this._rebindHandler = (e) => {
      e.preventDefault();
      e.stopPropagation();

      // Escape cancels
      if (e.code === 'Escape') {
        this._cancelRebind();
        return;
      }

      keybindings.setKey(action, e.code);
      this._cancelRebind();
      this._refreshKeyLabels();
    };

    // Use capture to intercept before other handlers
    document.addEventListener('keydown', this._rebindHandler, true);
  }

  _cancelRebind() {
    if (this._rebindHandler) {
      document.removeEventListener('keydown', this._rebindHandler, true);
      this._rebindHandler = null;
    }
    if (this._rebindingAction) {
      const entry = this._controlRows[this._rebindingAction];
      if (entry) {
        entry.row.classList.remove('rebinding');
        entry.keyLabel.textContent = keybindings.getLabel(this._rebindingAction);
      }
      this._rebindingAction = null;
    }
  }

  _refreshKeyLabels() {
    for (const [action, entry] of Object.entries(this._controlRows)) {
      entry.keyLabel.textContent = keybindings.getLabel(action);
    }
  }

  onActivate() {}

  onDeactivate() {
    this._cancelRebind();
  }

  update(_dt) {}
}
