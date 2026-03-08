import { TamaTab } from './tama-tab.js';
import { TasksTab } from './tasks-tab.js';
import { SettingsTab } from './settings-tab.js';
import { SnakeApp } from './snake-app.js';

export class DeviceRenderer {
  constructor(game) {
    this.game = game;
    this._activeTabName = null;
    this._activeTab = null;
    this._onHomeScreen = true;

    this._buildDOM();
    this._createTabs();
  }

  _buildDOM() {
    const root = document.getElementById('ui-root');

    // Container
    this._container = document.createElement('div');
    this._container.id = 'device-container';

    // Frame
    this._frame = document.createElement('div');
    this._frame.id = 'device-frame';

    // Header (status bar)
    const header = document.createElement('div');
    header.id = 'device-header';

    const title = document.createElement('span');
    title.className = 'device-title';
    title.textContent = 'DEEP-OS v2.1';

    this._clock = document.createElement('span');
    this._clock.className = 'device-clock';
    this._clock.textContent = '12:00 AM';

    this._batteryEl = document.createElement('span');
    this._batteryEl.className = 'device-battery';
    this._batteryEl.textContent = 'BAT 100%';

    header.appendChild(title);
    header.appendChild(this._batteryEl);
    header.appendChild(this._clock);

    // Content area
    this._content = document.createElement('div');
    this._content.id = 'device-content';

    // Scanlines overlay
    const scanlines = document.createElement('div');
    scanlines.id = 'device-scanlines';

    // Assemble
    this._frame.appendChild(header);
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
      snake: new SnakeApp(),
    };
  }

  _showHomeScreen() {
    if (this._activeTab) {
      this._activeTab.onDeactivate();
      this._activeTab = null;
    }
    this._activeTabName = null;
    this._onHomeScreen = true;
    this._content.innerHTML = '';

    const home = document.createElement('div');
    home.className = 'device-home';

    const apps = [
      { key: 'specimens', label: 'SPECIMENS', icon: '[\u2588]' },
      { key: 'tasks', label: 'TASKS', icon: '[!]' },
      { key: 'snake', label: 'SNAKE', icon: '[~]' },
      { key: 'settings', label: 'SETTINGS', icon: '[*]' },
    ];

    for (const app of apps) {
      const btn = document.createElement('button');
      btn.className = 'device-app-icon';
      btn.innerHTML = `<span class="app-icon-glyph">${app.icon}</span><span class="app-icon-label">${app.label}</span>`;
      btn.addEventListener('click', () => this._openApp(app.key));
      home.appendChild(btn);
    }

    this._content.appendChild(home);
  }

  _openApp(name) {
    if (this._activeTab) {
      this._activeTab.onDeactivate();
    }

    this._onHomeScreen = false;
    this._content.innerHTML = '';
    this._activeTabName = name;
    this._activeTab = this._tabs[name];

    // App wrapper with close button
    const wrapper = document.createElement('div');
    wrapper.className = 'device-app-wrapper';

    const topBar = document.createElement('div');
    topBar.className = 'device-app-topbar';

    const appTitle = document.createElement('span');
    appTitle.textContent = name.toUpperCase();

    const closeBtn = document.createElement('button');
    closeBtn.className = 'device-app-close';
    closeBtn.textContent = '< BACK';
    closeBtn.addEventListener('click', () => this._showHomeScreen());

    topBar.appendChild(appTitle);
    topBar.appendChild(closeBtn);

    const appContent = document.createElement('div');
    appContent.className = 'device-app-content';
    appContent.appendChild(this._activeTab.createElement());

    wrapper.appendChild(topBar);
    wrapper.appendChild(appContent);
    this._content.appendChild(wrapper);
    this._activeTab.onActivate();
  }

  _switchTab(name) {
    this._openApp(name);
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

    if (this._onHomeScreen) {
      this._showHomeScreen();
    } else if (this._activeTab) {
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
  }

  hideBriefing() {
    this.hide();

    // Restore home screen after close animation
    const onEnd = () => {
      this._onHomeScreen = true;
      this._activeTabName = null;
      this._activeTab = null;
      this._container.removeEventListener('animationend', onEnd);
    };
    this._container.addEventListener('animationend', onEnd);
  }

  showMainMenu(onStart, onSettings) {
    this._container.classList.remove('device-hidden');
    this._container.classList.add('device-visible');
    this._content.innerHTML = '';

    const menu = document.createElement('div');
    menu.className = 'device-main-menu';
    menu.innerHTML = `
      <div class="menu-title">
        <div class="menu-ascii">╔═══════════════╗</div>
        <div class="menu-ascii">║   DEEP  PEN   ║</div>
        <div class="menu-ascii">╚═══════════════╝</div>
        <div class="menu-subtitle">CONTAINMENT FACILITY OS</div>
      </div>
      <div class="menu-buttons">
        <button class="menu-btn menu-start">[  START  ]</button>
        <button class="menu-btn menu-settings">[SETTINGS ]</button>
        <button class="menu-btn menu-credits">[ CREDITS ]</button>
      </div>
      <div class="menu-footer">v2.1 // DEEP-OS</div>
    `;
    this._content.appendChild(menu);

    menu.querySelector('.menu-start').addEventListener('click', () => {
      onStart();
    });
    menu.querySelector('.menu-settings').addEventListener('click', () => {
      onSettings();
    });
    menu.querySelector('.menu-credits').addEventListener('click', () => {
      this._showCredits(() => this.showMainMenu(onStart, onSettings));
    });
  }

  _showCredits(onBack) {
    this._content.innerHTML = '';
    const credits = document.createElement('div');
    credits.className = 'device-credits';
    credits.innerHTML = `
      <div class="credits-title">CREDITS</div>
      <div class="credits-body">
        A game jam project<br><br>
        Built with Three.js<br>
        Font: Press Start 2P<br><br>
        Thank you for playing
      </div>
      <button class="menu-btn credits-back">[ BACK ]</button>
    `;
    this._content.appendChild(credits);
    credits.querySelector('.credits-back').addEventListener('click', () => onBack());
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
