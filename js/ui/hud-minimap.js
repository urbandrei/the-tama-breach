import { GameState } from '../core/constants.js';
import { rooms, hallways, doorways, HALLWAY_WIDTH } from '../facility/layout-data.js';
import { getNearestNode } from '../ai/nav-graph.js';
import { findPath } from '../ai/pathfinding.js';

const CANVAS_SIZE = 180;
const PAD = 8;
const DRAW_RADIUS = (CANVAS_SIZE - PAD * 2) / 2;
const CX = CANVAS_SIZE / 2;
const CY = CANVAS_SIZE / 2;
const VIEW_RADIUS = 25;
const SCALE = DRAW_RADIUS / VIEW_RADIUS;
const DOOR_WIDTH = 2.5;

// Colors
const COL_HALLWAY = '#0a3a0a';
const COL_ROOM = '#0d4d0d';
const COL_ROOM_ACTIVE = '#1a7a1a';
const COL_WALL = '#00aa2a';
const COL_TASK = '#ffaa00';
const COL_PLAYER = '#00ff41';
const COL_BORDER = 'rgba(0, 170, 42, 0.4)';
const COL_PATH = '#00ff41';
const PATH_RECOMPUTE_INTERVAL = 1.0;

export class HudMinimap {
  constructor(game) {
    this.game = game;

    // Pathfinding state
    this._pathCache = [];
    this._pathTimer = 0;
    this._currentEscortTarget = null;

    this._precomputeWalls();
    this._buildDOM();
  }

  _buildDOM() {
    const wrapper = document.createElement('div');
    wrapper.id = 'hud-minimap';

    const canvas = document.createElement('canvas');
    canvas.width = CANVAS_SIZE;
    canvas.height = CANVAS_SIZE;
    wrapper.appendChild(canvas);

    document.getElementById('ui-root').appendChild(wrapper);
    this._wrapper = wrapper;
    this._canvas = canvas;
    this._ctx = canvas.getContext('2d');
  }

  /** Pre-compute room wall segments with gaps for doorways. */
  _precomputeWalls() {
    this._roomWalls = [];

    for (const r of rooms) {
      const [cx, cz] = r.center;
      const [w, h] = r.size;
      const hw = w / 2, hh = h / 2;
      const roomDoors = doorways.filter(d => d.roomId === r.id);

      const wallDefs = [
        { side: 'north', fixed: cz + hh, from: cx - hw, to: cx + hw, axis: 'x' },
        { side: 'south', fixed: cz - hh, from: cx - hw, to: cx + hw, axis: 'x' },
        { side: 'east',  fixed: cx + hw, from: cz - hh, to: cz + hh, axis: 'z' },
        { side: 'west',  fixed: cx - hw, from: cz - hh, to: cz + hh, axis: 'z' },
      ];

      const segments = [];
      for (const wall of wallDefs) {
        const doorsOnWall = roomDoors.filter(d => d.wallSide === wall.side);
        const gaps = doorsOnWall.map(d => {
          const center = (wall.axis === 'x') ? cx + d.position : cz + d.position;
          return { start: center - DOOR_WIDTH / 2, end: center + DOOR_WIDTH / 2 };
        }).sort((a, b) => a.start - b.start);

        let cursor = wall.from;
        for (const gap of gaps) {
          if (gap.start > cursor) {
            segments.push(this._makeSeg(wall, cursor, gap.start));
          }
          cursor = gap.end;
        }
        if (cursor < wall.to) {
          segments.push(this._makeSeg(wall, cursor, wall.to));
        }
      }

      this._roomWalls.push({ room: r, segments });
    }
  }

  _makeSeg(wall, from, to) {
    if (wall.axis === 'x') {
      return [from, wall.fixed, to, wall.fixed];
    }
    return [wall.fixed, from, wall.fixed, to];
  }

  update(dt) {
    const s = this.game.state;
    if (s !== GameState.PLAYING && s !== GameState.DEVICE_OPEN && s !== GameState.TASK_ACTIVE) {
      this._wrapper.style.display = 'none';
      return;
    }
    this._wrapper.style.display = 'block';
    this._updatePath(dt);
    this._draw();
  }

