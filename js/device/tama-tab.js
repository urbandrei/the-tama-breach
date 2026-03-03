const ACTIONS = ['FEED', 'PLAY', 'SCOLD'];

export class TamaTab {
  constructor(game) {
    this.game = game;
    this._el = null;
    this._selectedId = null;
    this._sidebar = null;
    this._detail = null;
    this._listItems = {};
    this._bars = {};
    this._actionBtns = {};
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
    if (allData.length > 0 && !this._selectedId) {
      this._selectedId = allData[0].id;
    }

    for (const data of allData) {
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
    if (!data) return;

    this._detail.innerHTML = '';

    // ASCII sprite
    const spriteBox = document.createElement('pre');
    spriteBox.className = 'tama-sprite-area';
    spriteBox.textContent = data.sprite.join('\n');
    this._detail.appendChild(spriteBox);

    // Name
    const nameEl = document.createElement('div');
    nameEl.className = 'tama-name';
    nameEl.textContent = data.name;
    this._detail.appendChild(nameEl);

    // Personality
    const personality = document.createElement('div');
    personality.className = 'tama-personality';
    personality.textContent = data.personality;
    this._detail.appendChild(personality);

    // Status
    const statusEl = document.createElement('div');
    statusEl.className = `tama-status-text ${data.status}`;
    statusEl.textContent = data.status.toUpperCase();
    this._detail.appendChild(statusEl);

    // Need bars
    const barsContainer = document.createElement('div');
    barsContainer.className = 'tama-needs';
    this._bars = {};

    for (const [need, value] of Object.entries(data.needs)) {
      const row = document.createElement('div');
      row.className = 'need-row';

      const label = document.createElement('span');
      label.className = 'need-label';
      label.textContent = need.substring(0, 3).toUpperCase();

      const barOuter = document.createElement('div');
      barOuter.className = 'need-bar-bg';

      const barFill = document.createElement('div');
      barFill.className = 'need-bar-fill';
      barFill.style.width = `${Math.round(value)}%`;
      this._updateBarColor(barFill, value);

      const valText = document.createElement('span');
      valText.className = 'need-value';
      valText.textContent = `${Math.round(value)}%`;

      barOuter.appendChild(barFill);
      row.appendChild(label);
      row.appendChild(barOuter);
      row.appendChild(valText);
      barsContainer.appendChild(row);

      this._bars[need] = { fill: barFill, text: valText };
    }

    // Glass health bar
    const glassRow = document.createElement('div');
    glassRow.className = 'need-row';

    const glassLabel = document.createElement('span');
    glassLabel.className = 'need-label';
    glassLabel.textContent = 'GLS';

    const glassBarOuter = document.createElement('div');
    glassBarOuter.className = 'need-bar-bg';

    const glassBarFill = document.createElement('div');
    glassBarFill.className = 'need-bar-fill';
    glassBarFill.style.width = `${Math.round(data.glassHealth)}%`;
    this._updateBarColor(glassBarFill, data.glassHealth);

    const glassText = document.createElement('span');
    glassText.className = 'need-value';
    glassText.textContent = `${Math.round(data.glassHealth)}%`;

    glassBarOuter.appendChild(glassBarFill);
    glassRow.appendChild(glassLabel);
    glassRow.appendChild(glassBarOuter);
    glassRow.appendChild(glassText);
    barsContainer.appendChild(glassRow);

    this._bars._glass = { fill: glassBarFill, text: glassText };
    this._detail.appendChild(barsContainer);

    // Action buttons
    const actions = document.createElement('div');
    actions.className = 'tama-actions';
    this._actionBtns = {};

    for (const action of ACTIONS) {
      const btn = document.createElement('button');
      btn.className = 'tama-btn';
      if (data.cooldowns[action]) btn.classList.add('cooldown');
      btn.disabled = data.cooldowns[action] || data.status === 'escaped';
      btn.textContent = action;
      btn.addEventListener('click', () => this._doAction(action));
      actions.appendChild(btn);
      this._actionBtns[action] = btn;
    }

    this._detail.appendChild(actions);
  }

  _updateBarColor(fillEl, value) {
    fillEl.classList.remove('high', 'mid', 'low');
    if (value > 60) fillEl.classList.add('high');
    else if (value > 30) fillEl.classList.add('mid');
    else fillEl.classList.add('low');
  }

  _doAction(action) {
    const mgr = this.game.tamagotchiManager;
    if (!mgr) return;

    const success = mgr.careAction(this._selectedId, action);
    if (success) {
      const btn = this._actionBtns[action];
      if (btn) {
        btn.classList.add('cooldown');
        btn.disabled = true;
      }
    }
  }

  onActivate() {}
  onDeactivate() {}

  update(_dt) {
    const mgr = this.game.tamagotchiManager;
    if (!mgr) return;

    // Update list item status dots
    const allData = mgr.getAllUIData();
    for (const data of allData) {
      const entry = this._listItems[data.id];
      if (entry) {
        entry.dot.className = `tama-status-dot ${data.status}`;
      }
    }

    // Update selected tama's bars (efficient — no full re-render)
    const data = mgr.getUIData(this._selectedId);
    if (!data) return;

    for (const [need, value] of Object.entries(data.needs)) {
      const bar = this._bars[need];
      if (bar) {
        const rounded = Math.round(value);
        bar.fill.style.width = `${rounded}%`;
        bar.text.textContent = `${rounded}%`;
        this._updateBarColor(bar.fill, value);
      }
    }

    // Glass health bar
    if (this._bars._glass) {
      const rounded = Math.round(data.glassHealth);
      this._bars._glass.fill.style.width = `${rounded}%`;
      this._bars._glass.text.textContent = `${rounded}%`;
      this._updateBarColor(this._bars._glass.fill, data.glassHealth);
    }

    // Action button cooldown states
    for (const action of ACTIONS) {
      const btn = this._actionBtns[action];
      if (!btn) continue;
      const onCooldown = data.cooldowns[action];
      btn.classList.toggle('cooldown', onCooldown);
      btn.disabled = onCooldown || data.status === 'escaped';
    }
  }
}
