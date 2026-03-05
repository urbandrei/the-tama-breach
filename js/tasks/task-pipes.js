import { TaskBase, TaskState } from './task-base.js';

const GRID_SIZE = 4;
const CELL_W = 120;
const CELL_H = 80;
const CANVAS_W = GRID_SIZE * CELL_W;  // 480
const CANVAS_H = GRID_SIZE * CELL_H;  // 320
const PIPE_WIDTH = 12;
const BG_COLOR = '#0a0f0a';
const PIPE_DIM = '#0a5a2a';
const PIPE_LIT = '#00ff41';
const PIPE_BORDER = '#1a3a1a';

// Directions: 0=up, 1=right, 2=down, 3=left
const DIR = { UP: 0, RIGHT: 1, DOWN: 2, LEFT: 3 };
const DX = [0, 1, 0, -1];
const DY = [-1, 0, 1, 0];

// Pipe types and their base connections (before rotation)
// Each type defines which directions are open
const PIPE_TYPES = {
  straight: [DIR.UP, DIR.DOWN],      // vertical straight
  elbow: [DIR.UP, DIR.RIGHT],        // L-bend
  tee: [DIR.UP, DIR.RIGHT, DIR.DOWN], // T-junction
  cross: [DIR.UP, DIR.RIGHT, DIR.DOWN, DIR.LEFT], // + cross
};

export class TaskPipes extends TaskBase {
  constructor(game, config) {
    super(game, config);
    this._canvas = null;
    this._ctx = null;
    this._grid = null;
    this._sourceRow = 0;
    this._sinkRow = 2;
    this._connected = null;
    this._clickHandler = null;
  }

  start() {
    this._generatePuzzle();
    super.start();
  }

  _generatePuzzle() {
    // Create a solved grid first, then randomize rotations
    this._grid = [];
    for (let r = 0; r < GRID_SIZE; r++) {
      this._grid[r] = [];
      for (let c = 0; c < GRID_SIZE; c++) {
        this._grid[r][c] = { type: 'straight', rotation: 0 };
      }
    }

    // Build a known solution path from source to sink
    // Source: left edge, row 0. Sink: right edge, row 2.
    this._sourceRow = 0;
    this._sinkRow = 2;

    // Simple solution path: right across row 0, down to row 2, right to exit
    // Row 0: straight-right across
    // Row 0, col 0: elbow (right + down) or (left + right) — source enters from left
    // Let's do: row 0 goes right, then drops down at col 2, then goes right on row 2

    const solution = [
      // [row, col, type, rotation]
      [0, 0, 'straight', 1],  // horizontal: left-right
      [0, 1, 'elbow', 1],     // right-down (rotated elbow)
      [1, 1, 'straight', 0],  // vertical: up-down
      [2, 1, 'elbow', 3],     // up-right → (rotated)
      [2, 2, 'straight', 1],  // horizontal
      [2, 3, 'straight', 1],  // horizontal to sink
    ];

    // Fill non-path cells with random types
    const pathCells = new Set(solution.map(([r, c]) => `${r},${c}`));

    for (const [r, c, type, rotation] of solution) {
      this._grid[r][c] = { type, rotation };
    }

    // Fill remaining with random pipe types
    const types = ['straight', 'elbow', 'tee', 'cross'];
    for (let r = 0; r < GRID_SIZE; r++) {
      for (let c = 0; c < GRID_SIZE; c++) {
        if (!pathCells.has(`${r},${c}`)) {
          this._grid[r][c] = {
            type: types[Math.floor(Math.random() * types.length)],
            rotation: Math.floor(Math.random() * 4),
          };
        }
      }
    }

    // Randomize rotations of ALL tiles (including solution path)
    for (let r = 0; r < GRID_SIZE; r++) {
      for (let c = 0; c < GRID_SIZE; c++) {
        const randomTurns = Math.floor(Math.random() * 3) + 1; // 1-3 rotations
        this._grid[r][c].rotation = (this._grid[r][c].rotation + randomTurns) % 4;
      }
    }

    this._connected = this._checkConnectivity();
  }

  _getOpenDirections(row, col) {
    const cell = this._grid[row][col];
    const baseDirections = PIPE_TYPES[cell.type];
    return baseDirections.map(d => (d + cell.rotation) % 4);
  }

