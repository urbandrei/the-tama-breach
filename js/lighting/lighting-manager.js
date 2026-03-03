import * as THREE from 'three';
import { rooms } from '../facility/layout-data.js';
import { randomFloat } from '../utils/math-utils.js';

export class LightingManager {
  constructor(scene) {
    this.scene = scene;
    this.lights = [];
    this._flickerTimers = [];

    // Low ambient for the whole facility
    this._ambient = new THREE.AmbientLight(0x111118, 0.3);
    scene.add(this._ambient);

    this._buildRoomLights();
  }

  _buildRoomLights() {
    for (const roomData of rooms) {
      const [cx, cz] = roomData.center;
      const h = roomData.ceilingHeight;

      const light = new THREE.PointLight(
        roomData.lightColor,
        roomData.lightIntensity,
        Math.max(roomData.size[0], roomData.size[1]) * 1.2
      );
      light.position.set(cx, h - 0.3, cz);
      this.scene.add(light);

      const entry = {
        light,
        baseIntensity: roomData.lightIntensity,
        roomId: roomData.id,
        // Flicker state
        flickerType: 'none', // 'none', 'random', 'surge', 'chase'
        flickerTimer: 0,
        flickerDuration: 0,
        nextFlicker: randomFloat(8, 25), // seconds until next random flicker
      };

      this.lights.push(entry);
    }
  }

  update(dt) {
    for (const entry of this.lights) {
      entry.nextFlicker -= dt;

      if (entry.flickerType === 'none' && entry.nextFlicker <= 0) {
        // Start a random flicker
        this._startFlicker(entry);
      }

      if (entry.flickerType !== 'none') {
        this._updateFlicker(entry, dt);
      }
    }
  }

  _startFlicker(entry) {
    const roll = Math.random();
    if (roll < 0.6) {
      // Quick random flicker
      entry.flickerType = 'random';
      entry.flickerDuration = randomFloat(0.2, 0.8);
    } else if (roll < 0.85) {
      // Power surge - dim then bright
      entry.flickerType = 'surge';
      entry.flickerDuration = randomFloat(0.5, 1.5);
    } else {
      // Longer unsettling flicker
      entry.flickerType = 'random';
      entry.flickerDuration = randomFloat(1.0, 3.0);
    }
    entry.flickerTimer = 0;
  }

  _updateFlicker(entry, dt) {
    entry.flickerTimer += dt;

    if (entry.flickerTimer >= entry.flickerDuration) {
      // Flicker done, restore
      entry.light.intensity = entry.baseIntensity;
      entry.flickerType = 'none';
      entry.nextFlicker = randomFloat(8, 30);
      return;
    }

    const t = entry.flickerTimer / entry.flickerDuration;

    switch (entry.flickerType) {
      case 'random': {
        // Rapid on/off with noise
        const noise = Math.sin(entry.flickerTimer * 40) * 0.5 + 0.5;
        const spike = Math.random() > 0.7 ? 0.1 : 1.0;
        entry.light.intensity = entry.baseIntensity * noise * spike;
        break;
      }
      case 'surge': {
        // Dim down then spike bright
        if (t < 0.6) {
          entry.light.intensity = entry.baseIntensity * (1 - t * 1.2);
        } else {
          entry.light.intensity = entry.baseIntensity * (1 + (t - 0.6) * 4);
        }
        break;
      }
    }
  }

  // Trigger a flicker on a specific room
  triggerFlicker(roomId, type = 'random', duration = 1.0) {
    const entry = this.lights.find(e => e.roomId === roomId);
    if (!entry) return;
    entry.flickerType = type;
    entry.flickerDuration = duration;
    entry.flickerTimer = 0;
  }

  // Trigger all lights flickering (power event)
  triggerPowerSurge(duration = 2.0) {
    for (const entry of this.lights) {
      entry.flickerType = 'surge';
      entry.flickerDuration = duration + randomFloat(-0.3, 0.3);
      entry.flickerTimer = 0;
    }
  }
}
