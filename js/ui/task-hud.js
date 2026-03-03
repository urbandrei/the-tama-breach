import { GameState } from '../core/constants.js';

const EDGE_MARGIN = 48; // px from screen edge

export class TaskHUD {
  constructor(game) {
    this.game = game;

    // Build DOM
    this._container = document.createElement('div');
    this._container.id = 'task-hud';

    this._arrowEl = document.createElement('div');
    this._arrowEl.id = 'task-hud-arrow';
    this._arrowEl.textContent = '\u25B2'; // ▲
    this._container.appendChild(this._arrowEl);

    this._textEl = document.createElement('div');
    this._textEl.id = 'task-hud-text';
    this._container.appendChild(this._textEl);

    document.getElementById('ui-root').appendChild(this._container);
  }

  update(dt) {
    // Hide during device open or task active
    if (this.game.state === GameState.DEVICE_OPEN || this.game.state === GameState.TASK_ACTIVE) {
      this._container.classList.remove('visible');
      return;
    }

    // Find next pending or failed task
    if (!this.game.taskManager) {
      this._container.classList.remove('visible');
      return;
    }

    const tasks = this.game.taskManager.getAllTaskData();
    const nextTask = tasks.find(t => t.status === 'pending' || t.status === 'failed');

    if (!nextTask || !nextTask.triggerPosition) {
      this._container.classList.remove('visible');
      return;
    }

    // Show HUD
    this._container.classList.add('visible');
    this._textEl.textContent = nextTask.location;

    // Use exact trigger position
    const [tx, _ty, tz] = nextTask.triggerPosition;

    const player = this.game.player;
    const px = player.position.x;
    const pz = player.position.z;

    const dx = tx - px;
    const dz = tz - pz;
    const yaw = player.yaw.rotation.y;

    // Player's forward and right directions in XZ plane
    const fwdX = -Math.sin(yaw);
    const fwdZ = -Math.cos(yaw);
    const rightX = Math.cos(yaw);
    const rightZ = -Math.sin(yaw);

    // Project target direction onto player axes
    const dotFwd = dx * fwdX + dz * fwdZ;
    const dotRight = dx * rightX + dz * rightZ;

    // Screen-space direction (right = +x, down = +y)
    let sx = dotRight;
    let sy = -dotFwd;

    const len = Math.sqrt(sx * sx + sy * sy);
    if (len > 0.001) {
      sx /= len;
      sy /= len;
    } else {
      sx = 0;
      sy = -1; // default: up
    }

    // Find where this ray from screen center hits the screen edge
    const halfW = window.innerWidth / 2 - EDGE_MARGIN;
    const halfH = window.innerHeight / 2 - EDGE_MARGIN;

    let t;
    const absSx = Math.abs(sx);
    const absSy = Math.abs(sy);

    if (absSx < 0.001) {
      t = halfH;
    } else if (absSy < 0.001) {
      t = halfW;
    } else {
      t = Math.min(halfW / absSx, halfH / absSy);
    }

    const posX = window.innerWidth / 2 + sx * t;
    const posY = window.innerHeight / 2 + sy * t;

    this._container.style.left = `${posX}px`;
    this._container.style.top = `${posY}px`;

    // Rotate arrow to point toward target (▲ points up = 0deg)
    const arrowAngle = Math.atan2(sx, -sy);
    this._arrowEl.style.transform = `rotate(${arrowAngle}rad)`;
  }
}
