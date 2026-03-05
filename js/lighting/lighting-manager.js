import * as THREE from 'three';
import { rooms, hallways } from '../facility/layout-data.js';
import { randomFloat } from '../utils/math-utils.js';

const BRIGHT_MULTIPLIER = 2.5;

export class LightingManager {
  constructor(scene, game) {
    this.scene = scene;
    this.game = game;
    this.lights = [];
    this._flickerTimers = [];

    // Blackout state — reference counted by reason
    this._blackoutReasons = new Set();
    this._blackoutProgress = 0; // 0=normal, 1=dark
    this._blackoutDirection = 0; // 1=going dark, -1=restoring
    this._blackoutSpeed = 5.0;

    // Emissive navigation aids (set after construction via setNavigationAids)
    this._edgeStrips = null;
    this._roomSigns = null;
    this._alertActive = false;

    // Fog control — density ramps up during blackout
    this._fog = scene.fog;
    this._fogBaseDensity = scene.fog ? scene.fog.density : 0.003;
    this._fogBlackoutDensity = 0.06;

    // Bright ambient — fluorescent level
    this._ambientBaseIntensity = 1.0;
    this._ambient = new THREE.AmbientLight(0x99aabb, this._ambientBaseIntensity);
    scene.add(this._ambient);

    this._buildRoomLights();
    this._buildHallwayLights();

    // Listen for breach events
    if (game) {
      game.on('containment:breach', () => this.goBlackout('breach'));
    }
  }

  _buildRoomLights() {
    for (const roomData of rooms) {
      const [cx, cz] = roomData.center;
      const h = roomData.ceilingHeight;

      const baseIntensity = roomData.lightIntensity * BRIGHT_MULTIPLIER;

      const light = new THREE.PointLight(
        roomData.lightColor,
        baseIntensity,
        Math.max(roomData.size[0], roomData.size[1]) * 3.0
      );
      light.position.set(cx, h - 0.3, cz);
      this.scene.add(light);

      const entry = {
        light,
        baseIntensity,
        roomId: roomData.id,
        flickerType: 'none',
        flickerTimer: 0,
        flickerDuration: 0,
        nextFlicker: randomFloat(8, 25),
        agitatedFlicker: false,
      };

      this.lights.push(entry);
    }
  }

  _buildHallwayLights() {
    for (const hall of hallways) {
      const [sx, sz] = hall.start;
      const [ex, ez] = hall.end;

      const midX = (sx + ex) / 2;
      const midZ = (sz + ez) / 2;
      const dx = ex - sx;
      const dz = ez - sz;
      const hallLength = Math.sqrt(dx * dx + dz * dz);

      const light = new THREE.PointLight(0xcccccc, 2.0, hallLength * 1.5);
      light.position.set(midX, 2.5, midZ);
      this.scene.add(light);

      const entry = {
        light,
        baseIntensity: 2.0,
        roomId: hall.id,
        flickerType: 'none',
        flickerTimer: 0,
        flickerDuration: 0,
        nextFlicker: randomFloat(8, 25),
        agitatedFlicker: false,
      };

      this.lights.push(entry);
    }
  }

  setNavigationAids(edgeStrips, roomSigns) {
    this._edgeStrips = edgeStrips;
    this._roomSigns = roomSigns;
  }

  goBlackout(reason = 'breach') {
    this._blackoutReasons.add(reason);
    this._blackoutDirection = 1;
  }

  restoreBlackout(reason = 'breach') {
    this._blackoutReasons.delete(reason);
    // Only actually restore if no reasons remain
    if (this._blackoutReasons.size === 0) {
      this._blackoutDirection = -1;
    }
  }

  resetFull() {
    this._blackoutReasons.clear();
    this._blackoutProgress = 0;
    this._blackoutDirection = 0;
    for (const entry of this.lights) {
      entry.light.intensity = entry.baseIntensity;
      entry.flickerType = 'none';
      entry.agitatedFlicker = false;
      entry.nextFlicker = randomFloat(8, 25);
    }
    this._ambient.intensity = this._ambientBaseIntensity;
    if (this._fog) this._fog.density = this._fogBaseDensity;
    if (this._edgeStrips) {
      this._edgeStrips.setIntensity(0);
      this._edgeStrips.setAlert(false);
    }
    if (this._roomSigns) this._roomSigns.setAlert(false);
    this._alertActive = false;
  }

  setAgitatedFlicker(roomId, active) {
    const entry = this.lights.find(e => e.roomId === roomId);
    if (!entry) return;
    entry.agitatedFlicker = active;
    if (active) {
      entry.nextFlicker = randomFloat(0.3, 1.0);
    }
  }

