import { Game } from './game.js';
import { FacilityBuilder } from './facility/facility-builder.js';
import { LightingManager } from './lighting/lighting-manager.js';
import { TamagotchiManager } from './tamagotchi/tamagotchi-manager.js';
import { DeviceManager } from './device/device-manager.js';

// Boot
document.addEventListener('DOMContentLoaded', () => {
  try {
    const canvas = document.getElementById('game-canvas');
    const game = new Game(canvas);

    // Build the full facility
    const facility = new FacilityBuilder(game);
    facility.build();
    game.facility = facility;

    // Set up lighting
    const lightingManager = new LightingManager(game.scene);
    game.lightingManager = lightingManager;

    // Set up tamagotchi system (before device so tabs can read data)
    const tamagotchiManager = new TamagotchiManager(game);
    tamagotchiManager.attachToFacility(facility.containmentChambers);
    game.tamagotchiManager = tamagotchiManager;

    // Set up device (Pip-Boy)
    const deviceManager = new DeviceManager(game);
    game.deviceManager = deviceManager;

    // Position player in entryway (center 0,-40)
    game.player.position.set(0, 1.7, -40);

    game.start();

    // Expose for debugging
    window.game = game;

    console.log('The Tama Breach - Phase 4 loaded. Click to enable mouse look. Tab to open device.');
  } catch (err) {
    console.error('Game failed to initialize:', err);
    document.body.style.background = '#200';
    document.body.innerHTML = `<pre style="color:#f66;padding:20px;font-size:14px;">Game init error:\n${err.stack}</pre>`;
  }
});
