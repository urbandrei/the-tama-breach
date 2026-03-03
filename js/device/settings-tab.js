const SETTINGS = [
  { id: 'master_volume', label: 'MASTER VOLUME', value: 80, min: 0, max: 100 },
  { id: 'music_volume', label: 'MUSIC VOLUME', value: 60, min: 0, max: 100 },
  { id: 'sfx_volume', label: 'SFX VOLUME', value: 80, min: 0, max: 100 },
  { id: 'sensitivity', label: 'MOUSE SENSITIVITY', value: 50, min: 10, max: 100 },
];

const CONTROLS = [
  ['WASD', 'Move'],
  ['SHIFT', 'Sprint'],
  ['SPACE', 'Jump'],
  ['C', 'Crouch'],
  ['F', 'Flashlight'],
  ['E', 'Interact'],
  ['TAB', 'Device'],
];

export class SettingsTab {
  constructor(game) {
    this.game = game;
    this._el = null;
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

    // Controls reference
    const ctrlSection = document.createElement('div');
    ctrlSection.className = 'controls-section';

    const ctrlTitle = document.createElement('div');
    ctrlTitle.className = 'controls-title';
    ctrlTitle.textContent = 'CONTROLS';
    ctrlSection.appendChild(ctrlTitle);

    for (const [key, action] of CONTROLS) {
      const row = document.createElement('div');
      row.className = 'control-row';

      const k = document.createElement('span');
      k.className = 'control-key';
      k.textContent = key;

      const a = document.createElement('span');
      a.textContent = action;

      row.appendChild(k);
      row.appendChild(a);
      ctrlSection.appendChild(row);
    }

    root.appendChild(ctrlSection);
    this._el = root;
    return root;
  }

  onActivate() {}
  onDeactivate() {}
  update(_dt) {}
}
