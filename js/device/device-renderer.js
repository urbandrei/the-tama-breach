import { TamaTab } from './tama-tab.js';
import { TasksTab } from './tasks-tab.js';
import { Minimap } from './minimap.js';
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

    header.appendChild(title);
    header.appendChild(this._clock);

    // Tab bar
    const tabBar = document.createElement('div');
    tabBar.id = 'device-tabs';

    const tabNames = [
      { key: 'specimens', label: 'SPECIMENS' },
      { key: 'tasks', label: 'TASKS' },
      { key: 'map', label: 'MAP' },
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
      map: new Minimap(this.game),
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

  update(dt) {
    if (this._activeTab) {
      this._activeTab.update(dt);
    }
  }
}
