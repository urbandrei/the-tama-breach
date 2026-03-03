import { rooms, hallways, HALLWAY_WIDTH } from '../facility/layout-data.js';

// World bounds (with padding)
const WORLD_MIN_X = -40;
const WORLD_MAX_X = 40;
const WORLD_MIN_Z = -46;
const WORLD_MAX_Z = 48;
const WORLD_W = WORLD_MAX_X - WORLD_MIN_X;
const WORLD_H = WORLD_MAX_Z - WORLD_MIN_Z;

const CANVAS_SIZE = 300;
const PAD = 12;
const DRAW_SIZE = CANVAS_SIZE - PAD * 2;

// Colors
const COL_BG = '#080c08';
const COL_HALLWAY = '#0a3a0a';
const COL_ROOM = '#0d4d0d';
const COL_ROOM_ACTIVE = '#1a7a1a';
const COL_BORDER = '#00aa2a';
const COL_LABEL = '#00aa2a';
const COL_PLAYER = '#00ff41';
const COL_ARROW = '#00ff41';

function worldToCanvas(wx, wz) {
  const nx = (wx - WORLD_MIN_X) / WORLD_W;
  // Flip Z: world +Z is north, canvas +Y is down
  const ny = 1 - (wz - WORLD_MIN_Z) / WORLD_H;
  return [PAD + nx * DRAW_SIZE, PAD + ny * DRAW_SIZE];
}

function worldScaleX(w) { return (w / WORLD_W) * DRAW_SIZE; }
function worldScaleZ(h) { return (h / WORLD_H) * DRAW_SIZE; }

export class Minimap {
  constructor(game) {
    this.game = game;
    this._el = null;
    this._canvas = null;
    this._ctx = null;
    this._blinkTimer = 0;
    this._blinkOn = true;
  }

  createElement() {
    if (this._el) return this._el;

    const root = document.createElement('div');
    root.className = 'map-tab';

    const canvas = document.createElement('canvas');
    canvas.className = 'minimap-canvas';
    canvas.width = CANVAS_SIZE;
    canvas.height = CANVAS_SIZE;
    root.appendChild(canvas);

    this._canvas = canvas;
    this._ctx = canvas.getContext('2d');
    this._el = root;

    this._draw();
    return root;
  }

  _draw() {
    const ctx = this._ctx;
    if (!ctx) return;

    // Clear
    ctx.fillStyle = COL_BG;
    ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

    // Determine which room the player is in
    const px = this.game.player.position.x;
    const pz = this.game.player.position.z;
    const activeRoom = this._getRoomAtPosition(px, pz);

    // Draw hallways
    ctx.fillStyle = COL_HALLWAY;
    for (const h of hallways) {
      const [sx, sz] = h.start;
      const [ex, ez] = h.end;

      const hw = HALLWAY_WIDTH;

      if (sx === ex) {
        // N-S hallway
        const minZ = Math.min(sz, ez);
        const maxZ = Math.max(sz, ez);
        const [cx, cy] = worldToCanvas(sx - hw / 2, maxZ);
        const w = worldScaleX(hw);
        const height = worldScaleZ(maxZ - minZ);
        ctx.fillRect(cx, cy, w, height);
      } else {
        // E-W hallway
        const minX = Math.min(sx, ex);
        const maxX = Math.max(sx, ex);
        const [cx, cy] = worldToCanvas(minX, sz + hw / 2);
        const w = worldScaleX(maxX - minX);
        const height = worldScaleZ(hw);
        ctx.fillRect(cx, cy, w, height);
      }
    }

    // Draw rooms
    for (const r of rooms) {
      const [rcx, rcz] = r.center;
      const [rw, rh] = r.size;
      const isActive = activeRoom && activeRoom.id === r.id;

      const [rx, ry] = worldToCanvas(rcx - rw / 2, rcz + rh / 2);
      const w = worldScaleX(rw);
      const h = worldScaleZ(rh);

      // Fill
      ctx.fillStyle = isActive ? COL_ROOM_ACTIVE : COL_ROOM;
      ctx.fillRect(rx, ry, w, h);

      // Border
      ctx.strokeStyle = COL_BORDER;
      ctx.lineWidth = 0.5;
      ctx.strokeRect(rx, ry, w, h);

      // Label
      ctx.fillStyle = COL_LABEL;
      ctx.font = '6px "Press Start 2P", monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      const labelText = r.label.length > 10 ? r.label.substring(0, 9) + '.' : r.label;
      ctx.fillText(labelText, rx + w / 2, ry + h / 2);
    }

    // Draw player dot (with blink)
    if (this._blinkOn) {
      const [dotX, dotY] = worldToCanvas(px, pz);

      // Player dot
      ctx.fillStyle = COL_PLAYER;
      ctx.beginPath();
      ctx.arc(dotX, dotY, 4, 0, Math.PI * 2);
      ctx.fill();

      // Direction arrow
      const yaw = this.game.player.yaw ? this.game.player.yaw.rotation.y : 0;
      const arrowLen = 8;
      // yaw=0 faces -Z (south on screen = down), rotating left increases yaw
      const ax = dotX + Math.sin(yaw) * -arrowLen;
      const ay = dotY + Math.cos(yaw) * arrowLen;

      ctx.strokeStyle = COL_ARROW;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(dotX, dotY);
      ctx.lineTo(ax, ay);
      ctx.stroke();

      // Arrowhead
      const headLen = 4;
      const angle = Math.atan2(ay - dotY, ax - dotX);
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(
        ax - headLen * Math.cos(angle - 0.5),
        ay - headLen * Math.sin(angle - 0.5),
      );
      ctx.moveTo(ax, ay);
      ctx.lineTo(
        ax - headLen * Math.cos(angle + 0.5),
        ay - headLen * Math.sin(angle + 0.5),
      );
      ctx.stroke();
    }
  }

  _getRoomAtPosition(x, z) {
    for (const r of rooms) {
      const [cx, cz] = r.center;
      const [w, h] = r.size;
      if (
        x >= cx - w / 2 && x <= cx + w / 2 &&
        z >= cz - h / 2 && z <= cz + h / 2
      ) {
        return r;
      }
    }
    return null;
  }

  onActivate() {}
  onDeactivate() {}

  update(dt) {
    // Blink timer for player dot
    this._blinkTimer += dt;
    if (this._blinkTimer >= 0.5) {
      this._blinkTimer -= 0.5;
      this._blinkOn = !this._blinkOn;
    }

    this._draw();
  }
}
