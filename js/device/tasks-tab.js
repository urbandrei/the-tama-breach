// Task type categories shown on device
const TASK_TYPES = [
  { key: 'electrical', label: 'ELECTRICAL', ids: ['electrical_qte'] },
  { key: 'server', label: 'SERVER', ids: ['server_wires'] },
  { key: 'water', label: 'WATER', ids: ['water_pipes'] },
  { key: 'storage', label: 'STORAGE', ids: ['storage_calibrate'] },
  { key: 'transport', label: 'TRANSPORT', ids: ['transport_specimen'] },
  { key: 'glass', label: 'GLASS REPAIR', pattern: 'repair_' },
  { key: 'infra', label: 'INFRA REPAIR', pattern: 'infra_repair_' },
  { key: 'fetch', label: 'FETCH ITEM', ids: ['fetch_food', 'fetch_water', 'fetch_toy'] },
];

export class TasksTab {
  constructor(game) {
    this.game = game;
    this._el = null;
    this._rows = {};
    this._summary = null;
    this._list = null;
  }

  createElement() {
    if (this._el) return this._el;

    const root = document.createElement('div');
    root.className = 'tasks-tab';

    const header = document.createElement('div');
    header.className = 'tasks-header';
    header.textContent = 'SYSTEMS';
    root.appendChild(header);

    this._list = document.createElement('div');
    this._list.className = 'tasks-list';
    root.appendChild(this._list);

    this._summary = document.createElement('div');
    this._summary.className = 'tasks-summary';
    root.appendChild(this._summary);

    this._el = root;
    this._buildTypeRows();

    return root;
  }

  _buildTypeRows() {
    if (!this._list) return;
    this._list.innerHTML = '';
    this._rows = {};

    for (const type of TASK_TYPES) {
      const row = document.createElement('div');
      row.className = 'task-item task-idle';

      const label = document.createElement('span');
      label.className = 'task-type-label';
      label.textContent = type.label;

      const status = document.createElement('span');
      status.className = 'task-type-status';
      status.textContent = '---';

      row.appendChild(label);
      row.appendChild(status);
      this._list.appendChild(row);

      this._rows[type.key] = { row, status };
    }
  }

  _getMatchingTasks(type, tasks) {
    if (type.ids) {
      return tasks.filter(t => type.ids.includes(t.id));
    }
    if (type.pattern) {
      return tasks.filter(t => t.id.startsWith(type.pattern));
    }
    return [];
  }

  _updateRows() {
    const mgr = this.game.taskManager;
    if (!mgr) return;

    const tasks = mgr.getAllTaskData();
    let completed = 0;
    let total = 0;

    for (const type of TASK_TYPES) {
      const entry = this._rows[type.key];
      if (!entry) continue;

      const matching = this._getMatchingTasks(type, tasks);

      // Find most important status: active > pending > completed > none
      const active = matching.find(t => t.status === 'active');
      const pending = matching.find(t => t.status === 'pending');
      const done = matching.filter(t => t.status === 'completed');

      if (active) {
        entry.row.className = 'task-item task-active';
        const detail = active.location || '';
        entry.status.textContent = detail ? `ACTIVE [${detail}]` : 'ACTIVE';
        total++;
      } else if (pending) {
        entry.row.className = 'task-item task-pending-type';
        const detail = pending.location || '';
        entry.status.textContent = detail ? `PENDING [${detail}]` : 'PENDING';
        total++;
      } else if (done.length > 0) {
        entry.row.className = 'task-item task-complete';
        entry.status.textContent = 'DONE';
        total++;
        completed += done.length;
      } else {
        entry.row.className = 'task-item task-idle';
        entry.status.textContent = '---';
      }
    }

    if (this._summary) {
      const allDone = tasks.filter(t => t.status === 'completed').length;
      this._summary.textContent = `${allDone}/${tasks.length} COMPLETE`;
    }
  }

  onActivate() {
    this._updateRows();
  }

  onDeactivate() {}

  update(_dt) {
    this._updateRows();
  }
}
