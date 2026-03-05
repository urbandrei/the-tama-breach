import { PERSONALITIES } from '../tamagotchi/personality.js';

const ACTIONS = ['FEED', 'WATER', 'PLAY'];
const STATIC_CHARS = '\u2591\u2592\u2593\u2588\u2584\u2580\u2590\u258C';

const HABITAT_W = 280;
const HABITAT_H = 180;

// Colors (CRT green palette)
const C_BG = '#0a0f0a';
const C_WALL = '#0d1a0d';
const C_FLOOR = '#0a150a';
const C_GRID = '#112211';
const C_GREEN = '#00ff41';
const C_DIM = '#005518';
const C_BLUE = '#2288cc';
const C_BLUE_DIM = '#114466';
const C_RED = '#ff3333';
const C_YELLOW = '#ffaa00';
const C_GRAY = '#444444';
const C_CRACK = '#663333';

export class TamaTab {
  constructor(game) {
    this.game = game;
    this._el = null;
    this._selectedId = null;
    this._sidebar = null;
    this._detail = null;
    this._listItems = {};
    this._actionBtns = {};
    this._canvas = null;
    this._ctx = null;
    this._cameraOffline = false;
    this._staticTimer = 0;
    this._visibleCount = 0;
    this._selectedDelivered = false;
  }

  createElement() {
    if (this._el) return this._el;

    const root = document.createElement('div');
    root.className = 'tama-tab';

    // Left sidebar
    const sidebar = document.createElement('div');
    sidebar.className = 'tama-list';
    this._sidebar = sidebar;

    // Right panel
    this._detail = document.createElement('div');
    this._detail.className = 'tama-detail';

    root.appendChild(sidebar);
    root.appendChild(this._detail);
    this._el = root;

    this._rebuildList();
    this._renderDetail();

    return root;
  }

  _rebuildList() {
    this._sidebar.innerHTML = '';
    this._listItems = {};

    const mgr = this.game.tamagotchiManager;
    if (!mgr) return;

    const allData = mgr.getAllUIData();
    const visibleData = allData.filter(d => d.delivered || d.inTransit);
    this._visibleCount = visibleData.length;

    // Reset selection if current pick is no longer visible
    if (this._selectedId && !visibleData.find(d => d.id === this._selectedId)) {
      this._selectedId = visibleData.length > 0 ? visibleData[0].id : null;
    }
    if (!this._selectedId && visibleData.length > 0) {
      this._selectedId = visibleData[0].id;
    }

    for (const data of visibleData) {
      const item = document.createElement('div');
      item.className = 'tama-list-item';
      item.dataset.id = data.id;

      const dot = document.createElement('span');
      dot.className = `tama-status-dot ${data.status}`;

      const name = document.createElement('span');
      name.className = 'tama-list-name';
      name.textContent = data.name;

      item.appendChild(dot);
      item.appendChild(name);
      item.addEventListener('click', () => this._selectTama(data.id));
      this._sidebar.appendChild(item);
      this._listItems[data.id] = { item, dot };
    }

    this._updateListHighlight();
  }

  _selectTama(id) {
    this._selectedId = id;
    this._updateListHighlight();
    this._renderDetail();
  }

  _updateListHighlight() {
    for (const [id, entry] of Object.entries(this._listItems)) {
      entry.item.classList.toggle('selected', id === this._selectedId);
    }
  }

