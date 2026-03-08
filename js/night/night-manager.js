import * as THREE from 'three';
import { GameState } from '../core/constants.js';
import { NIGHT_CONFIGS } from './night-config.js';
import { PERSONALITIES } from '../tamagotchi/personality.js';
import { NightClock } from './night-clock.js';
import { EventScheduler } from './event-scheduler.js';
import { rooms } from '../facility/layout-data.js';
import { DeathScreen } from '../ui/death-screen.js';

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

    // Death screen
    this._deathScreen = new DeathScreen();

    // Elevator return
    this._elevatorOpen = false;
    this._elevatorEntered = false;
    this._clockOutHudEl = null;

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
    game.on('specimen:hatched', (data) => this._deliveredTamaIds.add(data.tamaId));
    game.on('elevator:quit', () => this._onPlayerQuit());
    game.on('item:broken', (data) => this._onItemBroken(data));
  }

  startGame() {
    this.currentNight = 0;
    this.game.state = GameState.MENU;

    // Position player in elevator for menu with band loop running
    this.game.player.movementEnabled = false;
    this.game.player.mouseLookEnabled = false;

    const em = this.game.elevatorManager;
    if (em) {
      em.positionAtTop();
      // Match intro height so menu→intro transition is seamless
      const introHeight = 8;
      em._platformY = introHeight;
      if (em._platform) em._platform.position.y = introHeight;
      const [ecx, ecz] = em._roomCenter;
      this.game.player.position.set(ecx, introHeight + 1.7, ecz);
    } else {
      this.game.player.position.set(-19.25, 1.7, 5);
    }
    this.game.player.yaw.rotation.y = -Math.PI / 2;
    this.game.player.pitch.rotation.x = 0;
    this.game.canvas.style.cursor = 'default';

    // Show main menu on device
    this.game.deviceManager.renderer.showMainMenu(
      () => {
        // START pressed — transition to night intro
        this.game.deviceManager.renderer.hide();
        setTimeout(() => this._startNightIntro(), 300);
      },
      () => {
        // SETTINGS — open settings app
        this.game.deviceManager.renderer._openApp('settings');
      },
    );
  }

  update(dt) {
    if (this.game.state !== GameState.PLAYING) return;

    // Advance night clock
    this.clock.update(dt);

    // Update event scheduler
    this.eventScheduler.update(dt, this.clock.getGameHour());

    // Last minute — stop tasks, open elevator for return
    if (!this._lastMinuteTriggered && this.clock.getRemainingSeconds() < 60) {
      this._lastMinuteTriggered = true;
      this._spawningActive = false;
      const taskMgr = this.game.taskManager;
      for (const task of taskMgr._taskList) {
        if (task.state === 'active') task.abort();
      }
      this.game.emit('night:ending');
      this._openElevatorForReturn();
    }

    // Check if player entered the elevator to end the night
    if (this._elevatorOpen && !this._elevatorEntered) {
      const px = this.game.player.position.x;
      const pz = this.game.player.position.z;
      const ecx = -19.25, ecz = 5;
      const dx = px - ecx, dz = pz - ecz;
      if (dx * dx + dz * dz < 9) { // within 3 units of elevator center
        this._elevatorEntered = true;
        this._removeClockOutHud();
        const em = this.game.elevatorManager;
        if (em) em.closeDoors();
        this.game.once('elevator:departed', () => this._endNight());
      }
    }

    // Check night timer
    if (this.clock.isNightOver()) {
      this._missedElevator();
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

    // Restock spawning (~every 3 min, from night 2+)
    if (this.currentNight >= 1 && this._spawningActive) {
      this._restockTimer += dt;
      if (this._restockTimer >= 180 && !this._spawnedPoolTasks.has('restock_supplies')) {
        this._restockTimer = 0;
        const task = this.game.taskManager.tasks['restock_supplies'];
        if (task && task.state !== 'active') {
          task.state = 'pending';
          task.placeTrigger();
          this._spawnedPoolTasks.add('restock_supplies');
          if (!this.game.taskManager._taskList.includes(task)) {
            this.game.taskManager._taskList.push(task);
          }
        }
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

    // Carry-over: fetch tasks for previously-delivered tamas missing items
    this._configureCarryOverTasks();

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

    // Activate camera failure timers (only for rooms with creatures)
    if (this.game.cameraSystem) {
      const occupiedRooms = [];
      for (const tamaId of this._deliveredTamaIds) {
        const p = PERSONALITIES[tamaId];
        if (p) occupiedRooms.push(p.roomId);
      }
      if (this.nightConfig.transportTamaId) {
        const p = PERSONALITIES[this.nightConfig.transportTamaId];
        if (p && !occupiedRooms.includes(p.roomId)) occupiedRooms.push(p.roomId);
      }
      this.game.cameraSystem.activate(this.nightConfig.decayMultiplier, occupiedRooms);
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

  // --- Clock-out Sequence (D1/D2) ---

  _openElevatorForReturn() {
    this._elevatorOpen = true;
    this._elevatorEntered = false;

    // HUD flash: "RETURN TO ELEVATOR"
    this._clockOutHudEl = document.createElement('div');
    this._clockOutHudEl.id = 'clock-out-hud';
    this._clockOutHudEl.textContent = 'RETURN TO ELEVATOR';
    this._clockOutHudEl.className = 'flash';
    document.getElementById('ui-root').appendChild(this._clockOutHudEl);

    // Open elevator doors
    const em = this.game.elevatorManager;
    if (em) {
      em.openDoorsForReturn();
    }
  }

  _missedElevator() {
    this._removeClockOutHud();
    this.game.state = GameState.DEATH;
    this._spawningActive = false;
    this.game.player.movementEnabled = false;
    this.game.player.mouseLookEnabled = false;
    this.game.input.releasePointerLock();

    setTimeout(() => {
      this._showOverlay(
        'OVERTIME',
        'Failed to return to elevator in time.\nBody not found.',
        `RETRY NIGHT ${this.currentNight + 1}`,
        true,
        () => {
          this._removeOverlay();
          this._startNightIntro();
        },
      );
    }, 500);
  }

  _removeClockOutHud() {
    if (this._clockOutHudEl) {
      this._clockOutHudEl.remove();
      this._clockOutHudEl = null;
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
    if (itemType) {
      // Use tamaId from multi-destination completion, or fall back to transport tama
      const targetTamaId = data.tamaId || this.nightConfig?.transportTamaId;
      if (targetTamaId) {
        const tama = this.game.tamagotchiManager.getTama(targetTamaId);
        if (tama) tama.setEnclosureItem(itemType, true);
      }

      // Check if other tamas still need this item → re-spawn fetch task
      this._respawnFetchIfNeeded(data.taskId, itemType, targetTamaId);
    }

    // Restock completion → replenish lures and enable broken item re-fetch
    if (data.taskId === 'restock_supplies') {
      this.game.creatureManager.hasLure = false; // allow lure pickup again
      this._restockAvailable = true;
    }
  }

  /** Respawn fetch task when specimen breaks an item (C2). */
  _onItemBroken(data) {
    const idMap = { food: 'fetch_food', water: 'fetch_water', toy: 'fetch_toy' };
    const taskId = idMap[data.itemType];
    if (!taskId) return;

    const task = this.game.taskManager.tasks[taskId];
    if (!task) return;

    // If this fetch task is already active (player carrying), just add this room as a destination
    if (task.state === 'active' && task.addDestination) {
      const dest = this._buildDestination(data.tamaId);
      if (dest) task.addDestination(dest);
      return;
    }

    // Clean up placed sprite if exists
    if (task.cleanupPlacedSprite) task.cleanupPlacedSprite();

    // Build destinations for all tamas missing this item
    this._configureFetchDestinations(taskId, data.itemType);

    // Reset task and add it back
    task.state = 'pending';
    task.triggerPosition = [task._sourcePosition.x, 1.4, task._sourcePosition.z];
    task.placeTrigger();
    if (!this.game.taskManager._taskList.includes(task)) {
      this.game.taskManager._taskList.push(task);
    }
  }

  // --- Carry-over fetch tasks ---

  _configureCarryOverTasks() {
    const taskMgr = this.game.taskManager;
    const needed = { food: [], water: [], toy: [] };

    for (const tamaId of this._deliveredTamaIds) {
      // Skip the tama being delivered THIS night (handled by _configureSetupTasks)
      if (tamaId === this.nightConfig.transportTamaId) continue;

      const tama = this.game.tamagotchiManager.getTama(tamaId);
      if (!tama) continue;

      for (const itemType of ['food', 'water', 'toy']) {
        if (!tama._enclosureItems[itemType]) {
          needed[itemType].push(tamaId);
        }
      }
    }

    for (const [itemType, tamaIds] of Object.entries(needed)) {
      if (tamaIds.length === 0) continue;
      const taskId = `fetch_${itemType}`;
      const task = taskMgr.tasks[taskId];
      if (!task) continue;

      // If setup tasks already activated this fetch task, merge destinations
      const alreadyActive = taskMgr._taskList.includes(task);

      const dests = tamaIds.map(id => this._buildDestination(id)).filter(Boolean);
      if (dests.length === 0) continue;

      if (alreadyActive) {
        // Add carry-over destinations to already-configured task
        for (const dest of dests) task.addDestination(dest);
      } else {
        task.setMultipleDestinations(dests);
        taskMgr.addActiveTasks([taskId]);
      }
    }
  }

  _buildDestination(tamaId) {
    const tama = this.game.tamagotchiManager.getTama(tamaId);
    if (!tama) return null;
    const roomId = tama.personality.roomId;
    const chamber = this.game.facility?.containmentChambers?.[roomId];
    const centers = {
      contain_a: [-7.5, 0, 19],
      contain_b: [7.5, 0, 19],
      contain_c: [-7.5, 0, -19],
      contain_d: [7.5, 0, -19],
    };
    return {
      tamaId,
      roomId,
      position: centers[roomId] || [0, 0, 0],
      glassFront: chamber?.glassFront || null,
      roomCenterX: chamber?.group?.position?.x ?? (centers[roomId]?.[0] || 0),
    };
  }

  /** Configure fetch task destinations for all tamas missing the given item. */
  _configureFetchDestinations(taskId, itemType) {
    const task = this.game.taskManager.tasks[taskId];
    if (!task || !task.setMultipleDestinations) return;

    const dests = [];
    for (const tamaId of this._deliveredTamaIds) {
      const tama = this.game.tamagotchiManager.getTama(tamaId);
      if (!tama || tama._enclosureItems[itemType]) continue;
      const dest = this._buildDestination(tamaId);
      if (dest) dests.push(dest);
    }
    if (dests.length > 0) {
      task.setMultipleDestinations(dests);
    }
  }

  /** After a fetch completion, check if other tamas still need the item and re-spawn. */
  _respawnFetchIfNeeded(taskId, itemType, completedTamaId) {
    const remaining = [];
    for (const tamaId of this._deliveredTamaIds) {
      if (tamaId === completedTamaId) continue;
      const tama = this.game.tamagotchiManager.getTama(tamaId);
      if (!tama || tama._enclosureItems[itemType]) continue;
      remaining.push(tamaId);
    }

    if (remaining.length === 0) return;

    const task = this.game.taskManager.tasks[taskId];
    if (!task) return;

    // Clean up and re-configure for remaining tamas
    if (task.cleanupPlacedSprite) task.cleanupPlacedSprite();
    const dests = remaining.map(id => this._buildDestination(id)).filter(Boolean);
    task.setMultipleDestinations(dests);
    task.state = 'pending';
    task.triggerPosition = [task._sourcePosition.x, 1.4, task._sourcePosition.z];
    task.placeTrigger();
    if (!this.game.taskManager._taskList.includes(task)) {
      this.game.taskManager._taskList.push(task);
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

    // No tasks in the last minute (B2)
    if (this.clock.getRemainingSeconds() < 60) {
      this._spawningActive = false;
      return;
    }

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

  _onPlayerDied(data) {
    this.game.state = GameState.DEATH;
    this._deathCount++;
    this._spawningActive = false;
    this.game.input.releasePointerLock();

    // Determine which specimen killed the player
    const killerTamaId = data?.tamaId || 'nibbles';

    this._deathScreen.show(
      () => this.startGame(),
    );
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

    // Tamagotchis — preserve delivery state + enclosure items
    for (const tama of this.game.tamagotchiManager._tamaList) {
      const wasDelivered = this._deliveredTamaIds.has(tama.id);
      const savedItems = wasDelivered ? { ...tama._enclosureItems } : null;
      tama.delivered = wasDelivered;
      tama.reset();
      if (savedItems) {
        tama._enclosureItems = savedItems;
      }
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

    // Restock
    this._restockTimer = 0;
    this._restockAvailable = true;

    // Transport delay
    this._transportPending = false;
    this._transportDelay = 0;

    // Last minute flag (B2)
    this._lastMinuteTriggered = false;

    // Elevator return state
    this._elevatorOpen = false;
    this._elevatorEntered = false;
    this._removeClockOutHud();

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
    this.game.deviceManager.renderer._onHomeScreen = true;
    this.game.deviceManager.renderer._activeTabName = null;
    this.game.deviceManager.renderer._activeTab = null;
    this.game.deviceManager.battery = 100;
    this.game.deviceManager._isCharging = false;
  }

  _configureSetupTasks() {
    const setup = this.nightConfig.setupTasks;
    if (!setup) return;

    // Skip if tama already delivered (death retry)
    if (this.nightConfig.transportTamaId &&
        this._deliveredTamaIds.has(this.nightConfig.transportTamaId)) return;

    const taskMgr = this.game.taskManager;
    const dest = this._buildDestination(this.nightConfig.transportTamaId);
    if (!dest) return;

    // Set destination on each fetch task using multi-destination API
    for (const id of ['fetch_food', 'fetch_water', 'fetch_toy']) {
      const task = taskMgr.tasks[id];
      if (task && task.setMultipleDestinations) {
        task.setMultipleDestinations([dest]);
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
