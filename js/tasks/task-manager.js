import { TaskState } from './task-base.js';
import { TaskQTE } from './task-qte.js';
import { TaskWires } from './task-wires.js';
import { TaskPipes } from './task-pipes.js';
import { TaskHoldSteady } from './task-holdsteady.js';
import { TaskTransport } from './task-transport.js';
import { TaskGlassRepair } from './task-glass-repair.js';
import { TaskNotes } from './task-notes.js';
import { TaskFetchItem } from './task-fetch-item.js';
import { ROOM_TO_TAMA } from '../tamagotchi/personality.js';

const TASK_CONFIGS = [
  {
    id: 'electrical_qte',
    type: 'qte',
    title: 'Reset breaker panel C',
    roomId: 'generator_room',
    location: 'Generator Room',
    triggerPosition: [1, 1.4, -5],
    keyCount: 5,
    timeLimit: 8,
  },
  {
    id: 'server_wires',
    type: 'wires',
    title: 'Reconnect server UPS',
    roomId: 'server_room',
    location: 'Server Room',
    triggerPosition: [-5, 1.4, -7],
  },
  {
    id: 'water_pipes',
    type: 'pipes',
    title: 'Calibrate filtration pipes',
    roomId: 'water_filtration',
    location: 'Water Filtration',
    triggerPosition: [19.25, 1.4, 5],
  },
  {
    id: 'storage_calibrate',
    type: 'holdsteady',
    title: 'Calibrate storage sensors',
    roomId: 'storage',
    location: 'Storage',
    triggerPosition: [19.25, 1.4, -5],
    duration: 5,
  },
  {
    id: 'checkin_command',
    type: 'holdsteady',
    title: 'Check in at command center',
    roomId: 'command_center',
    location: 'Command Center',
    triggerPosition: [-19.25, 1.4, -5],
    duration: 4,
  },
  {
    id: 'transport_specimen',
    type: 'transport',
    title: 'Transport specimen crate',
    roomId: 'elevator',
    location: 'Elevator',
    triggerPosition: [-19.25, 1.4, 5],
    targetRoomId: 'contain_b',
    targetPosition: [7.5, 0, 19],
  },
  {
    id: 'note_specimen',
    type: 'notes',
    title: 'Record specimen observations',
    roomId: 'contain_b',
    location: 'Containment B',
    triggerPosition: [7.5, 1.4, 19],
  },
  {
    id: 'fetch_food',
    type: 'fetch_item',
    title: 'Fetch food supply',
    roomId: 'food_processing',
    location: 'Food Processing',
    triggerPosition: [5, 1.4, 5],
    itemType: 'food',
    sourcePosition: [5, 1.4, 5],
    destinationPosition: [7.5, 0, 19],
  },
  {
    id: 'fetch_water',
    type: 'fetch_item',
    title: 'Fetch water supply',
    roomId: 'water_filtration',
    location: 'Water Filtration',
    triggerPosition: [19.25, 1.4, 5],
    itemType: 'water',
    sourcePosition: [19.25, 1.4, 5],
    destinationPosition: [7.5, 0, 19],
  },
  {
    id: 'fetch_toy',
    type: 'fetch_item',
    title: 'Fetch toy supply',
    roomId: 'storage',
    location: 'Storage',
    triggerPosition: [19.25, 1.4, -5],
    itemType: 'toy',
    sourcePosition: [19.25, 1.4, -5],
    destinationPosition: [7.5, 0, 19],
  },
];

// Room center positions for containment rooms (for glass repair triggers)
const ROOM_CENTERS = {
  contain_a: [-7.5, 1.4, 19],
  contain_b: [7.5, 1.4, 19],
  contain_c: [-7.5, 1.4, -19],
  contain_d: [7.5, 1.4, -19],
};

// Hub room centers for infrastructure repair tasks
const HUB_CENTERS = {
  food_processing: [5, 1.4, 5],
  water_filtration: [19.25, 1.4, 5],
  server_room: [-5, 1.4, -5],
  generator_room: [1, 1.4, -5],
};

const INFRA_LABELS = {
  food_processing: 'Food Processing',
  water_filtration: 'Water Filtration',
  server_room: 'Server Room',
  generator_room: 'Generator Room',
};

const INFRA_TITLES = {
  food_processing: 'Restore food processing',
  water_filtration: 'Fix water filtration',
  server_room: 'Reconnect server systems',
  generator_room: 'Restart generator',
};

export class TaskManager {
  constructor(game) {
    this.game = game;
    this.tasks = {};
    this._taskList = [];

    // Create standard tasks (triggers placed later by NightManager)
    for (const config of TASK_CONFIGS) {
      const task = this._createTask(config);
      if (task) {
        this.tasks[config.id] = task;
      }
    }

    // Listen for containment breaches to create repair tasks
    this._breachHandler = (data) => this._onBreach(data);
    game.on('containment:breach', this._breachHandler);
  }