  _renderDetail() {
    const mgr = this.game.tamagotchiManager;
    if (!mgr || !this._detail) return;

    const data = mgr.getUIData(this._selectedId);
    this._detail.innerHTML = '';
    if (!data) {
      this._canvas = null;
      this._ctx = null;
      this._actionBtns = {};
      return;
    }

    // Habitat canvas
    const canvas = document.createElement('canvas');
    canvas.className = 'tama-habitat-canvas';
    canvas.width = HABITAT_W;
    canvas.height = HABITAT_H;
    this._canvas = canvas;
    this._ctx = canvas.getContext('2d');
    this._detail.appendChild(canvas);

    // Name + status row
    const infoRow = document.createElement('div');
    infoRow.className = 'tama-info-row';

    const nameEl = document.createElement('span');
    nameEl.className = 'tama-name';
    nameEl.textContent = data.name;

    const statusEl = document.createElement('span');
    statusEl.className = `tama-status-text ${data.status}`;
    statusEl.textContent = data.status.toUpperCase();

    infoRow.appendChild(nameEl);
    infoRow.appendChild(statusEl);
    this._detail.appendChild(infoRow);

    // Action buttons
    const actions = document.createElement('div');
    actions.className = 'tama-actions';
    this._actionBtns = {};

    for (let i = 0; i < ACTIONS.length; i++) {
      const action = ACTIONS[i];
      const btn = document.createElement('button');
      btn.className = 'tama-btn';
      if (data.cooldowns[action]) btn.classList.add('cooldown');
      btn.disabled = data.cooldowns[action] || data.status === 'escaped';
      btn.textContent = `[${i + 1}] ${action}`;
      btn.addEventListener('click', () => this._doAction(action));
      actions.appendChild(btn);
      this._actionBtns[action] = btn;
    }

    // Hide controls until tama has hatched
    if (!data.delivered) {
      actions.style.display = 'none';
    }

    this._detail.appendChild(actions);

    // Initial draw
    this._drawHabitat(data);
  }

  // --- Habitat Canvas Drawing ---

  _drawHabitat(data) {
    const ctx = this._ctx;
    if (!ctx) return;

    // Clear
    ctx.fillStyle = C_BG;
    ctx.fillRect(0, 0, HABITAT_W, HABITAT_H);

    // Floor
    ctx.fillStyle = C_FLOOR;
    ctx.fillRect(0, 140, HABITAT_W, 40);

    // Floor grid lines
    ctx.strokeStyle = C_GRID;
    ctx.lineWidth = 1;
    for (let x = 0; x < HABITAT_W; x += 20) {
      ctx.beginPath();
      ctx.moveTo(x, 140);
      ctx.lineTo(x, HABITAT_H);
      ctx.stroke();
    }
    for (let y = 140; y < HABITAT_H; y += 10) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(HABITAT_W, y);
      ctx.stroke();
    }

