import { GameState } from '../core/constants.js';
import { rooms } from '../facility/layout-data.js';

const ROOM_CENTERS = {};
for (const r of rooms) {
  ROOM_CENTERS[r.id] = r.center;
}

export class TaskHUD {
  constructor(game) {
    this.game = game;

    // Build DOM
    this._container = document.createElement('div');
    this._container.id = 'task-hud';

    this._textEl = document.createElement('div');
    this._textEl.id = 'task-hud-text';
    this._container.appendChild(this._textEl);

    this._arrowEl = document.createElement('div');
    this._arrowEl.id = 'task-hud-arrow';
    this._arrowEl.textContent = '\u25B2'; // ▲
    this._container.appendChild(this._arrowEl);

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

    if (!nextTask) {
      this._container.classList.remove('visible');
      return;
    }

    // Show HUD
    this._container.classList.add('visible');
    this._textEl.textContent = `${nextTask.title} - ${nextTask.location}`;

    // Calculate directional arrow
    const roomCenter = ROOM_CENTERS[nextTask.roomId];
    if (!roomCenter) return;

    const player = this.game.player;
    const px = player.position.x;
    const pz = player.position.z;
    const [tx, tz] = roomCenter;

    const dx = tx - px;
    const dz = tz - pz;
    const worldAngle = Math.atan2(dx, dz);
    const playerYaw = player.yaw.rotation.y;
    const relAngle = worldAngle - playerYaw - Math.PI;

    this._arrowEl.style.transform = `rotate(${relAngle}rad)`;
  }
}
