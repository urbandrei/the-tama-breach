const GRACE_PERIOD = 75; // seconds before systems can start failing

const SYSTEM_DEFS = {
  food_processing: {
    roomId: 'food_processing',
    label: 'FOOD PROCESSING',
    baseFailInterval: [120, 240],
  },
  water_filtration: {
    roomId: 'water_filtration',
    label: 'WATER FILTRATION',
    baseFailInterval: [120, 240],
  },
  server_room: {
    roomId: 'server_room',
    label: 'SERVER ROOM',
    baseFailInterval: [150, 270],
  },
  generator_room: {
    roomId: 'generator_room',
    label: 'GENERATOR',
    baseFailInterval: [180, 300],
  },
};

// Maps system → task type for repair tasks
const REPAIR_TASK_TYPES = {
  food_processing: 'holdsteady',
  water_filtration: 'pipes',
  server_room: 'wires',
  generator_room: 'qte',
};

export class InfrastructureManager {
  constructor(game) {
    this.game = game;
    this.systems = {};
    this._graceTimer = GRACE_PERIOD;
    this._active = false;
    this._difficultyScale = 1.0;

    // Initialize systems
    for (const [id, def] of Object.entries(SYSTEM_DEFS)) {
      this.systems[id] = {
        id,
        def,
        operational: true,
        failTimer: this._randomInterval(def.baseFailInterval),
      };
    }

    // Listen for infra repair task completions
    game.on('task:completed', (data) => this._onTaskCompleted(data));
  }

  /** Call at night start to activate with difficulty scaling. */
  activate(difficultyScale = 1.0) {
    this._active = true;
    this._difficultyScale = difficultyScale;
    this._graceTimer = GRACE_PERIOD;

    // Reset all systems to operational
    for (const sys of Object.values(this.systems)) {
      sys.operational = true;
      sys.failTimer = this._randomInterval(sys.def.baseFailInterval);
    }

    // Apply "UP" bonuses immediately
    this._applyEffects();
  }

  deactivate() {
    this._active = false;

    // Restore all multipliers to neutral
    for (const tama of this.game.tamagotchiManager._tamaList) {
      tama.needs.hungerDecayMultiplier = 1.0;
      tama.needs.thirstDecayMultiplier = 1.0;
      tama.needs.panicMode = false;
    }
  }

  update(dt) {
    if (!this._active) return;

    // Grace period countdown
    if (this._graceTimer > 0) {
      this._graceTimer -= dt;
      return;
    }

    // Tick fail timers for operational systems
    for (const sys of Object.values(this.systems)) {
      if (!sys.operational) continue;

      sys.failTimer -= dt;
      if (sys.failTimer <= 0) {
        this._takeOffline(sys);
      }
    }
  }

  _takeOffline(sys) {
    sys.operational = false;

    // Apply system-specific effects
    this._applyEffects();

    // Emit event
    this.game.emit('infra:down', { systemId: sys.id, label: sys.def.label });

    // Create repair task
    if (this.game.taskManager) {
      this.game.taskManager.createInfraRepairTask(sys.id, REPAIR_TASK_TYPES[sys.id], sys.def.roomId);
    }
  }

  _bringOnline(systemId) {
    const sys = this.systems[systemId];
    if (!sys || sys.operational) return;

    sys.operational = true;
    sys.failTimer = this._randomInterval(sys.def.baseFailInterval);

    // Reapply effects
    this._applyEffects();

    // Emit event
    this.game.emit('infra:up', { systemId: sys.id, label: sys.def.label });
  }

  _applyEffects() {
    const tamas = this.game.tamagotchiManager?._tamaList || [];

    // Food processing: 0.5x when UP, 2.0x when DOWN
    const foodUp = this.systems.food_processing.operational;
    for (const tama of tamas) {
      tama.needs.hungerDecayMultiplier = foodUp ? 0.5 : 2.0;
    }

    // Water filtration: 0.5x when UP, 2.0x when DOWN
    const waterUp = this.systems.water_filtration.operational;
    for (const tama of tamas) {
      tama.needs.thirstDecayMultiplier = waterUp ? 0.5 : 2.0;
    }

    // Generator: sustained flicker + panic mode (no full blackout)
    const genUp = this.systems.generator_room.operational;
    const lm = this.game.lightingManager;
    if (lm) {
      for (const entry of lm.lights) {
        lm.setAgitatedFlicker(entry.roomId, !genUp);
      }
    }
    for (const tama of tamas) {
      tama.needs.panicMode = !genUp;
    }

    // Server room: effect handled by tama-tab.js checking operational state
  }

  _onTaskCompleted(data) {
    // Check if this is an infra repair task
    if (data.taskId && data.taskId.startsWith('infra_repair_')) {
      const systemId = data.taskId.replace('infra_repair_', '');
      this._bringOnline(systemId);
    }
  }

  _randomInterval(baseRange) {
    const [min, max] = baseRange;
    // Scale by difficulty — harder nights = shorter intervals
    const scale = 1 / Math.max(this._difficultyScale, 0.5);
    return (min + Math.random() * (max - min)) * scale;
  }

  reset() {
    this._active = false;
    this._graceTimer = GRACE_PERIOD;

    for (const sys of Object.values(this.systems)) {
      sys.operational = true;
      sys.failTimer = this._randomInterval(sys.def.baseFailInterval);
    }
  }
}