  _createTask(config) {
    switch (config.type) {
      case 'qte': return new TaskQTE(this.game, config);
      case 'wires': return new TaskWires(this.game, config);
      case 'pipes': return new TaskPipes(this.game, config);
      case 'holdsteady': return new TaskHoldSteady(this.game, config);
      case 'transport': return new TaskTransport(this.game, config);
      case 'glass_repair': return new TaskGlassRepair(this.game, config);
      case 'notes': return new TaskNotes(this.game, config);
      case 'fetch_item': return new TaskFetchItem(this.game, config);
      default:
        console.warn(`Unknown task type: ${config.type}`);
        return null;
    }
  }

  createInfraRepairTask(systemId, taskType, roomId) {
    const repairId = `infra_repair_${systemId}`;

    // Don't create duplicate
    if (this.tasks[repairId]) return;

    const center = HUB_CENTERS[roomId] || HUB_CENTERS[systemId];
    if (!center) return;

    const config = {
      id: repairId,
      type: taskType,
      title: INFRA_TITLES[systemId] || `Repair ${systemId}`,
      roomId,
      location: INFRA_LABELS[systemId] || roomId,
      triggerPosition: [...center],
    };

    // Add type-specific config
    if (taskType === 'qte') {
      config.keyCount = 6;
      config.timeLimit = 7;
    } else if (taskType === 'holdsteady') {
      config.duration = 6;
    }

    const task = this._createTask(config);
    if (task) {
      this.tasks[repairId] = task;
      this._taskList.push(task);
      task.placeTrigger();
    }
  }

  _onBreach(data) {
    const roomId = data.roomId;
    const repairId = `repair_${roomId}`;

    // Don't create duplicate repair tasks
    if (this.tasks[repairId]) return;

    const tamaId = ROOM_TO_TAMA[roomId];
    if (!tamaId) return;

    const center = ROOM_CENTERS[roomId];
    if (!center) return;

    const config = {
      id: repairId,
      type: 'glass_repair',
      title: `Repair containment glass`,
      roomId,
      location: roomId.replace('contain_', 'Containment ').toUpperCase().replace('CONTAINMENT ', 'Containment '),
      triggerPosition: center,
      tamaId,
      requiredClicks: 20,
    };

    const task = this._createTask(config);
    if (task) {
      this.tasks[repairId] = task;
      this._taskList.push(task);
      task.placeTrigger();
    }
  }

  update(dt) {
    const playerPos = this.game.player.position;
    for (const task of this._taskList) {
      if (task.state === TaskState.ACTIVE) {
        task.update(dt);
      }
      if (task.state === TaskState.PENDING || task.state === TaskState.FAILED) {
        task.updateHighlight(dt, playerPos);
      }
      // Update transport preview (egg hatching) while pending
      if (task.updatePreview && task._previewCart) {
        task.updatePreview(dt);
      }
    }
  }

  getAllTaskData() {
    return this._taskList.map(t => t.getTaskData());
  }

  getActiveTask() {
    return this._taskList.find(t => t.state === TaskState.ACTIVE) || null;
  }

  isTaskActive() {
    return this._taskList.some(t => t.state === TaskState.ACTIVE);
  }

  resetAll() {
    // 1. Abort any active task (cleans up cart, overlays, key handlers)
    for (const task of this._taskList) {
      if (task.state === TaskState.ACTIVE) {
        task.abort();
      }
    }

    // 2. Remove all triggers from all listed tasks
    for (const task of this._taskList) {
      task.removeTrigger();
    }

    // 3. Remove dynamic tasks (glass repairs + infra repairs)
    const dynamicIds = Object.keys(this.tasks).filter(id =>
      id.startsWith('repair_') || id.startsWith('infra_repair_')
    );
    for (const id of dynamicIds) {
      this.tasks[id].removeTrigger();
      delete this.tasks[id];
    }

    // 4. Reset static tasks to PENDING with original trigger positions (no triggers placed)
    for (const config of TASK_CONFIGS) {
      const task = this.tasks[config.id];
      if (task) {
        task.removeTrigger();
        task.state = TaskState.PENDING;
        task.triggerPosition = [...config.triggerPosition];
        // Clean up placed item sprites from fetch tasks
        if (task.cleanupPlacedSprite) task.cleanupPlacedSprite();
      }
    }

    // 5. Clear task list — NightManager controls what appears
    this._taskList = [];
  }

  setActiveTasks(taskIds) {
    // Remove all triggers first
    for (const task of this._taskList) {
      task.removeTrigger();
    }

    // Rebuild list with only matching tasks, place their triggers
    this._taskList = [];
    for (const id of taskIds) {
      const task = this.tasks[id];
      if (task) {
        task.state = TaskState.PENDING;
        task.placeTrigger();
        this._taskList.push(task);
      }
    }
  }

  addActiveTasks(taskIds) {
    // Add tasks to the existing list without clearing it
    for (const id of taskIds) {
      const task = this.tasks[id];
      if (task && !this._taskList.includes(task)) {
        task.state = TaskState.PENDING;
        task.placeTrigger();
        this._taskList.push(task);
      }
    }
  }
}
