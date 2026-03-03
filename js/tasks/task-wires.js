import { TaskBase, TaskState } from './task-base.js';

const COLORS = [
  { id: 'red', hex: '#ff3333' },
  { id: 'blue', hex: '#3399ff' },
  { id: 'yellow', hex: '#ffcc00' },
  { id: 'green', hex: '#33ff66' },
];

const CANVAS_W = 400;
const CANVAS_H = 300;
const NODE_RADIUS = 15;
const LEFT_X = 50;
const RIGHT_X = 350;

export class TaskWires extends TaskBase {
  constructor(game, config) {
    super(game, config);
    this._canvas = null;
    this._ctx = null;
    this._leftNodes = [];
    this._rightNodes = [];
    this._selectedLeft = null;
    this._matched = {};
    this._matchCount = 0;
    this._errorFlash = 0;
    this._clickHandler = null;
  }

  start() {
    // Shuffle node positions
    this._leftNodes = this._shufflePositions(COLORS);
    this._rightNodes = this._shufflePositions(COLORS);
    this._selectedLeft = null;
    this._matched = {};
    this._matchCount = 0;
    this._errorFlash = 0;

    super.start();
  }

  _shufflePositions(colors) {
    const spacing = CANVAS_H / (colors.length + 1);
    const indices = colors.map((_, i) => i);
    // Fisher-Yates shuffle
    for (let i = indices.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [indices[i], indices[j]] = [indices[j], indices[i]];
    }
    return indices.map((colorIdx, posIdx) => ({
      color: colors[colorIdx],
      y: spacing * (posIdx + 1),
    }));
  }

  _buildUI(container) {
    const title = document.createElement('div');
    title.className = 'task-title';
    title.textContent = this.title.toUpperCase();
    container.appendChild(title);

    this._canvas = document.createElement('canvas');
    this._canvas.width = CANVAS_W;
    this._canvas.height = CANVAS_H;
    container.appendChild(this._canvas);
    this._ctx = this._canvas.getContext('2d');

    // Hint
    const hint = document.createElement('div');
    hint.className = 'task-hint';
    hint.textContent = 'Click left node, then matching right node  •  [ESC] Cancel';
    container.appendChild(hint);

    this._clickHandler = (e) => this._onClick(e);
    this._canvas.addEventListener('click', this._clickHandler);

    this._draw();
  }

  _onClick(e) {
    if (this.state !== TaskState.ACTIVE) return;

    const rect = this._canvas.getBoundingClientRect();
    const mx = (e.clientX - rect.left) * (CANVAS_W / rect.width);
    const my = (e.clientY - rect.top) * (CANVAS_H / rect.height);

    // Check left nodes
    for (const node of this._leftNodes) {
      if (this._matched[node.color.id]) continue;
      const dx = mx - LEFT_X;
      const dy = my - node.y;
      if (dx * dx + dy * dy <= NODE_RADIUS * NODE_RADIUS * 2) {
        this._selectedLeft = node;
        this._draw();
        return;
      }
    }

    // Check right nodes
    if (this._selectedLeft) {
      for (const node of this._rightNodes) {
        if (this._matched[node.color.id]) continue;
        const dx = mx - RIGHT_X;
        const dy = my - node.y;
        if (dx * dx + dy * dy <= NODE_RADIUS * NODE_RADIUS * 2) {
          if (node.color.id === this._selectedLeft.color.id) {
            // Correct match
            this._matched[node.color.id] = {
              leftY: this._selectedLeft.y,
              rightY: node.y,
              hex: node.color.hex,
            };
            this._matchCount++;
            this._selectedLeft = null;

            if (this._matchCount >= COLORS.length) {
              this._draw();
              setTimeout(() => this.complete(), 300);
              return;
            }
          } else {
            // Wrong match
            this._selectedLeft = null;
            this._errorFlash = 1;
            setTimeout(() => {
              this._errorFlash = 0;
              this._draw();
            }, 300);
          }
          this._draw();
          return;
        }
      }
    }
  }

  _draw() {
    const ctx = this._ctx;
    if (!ctx) return;

    // Background
    ctx.fillStyle = '#0a0f0a';
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

    // Draw matched wires
    for (const m of Object.values(this._matched)) {
      ctx.beginPath();
      ctx.moveTo(LEFT_X, m.leftY);
      ctx.bezierCurveTo(
        LEFT_X + 80, m.leftY,
        RIGHT_X - 80, m.rightY,
        RIGHT_X, m.rightY
      );
      ctx.strokeStyle = m.hex;
      ctx.lineWidth = 3;
      ctx.shadowColor = m.hex;
      ctx.shadowBlur = 8;
      ctx.stroke();
      ctx.shadowBlur = 0;
    }

    // Draw left nodes
    for (const node of this._leftNodes) {
      const matched = this._matched[node.color.id];
      const selected = this._selectedLeft === node;

      ctx.beginPath();
      ctx.arc(LEFT_X, node.y, NODE_RADIUS, 0, Math.PI * 2);
      ctx.fillStyle = matched ? node.color.hex : '#0a1a0a';
      ctx.fill();
      ctx.lineWidth = selected ? 3 : 2;
      ctx.strokeStyle = node.color.hex;
      ctx.stroke();

      if (selected) {
        ctx.beginPath();
        ctx.arc(LEFT_X, node.y, NODE_RADIUS + 4, 0, Math.PI * 2);
        ctx.strokeStyle = '#00ff41';
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    }

    // Draw right nodes
    for (const node of this._rightNodes) {
      const matched = this._matched[node.color.id];

      ctx.beginPath();
      ctx.arc(RIGHT_X, node.y, NODE_RADIUS, 0, Math.PI * 2);
      ctx.fillStyle = matched ? node.color.hex : '#0a1a0a';
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = node.color.hex;
      ctx.stroke();
    }

    // Error flash
    if (this._errorFlash) {
      ctx.fillStyle = 'rgba(255, 51, 51, 0.15)';
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    }
  }

  update(_dt) {
    // Wires task is event-driven (clicks), no per-frame update needed
  }

  _destroyOverlay() {
    if (this._canvas && this._clickHandler) {
      this._canvas.removeEventListener('click', this._clickHandler);
    }
    this._canvas = null;
    this._ctx = null;
    this._clickHandler = null;
    super._destroyOverlay();
  }
}