  _draw() {
    const ctx = this._ctx;
    const px = this.game.player.position.x;
    const pz = this.game.player.position.z;
    const yaw = this.game.player.yaw ? this.game.player.yaw.rotation.y : 0;
    const activeRoom = this._getRoomAtPosition(px, pz);
    const inAlert = this.game.lightingManager && this.game.lightingManager._blackoutReasons.size > 0;
    const wallColor = inAlert ? '#ff2222' : COL_WALL;
    const borderColor = inAlert ? 'rgba(255, 34, 34, 0.6)' : COL_BORDER;

    ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

    // === Clipped world-space drawing ===
    ctx.save();
    ctx.beginPath();
    ctx.arc(CX, CY, DRAW_RADIUS, 0, Math.PI * 2);
    ctx.clip();

    // World transform: player centered, rotated so forward = up
    ctx.translate(CX, CY);
    ctx.scale(SCALE, SCALE);
    ctx.rotate(yaw);
    ctx.translate(-px, -pz);

    // Hallways
    ctx.fillStyle = COL_HALLWAY;
    for (const h of hallways) {
      const [sx, sz] = h.start;
      const [ex, ez] = h.end;
      const hw = HALLWAY_WIDTH;
      if (sx === ex) {
        const minZ = Math.min(sz, ez);
        ctx.fillRect(sx - hw / 2, minZ, hw, Math.abs(ez - sz));
      } else {
        const minX = Math.min(sx, ex);
        ctx.fillRect(minX, sz - hw / 2, Math.abs(ex - sx), hw);
      }
    }

    // Rooms (fill + wall segments with door gaps)
    const wallLW = 1.5 / SCALE;
    for (const entry of this._roomWalls) {
      const r = entry.room;
      const [rcx, rcz] = r.center;
      const [rw, rh] = r.size;
      const isActive = activeRoom && activeRoom.id === r.id;

      ctx.fillStyle = isActive ? COL_ROOM_ACTIVE : COL_ROOM;
      ctx.fillRect(rcx - rw / 2, rcz - rh / 2, rw, rh);

      ctx.strokeStyle = wallColor;
      ctx.lineWidth = wallLW;
      for (const seg of entry.segments) {
        ctx.beginPath();
        ctx.moveTo(seg[0], seg[1]);
        ctx.lineTo(seg[2], seg[3]);
        ctx.stroke();
      }
    }

    // Draw pathfinding line (in world space)
    this._drawPath(ctx, px, pz);

    ctx.restore();

    // === Screen-space drawing ===

    // Task dots with perimeter clamping for off-screen tasks
    if (this.game.taskManager) {
      const cosA = Math.cos(yaw);
      const sinA = Math.sin(yaw);

      for (const task of this.game.taskManager._taskList) {
        if ((task.state === 'pending' || task.state === 'active') && task.triggerPosition) {
          if (typeof task.shouldShowOnMap === 'function' && !task.shouldShowOnMap()) continue;
          const mp = task._mapPosition;
          const pp = task._propWorldPos;
          const tx = mp ? mp.x : (pp ? pp.x : task.triggerPosition[0]);
          const tz = mp ? mp.z : (pp ? pp.z : task.triggerPosition[2]);
          const dx = tx - px;
          const dz = tz - pz;
          const rx = dx * cosA - dz * sinA;
          const rz = dx * sinA + dz * cosA;
          let sx = CX + rx * SCALE;
          let sy = CY + rz * SCALE;

          const dist = Math.sqrt((sx - CX) ** 2 + (sy - CY) ** 2);
          let radius = 2.5;

          if (dist > DRAW_RADIUS - 4) {
            const angle = Math.atan2(sy - CY, sx - CX);
            sx = CX + Math.cos(angle) * (DRAW_RADIUS - 4);
            sy = CY + Math.sin(angle) * (DRAW_RADIUS - 4);
            radius = 3;
          }

          ctx.fillStyle = COL_TASK;
          ctx.beginPath();
          ctx.arc(sx, sy, radius, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    // Player triangle (center, always pointing up)
    ctx.fillStyle = COL_PLAYER;
    ctx.beginPath();
    ctx.moveTo(CX, CY - 5);
    ctx.lineTo(CX - 3.5, CY + 3);
    ctx.lineTo(CX + 3.5, CY + 3);
    ctx.closePath();
    ctx.fill();

    // Circle border
    ctx.strokeStyle = borderColor;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(CX, CY, DRAW_RADIUS, 0, Math.PI * 2);
    ctx.stroke();
  }

  _getEscortTarget() {
    const player = this.game.player;
    const taskMgr = this.game.taskManager;
    if (!taskMgr) return null;

    // Check active tasks for escort interface
    for (const task of taskMgr._taskList) {
      if (task.state !== 'active') continue;
      if (task.isEscortActive && task.getEscortTarget) {
        return task.getEscortTarget();
      }
    }

    return null;
  }

  _updatePath(dt) {
    const target = this._getEscortTarget();
    this._currentEscortTarget = target;
    if (!target) {
      this._pathCache = [];
      this._pathTimer = 0;
      return;
    }

    this._pathTimer += dt;
    if (this._pathTimer < PATH_RECOMPUTE_INTERVAL && this._pathCache.length > 0) return;
    this._pathTimer = 0;

    const graph = this.game.creatureManager && this.game.creatureManager.graph;
    if (!graph) {
      this._pathCache = [];
      return;
    }

    const px = this.game.player.position.x;
    const pz = this.game.player.position.z;
    const startIdx = getNearestNode(graph, px, pz);
    const endIdx = getNearestNode(graph, target.x, target.z);
    this._pathCache = findPath(graph, startIdx, endIdx);
  }

  _drawPath(ctx, px, pz) {
    const hasPath = this._pathCache.length >= 2;
    const hasTarget = this._currentEscortTarget != null;

    if (!hasPath && !hasTarget) return;

    ctx.save();
    ctx.strokeStyle = COL_PATH;
    ctx.globalAlpha = 0.6;
    ctx.lineWidth = 2 / SCALE;

    ctx.beginPath();
    ctx.moveTo(px, pz);

    if (hasPath) {
      for (const node of this._pathCache) {
        ctx.lineTo(node.x, node.z);
      }
    } else if (hasTarget) {
      // Fallback: straight line to target
      ctx.lineTo(this._currentEscortTarget.x, this._currentEscortTarget.z);
    }

    ctx.stroke();
    ctx.restore();
  }

  _getRoomAtPosition(x, z) {
    for (const r of rooms) {
      const [cx, cz] = r.center;
      const [w, h] = r.size;
      if (x >= cx - w / 2 && x <= cx + w / 2 && z >= cz - h / 2 && z <= cz + h / 2) {
        return r;
      }
    }
    return null;
  }
}
