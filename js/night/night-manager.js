import { GameState } from '../core/constants.js';
import { NIGHT_CONFIGS } from './night-config.js';
import { PERSONALITIES } from '../tamagotchi/personality.js';
import { NightClock } from './night-clock.js';
import { EventScheduler } from './event-scheduler.js';
import { rooms } from '../facility/layout-data.js';

export class NightManager {
  constructor(game) {
    this.game = game;
    this.currentNight = 0;
    this.nightConfig = null;
    this._overlay = null;
    this._deathCount = 0;
    this._keyHandler = null;

    // Night timer
    this.clock = new NightClock();
    this.eventScheduler = new EventScheduler(game);

    // Delivery persistence across nights
    this._deliveredTamaIds = new Set();

    // Interval-based task spawning
    this._spawnTimer = 0;
    this._spawnInterval = 0;
    this._spawningActive = false;

    // Track which pool tasks are currently pending/active (no repeats until cleared)
    this._spawnedPoolTasks = new Set();

    // Delayed transport spawning
    this._transportPending = false;
    this._transportDelay = 0;

    game.on('player:died', () => this._onPlayerDied());
    game.on('task:completed', (data) => this._onTaskCompleted(data));
    game.on('task:started', (data) => this._onTaskStarted(data));
    game.on('tama:hatched', (data) => this._deliveredTamaIds.add(data.tamaId));
    game.on('elevator:quit', () => this._onPlayerQuit());
  }

  startGame() {
    this.currentNight = 0;
    this._startNightIntro();
  }

  update(dt) {
    if (this.game.state !== GameState.PLAYING) return;

    // Advance night clock
    this.clock.update(dt);

    // Update event scheduler
    this.eventScheduler.update(dt, this.clock.getGameHour());

    // Check night timer
    if (this.clock.isNightOver()) {
      this._endNight();
      return;
    }

    // Delayed transport spawning
    if (this._transportPending) {
      this._transportDelay -= dt;
      if (this._transportDelay <= 0) {
        this._transportPending = false;
        this._configureTasks();
        this._setupTransportPreview();
      }
    }

    // Interval task spawning
    if (this._spawningActive) {
      this._spawnTimer += dt;
      if (this._spawnTimer >= this._spawnInterval) {
        this._spawnTimer = 0;
        this._spawnNextPoolTask();
        this._rollNextInterval();
      }
    }
  }

  // --- Night Intro ---

  _startNightIntro() {
    this.nightConfig = NIGHT_CONFIGS[this.currentNight];
    this._resetForNight();
    this.game.state = GameState.NIGHT_INTRO;

    this.game.player.movementEnabled = false;
    this.game.player.mouseLookEnabled = false;
    // Don't release pointer lock — software cursor needs it for the briefing screen

    const em = this.game.elevatorManager;
    if (em) {
      // Position elevator low in the shaft — close enough to the bottom that
      // rush descent at band scroll speed (~8 u/s) reaches floor in ~1 second.
      // Bands scroll during IDLE_TOP to create the visual descent illusion.
      em.positionAtTop();
      const introHeight = 8; // ~1s of descent at band scroll speed
      em._platformY = introHeight;
      if (em._platform) em._platform.position.y = introHeight;
      const [ecx, ecz] = em._roomCenter;
      this.game.player.position.set(ecx, introHeight + 1.7, ecz);
      this.game.player.yaw.rotation.y = -Math.PI / 2; // face east (toward door)
      this.game.player.pitch.rotation.x = 0;

      // Show device with night number + START — pressing START rushes elevator down
      this.game.deviceManager.showBriefing(
        this.nightConfig.title,
        '',
        'START',
        () => {
          em.rushToBottom();
          em.onArrived(() => this._beginNight());
        },
      );
    } else {
      // Fallback: old overlay-based intro (no elevator)
      this.game.player.position.set(-19.25, 1.7, 5);
      this.game.player.yaw.rotation.y = -Math.PI / 2;
      this.game.player.pitch.rotation.x = 0;
      this._showOverlay(
        this.nightConfig.title,
        this.nightConfig.briefing,
        'BEGIN SHIFT',
        false,
        () => {
          this._removeOverlay();
          this._beginNight();
        },
      );
    }
  }

