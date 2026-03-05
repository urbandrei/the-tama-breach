import { TaskBase, TaskState } from './task-base.js';
import { clamp } from '../utils/math-utils.js';

const DEFAULT_REQUIRED_CLICKS = 20;
const DRAIN_RATE = 8; // percent per second
const GLASS_ASCII = [
  '┌──────────────┐',
  '│  /  ╱   \\    │',
  '│    ╲  /  ╱   │',
  '│  ╱    ╲    / │',
  '│     /   ╱    │',
  '│  ╲   /    ╲  │',
  '└──────────────┘',
];

export class TaskGlassRepair extends TaskBase {
  constructor(game, config) {
    super(game, config);
    this._tamaId = config.tamaId;
    this._requiredClicks = config.requiredClicks || DEFAULT_REQUIRED_CLICKS;
    this._progress = 0;
    this._progressFill = null;
    this._progressText = null;
    this._glassArt = null;
    this._clickHandler = null;
  }

  start() {
    this._progress = 0;
    super.start();
  }

  _buildUI(container) {
    const title = document.createElement('div');
    title.className = 'task-title';
    title.textContent = 'REPAIR CONTAINMENT GLASS';
    container.appendChild(title);

    // Glass ASCII art
    this._glassArt = document.createElement('pre');
    this._glassArt.style.cssText = 'text-align:center;font-size:10px;padding:8px;border:1px solid #1a3a1a;color:#ff3333;text-shadow:0 0 8px rgba(255,51,51,0.4);margin:8px 0;';
    this._glassArt.textContent = GLASS_ASCII.join('\n');
    container.appendChild(this._glassArt);

    // Progress bar
    const progBg = document.createElement('div');
    progBg.className = 'task-progress-bg';
    this._progressFill = document.createElement('div');
    this._progressFill.className = 'task-progress-fill';
    this._progressFill.style.width = '0%';
    progBg.appendChild(this._progressFill);
    container.appendChild(progBg);

    // Progress text
    this._progressText = document.createElement('div');
    this._progressText.style.cssText = 'font-size:8px;text-align:center;margin-top:6px;color:#00aa2a;';
    this._progressText.textContent = '0%';
    container.appendChild(this._progressText);

    // Instruction
    const instruction = document.createElement('div');
    instruction.className = 'task-hint';
    instruction.style.fontSize = '8px';
    instruction.style.marginTop = '8px';
    instruction.textContent = 'CLICK RAPIDLY TO REPAIR';
    container.appendChild(instruction);

    const hint = document.createElement('div');
    hint.className = 'task-hint';
    hint.textContent = '[ESC] Cancel';
    container.appendChild(hint);

    // Click anywhere in the overlay to repair
    this._clickHandler = (e) => {
      if (this.state !== TaskState.ACTIVE) return;
      e.preventDefault();
      this._progress += 100 / this._requiredClicks;
      this._progress = clamp(this._progress, 0, 100);
      this._updateDisplay();
    };
    container.addEventListener('mousedown', this._clickHandler);
  }

  _updateDisplay() {
    const pct = Math.round(this._progress);
    if (this._progressFill) {
      this._progressFill.style.width = `${pct}%`;
    }
    if (this._progressText) {
      this._progressText.textContent = `${pct}%`;
    }

    // Transition glass art color from red → green as progress increases
    if (this._glassArt) {
      const ratio = this._progress / 100;
      if (ratio > 0.7) {
        this._glassArt.style.color = '#00ff41';
        this._glassArt.style.textShadow = '0 0 8px rgba(0,255,65,0.4)';
      } else if (ratio > 0.4) {
        this._glassArt.style.color = '#ffaa00';
        this._glassArt.style.textShadow = '0 0 8px rgba(255,170,0,0.4)';
      }
    }
  }

  update(dt) {
    if (this.state !== TaskState.ACTIVE) return;

    // Drain progress over time
    this._progress -= DRAIN_RATE * dt;
    if (this._progress < 0) this._progress = 0;
    this._updateDisplay();

    // Check completion
    if (this._progress >= 100) {
      // Repair containment and recapture
      const mgr = this.game.tamagotchiManager;
      if (mgr) {
        const tama = mgr.getTama(this._tamaId);
        if (tama) {
          tama.reset(); // restores to CONTAINED, repairs glass, resets needs, re-adds sprite
        }
      }
      // Despawn the roaming creature
      if (this.game.creatureManager) {
        this.game.creatureManager.despawnCreature(this._tamaId);
      }
      this.complete();
    }
  }

  _destroyOverlay() {
    if (this._overlay && this._clickHandler) {
      this._overlay.removeEventListener('mousedown', this._clickHandler);
    }
    this._progressFill = null;
    this._progressText = null;
    this._glassArt = null;
    this._clickHandler = null;
    super._destroyOverlay();
  }
}
