const GRID = 16;       // cells per row/col
const CELL = 12;       // px per cell
const TICK = 0.15;     // seconds between moves
const C_BG = '#0a0f0a';
const C_SNAKE = '#00ff41';
const C_FOOD = '#ffaa00';
const C_GRID = '#0d1a0d';
const C_TEXT = '#00ff41';

export class SnakeApp {
  constructor() {
    this._el = null;
    this._canvas = null;
    this._ctx = null;
    this._scoreEl = null;

    this._snake = [];
    this._dir = { x: 1, y: 0 };
    this._nextDir = { x: 1, y: 0 };
    this._food = null;
    this._score = 0;
    this._timer = 0;
    this._gameOver = false;
    this._keyHandler = null;
  }

  createElement() {
    if (this._el) return this._el;

    const root = document.createElement('div');
    root.className = 'snake-app';

    this._canvas = document.createElement('canvas');
    this._canvas.width = GRID * CELL;
    this._canvas.height = GRID * CELL;
    this._canvas.className = 'snake-canvas';
    this._ctx = this._canvas.getContext('2d');

    this._scoreEl = document.createElement('div');
    this._scoreEl.className = 'snake-score';

    root.appendChild(this._canvas);
    root.appendChild(this._scoreEl);
    this._el = root;

    this._reset();
    return root;
  }

  _reset() {
    const mid = Math.floor(GRID / 2);
    this._snake = [
      { x: mid, y: mid },
      { x: mid - 1, y: mid },
      { x: mid - 2, y: mid },
    ];
    this._dir = { x: 1, y: 0 };
    this._nextDir = { x: 1, y: 0 };
    this._score = 0;
    this._timer = 0;
    this._gameOver = false;
    this._spawnFood();
    this._draw();
  }

  _spawnFood() {
    const occupied = new Set(this._snake.map(s => `${s.x},${s.y}`));
    const free = [];
    for (let x = 0; x < GRID; x++) {
      for (let y = 0; y < GRID; y++) {
        if (!occupied.has(`${x},${y}`)) free.push({ x, y });
      }
    }
    this._food = free.length > 0 ? free[Math.floor(Math.random() * free.length)] : null;
  }

  _tick() {
    if (this._gameOver) return;

    this._dir = { ...this._nextDir };
    const head = this._snake[0];
    const nx = head.x + this._dir.x;
    const ny = head.y + this._dir.y;

    // Wall collision
    if (nx < 0 || nx >= GRID || ny < 0 || ny >= GRID) {
      this._gameOver = true;
      return;
    }

    // Self collision
    if (this._snake.some(s => s.x === nx && s.y === ny)) {
      this._gameOver = true;
      return;
    }

    this._snake.unshift({ x: nx, y: ny });

    // Eat food
    if (this._food && nx === this._food.x && ny === this._food.y) {
      this._score += 10;
      this._spawnFood();
    } else {
      this._snake.pop();
    }
  }

  _draw() {
    const ctx = this._ctx;
    if (!ctx) return;
    const w = GRID * CELL;

    // Background
    ctx.fillStyle = C_BG;
    ctx.fillRect(0, 0, w, w);

    // Grid
    ctx.strokeStyle = C_GRID;
    ctx.lineWidth = 0.5;
    for (let i = 0; i <= GRID; i++) {
      ctx.beginPath();
      ctx.moveTo(i * CELL, 0);
      ctx.lineTo(i * CELL, w);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, i * CELL);
      ctx.lineTo(w, i * CELL);
      ctx.stroke();
    }

    // Food
    if (this._food) {
      ctx.fillStyle = C_FOOD;
      ctx.fillRect(this._food.x * CELL + 1, this._food.y * CELL + 1, CELL - 2, CELL - 2);
    }

    // Snake
    for (let i = 0; i < this._snake.length; i++) {
      const s = this._snake[i];
      ctx.fillStyle = i === 0 ? C_TEXT : C_SNAKE;
      ctx.globalAlpha = i === 0 ? 1 : 0.7;
      ctx.fillRect(s.x * CELL + 1, s.y * CELL + 1, CELL - 2, CELL - 2);
    }
    ctx.globalAlpha = 1;

    // Game over text
    if (this._gameOver) {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
      ctx.fillRect(0, 0, w, w);
      ctx.fillStyle = C_TEXT;
      ctx.font = '10px "Press Start 2P", monospace';
      ctx.textAlign = 'center';
      ctx.fillText('GAME OVER', w / 2, w / 2 - 8);
      ctx.font = '7px "Press Start 2P", monospace';
      ctx.fillText('CLICK TO RETRY', w / 2, w / 2 + 12);
    }

    // Score
    if (this._scoreEl) {
      this._scoreEl.textContent = `SCORE: ${this._score}`;
    }
  }

  onActivate() {
    this._keyHandler = (e) => {
      // Stop WASD/arrow keys from reaching the input system (prevents player movement)
      const movementKeys = ['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','w','W','s','S','a','A','d','D'];
      if (movementKeys.includes(e.key)) {
        e.stopImmediatePropagation();
      }

      if (this._gameOver) {
        this._reset();
        return;
      }

      switch (e.key) {
        case 'ArrowUp': case 'w': case 'W':
          if (this._dir.y !== 1) this._nextDir = { x: 0, y: -1 };
          break;
        case 'ArrowDown': case 's': case 'S':
          if (this._dir.y !== -1) this._nextDir = { x: 0, y: 1 };
          break;
        case 'ArrowLeft': case 'a': case 'A':
          if (this._dir.x !== 1) this._nextDir = { x: -1, y: 0 };
          break;
        case 'ArrowRight': case 'd': case 'D':
          if (this._dir.x !== -1) this._nextDir = { x: 1, y: 0 };
          break;
      }
    };
    document.addEventListener('keydown', this._keyHandler);

    // Click to retry
    if (this._canvas) {
      this._clickHandler = () => {
        if (this._gameOver) this._reset();
      };
      this._canvas.addEventListener('click', this._clickHandler);
    }
  }

  onDeactivate() {
    if (this._keyHandler) {
      document.removeEventListener('keydown', this._keyHandler);
      this._keyHandler = null;
    }
    if (this._clickHandler && this._canvas) {
      this._canvas.removeEventListener('click', this._clickHandler);
      this._clickHandler = null;
    }
  }

  update(dt) {
    if (this._gameOver) return;
    this._timer += dt;
    if (this._timer >= TICK) {
      this._timer -= TICK;
      this._tick();
    }
    this._draw();
  }
}