  update(dt) {
    // Tick blackout transition
    if (this._blackoutDirection !== 0) {
      this._blackoutProgress += this._blackoutDirection * this._blackoutSpeed * dt;
      if (this._blackoutProgress >= 1) {
        this._blackoutProgress = 1;
        this._blackoutDirection = 0;
      } else if (this._blackoutProgress <= 0) {
        this._blackoutProgress = 0;
        this._blackoutDirection = 0;
      }
    }

    const blackoutScale = 1 - this._blackoutProgress;

    // Apply blackout to ambient
    this._ambient.intensity = this._ambientBaseIntensity * blackoutScale;

    // Fog thickens during blackout
    if (this._fog) {
      this._fog.density = this._fogBaseDensity + this._blackoutProgress * this._fogBlackoutDensity;
    }

    // Ramp edge strips up as blackout progresses
    if (this._edgeStrips) {
      this._edgeStrips.setIntensity(this._blackoutProgress * 0.6);
    }

    // Toggle alert color on navigation aids during blackout
    if (this._blackoutReasons.size > 0 && !this._alertActive) {
      this._alertActive = true;
      if (this._edgeStrips) this._edgeStrips.setAlert(true);
      if (this._roomSigns) this._roomSigns.setAlert(true);
    } else if (this._blackoutReasons.size === 0 && this._alertActive) {
      this._alertActive = false;
      if (this._edgeStrips) this._edgeStrips.setAlert(false);
      if (this._roomSigns) this._roomSigns.setAlert(false);
    }

    for (const entry of this.lights) {
      // During full blackout, force all lights off
      if (this._blackoutProgress >= 1) {
        entry.light.intensity = 0;
        continue;
      }

      entry.nextFlicker -= dt;

      // Agitated flicker uses shorter intervals
      const minFlickerWait = entry.agitatedFlicker ? 0.5 : 8;
      const maxFlickerWait = entry.agitatedFlicker ? 2.0 : 30;

      if (entry.flickerType === 'none' && entry.nextFlicker <= 0) {
        this._startFlicker(entry);
      }

      if (entry.flickerType !== 'none') {
        this._updateFlicker(entry, dt);
      }

      // Apply blackout scale to non-flickering lights
      if (entry.flickerType === 'none') {
        entry.light.intensity = entry.baseIntensity * blackoutScale;
      } else {
        // Flicker already set intensity, scale it by blackout
        entry.light.intensity *= blackoutScale;
      }

      // After flicker ends, use agitated-appropriate wait times
      if (entry.flickerType === 'none' && entry.nextFlicker > maxFlickerWait) {
        entry.nextFlicker = randomFloat(minFlickerWait, maxFlickerWait);
      }
    }
  }

  _startFlicker(entry) {
    const roll = Math.random();
    if (entry.agitatedFlicker) {
      entry.flickerType = 'random';
      entry.flickerDuration = randomFloat(0.3, 1.5);
    } else if (roll < 0.6) {
      entry.flickerType = 'random';
      entry.flickerDuration = randomFloat(0.2, 0.8);
    } else if (roll < 0.85) {
      entry.flickerType = 'surge';
      entry.flickerDuration = randomFloat(0.5, 1.5);
    } else {
      entry.flickerType = 'random';
      entry.flickerDuration = randomFloat(1.0, 3.0);
    }
    entry.flickerTimer = 0;
  }

  _updateFlicker(entry, dt) {
    entry.flickerTimer += dt;

    if (entry.flickerTimer >= entry.flickerDuration) {
      entry.light.intensity = entry.baseIntensity;
      entry.flickerType = 'none';
      entry.nextFlicker = entry.agitatedFlicker
        ? randomFloat(0.5, 2.0)
        : randomFloat(8, 30);
      return;
    }

    const t = entry.flickerTimer / entry.flickerDuration;

    switch (entry.flickerType) {
      case 'random': {
        const noise = Math.sin(entry.flickerTimer * 40) * 0.5 + 0.5;
        const spike = Math.random() > 0.7 ? 0.1 : 1.0;
        entry.light.intensity = entry.baseIntensity * noise * spike;
        break;
      }
      case 'surge': {
        if (t < 0.6) {
          entry.light.intensity = entry.baseIntensity * (1 - t * 1.2);
        } else {
          entry.light.intensity = entry.baseIntensity * (1 + (t - 0.6) * 4);
        }
        break;
      }
    }
  }

  triggerFlicker(roomId, type = 'random', duration = 1.0) {
    const entry = this.lights.find(e => e.roomId === roomId);
    if (!entry) return;
    entry.flickerType = type;
    entry.flickerDuration = duration;
    entry.flickerTimer = 0;
  }

  triggerPowerSurge(duration = 2.0) {
    for (const entry of this.lights) {
      entry.flickerType = 'surge';
      entry.flickerDuration = duration + randomFloat(-0.3, 0.3);
      entry.flickerTimer = 0;
    }
  }
}