  _beginNight() {

    // Set up clock and events
    this.clock.reset(this.nightConfig.nightDuration);
    this._setupEvents();

    // Check-in task spawns at the start of every night
    this.game.taskManager.setActiveTasks(['checkin_command']);

    // Setup tasks (fetch food/water/toy for enclosure)
    this._configureSetupTasks();

    // Delay transport if config specifies transportDelay
    const hasTransport = this.nightConfig.transportTamaId &&
      !this._deliveredTamaIds.has(this.nightConfig.transportTamaId);

    if (hasTransport && this.nightConfig.transportDelay) {
      this._transportPending = true;
      this._transportDelay = this.nightConfig.transportDelay;
    } else {
      this._transportPending = false;
      this._configureTasks();
      this._setupTransportPreview();
    }

    this._configureDifficulty();
    this._configureActiveTamas();

    // Activate infrastructure failure timers
    if (this.game.infrastructureManager) {
      this.game.infrastructureManager.activate(this.nightConfig.decayMultiplier);
    }

    // Activate camera failure timers
    if (this.game.cameraSystem) {
      this.game.cameraSystem.activate(this.nightConfig.decayMultiplier);
    }

    // Start interval spawning immediately (non-blocking)
    this._startIntervalSpawning();

    this.game.state = GameState.PLAYING;
    this.game.player.movementEnabled = true;
    this.game.player.mouseLookEnabled = true;
    this.game.input.requestPointerLock();
  }

  // --- Night End (Timer-Based) ---

  _endNight() {
    // Clean cutoff — abort active task, clear pending
    const taskMgr = this.game.taskManager;
    for (const task of taskMgr._taskList) {
      if (task.state === 'active') task.abort();
    }

    this._spawningActive = false;
    const isFinalNight = this.currentNight >= NIGHT_CONFIGS.length - 1;

    this.game.player.movementEnabled = false;
    this.game.player.mouseLookEnabled = false;
    this.game.input.releasePointerLock();

    if (isFinalNight) {
      this.game.state = GameState.VICTORY;
      this._showOverlay(
        'SHIFT COMPLETE',
        'All nights survived.\nThe facility is secure.',
        'THANKS FOR PLAYING',
        false,
        () => {
          this.currentNight = 0;
          this._deliveredTamaIds.clear();
          this._removeOverlay();
          this._startNightIntro();
        },
      );
    } else {
      this.game.state = GameState.NIGHT_OUTRO;
      this._showOverlay(
        `NIGHT ${this.currentNight + 1} COMPLETE`,
        `Shift survived.\n6:00 AM — dawn.`,
        'NEXT NIGHT',
        false,
        () => {
          this.currentNight++;
          this._removeOverlay();
          this._startNightIntro();
        },
      );
    }
  }

  // --- Task Events ---

  _onTaskStarted(data) {
    // When player picks up transport cart, clear delivery mode so elevator closes after they leave
    if (data.taskId === 'transport_specimen') {
      const em = this.game.elevatorManager;
      if (em) em._deliveryMode = false;
    }
  }

  _onTaskCompleted(data) {
    // Unmark from spawned set so it can spawn again later
    this._spawnedPoolTasks.delete(data.taskId);

    if (data.taskId === 'transport_specimen' && data.transportTamaId) {
      const tama = this.game.tamagotchiManager.getTama(data.transportTamaId);
      if (tama) {
        tama.startEggInChamber(data.eggElapsedTime || 0);
      }
    }

    // Fetch item completion → set enclosure item on target tama
    const fetchMap = { fetch_food: 'food', fetch_water: 'water', fetch_toy: 'toy' };
    const itemType = fetchMap[data.taskId];
    if (itemType && this.nightConfig?.transportTamaId) {
      const tama = this.game.tamagotchiManager.getTama(this.nightConfig.transportTamaId);
      if (tama) {
        tama.setEnclosureItem(itemType, true);
      }
    }
  }

  // --- Interval Task Spawning ---

  _startIntervalSpawning() {
    if (!this.nightConfig.taskPool || this.nightConfig.taskPool.length === 0) {
      this._spawningActive = false;
      return;
    }
    this._spawningActive = true;
    this._spawnTimer = 0;
    // First task spawns after a short delay (10-20s)
    this._spawnInterval = 10 + Math.random() * 10;
  }

  _rollNextInterval() {
    const [min, max] = this.nightConfig.taskInterval;
    this._spawnInterval = min + Math.random() * (max - min);
  }

  _spawnNextPoolTask() {
    const pool = this.nightConfig.taskPool;
    if (!pool || pool.length === 0) return;

    // Filter out tasks already spawned and not yet completed
    const available = pool.filter(id => !this._spawnedPoolTasks.has(id));
    if (available.length === 0) return;

    const taskId = available[Math.floor(Math.random() * available.length)];
    const task = this.game.taskManager.tasks[taskId];
    if (!task) return;

    // Reset to PENDING and place trigger
    task.state = 'pending';
    task.placeTrigger();
    this._spawnedPoolTasks.add(taskId);

    // Add to task list if not already there
    if (!this.game.taskManager._taskList.includes(task)) {
      this.game.taskManager._taskList.push(task);
    }

    this.game.emit('night:task-spawned', { taskId });
  }

