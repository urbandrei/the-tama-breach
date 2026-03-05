import * as THREE from 'three';
import { buildNavGraph, getNearestNode } from './nav-graph.js';
import { CreatureAI, CreatureState } from './creature-ai.js';
import { DamageSystem } from './damage-system.js';

import { BillboardSprite } from '../sprites/billboard-sprite.js';
import { PERSONALITIES } from '../tamagotchi/personality.js';
import { TamaState } from '../tamagotchi/personality.js';
import { rooms } from '../facility/layout-data.js';

const SPRITE_Y = 1.0;
const LURE_POSITION = [19.25, 1.4, -5]; // Storage room center
const SPRINT_NOISE_INTERVAL = 2.0;

// State → color mapping
const STATE_COLORS = {
  [CreatureState.WANDER]:      { hex: 0x00ff41, css: '#00ff41', glitch: 0.15 },
  [CreatureState.ALERT]:       { hex: 0xffaa00, css: '#ffaa00', glitch: 0.25 },
  [CreatureState.INVESTIGATE]: { hex: 0xffaa00, css: '#ffaa00', glitch: 0.2 },
  [CreatureState.CHASE]:       { hex: 0xff2222, css: '#ff2222', glitch: 0.4 },
  [CreatureState.FROZEN]:      { hex: 0x661111, css: '#ff2222', glitch: 0.1 },
  [CreatureState.RETURN]:      { hex: 0x00ff41, css: '#00ff41', glitch: 0.15 },
};

// Room center lookup
const ROOM_CENTERS = {};
for (const room of rooms) {
  ROOM_CENTERS[room.id] = { x: room.center[0], z: room.center[1] };
}

export class CreatureManager {
  constructor(game) {
    this.game = game;

    // Build nav graph once
    this.graph = buildNavGraph();

    // Active creatures (tamaId → creature data)
    this.creatures = new Map();

    // Subsystems
    this.damageSystem = new DamageSystem(game);
    this.proximityEffects = { update() {}, reset() {} };

    // Sprint noise throttle
    this._sprintNoiseTimer = 0;

    // Lure state
    this.hasLure = false;
    this._lureTrigger = null;
    this._lurePlaceTriggers = new Map(); // roomId → mesh

    // Create the lure pickup in storage room
    this._createLurePickup();

    // Listen for breaches
    this._breachHandler = (data) => this._onBreach(data);
    game.on('containment:breach', this._breachHandler);

    // Listen for door noises
    this._doorNoiseHandler = (data) => this._onDoorNoise(data);
    game.on('door:noise', this._doorNoiseHandler);
  }

  update(dt) {
    if (this.creatures.size === 0) return;

    const player = this.game.player;
    const playerPos = { x: player.position.x, z: player.position.z };
    const playerState = {
      isSprinting: player.isSprinting,
      isCrouching: player.isCrouching,
      isPushingCart: player.isPushingCart,
    };

    // Sprint noise emission (throttled)
    if (playerState.isSprinting) {
      this._sprintNoiseTimer += dt;
      if (this._sprintNoiseTimer >= SPRINT_NOISE_INTERVAL) {
        this._sprintNoiseTimer = 0;
        this._emitNoise(playerPos.x, playerPos.z);
      }
    } else {
      this._sprintNoiseTimer = 0;
    }

    // Camera world position for directional sprites
    const cameraWorldPos = this.game.camera.getWorldPosition(new THREE.Vector3());

    let anyChasing = false;

    for (const [tamaId, creature] of this.creatures) {
      // Skip creatures that have returned to their room (waiting for glass repair)
      if (creature.returned) continue;

      const prevState = creature.ai.state;

      // Update AI
      creature.ai.update(dt, playerPos, playerState, (ai) => {
        this._onCreatureHit(tamaId, ai);
      });

      const currentState = creature.ai.state;

      // Check if RETURN state arrived
      if (currentState === CreatureState.RETURN) {
        const rCenter = ROOM_CENTERS[creature.personality.roomId];
        if (rCenter) {
          const dx = creature.ai.x - rCenter.x;
          const dz = creature.ai.z - rCenter.z;
          if (Math.sqrt(dx * dx + dz * dz) < 2.0) {
            this._onCreatureReturned(tamaId);
            continue;
          }
        }
      }

      if (currentState === CreatureState.CHASE) {
        anyChasing = true;
      }

      // Update state-based colors on state change
      if (prevState !== currentState) {
        this._updateCreatureVisuals(creature, currentState);
      }

      // Update sprite position and direction
      if (creature.sprite) {
        creature.sprite.sprite.position.x = creature.ai.x;
        creature.sprite.sprite.position.z = creature.ai.z;
        creature.sprite.sprite.position.y = SPRITE_Y;
        creature.sprite.setFacingDirection(
          creature.ai.forwardX,
          creature.ai.forwardZ,
          cameraWorldPos,
        );
        creature.sprite.update(dt);
      }

      // Update spotlight position and direction
      if (creature.spotlight) {
        creature.spotlight.position.set(creature.ai.x, 0.8, creature.ai.z);
        creature.spotlightTarget.position.set(
          creature.ai.x + creature.ai.forwardX * 5,
          0,
          creature.ai.z + creature.ai.forwardZ * 5,
        );
      }
    }

    this.damageSystem.update(dt, anyChasing);
  }

