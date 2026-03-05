import { Game } from './game.js';
import { FacilityBuilder } from './facility/facility-builder.js';
import { LightingManager } from './lighting/lighting-manager.js';
import { ElevatorManager } from './facility/elevator-manager.js';
import { InfrastructureManager } from './facility/infrastructure-manager.js';
import { CameraSystem } from './facility/camera-system.js';
import { EdgeStrips } from './facility/edge-strips.js';
import { RoomSigns } from './facility/room-signs.js';
import { TamagotchiManager } from './tamagotchi/tamagotchi-manager.js';
import { TaskManager } from './tasks/task-manager.js';
import { DeviceManager } from './device/device-manager.js';
import { TaskHUD } from './ui/task-hud.js';
import { CreatureManager } from './ai/creature-manager.js';
import { NightManager } from './night/night-manager.js';
import { DustParticles } from './effects/dust-particles.js';
import { SoftwareCursor } from './ui/software-cursor.js';
import { HudMinimap } from './ui/hud-minimap.js';

// Boot
document.addEventListener('DOMContentLoaded', () => {
  try {
    const canvas = document.getElementById('game-canvas');
    const game = new Game(canvas);

    // Build the full facility
    const facility = new FacilityBuilder(game);
    facility.build();
    game.facility = facility;

    // Set up lighting (pass game for event bus)
    const lightingManager = new LightingManager(game.scene, game);
    game.lightingManager = lightingManager;

    // Elevator (after facility, before other systems)
    const elevatorManager = new ElevatorManager(game);
    elevatorManager.init();
    game.elevatorManager = elevatorManager;

    // Edge strips (off pre-escape, lit during blackout) + room signs (always on)
    const edgeStrips = new EdgeStrips(game.scene);
    const roomSigns = new RoomSigns(game.scene);
    lightingManager.setNavigationAids(edgeStrips, roomSigns);

    // Set up tamagotchi system (before device so tabs can read data)
    const tamagotchiManager = new TamagotchiManager(game);
    tamagotchiManager.attachToFacility(facility.containmentChambers);
    game.tamagotchiManager = tamagotchiManager;

    // Set up task system (before device so tabs can read data)
    const taskManager = new TaskManager(game);
    game.taskManager = taskManager;

    // Infrastructure systems (after tama + tasks so it can reference them)
    const infrastructureManager = new InfrastructureManager(game);
    game.infrastructureManager = infrastructureManager;

    // Security cameras (after facility so we can read camera props)
    const cameraSystem = new CameraSystem(game);
    cameraSystem.setCameraProps(facility.cameraProps);
    game.cameraSystem = cameraSystem;

    // Software cursor (shared, used by device + task screens)
    game.softwareCursor = new SoftwareCursor();

    // Set up device (Pip-Boy)
    const deviceManager = new DeviceManager(game);
    deviceManager.placeChargeTrigger();
    game.deviceManager = deviceManager;

    // Creature AI manager (after TamagotchiManager + TaskManager)
    const creatureManager = new CreatureManager(game);
    game.creatureManager = creatureManager;

    // Task HUD (after TaskManager)
    const taskHUD = new TaskHUD(game);
    game.taskHUD = taskHUD;

    // Dust particles (cosmetic)
    const dustParticles = new DustParticles(game);
    game.dustParticles = dustParticles;

    // HUD minimap (M key toggle)
    game.hudMinimap = new HudMinimap(game);

    // Night system (after all other systems)
    const nightManager = new NightManager(game);
    game.nightManager = nightManager;

    // Position player (will be reset by NightManager each night)
    game.player.position.set(-19.25, 1.7, 5);
    game.player.yaw.rotation.y = -Math.PI / 2;

    // Start render loop, then begin night progression
    game.start();
    nightManager.startGame();

    // Expose for debugging
    window.game = game;

    console.log('The Tama Breach - Phase 7 loaded.');
  } catch (err) {
    console.error('Game failed to initialize:', err);
    document.body.style.background = '#200';
    document.body.innerHTML = `<pre style="color:#f66;padding:20px;font-size:14px;">Game init error:\n${err.stack}</pre>`;
  }
});