  // --- Event Scheduling ---

  _setupEvents() {
    this.eventScheduler.reset();
    const events = this.nightConfig.events;
    if (!events) return;

    const lm = this.game.lightingManager;

    // One-shot events
    if (events.oneShot) {
      for (const evt of events.oneShot) {
        this.eventScheduler.atHour(evt.hour, () => this._fireEvent(evt));
      }
    }

    // Repeating events
    if (events.repeating) {
      for (const evt of events.repeating) {
        this.eventScheduler.every(evt.interval, () => this._fireEvent(evt));
      }
    }
  }

  _fireEvent(evt) {
    const lm = this.game.lightingManager;
    if (!lm) return;

    switch (evt.type) {
      case 'surge':
        lm.triggerPowerSurge(evt.duration || 2.0);
        break;

      case 'flicker':
        if (evt.rooms) {
          for (const roomId of evt.rooms) {
            lm.triggerFlicker(roomId, 'random', evt.duration || 1.5);
          }
        }
        break;

      case 'flicker_random': {
        // Pick a random room to flicker
        const allRoomIds = rooms.map(r => r.id);
        const pick = allRoomIds[Math.floor(Math.random() * allRoomIds.length)];
        lm.triggerFlicker(pick, 'random', evt.duration || 1.0);
        break;
      }
    }
  }

  // --- Death ---

  _onPlayerDied() {
    this.game.state = GameState.DEATH;
    this._deathCount++;
    this._spawningActive = false;
    this.game.input.releasePointerLock();

    setTimeout(() => {
      this._showOverlay(
        'TERMINATED',
        'A specimen got you.',
        `RETRY NIGHT ${this.currentNight + 1}`,
        true,
        () => {
          this._removeOverlay();
          this._startNightIntro();
        },
      );
    }, 500);
  }

  _onPlayerQuit() {
    this.game.state = GameState.DEATH;
    this._spawningActive = false;
    this.game.player.movementEnabled = false;
    this.game.player.mouseLookEnabled = false;
    this.game.input.releasePointerLock();

    setTimeout(() => {
      this._showOverlay(
        'YOU QUIT',
        'You took the elevator back up.\nShift abandoned.',
        `RETRY NIGHT ${this.currentNight + 1}`,
        true,
        () => {
          this._removeOverlay();
          this._startNightIntro();
        },
      );
    }, 500);
  }

  // --- Reset ---

  _resetForNight() {
    // Player (position set by _startNightIntro, just reset velocity/state)
    this.game.player._velocity.set(0, 0, 0);
    this.game.player._verticalVelocity = 0;
    this.game.player.isPushingCart = false;
    this.game.player.isCarryingItem = false;
    this.game.player.deviceOpen = false;

    // Damage
    this.game.creatureManager.damageSystem.reset();

    // Creatures
    this.game.creatureManager.despawnAll();
    this.game.creatureManager.hasLure = false;

    // Tamagotchis — preserve delivery state
    for (const tama of this.game.tamagotchiManager._tamaList) {
      const wasDelivered = this._deliveredTamaIds.has(tama.id);
      tama.delivered = wasDelivered;
      tama.reset();
    }

    // Lighting
    this.game.lightingManager.resetFull();

    // Transport preview
    const transport = this.game.taskManager.tasks['transport_specimen'];
    if (transport && transport.resetPreview) {
      transport.resetPreview();
    }

    // Tasks
    this.game.taskManager.resetAll();

    // Interval spawning state
    this._spawnTimer = 0;
    this._spawningActive = false;
    this._spawnedPoolTasks.clear();

    // Transport delay
    this._transportPending = false;
    this._transportDelay = 0;

    // Event scheduler
    this.eventScheduler.reset();

    // Infrastructure
    if (this.game.infrastructureManager) {
      this.game.infrastructureManager.reset();
    }

    // Cameras
    if (this.game.cameraSystem) {
      this.game.cameraSystem.reset();
    }

    // Device
    if (this.game.deviceManager.isOpen) {
      this.game.deviceManager.isOpen = false;
      this.game.deviceManager.renderer.hide();
    }
    this.game.deviceManager.battery = 100;
    this.game.deviceManager._isCharging = false;
  }

  _configureSetupTasks() {
    const setup = this.nightConfig.setupTasks;
    if (!setup) return;

    // Skip if tama already delivered (death retry)
    if (this.nightConfig.transportTamaId &&
        this._deliveredTamaIds.has(this.nightConfig.transportTamaId)) return;

    const [tx, ty, tz] = setup.targetPosition;
    const taskMgr = this.game.taskManager;

    // Look up glass front info from containment chamber
    const chamber = this.game.facility?.containmentChambers?.[setup.targetRoomId];
    const glassFront = chamber?.glassFront;
    const roomCenterX = chamber ? chamber.group.position.x : tx;

    // Set destination on each fetch task
    for (const id of ['fetch_food', 'fetch_water', 'fetch_toy']) {
      const task = taskMgr.tasks[id];
      if (task && task.setDestination) {
        task.setDestination(tx, ty, tz);
      }
      if (task && task.setDestinationRoom && glassFront) {
        task.setDestinationRoom(roomCenterX, glassFront);
      }
    }

    taskMgr.addActiveTasks(['fetch_food', 'fetch_water', 'fetch_toy']);
  }

