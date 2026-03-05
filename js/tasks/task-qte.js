import { TaskBase, TaskState } from './task-base.js';

const KEYS = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyE'];
const KEY_LABELS = { KeyW: 'W', KeyA: 'A', KeyS: 'S', KeyD: 'D', KeyE: 'E' };
const DEFAULT_KEY_COUNT = 5;
const DEFAULT_TIME_LIMIT = 8;
export class TaskQTE extends TaskBase {
  constructor(game, config) {
    super(game, config);
    this._keyCount = config.keyCount || DEFAULT_KEY_COUNT;
    this._timeLimit = config.timeLimit || DEFAULT_TIME_LIMIT;

    this._sequence = [];
    this._currentIndex = 0;
    this._timeRemaining = 0;
    this._dots = [];
    this._keyPrompt = null;
    this._timerFill = null;
    this._flashTimeout = null;
  }

  start() {
    // Generate random key sequence before calling super (which builds UI)
    this._sequence = [];
    for (let i = 0; i < this._keyCount; i++) {
      this._sequence.push(KEYS[Math.floor(Math.random() * KEYS.length)]);
    }
    this._currentIndex = 0;
    this._timeRemaining = this._timeLimit;

    super.start();
  }

  _buildUI(container) {
    const title = document.createElement('div');
    title.className = 'task-title';
    title.textContent = this.title.toUpperCase();
    container.appendChild(title);

    // Key prompt
    this._keyPrompt = document.createElement('div');
    this._keyPrompt.className = 'task-key-prompt';
    this._keyPrompt.textContent = KEY_LABELS[this._sequence[0]];
    container.appendChild(this._keyPrompt);

    // Progress dots
    const dotsRow = document.createElement('div');
    dotsRow.className = 'task-dots';
    this._dots = [];
    for (let i = 0; i < this._keyCount; i++) {
      const dot = document.createElement('div');
      dot.className = 'task-dot';
      dotsRow.appendChild(dot);
      this._dots.push(dot);
    }
    container.appendChild(dotsRow);

    // Hint
    const hint = document.createElement('div');
    hint.className = 'task-hint';
    hint.textContent = '[ESC] Cancel';
    container.appendChild(hint);
  }

  update(dt) {
    if (this.state !== TaskState.ACTIVE) return;

    // Check key presses
    const expectedKey = this._sequence[this._currentIndex];
    for (const key of KEYS) {
      if (this.game.input.isKeyPressed(key)) {
        if (key === expectedKey) {
          this._onCorrectKey();
        } else {
          this._onWrongKey();
        }
        break;
      }
    }
  }

  _onCorrectKey() {
    const dot = this._dots[this._currentIndex];
    if (dot) dot.classList.add('filled');

    this._currentIndex++;

    if (this._currentIndex >= this._keyCount) {
      this.complete();
      return;
    }

    // Show next key
    if (this._keyPrompt) {
      this._keyPrompt.textContent = KEY_LABELS[this._sequence[this._currentIndex]];
      this._keyPrompt.style.color = '#00ff41';
    }
  }

  _onWrongKey() {
    if (this._keyPrompt) {
      this._keyPrompt.style.color = '#ff3333';
      clearTimeout(this._flashTimeout);
      this._flashTimeout = setTimeout(() => {
        if (this._keyPrompt) this._keyPrompt.style.color = '#00ff41';
      }, 200);
    }
  }

  _destroyOverlay() {
    clearTimeout(this._flashTimeout);
    this._flashTimeout = null;
    this._dots = [];
    this._keyPrompt = null;
    this._timerFill = null;
    super._destroyOverlay();
  }
}
