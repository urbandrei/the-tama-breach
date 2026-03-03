import { TaskBase, TaskState } from './task-base.js';
import { clamp } from '../utils/math-utils.js';

const CANVAS_W = 400;
const CANVAS_H = 300;
const TARGET_RADIUS = 40;
const DEFAULT_DURATION = 5;
const DRAIN_RATE = 0.5; // multiplier of fill rate when outside target
const BG_COLOR = '#0a0f0a';
const TARGET_COLOR = '#00ff41';
const TARGET_DIM = '#0a5a2a';
const CROSSHAIR_COLOR = '#00ff41';

export class TaskHoldSteady extends TaskBase {
  constructor(game, config) {
    super(game, config);
    this._duration = config.duration || DEFAULT_DURATION;

    this._canvas = null;
    this._ctx = null;
    this._progress = 0;
    this._time = 0;
    this._mouseX = CANVAS_W / 2;
    this._mouseY = CANVAS_H / 2;
    this._targetX = CANVAS_W / 2;
    this._targetY = CANVAS_H / 2;
    this._moveHandler = null;
    this._progressFill = null;

    // Lissajous parameters
    this._freqA = 0.7;
    this._freqB = 1.1;
    this._ampX = CANVAS_W * 0.3;
    this._ampY = CANVAS_H * 0.3;
  }

  start() {
    this._progress = 0;
    this._time = 0;
    this._mouseX = CANVAS_W / 2;
    this._mouseY = CANVAS_H / 2;
    super.start();
  }

  _buildUI(container) {
    const title = document.createElement('div');
    title.className = 'task-title';
    title.textContent = this.title.toUpperCase();
    container.appendChild(title);

    // Progress bar
    const progBg = document.createElement('div');
    progBg.className = 'task-progress-bg';
    this._progressFill = document.createElement('div');
    this._progressFill.className = 'task-progress-fill';
    this._progressFill.style.width = '0%';
    progBg.appendChild(this._progressFill);
    container.appendChild(progBg);

    this._canvas = document.createElement('canvas');
    this._canvas.width = CANVAS_W;
    this._canvas.height = CANVAS_H;
    container.appendChild(this._canvas);
    this._ctx = this._canvas.getContext('2d');

    const hint = document.createElement('div');
    hint.className = 'task-hint';
    hint.textContent = 'Keep cursor inside the target circle  •  [ESC] Cancel';
    container.appendChild(hint);

    this._moveHandler = (e) => {
      const rect = this._canvas.getBoundingClientRect();
      this._mouseX = (e.clientX - rect.left) * (CANVAS_W / rect.width);
      this._mouseY = (e.clientY - rect.top) * (CANVAS_H / rect.height);
    };
    this._canvas.addEventListener('mousemove', this._moveHandler);
  }

  update(dt) {
    if (this.state !== TaskState.ACTIVE) return;

    this._time += dt;

    // Update target position (Lissajous curve)
    const cx = CANVAS_W / 2;
    const cy = CANVAS_H / 2;
    this._targetX = cx + this._ampX * Math.sin(this._freqA * this._time);
    this._targetY = cy + this._ampY * Math.sin(this._freqB * this._time);

    // Check if cursor is inside target
    const dx = this._mouseX - this._targetX;
    const dy = this._mouseY - this._targetY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const inside = dist <= TARGET_RADIUS;

    // Update progress
    const fillRate = 1 / this._duration;
    if (inside) {
      this._progress += fillRate * dt;
    } else {
      this._progress -= fillRate * DRAIN_RATE * dt;
    }
    this._progress = clamp(this._progress, 0, 1);

    // Update progress bar
    if (this._progressFill) {
      this._progressFill.style.width = `${Math.round(this._progress * 100)}%`;
    }

    this._draw(inside);

    if (this._progress >= 1) {
      this.complete();
    }
  }

  _draw(inside) {
    const ctx = this._ctx;
    if (!ctx) return;

    // Background
    ctx.fillStyle = BG_COLOR;
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

    // Target circle
    ctx.beginPath();
    ctx.arc(this._targetX, this._targetY, TARGET_RADIUS, 0, Math.PI * 2);
    ctx.strokeStyle = inside ? TARGET_COLOR : TARGET_DIM;
    ctx.lineWidth = 2;
    if (inside) {
      ctx.shadowColor = TARGET_COLOR;
      ctx.shadowBlur = 12;
    }
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Fill when inside
    if (inside) {
      ctx.fillStyle = 'rgba(0, 255, 65, 0.1)';
      ctx.fill();
    }

    // Crosshair at mouse position
    const size = 10;
    ctx.strokeStyle = CROSSHAIR_COLOR;
    ctx.lineWidth = 1.5;

    ctx.beginPath();
    ctx.moveTo(this._mouseX - size, this._mouseY);
    ctx.lineTo(this._mouseX + size, this._mouseY);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(this._mouseX, this._mouseY - size);
    ctx.lineTo(this._mouseX, this._mouseY + size);
    ctx.stroke();

    // Small center dot
    ctx.beginPath();
    ctx.arc(this._mouseX, this._mouseY, 2, 0, Math.PI * 2);
    ctx.fillStyle = CROSSHAIR_COLOR;
    ctx.fill();
  }

  _destroyOverlay() {
    if (this._canvas && this._moveHandler) {
      this._canvas.removeEventListener('mousemove', this._moveHandler);
    }
    this._canvas = null;
    this._ctx = null;
    this._moveHandler = null;
    this._progressFill = null;
    super._destroyOverlay();
  }
}
