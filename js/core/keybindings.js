const STORAGE_KEY = 'tama-breach-keybindings';

const DEFAULTS = {
  move_forward: 'KeyW',
  move_back: 'KeyS',
  move_left: 'KeyA',
  move_right: 'KeyD',
  sprint: 'ShiftLeft',
  jump: 'Space',
  crouch: 'KeyC',
  flashlight: 'KeyF',
  interact: 'KeyE',
  device: 'Tab',
  minimap: 'KeyM',
};

// Human-readable names for display
const ACTION_LABELS = {
  move_forward: 'Move Forward',
  move_back: 'Move Back',
  move_left: 'Move Left',
  move_right: 'Move Right',
  sprint: 'Sprint',
  jump: 'Jump',
  crouch: 'Crouch',
  flashlight: 'Flashlight',
  interact: 'Interact',
  device: 'Device',
  minimap: 'Minimap',
};

// Convert key codes to display names
function codeToLabel(code) {
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Arrow')) return code.slice(5);
  const map = {
    ShiftLeft: 'L-SHIFT', ShiftRight: 'R-SHIFT',
    ControlLeft: 'L-CTRL', ControlRight: 'R-CTRL',
    AltLeft: 'L-ALT', AltRight: 'R-ALT',
    Space: 'SPACE', Tab: 'TAB', Enter: 'ENTER',
    Backspace: 'BKSP', Escape: 'ESC',
    CapsLock: 'CAPS',
  };
  return map[code] || code;
}

class KeyBindings {
  constructor() {
    this._bindings = { ...DEFAULTS };
    this._load();
  }

  /** Get the bound key code for an action. */
  getKey(action) {
    return this._bindings[action] || DEFAULTS[action];
  }

  /** Set a new key code for an action. */
  setKey(action, code) {
    this._bindings[action] = code;
    this._save();
  }

  /** Reset all bindings to defaults. */
  resetAll() {
    this._bindings = { ...DEFAULTS };
    this._save();
  }

  /** Get display label for bound key. */
  getLabel(action) {
    return codeToLabel(this.getKey(action));
  }

  /** Get action display name. */
  getActionLabel(action) {
    return ACTION_LABELS[action] || action;
  }

  /** Get all action names in display order. */
  getActions() {
    return Object.keys(DEFAULTS);
  }

  _load() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        for (const [action, code] of Object.entries(parsed)) {
          if (DEFAULTS[action] !== undefined) {
            this._bindings[action] = code;
          }
        }
      }
    } catch (_) {
      // Ignore malformed data
    }
  }

  _save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this._bindings));
    } catch (_) {
      // localStorage might be unavailable
    }
  }
}

// Singleton
export const keybindings = new KeyBindings();