  _onBreach(data) {
    const tamaId = data.tamaId;
    if (this.creatures.has(tamaId)) return;

    this.spawnCreature(tamaId, data.spawnPos || null);
  }

  spawnCreature(tamaId, startPos = null) {
    const personality = PERSONALITIES[tamaId];
    if (!personality) return;

    const roomCenter = ROOM_CENTERS[personality.roomId];
    if (!roomCenter) return;

    // Use custom start position if provided (e.g., cart hatch escape)
    const spawnX = startPos ? startPos.x : roomCenter.x;
    const spawnZ = startPos ? startPos.z : roomCenter.z;

    // Create billboard sprite with directional animation, starting green (wander)
    const sprite = new BillboardSprite(
      personality.sprite.agitated[0],
      STATE_COLORS[CreatureState.WANDER].css,
    );
    sprite.setDirectionalAnimation(
      personality.sprite.agitated,
      STATE_COLORS[CreatureState.WANDER].css,
      0.3,
    );
    sprite.setGlitch(STATE_COLORS[CreatureState.WANDER].glitch);
    sprite.setPosition(spawnX, SPRITE_Y, spawnZ);
    sprite.addTo(this.game.scene);

    // Create SpotLight for vision cone visualization
    const spotlight = new THREE.SpotLight(
      STATE_COLORS[CreatureState.WANDER].hex,
      5.0,
      15,
      0.55,
      0.3,
    );
    spotlight.position.set(spawnX, 0.8, spawnZ);

    const spotlightTarget = new THREE.Object3D();
    spotlightTarget.position.set(spawnX, 0, spawnZ - 5);
    this.game.scene.add(spotlightTarget);
    spotlight.target = spotlightTarget;
    this.game.scene.add(spotlight);

    // Create AI
    const ai = new CreatureAI(this.graph, personality, spawnX, spawnZ);

    this.creatures.set(tamaId, {
      personality,
      ai,
      sprite,
      spotlight,
      spotlightTarget,
      returned: false,
    });

    // Create lure placement trigger for this containment room
    this._createLurePlaceTrigger(tamaId, personality.roomId);

    this.game.emit('creature:spawned', { tamaId, roomId: personality.roomId });
  }

  despawnCreature(tamaId) {
    const creature = this.creatures.get(tamaId);
    if (!creature) return;

    // Remove sprite
    if (creature.sprite) {
      creature.sprite.removeFromParent();
      creature.sprite.dispose();
    }

    // Remove spotlight
    if (creature.spotlight) {
      this.game.scene.remove(creature.spotlight);
      this.game.scene.remove(creature.spotlightTarget);
      creature.spotlight.dispose();
    }

    // Remove lure place trigger
    this._removeLurePlaceTrigger(tamaId);

    this.creatures.delete(tamaId);

  }

  despawnAll() {
    for (const id of [...this.creatures.keys()]) {
      this.despawnCreature(id);
    }
  }

  _updateCreatureVisuals(creature, state) {
    const colors = STATE_COLORS[state] || STATE_COLORS[CreatureState.WANDER];

    if (creature.sprite) {
      creature.sprite.setColor(colors.css);
      creature.sprite.setGlitch(colors.glitch);
    }

    if (creature.spotlight) {
      creature.spotlight.color.setHex(colors.hex);
    }
  }

  _emitNoise(x, z) {
    for (const [, creature] of this.creatures) {
      if (creature.returned) continue;
      creature.ai.onNoise(x, z);
    }
  }

  _onDoorNoise(data) {
    this._emitNoise(data.x, data.z);
  }

