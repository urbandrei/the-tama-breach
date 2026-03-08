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

    // Night clock display
    this._clockEl = document.createElement('div');
    this._clockEl.id = 'night-clock';
    document.getElementById('ui-root').appendChild(this._clockEl);

    // Notification flash
    this._notifEl = document.createElement('div');
    this._notifEl.id = 'hud-notification';
    document.getElementById('ui-root').appendChild(this._notifEl);
    this._notifTimer = 0;

    // Device hint (bottom-left, fades after 10s)
    this._hintEl = document.createElement('div');
    this._hintEl.id = 'device-hint';
    this._hintEl.textContent = 'LOOK DOWN or [TAB] to open device';
    document.getElementById('ui-root').appendChild(this._hintEl);
    this._hintTimer = 0;

    // Center-screen message (for errors like missing items)
    this._centerMsgEl = document.createElement('div');
    this._centerMsgEl.id = 'center-message';
    document.getElementById('ui-root').appendChild(this._centerMsgEl);
    this._centerMsgTimer = 0;

    // Listen for infra events
    game.on('infra:down', (data) => this._showNotification(`${data.label} OFFLINE`, 'warn'));
    game.on('infra:up', (data) => this._showNotification(`${data.label} ONLINE`, 'ok'));

    // Show device hint when night begins
    game.on('elevator:arrived', () => this._showDeviceHint());

    // Center-screen error messages
    game.on('ui:center-message', (data) => this._showCenterMessage(data.text));
  }

  _showNotification(text, type = 'warn') {
    this._notifEl.textContent = text;
    this._notifEl.className = `visible ${type}`;
    this._notifTimer = 3.5;
  }

  _showDeviceHint() {
    this._hintTimer = 10;
    this._hintEl.classList.add('visible');
  }

  _showCenterMessage(text) {
    this._centerMsgEl.textContent = text;
    this._centerMsgEl.classList.add('visible');
    this._centerMsgTimer = 3;
  }

  update(dt) {
    // Update night clock
    const nm = this.game.nightManager;
    if (nm && nm.clock && this.game.state === GameState.PLAYING) {
      this._clockEl.textContent = nm.clock.getFormattedTime();
      this._clockEl.classList.add('visible');
    } else {
      this._clockEl.classList.remove('visible');
    }

    // Notification flash timer
    if (this._notifTimer > 0) {
      this._notifTimer -= dt;
      if (this._notifTimer <= 0) {
        this._notifEl.className = '';
      }
    }

    // Device hint timer
    if (this._hintTimer > 0) {
      this._hintTimer -= dt;
      if (this._hintTimer <= 0) {
        this._hintEl.classList.remove('visible');
      }
    }

    // Center message timer
    if (this._centerMsgTimer > 0) {
      this._centerMsgTimer -= dt;
      if (this._centerMsgTimer <= 0) {
        this._centerMsgEl.classList.remove('visible');
      }
    }

    // Hide during device open or task active
    if (this.game.state === GameState.DEVICE_OPEN || this.game.state === GameState.TASK_ACTIVE) {
      this._container.classList.remove('visible');
      return;
    }

    // Find target to point at
    if (!this.game.taskManager) {
      this._container.classList.remove('visible');
      return;
    }

    let tx, tz, targetLabel;

    // While pushing cart, point to delivery destination
    if (this.game.player.isPushingCart) {
      const transport = this.game.taskManager.tasks['transport_specimen'];
      if (transport && transport.getTargetInfo) {
        const info = transport.getTargetInfo();
        if (info) {
          tx = info.position[0];
          tz = info.position[2];
          targetLabel = info.label;
        }
      }
    }

    // Otherwise point to highest-priority pending task
    if (targetLabel === undefined) {
      const pendingTasks = this.game.taskManager._taskList.filter(t =>
        (t.state === 'pending' || t.state === 'failed') && t.shouldShowOnMap()
      );
      pendingTasks.sort((a, b) => a.getPriority() - b.getPriority());
      const nextTask = pendingTasks[0] || null;

      if (!nextTask || !nextTask.triggerPosition) {
        this._container.classList.remove('visible');
        return;
      }

      const mp = nextTask._mapPosition;
      const pp = nextTask._propWorldPos;
      tx = mp ? mp.x : (pp ? pp.x : nextTask.triggerPosition[0]);
      tz = mp ? mp.z : (pp ? pp.z : nextTask.triggerPosition[2]);
      targetLabel = nextTask.location;
    }

    // Show HUD
    this._container.classList.add('visible');
    this._textEl.textContent = targetLabel;

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