    // Wall line
    ctx.strokeStyle = C_DIM;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, 140);
    ctx.lineTo(HABITAT_W, 140);
    ctx.stroke();

    // Draw items
    this._drawFoodBowl(ctx, 45, 125, data.needs.hunger);
    this._drawWaterBowl(ctx, 110, 125, data.waterLevel);
    this._drawToy(ctx, 225, 125, data.needs.happiness);
    this._drawGlassCracks(ctx, data.glassHealth);

    // Tama sprite (center)
    this._drawTamaSprite(ctx, data);

    // Speech bubble
    this._drawSpeechBubble(ctx, data);
  }

  _drawFoodBowl(ctx, x, y, hunger) {
    // Bowl outline
    ctx.strokeStyle = C_DIM;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(x, y + 8, 18, 6, 0, 0, Math.PI);
    ctx.stroke();
    // Bowl rim
    ctx.beginPath();
    ctx.ellipse(x, y + 2, 20, 7, 0, 0, Math.PI * 2);
    ctx.stroke();

    // Food fill
    if (hunger > 60) {
      // Heaped — mound above rim
      ctx.fillStyle = C_GREEN;
      ctx.beginPath();
      ctx.ellipse(x, y + 5, 16, 5, 0, Math.PI, 0);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(x, y - 2, 10, Math.PI, 0);
      ctx.fill();
    } else if (hunger > 30) {
      // Half
      ctx.fillStyle = C_YELLOW;
      ctx.beginPath();
      ctx.ellipse(x, y + 5, 14, 4, 0, Math.PI, 0);
      ctx.fill();
    }
    // < 30 = empty bowl, no fill

    // Label
    ctx.fillStyle = hunger > 60 ? C_GREEN : hunger > 30 ? C_YELLOW : C_RED;
    ctx.font = '7px "Press Start 2P", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('FOOD', x, y + 22);
  }

  _drawWaterBowl(ctx, x, y, waterLevel) {
    // Bowl outline
    ctx.strokeStyle = C_DIM;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(x, y + 8, 18, 6, 0, 0, Math.PI);
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(x, y + 2, 20, 7, 0, 0, Math.PI * 2);
    ctx.stroke();

    // Water fill based on waterLevel (0-100)
    if (waterLevel > 5) {
      const fillHeight = Math.min(waterLevel / 100, 1);
      ctx.fillStyle = waterLevel > 50 ? C_BLUE : C_BLUE_DIM;
      ctx.globalAlpha = 0.6 + fillHeight * 0.4;
      ctx.beginPath();
      const ry = 3 + fillHeight * 3;
      ctx.ellipse(x, y + 8 - fillHeight * 4, 15 * fillHeight, ry, 0, Math.PI, 0);
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    // Label
    ctx.fillStyle = waterLevel > 50 ? C_BLUE : waterLevel > 20 ? C_YELLOW : C_RED;
    ctx.font = '7px "Press Start 2P", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('H2O', x, y + 22);
  }

  _drawToy(ctx, x, y, happiness) {
    if (happiness > 40) {
      // Ball toy
      ctx.fillStyle = C_GREEN;
      ctx.beginPath();
      ctx.arc(x, y, 8, 0, Math.PI * 2);
      ctx.fill();
      // Star decoration
      ctx.fillStyle = C_BG;
      ctx.font = '8px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('*', x, y);
      ctx.textBaseline = 'alphabetic';
    } else if (happiness > 15) {
      // Broken toy — outline only
      ctx.strokeStyle = C_GRAY;
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 2]);
      ctx.beginPath();
      ctx.arc(x, y, 8, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    // < 15 = no toy visible

    // Label
    ctx.fillStyle = happiness > 40 ? C_GREEN : happiness > 15 ? C_YELLOW : C_RED;
    ctx.font = '7px "Press Start 2P", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('TOY', x, y + 18);
  }

  _drawGlassCracks(ctx, glassHealth) {
    if (glassHealth >= 100) return;

    ctx.strokeStyle = C_CRACK;
    ctx.lineWidth = 1;

    const severity = 1 - (glassHealth / 100); // 0 = no cracks, 1 = destroyed
    const crackCount = Math.floor(severity * 8) + 1;

    // Draw cracks from edges
    for (let i = 0; i < crackCount; i++) {
      const side = i % 4; // top, right, bottom, left
      ctx.beginPath();

      // Deterministic crack positions using index as seed
      const seed = (i * 137 + 43) % 100 / 100;
      const len = 15 + severity * 30;

      if (side === 0) { // top
        const sx = 30 + seed * (HABITAT_W - 60);
        ctx.moveTo(sx, 0);
        ctx.lineTo(sx + (seed > 0.5 ? len : -len) * 0.5, len * 0.7);
        ctx.lineTo(sx + (seed > 0.5 ? -5 : 5), len);
      } else if (side === 1) { // right
        const sy = 10 + seed * 120;
        ctx.moveTo(HABITAT_W, sy);
        ctx.lineTo(HABITAT_W - len * 0.7, sy + len * 0.3);
        ctx.lineTo(HABITAT_W - len, sy - 5);
      } else if (side === 2) { // bottom (above floor)
        const sx = 40 + seed * (HABITAT_W - 80);
        ctx.moveTo(sx, 138);
        ctx.lineTo(sx + 10, 138 - len * 0.5);
      } else { // left
        const sy = 20 + seed * 100;
        ctx.moveTo(0, sy);
        ctx.lineTo(len * 0.6, sy + len * 0.4);
        ctx.lineTo(len, sy - 3);
      }
      ctx.stroke();
    }

    // Red border glow when critical
    if (glassHealth < 30) {
      ctx.strokeStyle = C_RED;
      ctx.globalAlpha = 0.3;
      ctx.lineWidth = 3;
      ctx.strokeRect(1, 1, HABITAT_W - 2, HABITAT_H - 2);
      ctx.globalAlpha = 1;
    }
  }

  _drawTamaSprite(ctx, data) {
    const cx = HABITAT_W / 2;

    // Camera offline — static noise
    const camSys = this.game.cameraSystem;
    const personality = PERSONALITIES[this._selectedId];
    const camDown = camSys && personality && !camSys.isCameraUp(personality.roomId);

    if (camDown) {
      ctx.fillStyle = '#666';
      ctx.font = '10px monospace';
      ctx.textAlign = 'center';
      for (let row = 0; row < 5; row++) {
        let line = '';
        for (let col = 0; col < 10; col++) {
          line += STATIC_CHARS[Math.floor(Math.random() * STATIC_CHARS.length)];
        }
        ctx.fillText(line, cx, 70 + row * 14);
      }
      this._cameraOffline = true;
      return;
    }

    this._cameraOffline = false;

    // Draw ASCII sprite as text
    ctx.fillStyle = C_GREEN;
    ctx.font = '9px monospace';
    ctx.textAlign = 'center';
    const sprite = data.sprite;
    const startY = 68;
    for (let i = 0; i < sprite.length; i++) {
      ctx.fillText(sprite[i], cx, startY + i * 12);
    }
  }

  _drawSpeechBubble(ctx, data) {
    // Don't show bubble if camera is offline
    if (this._cameraOffline) return;

    const cx = HABITAT_W / 2;
    const bubbleY = 30;

    // Determine text
    let text = '...';
    let color = C_DIM;

    if (data.status === 'escaped') {
      text = '!!!';
      color = C_RED;
    } else {
      // Find lowest need
      const needs = [
        { name: 'HUNGRY!', value: data.needs.hunger },
        { name: 'THIRSTY!', value: data.needs.thirst },
        { name: 'BORED!', value: data.needs.happiness },
      ];
      needs.sort((a, b) => a.value - b.value);

      if (data.glassHealth < 40) {
        text = '!!!';
        color = C_RED;
      } else if (needs[0].value < 30) {
        text = needs[0].name;
        color = C_YELLOW;
      } else if (needs[0].value > 60) {
        text = '...';
        color = C_DIM;
      } else {
        text = '~';
        color = C_GREEN;
      }
    }

    // Bubble background
    ctx.font = '7px "Press Start 2P", monospace';
    const tw = ctx.measureText(text).width;
    const pad = 6;
    const bw = tw + pad * 2;
    const bh = 14;
    const bx = cx - bw / 2;

    ctx.fillStyle = C_WALL;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.fillRect(bx, bubbleY - bh / 2, bw, bh);
    ctx.strokeRect(bx, bubbleY - bh / 2, bw, bh);

    // Tail
    ctx.beginPath();
    ctx.moveTo(cx - 3, bubbleY + bh / 2);
    ctx.lineTo(cx, bubbleY + bh / 2 + 5);
    ctx.lineTo(cx + 3, bubbleY + bh / 2);
    ctx.fillStyle = C_WALL;
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(cx - 3, bubbleY + bh / 2);
    ctx.lineTo(cx, bubbleY + bh / 2 + 5);
    ctx.lineTo(cx + 3, bubbleY + bh / 2);
    ctx.strokeStyle = color;
    ctx.stroke();

    // Text
    ctx.fillStyle = color;
    ctx.textAlign = 'center';
    ctx.fillText(text, cx, bubbleY + 3);
  }

  _drawStaticNoise(ctx) {
    ctx.fillStyle = C_BG;
    ctx.fillRect(0, 0, HABITAT_W, HABITAT_H);

    ctx.fillStyle = '#444';
    ctx.font = '12px monospace';
    ctx.textAlign = 'center';
    for (let row = 0; row < 12; row++) {
      let line = '';
      for (let col = 0; col < 24; col++) {
        line += STATIC_CHARS[Math.floor(Math.random() * STATIC_CHARS.length)];
      }
      ctx.fillText(line, HABITAT_W / 2, 14 + row * 14);
    }

    ctx.fillStyle = C_RED;
    ctx.font = '8px "Press Start 2P", monospace';
    ctx.fillText('[CAMERA OFFLINE]', HABITAT_W / 2, HABITAT_H / 2);
  }

  _doAction(action) {
    const mgr = this.game.tamagotchiManager;
    if (!mgr) return;

    // Check enclosure item requirement
    const itemMap = { FEED: 'food', WATER: 'water', PLAY: 'toy' };
    const tama = mgr.getTama(this._selectedId);
    if (tama && !tama._enclosureItems[itemMap[action]]) return;

    const success = mgr.careAction(this._selectedId, action);
    if (success) {
      const btn = this._actionBtns[action];
      if (btn) {
        btn.classList.add('cooldown');
        btn.disabled = true;
      }
    }
  }

  onActivate() {
    this._hotkeyHandler = (e) => {
      const idx = parseInt(e.key) - 1;
      if (idx >= 0 && idx < ACTIONS.length) {
        this._doAction(ACTIONS[idx]);
      }
    };
    document.addEventListener('keydown', this._hotkeyHandler);
  }

  onDeactivate() {
    if (this._hotkeyHandler) {
      document.removeEventListener('keydown', this._hotkeyHandler);
      this._hotkeyHandler = null;
    }
  }

  update(dt) {
    const mgr = this.game.tamagotchiManager;
    if (!mgr) return;

    // Check if visibility changed (new tama arrived via transport or hatched)
    const allData = mgr.getAllUIData();
    const newVisibleCount = allData.filter(d => d.delivered || d.inTransit).length;
    const selectedData = allData.find(d => d.id === this._selectedId);
    const selectedDelivered = selectedData ? selectedData.delivered : false;

    if (newVisibleCount !== this._visibleCount || selectedDelivered !== this._selectedDelivered) {
      this._selectedDelivered = selectedDelivered;
      this._rebuildList();
      this._renderDetail();
    }

    // Update list item status dots
    for (const data of allData) {
      const entry = this._listItems[data.id];
      if (entry) {
        entry.dot.className = `tama-status-dot ${data.status}`;
      }
    }

    // Redraw habitat canvas
    const data = mgr.getUIData(this._selectedId);
    if (!data) return;

    if (this._ctx) {
      // Camera offline — full static
      const camSys = this.game.cameraSystem;
      const personality = PERSONALITIES[this._selectedId];
      const camDown = camSys && personality && !camSys.isCameraUp(personality.roomId);

      if (camDown) {
        this._staticTimer += dt;
        // Redraw static every few frames (throttle)
        if (this._staticTimer > 0.1) {
          this._staticTimer = 0;
          this._drawStaticNoise(this._ctx);
        }
      } else {
        this._drawHabitat(data);
      }
    }

    // Server offline check
    const infraMgr = this.game.infrastructureManager;
    const serverDown = infraMgr && !infraMgr.systems.server_room.operational;

    // Enclosure item check — care buttons disabled until corresponding item placed
    const tama = this.game.tamagotchiManager?.getTama(this._selectedId);
    const encItems = tama ? tama._enclosureItems : { food: false, water: false, toy: false };
    const itemMap = { FEED: 'food', WATER: 'water', PLAY: 'toy' };

    // Action button cooldown states
    for (let i = 0; i < ACTIONS.length; i++) {
      const action = ACTIONS[i];
      const btn = this._actionBtns[action];
      if (!btn) continue;
      const onCooldown = data.cooldowns[action];
      const noItem = !encItems[itemMap[action]];
      btn.classList.toggle('cooldown', onCooldown || serverDown || noItem);
      btn.disabled = onCooldown || serverDown || noItem || data.status === 'escaped';
      btn.textContent = serverDown ? '[OFFLINE]' : noItem ? `[${i + 1}] ---` : `[${i + 1}] ${action}`;
    }
  }
}
