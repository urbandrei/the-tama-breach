const MOCK_TASKS = [
  { id: 1, title: 'Calibrate water filtration sensors', location: 'Water Filtration', status: 'complete' },
  { id: 2, title: 'Replace server room UPS batteries', location: 'Server Room', status: 'active' },
  { id: 3, title: 'Reset electrical breaker panel C', location: 'Electrical', status: 'pending' },
  { id: 4, title: 'Transport specimen to Containment B', location: 'Loading Dock', status: 'pending' },
  { id: 5, title: 'Repair containment glass - Chamber A', location: 'Containment A', status: 'pending' },
];

const STATUS_ICON = {
  complete: '[X]',
  active: '[>]',
  pending: '[ ]',
};

export class TasksTab {
  constructor(game) {
    this.game = game;
    this._el = null;
  }

  createElement() {
    if (this._el) return this._el;

    const root = document.createElement('div');
    root.className = 'tasks-tab';

    // Task list
    const list = document.createElement('div');
    list.className = 'tasks-list';

    for (const task of MOCK_TASKS) {
      const row = document.createElement('div');
      row.className = `task-item task-${task.status}`;

      const icon = document.createElement('span');
      icon.className = 'task-status-icon';
      icon.textContent = STATUS_ICON[task.status];

      const info = document.createElement('div');
      info.className = 'task-info';

      const title = document.createElement('div');
      title.className = 'task-description';
      title.textContent = `${task.id}. ${task.title}`;

      const location = document.createElement('div');
      location.className = 'task-room';
      location.textContent = task.location;

      info.appendChild(title);
      info.appendChild(location);
      row.appendChild(icon);
      row.appendChild(info);
      list.appendChild(row);
    }

    root.appendChild(list);

    // Summary (at bottom)
    const summary = document.createElement('div');
    summary.className = 'tasks-summary';
    const doneCount = MOCK_TASKS.filter(t => t.status === 'complete').length;
    summary.textContent = `${doneCount}/${MOCK_TASKS.length} COMPLETE`;
    root.appendChild(summary);
    this._el = root;
    return root;
  }

  onActivate() {}
  onDeactivate() {}
  update(_dt) {}
}
