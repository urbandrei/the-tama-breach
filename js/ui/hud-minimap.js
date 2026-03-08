import { GameState } from '../core/constants.js';
import { rooms, hallways, doorways, HALLWAY_WIDTH } from '../facility/layout-data.js';

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
const COL_PATH = '#ffaa00';

// Hallway loop: rectangle at ±12.5 (midpoint of inner/outer corner edges)
// Parameterized CW from NW corner, perimeter = 100
const LOOP = [[-12.5, 12.5], [12.5, 12.5], [12.5, -12.5], [-12.5, -12.5]];
const LOOP_T = [0, 25, 50, 75];
const LOOP_PERIM = 100;

export class HudMinimap {
  constructor(game) {
    this.game = game;

    // Escort path (array of [x, z] points, or null)
    this._pathPoints = null;

    this._precomputeWalls();
    this._precomputeDoorways();
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

  /** Pre-compute doorway centers and their projections onto the hallway loop. */
  _precomputeDoorways() {
    this._roomDoors = {};
    for (const d of doorways) {
      const room = rooms.find(r => r.id === d.roomId);
      if (!room) continue;
      const [cx, cz] = room.center;
      const [w, h] = room.size;

      let dx, dz;
      switch (d.wallSide) {
        case 'north': dx = cx + d.position; dz = cz + h / 2; break;
        case 'south': dx = cx + d.position; dz = cz - h / 2; break;
        case 'east':  dx = cx + w / 2; dz = cz + d.position; break;
        case 'west':  dx = cx - w / 2; dz = cz + d.position; break;
      }

      const proj = this._projectOntoLoop(dx, dz);
      this._roomDoors[d.roomId] = {
        door: [dx, dz],
        loop: proj.point,
        t: proj.t,
      };
    }
  }

  update(dt) {
    const s = this.game.state;
    if (s !== GameState.PLAYING && s !== GameState.DEVICE_OPEN && s !== GameState.TASK_ACTIVE) {
      this._wrapper.style.display = 'none';
      return;
    }
    this._wrapper.style.display = 'block';
    this._updatePath();
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

    // Draw escort path (in world space)
    this._drawPath(ctx);

    ctx.restore();

    // === Screen-space drawing ===

    // Task dots with perimeter clamping for off-screen tasks
    {
      const cosA = Math.cos(yaw);
      const sinA = Math.sin(yaw);

      const drawDot = (tx, tz) => {
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
      };

      // Regular tasks — find highest priority for circling
      let topPriority = Infinity;
      let topTaskPos = null;
      if (this.game.taskManager) {
        for (const task of this.game.taskManager._taskList) {
          if ((task.state === 'pending' || task.state === 'active') && task.triggerPosition) {
            if (typeof task.shouldShowOnMap === 'function' && !task.shouldShowOnMap()) continue;
            const mp = task._mapPosition;
            const pp = task._propWorldPos;
            const tx = mp ? mp.x : (pp ? pp.x : task.triggerPosition[0]);
            const tz = mp ? mp.z : (pp ? pp.z : task.triggerPosition[2]);
            drawDot(tx, tz);

            const pri = task.getPriority();
            if (pri < topPriority) {
              topPriority = pri;
              topTaskPos = [tx, tz];
            }
          }
        }
      }

      // Lure task dot
      const cm = this.game.creatureManager;
      if (cm) {
        const lureInfo = cm.getLureMapInfo();
        if (lureInfo) drawDot(lureInfo.x, lureInfo.z);
      }

      // Camera repair dots
      if (this.game.cameraSystem) {
        for (const cam of this.game.cameraSystem.getOfflineCameraPositions()) {
          drawDot(cam.x, cam.z);
        }
      }

      // Circle around highest-priority task dot
      if (topTaskPos) {
        const dx = topTaskPos[0] - px;
        const dz = topTaskPos[1] - pz;
        const rx = dx * cosA - dz * sinA;
        const rz = dx * sinA + dz * cosA;
        let sx = CX + rx * SCALE;
        let sy = CY + rz * SCALE;
        const dist = Math.sqrt((sx - CX) ** 2 + (sy - CY) ** 2);
        if (dist > DRAW_RADIUS - 4) {
          const angle = Math.atan2(sy - CY, sx - CX);
          sx = CX + Math.cos(angle) * (DRAW_RADIUS - 4);
          sy = CY + Math.sin(angle) * (DRAW_RADIUS - 4);
        }
        ctx.strokeStyle = COL_TASK;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(sx, sy, 7, 0, Math.PI * 2);
        ctx.stroke();
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

    // Check lure escort (carrying lure → path to containment room)
    const cm = this.game.creatureManager;
    if (cm && cm.isLureEscortActive) {
      return cm.getLureEscortTarget();
    }

    // Check device manager escort (dead battery → charge station) (B4)
    const dm = this.game.deviceManager;
    if (dm && dm.isEscortActive && dm.getEscortTarget) {
      return dm.getEscortTarget();
    }

    return null;
  }

  // --- Geometric escort path (hallway loop) ---

  _updatePath() {
    const target = this._getEscortTarget();
    if (!target) {
      this._pathPoints = null;
      return;
    }

    const px = this.game.player.position.x;
    const pz = this.game.player.position.z;
    const tx = target.x;
    const tz = target.z;
    const playerRoom = this._getRoomAtPosition(px, pz);
    const targetRoom = this._getRoomAtPosition(tx, tz);

    // Same room → direct line
    if (playerRoom && targetRoom && playerRoom.id === targetRoom.id) {
      this._pathPoints = [[px, pz], [tx, tz]];
      return;
    }

    // Player attachment to loop
    let playerPoints, tPlayer;
    if (playerRoom && this._roomDoors[playerRoom.id]) {
      const rd = this._roomDoors[playerRoom.id];
      playerPoints = [[px, pz], rd.door, rd.loop];
      tPlayer = rd.t;
    } else {
      const proj = this._projectOntoLoop(px, pz);
      playerPoints = [[px, pz], proj.point];
      tPlayer = proj.t;
    }

    // Target attachment to loop
    let targetPoints, tTarget;
    if (targetRoom && this._roomDoors[targetRoom.id]) {
      const rd = this._roomDoors[targetRoom.id];
      targetPoints = [[tx, tz], rd.door, rd.loop];
      tTarget = rd.t;
    } else {
      const proj = this._projectOntoLoop(tx, tz);
      targetPoints = [[tx, tz], proj.point];
      tTarget = proj.t;
    }

    // Loop corners between the two attachment points (shortest direction)
    const loopCorners = this._getLoopCorners(tPlayer, tTarget);

    // Assemble: player side → loop corners → target side (reversed)
    this._pathPoints = [...playerPoints, ...loopCorners, ...targetPoints.reverse()];
  }

  /** Find nearest point on the hallway loop rectangle. */
  _projectOntoLoop(x, z) {
    // 4 segments: North, East, South, West
    const segs = [
      [-12.5, 12.5, 12.5, 12.5],
      [12.5, 12.5, 12.5, -12.5],
      [12.5, -12.5, -12.5, -12.5],
      [-12.5, -12.5, -12.5, 12.5],
    ];

    let best = null;
    for (const [x1, z1, x2, z2] of segs) {
      let px, pz;
      if (z1 === z2) {
        // Horizontal segment
        px = Math.max(Math.min(x, Math.max(x1, x2)), Math.min(x1, x2));
        pz = z1;
      } else {
        // Vertical segment
        px = x1;
        pz = Math.max(Math.min(z, Math.max(z1, z2)), Math.min(z1, z2));
      }
      const dist = (x - px) ** 2 + (z - pz) ** 2;
      if (!best || dist < best.dist) {
        best = { point: [px, pz], dist };
      }
    }

    best.t = this._loopT(best.point[0], best.point[1]);
    return best;
  }

  /** Get t parameter (0–100, CW from NW) for a point on the loop. */
  _loopT(x, z) {
    // North: t=0→25, Z=12.5, X: -12.5→12.5
    if (Math.abs(z - 12.5) < 0.01 && x >= -12.5 - 0.01) return Math.min(x + 12.5, 25);
    // East: t=25→50, X=12.5, Z: 12.5→-12.5
    if (Math.abs(x - 12.5) < 0.01) return 25 + (12.5 - z);
    // South: t=50→75, Z=-12.5, X: 12.5→-12.5
    if (Math.abs(z + 12.5) < 0.01) return 50 + (12.5 - x);
    // West: t=75→100, X=-12.5, Z: -12.5→12.5
    return 75 + (z + 12.5);
  }

  /** Get corner vertices between two t values on the loop, shortest direction. */
  _getLoopCorners(tFrom, tTo) {
    const cwDist = (tTo - tFrom + LOOP_PERIM) % LOOP_PERIM;
    const result = [];

    if (cwDist <= 50) {
      // Clockwise
      for (let i = 0; i < 4; i++) {
        const d = (LOOP_T[i] - tFrom + LOOP_PERIM) % LOOP_PERIM;
        if (d > 0.01 && d < cwDist - 0.01) {
          result.push({ d, corner: LOOP[i] });
        }
      }
    } else {
      // Counter-clockwise
      const ccwDist = LOOP_PERIM - cwDist;
      for (let i = 0; i < 4; i++) {
        const d = (tFrom - LOOP_T[i] + LOOP_PERIM) % LOOP_PERIM;
        if (d > 0.01 && d < ccwDist - 0.01) {
          result.push({ d, corner: LOOP[i] });
        }
      }
    }

    result.sort((a, b) => a.d - b.d);
    return result.map(r => r.corner);
  }

  _drawPath(ctx) {
    if (!this._pathPoints || this._pathPoints.length < 2) return;

    ctx.save();
    ctx.strokeStyle = COL_PATH;
    ctx.globalAlpha = 0.6;
    ctx.lineWidth = 2 / SCALE;

    ctx.beginPath();
    ctx.moveTo(this._pathPoints[0][0], this._pathPoints[0][1]);
    for (let i = 1; i < this._pathPoints.length; i++) {
      ctx.lineTo(this._pathPoints[i][0], this._pathPoints[i][1]);
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
