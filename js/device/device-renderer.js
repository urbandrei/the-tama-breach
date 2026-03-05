import { TamaTab } from './tama-tab.js';
import { TasksTab } from './tasks-tab.js';
import { SettingsTab } from './settings-tab.js';

export class DeviceRenderer {
  constructor(game) {
    this.game = game;
    this._activeTabName = 'specimens';
    this._activeTab = null;

    this._buildDOM();
    this._createTabs();

    // Set initial active tab
    this._switchTab('specimens');
  }

  _buildDOM() {
    const root = document.getElementById('ui-root');

    // Container
    this._container = document.createElement('div');
    this._container.id = 'device-container';
    // Start fully hidden (no class = display:none via CSS default)

    // Frame
    this._frame = document.createElement('div');
    this._frame.id = 'device-frame';

    // Header
    const header = document.createElement('div');
    header.id = 'device-header';

    const title = document.createElement('span');
    title.className = 'device-title';
    title.textContent = 'TAMA-OS v2.1';

    this._clock = document.createElement('span');
    this._clock.className = 'device-clock';
    this._clock.textContent = '12:00 AM';

    this._batteryEl = document.createElement('span');
    this._batteryEl.className = 'device-battery';
    this._batteryEl.textContent = 'BAT 100%';

    header.appendChild(title);
    header.appendChild(this._batteryEl);
    header.appendChild(this._clock);

    // Tab bar
    const tabBar = document.createElement('div');
    tabBar.id = 'device-tabs';

    const tabNames = [
      { key: 'specimens', label: 'SPECIMENS' },
      { key: 'tasks', label: 'TASKS' },
      { key: 'settings', label: 'SETTINGS' },
    ];

    this._tabButtons = {};
    for (const t of tabNames) {
      const btn = document.createElement('button');
      btn.className = 'device-tab';
      btn.dataset.tab = t.key;
      btn.textContent = t.label;
      btn.addEventListener('click', () => this._switchTab(t.key));
      tabBar.appendChild(btn);
      this._tabButtons[t.key] = btn;
    }

    // Content area
    this._content = document.createElement('div');
    this._content.id = 'device-content';

    // Scanlines overlay
    const scanlines = document.createElement('div');
    scanlines.id = 'device-scanlines';

    // Assemble
    this._frame.appendChild(header);
    this._frame.appendChild(tabBar);
    this._frame.appendChild(this._content);
    this._frame.appendChild(scanlines);
    this._container.appendChild(this._frame);
    root.appendChild(this._container);
  }

  _createTabs() {
    this._tabs = {
      specimens: new TamaTab(this.game),
      tasks: new TasksTab(this.game),
      settings: new SettingsTab(this.game),
    };
  }

  _switchTab(name) {
    if (this._activeTab) {
      this._activeTab.onDeactivate();
    }

    // Update button states
    for (const [key, btn] of Object.entries(this._tabButtons)) {
      btn.classList.toggle('active', key === name);
    }

    // Swap content
    this._content.innerHTML = '';
    this._activeTabName = name;
    this._activeTab = this._tabs[name];
    this._content.appendChild(this._activeTab.createElement());
    this._activeTab.onActivate();
  }

  show() {
    // Backdrop captures clicks outside device
    if (!this._backdrop) {
      this._backdrop = document.createElement('div');
      this._backdrop.className = 'screen-backdrop';
      document.getElementById('ui-root').appendChild(this._backdrop);
    }

    this._container.classList.remove('device-hidden');
    this._container.classList.add('device-visible');

    if (this._activeTab) {
      this._activeTab.onActivate();
    }
  }

  hide() {
    this._container.classList.remove('device-visible');
    this._container.classList.add('device-hidden');

    if (this._activeTab) {
      this._activeTab.onDeactivate();
    }

    // Remove backdrop
    if (this._backdrop) {
      this._backdrop.remove();
      this._backdrop = null;
    }

    // After close animation, fully hide
    const onEnd = () => {
      if (!this._container.classList.contains('device-visible')) {
        this._container.classList.remove('device-hidden');
        // Removes both classes → display:none via CSS default
      }
      this._container.removeEventListener('animationend', onEnd);
    };
    this._container.addEventListener('animationend', onEnd);
  }

  showBriefing(title, body, buttonText, onAction) {
    // Show device container
    this._container.classList.remove('device-hidden');
    this._container.classList.add('device-visible');

    // Replace content with briefing screen
    this._content.innerHTML = '';
    const briefing = document.createElement('div');
    briefing.className = 'device-briefing';
    const bodyHtml = body ? `<div class="briefing-body">${body.replace(/\n/g, '<br>')}</div>` : '';
    briefing.innerHTML = `
      <div class="briefing-title">${title}</div>
      ${bodyHtml}
      <button class="briefing-btn">${buttonText}</button>
    `;
    this._content.appendChild(briefing);

    const btn = briefing.querySelector('.briefing-btn');
    btn.addEventListener('click', onAction, { once: true });

    // Hide tab bar during briefing
    const tabBar = this._frame.querySelector('#device-tabs');
    if (tabBar) tabBar.style.display = 'none';
  }

  hideBriefing() {
    // Hide device first (before restoring tabs to avoid flash of home screen)
    this.hide();

    // Restore tab bar and content after close animation
    const onEnd = () => {
      const tabBar = this._frame.querySelector('#device-tabs');
      if (tabBar) tabBar.style.display = '';
      this._switchTab(this._activeTabName);
      this._container.removeEventListener('animationend', onEnd);
    };
    this._container.addEventListener('animationend', onEnd);
  }

  updateBattery(level) {
    if (!this._batteryEl) return;
    const pct = Math.round(level);
    this._batteryEl.textContent = `BAT ${pct}%`;
    if (pct <= 15) {
      this._batteryEl.classList.add('battery-low');
    } else {
      this._batteryEl.classList.remove('battery-low');
    }
  }

  update(dt) {
    if (this._activeTab) {
      this._activeTab.update(dt);
    }
  }
}