  _checkConnectivity() {
    // BFS from source (left of sourceRow) to sink (right of sinkRow)
    const connected = Array.from({ length: GRID_SIZE }, () =>
      Array(GRID_SIZE).fill(false)
    );

    // Source enters from the left of (sourceRow, 0)
    const startDirs = this._getOpenDirections(this._sourceRow, 0);
    if (!startDirs.includes(DIR.LEFT)) return connected;

    const queue = [[this._sourceRow, 0]];
    connected[this._sourceRow][0] = true;

    while (queue.length > 0) {
      const [r, c] = queue.shift();
      const openDirs = this._getOpenDirections(r, c);

      for (const dir of openDirs) {
        const nr = r + DY[dir];
        const nc = c + DX[dir];

        if (nr < 0 || nr >= GRID_SIZE || nc < 0 || nc >= GRID_SIZE) continue;
        if (connected[nr][nc]) continue;

        // Check that the neighbor connects back
        const opposite = (dir + 2) % 4;
        const neighborDirs = this._getOpenDirections(nr, nc);
        if (neighborDirs.includes(opposite)) {
          connected[nr][nc] = true;
          queue.push([nr, nc]);
        }
      }
    }

    return connected;
  }

  _isSolved() {
    if (!this._connected[this._sinkRow][GRID_SIZE - 1]) return false;
    // Also check that the sink cell opens to the right
    const sinkDirs = this._getOpenDirections(this._sinkRow, GRID_SIZE - 1);
    return sinkDirs.includes(DIR.RIGHT);
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

    const hint = document.createElement('div');
    hint.className = 'task-hint';
    hint.textContent = 'Click tiles to rotate • Connect source (left) to sink (right)  •  [ESC] Cancel';
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

    const col = Math.floor(mx / CELL_W);
    const row = Math.floor(my / CELL_H);

    if (row < 0 || row >= GRID_SIZE || col < 0 || col >= GRID_SIZE) return;

    // Rotate tile
    this._grid[row][col].rotation = (this._grid[row][col].rotation + 1) % 4;
    this._connected = this._checkConnectivity();
    this._draw();

    if (this._isSolved()) {
      setTimeout(() => this.complete(), 400);
    }
  }

  _draw() {
    const ctx = this._ctx;
    if (!ctx) return;

    ctx.fillStyle = BG_COLOR;
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

    // Draw grid lines
    ctx.strokeStyle = PIPE_BORDER;
    ctx.lineWidth = 1;
    for (let i = 0; i <= GRID_SIZE; i++) {
      ctx.beginPath();
      ctx.moveTo(i * CELL_W, 0);
      ctx.lineTo(i * CELL_W, CANVAS_H);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, i * CELL_H);
      ctx.lineTo(CANVAS_W, i * CELL_H);
      ctx.stroke();
    }

    // Draw source and sink indicators
    const srcY = this._sourceRow * CELL_H + CELL_H / 2;
    const snkY = this._sinkRow * CELL_H + CELL_H / 2;

    ctx.fillStyle = PIPE_LIT;
    ctx.shadowColor = PIPE_LIT;
    ctx.shadowBlur = 8;
    // Source arrow
    ctx.beginPath();
    ctx.moveTo(0, srcY - 10);
    ctx.lineTo(15, srcY);
    ctx.lineTo(0, srcY + 10);
    ctx.fill();
    // Sink arrow
    ctx.beginPath();
    ctx.moveTo(CANVAS_W, snkY - 10);
    ctx.lineTo(CANVAS_W - 15, snkY);
    ctx.lineTo(CANVAS_W, snkY + 10);
    ctx.fill();
    ctx.shadowBlur = 0;

    // Draw pipes
    for (let r = 0; r < GRID_SIZE; r++) {
      for (let c = 0; c < GRID_SIZE; c++) {
        this._drawPipe(ctx, r, c);
      }
    }
  }

  _drawPipe(ctx, row, col) {
    const cx = col * CELL_W + CELL_W / 2;
    const cy = row * CELL_H + CELL_H / 2;
    const halfW = CELL_W / 2;
    const halfH = CELL_H / 2;
    const isConnected = this._connected[row][col];
    const color = isConnected ? PIPE_LIT : PIPE_DIM;
    const openDirs = this._getOpenDirections(row, col);

    ctx.strokeStyle = color;
    ctx.lineWidth = PIPE_WIDTH;
    ctx.lineCap = 'round';

    if (isConnected) {
      ctx.shadowColor = color;
      ctx.shadowBlur = 6;
    }

    // Draw pipe segments from center to each open direction
    for (const dir of openDirs) {
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      switch (dir) {
        case DIR.UP:    ctx.lineTo(cx, cy - halfH); break;
        case DIR.RIGHT: ctx.lineTo(cx + halfW, cy); break;
        case DIR.DOWN:  ctx.lineTo(cx, cy + halfH); break;
        case DIR.LEFT:  ctx.lineTo(cx - halfW, cy); break;
      }
      ctx.stroke();
    }

    ctx.shadowBlur = 0;

    // Center node
    ctx.beginPath();
    ctx.arc(cx, cy, PIPE_WIDTH / 2 + 1, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
  }

  update(_dt) {
    // Pipes task is click-driven
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
