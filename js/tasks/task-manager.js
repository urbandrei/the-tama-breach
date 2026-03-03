import { TaskState } from './task-base.js';
import { TaskQTE } from './task-qte.js';
import { TaskWires } from './task-wires.js';
import { TaskPipes } from './task-pipes.js';
import { TaskHoldSteady } from './task-holdsteady.js';
import { TaskTransport } from './task-transport.js';
import { TaskGlassRepair } from './task-glass-repair.js';
import { ROOM_TO_TAMA } from '../tamagotchi/personality.js';

const TASK_CONFIGS = [
  {
    id: 'electrical_qte',
    type: 'qte',
    title: 'Reset breaker panel C',
    roomId: 'electrical',
    location: 'Electrical',
    triggerPosition: [-33.5, 1.4, 16],
    keyCount: 5,
    timeLimit: 8,
  },
  {
    id: 'server_wires',
    type: 'wires',
    title: 'Reconnect server UPS',
    roomId: 'server_room',
    location: 'Server Room',
    triggerPosition: [28, 1.4, 16],
  },
  {
    id: 'water_pipes',
    type: 'pipes',
    title: 'Calibrate filtration pipes',
    roomId: 'water_filtration',
    location: 'Water Filtration',
    triggerPosition: [0, 1.4, 40],
  },
  {
    id: 'storage_calibrate',
    type: 'holdsteady',
    title: 'Calibrate storage sensors',
    roomId: 'storage',
    location: 'Storage',
    triggerPosition: [0, 1.4, -24],
    duration: 5,
  },
  {
    id: 'transport_specimen',
    type: 'transport',
    title: 'Transport specimen crate',
    roomId: 'loading_dock',
    location: 'Loading Dock',
    triggerPosition: [0, 1.4, -8],
    targetRoomId: 'contain_b',
    targetPosition: [30, 0, 40],
  },
];

// Room center positions for containment rooms (for glass repair triggers)
const ROOM_CENTERS = {
  contain_a: [-30, 1.4, 40],
  contain_b: [30, 1.4, 40],
  contain_c: [30, 1.4, -8],
  contain_d: [-30, 1.4, -8],
};

export class TaskManager {
  constructor(game) {
    this.game = game;
    this.tasks = {};
    this._taskList = [];

    // Create standard tasks
    for (const config of TASK_CONFIGS) {
      const task = this._createTask(config);
      if (task) {
        this.tasks[config.id] = task;
        this._taskList.push(task);
        task.placeTrigger();
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
      default:
        console.warn(`Unknown task type: ${config.type}`);
        return null;
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
}
