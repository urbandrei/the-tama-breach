const STATUS_ICON = {
  completed: '[X]',
  active: '[>]',
  pending: '[ ]',
  failed: '[ ]',
};

const STATUS_CLASS = {
  completed: 'task-complete',
  active: 'task-active',
  pending: 'task-pending',
  failed: 'task-pending',
};

export class TasksTab {
  constructor(game) {
    this.game = game;
    this._el = null;
    this._taskItems = {};
    this._summary = null;
    this._list = null;
  }

  createElement() {
    if (this._el) return this._el;

    const root = document.createElement('div');
    root.className = 'tasks-tab';

    // Header
    const header = document.createElement('div');
    header.className = 'tasks-header';
    header.textContent = 'ACTIVE TASKS';
    root.appendChild(header);

    // Task list
    this._list = document.createElement('div');
    this._list.className = 'tasks-list';
    root.appendChild(this._list);

    // Summary
    this._summary = document.createElement('div');
    this._summary.className = 'tasks-summary';
    root.appendChild(this._summary);

    this._el = root;
    this._rebuildList();

    return root;
  }

  _rebuildList() {
    if (!this._list) return;

    this._list.innerHTML = '';
    this._taskItems = {};

    const mgr = this.game.taskManager;
    if (!mgr) return;

    const tasks = mgr.getAllTaskData();
    let idx = 1;

    for (const task of tasks) {
      const row = document.createElement('div');
      row.className = `task-item ${STATUS_CLASS[task.status]}`;

      const icon = document.createElement('span');
      icon.className = 'task-status-icon';
      icon.textContent = STATUS_ICON[task.status];

      const info = document.createElement('div');
      info.className = 'task-info';

      const title = document.createElement('div');
      title.className = 'task-description';
      title.textContent = `${idx}. ${task.title}`;

      const location = document.createElement('div');
      location.className = 'task-room';
      location.textContent = task.location;

      info.appendChild(title);
      info.appendChild(location);
      row.appendChild(icon);
      row.appendChild(info);
      this._list.appendChild(row);

      this._taskItems[task.id] = { row, icon };
      idx++;
    }

    this._updateSummary(tasks);
  }

  _updateSummary(tasks) {
    if (!this._summary) return;
    const total = tasks.length;
    const done = tasks.filter(t => t.status === 'completed').length;
    this._summary.textContent = `${done}/${total} COMPLETE`;
  }

  onActivate() {
    // Rebuild list when tab becomes visible (catches newly created repair tasks)
    this._rebuildList();
  }

  onDeactivate() {}

  update(_dt) {
    const mgr = this.game.taskManager;
    if (!mgr) return;

    const tasks = mgr.getAllTaskData();

    for (const task of tasks) {
      const entry = this._taskItems[task.id];
      if (!entry) {
        // New task appeared (e.g. glass repair) — rebuild
        this._rebuildList();
        return;
      }

      // Update status class and icon
      const newClass = STATUS_CLASS[task.status];
      entry.row.className = `task-item ${newClass}`;
      entry.icon.textContent = STATUS_ICON[task.status];
    }

    this._updateSummary(tasks);
  }
}