  _configureTasks() {
    // Collect initial tasks — transport + note if applicable
    const initialTasks = [];

    if (this.nightConfig.transportTamaId) {
      // Skip transport if tama already delivered (death retry)
      if (!this._deliveredTamaIds.has(this.nightConfig.transportTamaId)) {
        initialTasks.push('transport_specimen');
        initialTasks.push('note_specimen');

        // Configure note task position based on transport target
        const personality = PERSONALITIES[this.nightConfig.transportTamaId];
        if (personality) {
          const noteTask = this.game.taskManager.tasks['note_specimen'];
          if (noteTask) {
            const centers = {
              contain_a: [-7.5, 1.4, 19],
              contain_b: [7.5, 1.4, 19],
              contain_c: [-7.5, 1.4, -19],
              contain_d: [7.5, 1.4, -19],
            };
            const center = centers[personality.roomId];
            if (center) {
              noteTask.triggerPosition = [...center];
              noteTask.location = 'Containment ' + personality.roomId.slice(-1).toUpperCase();
              noteTask._tamaId = this.nightConfig.transportTamaId;
            }
          }
        }
      }
    }

    // Set configurable egg hatch time on transport task
    if (this.nightConfig.eggHatchTime) {
      const transport = this.game.taskManager.tasks['transport_specimen'];
      if (transport) {
        transport._eggTotalTime = this.nightConfig.eggHatchTime;
      }
    }

    // Add transport tasks to the active list (don't wipe existing tasks like check-in)
    this.game.taskManager.addActiveTasks(initialTasks);
  }

  _configureDifficulty() {
    const multiplier = this.nightConfig.decayMultiplier;
    for (const tama of this.game.tamagotchiManager._tamaList) {
      tama.needs.decayMultiplier = multiplier;
    }
  }

  _setupTransportPreview() {
    if (!this.nightConfig.transportTamaId) return;
    if (this._deliveredTamaIds.has(this.nightConfig.transportTamaId)) return;
    const transport = this.game.taskManager.tasks['transport_specimen'];
    if (transport && transport.createPreview) {
      transport.createPreview(this.nightConfig.transportTamaId);
    }

    // Mark tama as visible on device (cart has arrived)
    const tama = this.game.tamagotchiManager.getTama(this.nightConfig.transportTamaId);
    if (tama) tama.inTransit = true;

    // Open elevator doors for cart delivery
    const em = this.game.elevatorManager;
    if (em && em.openDoorsForDelivery) {
      em.openDoorsForDelivery();
    }
  }

  _configureActiveTamas() {
    for (const tama of this.game.tamagotchiManager._tamaList) {
      tama.active = this._deliveredTamaIds.has(tama.id);
    }
  }

  // --- Overlay UI ---

  _showOverlay(title, body, buttonText, isDeath, onAction) {
    this._overlay = document.createElement('div');
    this._overlay.className = 'night-overlay' + (isDeath ? ' death-overlay' : '');
    this._overlay.innerHTML = `
      <div class="night-frame${isDeath ? ' death-frame' : ''}">
        ${isDeath ? '<div class="death-static"></div>' : ''}
        <div class="night-title${isDeath ? ' death-title' : ''}">${title}</div>
        <div class="night-briefing">${body.replace(/\n/g, '<br>')}</div>
        <button class="night-button" id="night-action-btn">${buttonText}</button>
      </div>
    `;
    document.getElementById('ui-root').appendChild(this._overlay);

    const btn = document.getElementById('night-action-btn');
    const handler = () => {
      btn.removeEventListener('click', handler);
      this._removeKeyHandler();
      onAction();
    };
    btn.addEventListener('click', handler);

    this._keyHandler = (e) => {
      if (e.code === 'Enter' || e.code === 'Space') {
        e.preventDefault();
        handler();
      }
    };
    document.addEventListener('keydown', this._keyHandler);
  }

  _removeOverlay() {
    if (this._overlay) {
      this._overlay.remove();
      this._overlay = null;
    }
    this._removeKeyHandler();
  }

  _removeKeyHandler() {
    if (this._keyHandler) {
      document.removeEventListener('keydown', this._keyHandler);
      this._keyHandler = null;
    }
  }
}