  _onCreatureHit(tamaId, ai) {
    const player = this.game.player;
    const playerPos = { x: player.position.x, z: player.position.z };
    const result = this.damageSystem.onHit({ x: ai.x, z: ai.z });
    if (result === 'hit' || result === 'kill') {
      // Creature freezes after hitting (stores player pos to resume chase)
      ai.freeze(playerPos);
    }
  }

  _onCreatureReturned(tamaId) {
    const creature = this.creatures.get(tamaId);
    if (!creature || creature.returned) return;

    creature.returned = true;

    // Remove the roaming sprite
    if (creature.sprite) {
      creature.sprite.removeFromParent();
      creature.sprite.dispose();
      creature.sprite = null;
    }

    // Remove the spotlight
    if (creature.spotlight) {
      this.game.scene.remove(creature.spotlight);
      this.game.scene.remove(creature.spotlightTarget);
      creature.spotlight.dispose();
      creature.spotlight = null;
      creature.spotlightTarget = null;
    }

    this.game.emit('creature:returned', {
      tamaId,
      roomId: creature.personality.roomId,
    });
  }

  // --- Lure system ---

  _createLurePickup() {
    const [x, y, z] = LURE_POSITION;
    this._lureTrigger = new THREE.Mesh(
      new THREE.BoxGeometry(0.8, 1.6, 0.8),
      new THREE.MeshBasicMaterial({ visible: false }),
    );
    this._lureTrigger.position.set(x, y, z);
    this._lureTrigger.userData.interactable = {
      promptText: '[E] Take lure',
      interact: () => this._takeLure(),
    };
    this.game.scene.add(this._lureTrigger);
    this.game.player.interaction.addInteractable(this._lureTrigger);
  }

  _takeLure() {
    this.hasLure = true;

    // Remove the trigger temporarily
    if (this._lureTrigger) {
      this.game.player.interaction.removeInteractable(this._lureTrigger);
      this.game.scene.remove(this._lureTrigger);
    }

    // Hide interact prompt
    const prompt = document.getElementById('interact-prompt');
    if (prompt) prompt.classList.remove('visible');
  }

  _respawnLurePickup() {
    if (this._lureTrigger) {
      this.game.scene.add(this._lureTrigger);
      this.game.player.interaction.addInteractable(this._lureTrigger);
    }
  }

  _createLurePlaceTrigger(tamaId, roomId) {
    if (this._lurePlaceTriggers.has(tamaId)) return;

    const center = ROOM_CENTERS[roomId];
    if (!center) return;

    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(2, 2, 2),
      new THREE.MeshBasicMaterial({ visible: false, side: THREE.DoubleSide }),
    );
    mesh.position.set(center.x, 1.0, center.z);
    mesh.userData.interactable = {
      promptText: '[E] Place lure',
      interact: () => this._placeLure(tamaId),
    };

    // Only add if player has lure — we'll toggle visibility in update
    // Actually, simpler: always add it, check hasLure in interact
    mesh.userData.interactable.interact = () => {
      if (!this.hasLure) return;
      this._placeLure(tamaId);
    };
    mesh.userData.interactable.promptText = '[E] Place lure';
    mesh.userData._checkCondition = () => this.hasLure;

    this.game.scene.add(mesh);
    this.game.player.interaction.addInteractable(mesh);
    this._lurePlaceTriggers.set(tamaId, mesh);
  }

  _removeLurePlaceTrigger(tamaId) {
    const mesh = this._lurePlaceTriggers.get(tamaId);
    if (!mesh) return;

    this.game.player.interaction.removeInteractable(mesh);
    this.game.scene.remove(mesh);
    mesh.geometry.dispose();
    mesh.material.dispose();
    this._lurePlaceTriggers.delete(tamaId);
  }

  _placeLure(tamaId) {
    if (!this.hasLure) return;

    const creature = this.creatures.get(tamaId);
    if (!creature) return;
    if (creature.returned) return;

    this.hasLure = false;

    // Set creature to RETURN to its home room
    const roomCenter = ROOM_CENTERS[creature.personality.roomId];
    if (roomCenter) {
      creature.ai.setReturn(roomCenter.x, roomCenter.z);
    }

    // Remove the lure place trigger
    this._removeLurePlaceTrigger(tamaId);

    // Respawn the lure pickup in storage
    this._respawnLurePickup();

    // Hide interact prompt
    const prompt = document.getElementById('interact-prompt');
    if (prompt) prompt.classList.remove('visible');

    this.game.emit('lure:placed', { tamaId, roomId: creature.personality.roomId });
  }

  isCreatureActive(tamaId) {
    return this.creatures.has(tamaId) && !this.creatures.get(tamaId).returned;
  }
}
