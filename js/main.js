import { Game } from './game.js';
import { FacilityBuilder } from './facility/facility-builder.js';
import { LightingManager } from './lighting/lighting-manager.js';
import { EdgeStrips } from './facility/edge-strips.js';
import { RoomSigns } from './facility/room-signs.js';
import { TamagotchiManager } from './tamagotchi/tamagotchi-manager.js';
import { TaskManager } from './tasks/task-manager.js';
import { DeviceManager } from './device/device-manager.js';
import { TaskHUD } from './ui/task-hud.js';

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

    // Edge strips (off pre-escape, lit during blackout) + room signs (always on)
    const edgeStrips = new EdgeStrips(game.scene);
    new RoomSigns(game.scene);
    lightingManager.setNavigationAids(edgeStrips);

    // Set up tamagotchi system (before device so tabs can read data)
    const tamagotchiManager = new TamagotchiManager(game);
    tamagotchiManager.attachToFacility(facility.containmentChambers);
    game.tamagotchiManager = tamagotchiManager;

    // Set up task system (before device so tabs can read data)
    const taskManager = new TaskManager(game);
    game.taskManager = taskManager;

    // Set up device (Pip-Boy)
    const deviceManager = new DeviceManager(game);
    game.deviceManager = deviceManager;

    // Task HUD (after TaskManager)
    const taskHUD = new TaskHUD(game);
    game.taskHUD = taskHUD;

    // Position player in entryway (center 0,-40), facing north into the facility
    game.player.position.set(0, 1.7, -40);
    game.player.yaw.rotation.y = Math.PI;

    game.start();

    // Expose for debugging
    window.game = game;

    console.log('The Tama Breach - Phase 5.5 loaded. Click to enable mouse look. Tab to open device.');
  } catch (err) {
    console.error('Game failed to initialize:', err);
    document.body.style.background = '#200';
    document.body.innerHTML = `<pre style="color:#f66;padding:20px;font-size:14px;">Game init error:\n${err.stack}</pre>`;
  }
});
