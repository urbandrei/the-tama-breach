import * as THREE from 'three';
import { NeedsSystem } from './needs-system.js';
import { Containment } from './containment.js';
import { BillboardSprite } from '../sprites/billboard-sprite.js';
import { TamaState, EGG_FRAMES } from './personality.js';
import { createDecorations } from './aquarium-decorations.js';

const _cameraVec = new THREE.Vector3();

const CALM_SPEED = 1.2;       // units/sec
const AGITATED_SPEED = 3.5;   // units/sec
const PAUSE_MIN = 3.0;        // seconds
const PAUSE_MAX = 6.0;        // seconds
const PACE_DURATION = 2.5;    // seconds before possibly charging again
const ARRIVE_DIST = 0.3;      // distance to consider "arrived" at waypoint
const SPRITE_Y = 0.6;         // vertical position of sprite

// Random bang constants
const RANDOM_BANG_CHECK_MIN = 30;   // seconds between random bang checks
const RANDOM_BANG_CHECK_MAX = 90;
const RANDOM_BANG_DURATION = 7;     // seconds of banging
const RANDOM_BANG_DAMAGE = 20;      // total HP damage per episode (spread over duration)
const RANDOM_BANG_BASE_CHANCE = 0.3;
const RANDOM_BANG_VISIT_CHANCE = 0.1; // reduced chance after player visit
const RANDOM_BANG_VISIT_RANGE = 8;    // units — player within this range counts as visit
const RANDOM_BANG_CHANCE_RECOVERY = 0.01; // chance creeps back per second

// Glass repair constants
const GLASS_REPAIR_AMOUNT = 10;

export class Tamagotchi {
  constructor(personality, game) {
    this.personality = personality;
    this.game = game;
    this.id = personality.id;
    this.name = personality.name;

    this.state = TamaState.CONTAINED;
    this.active = false;
    this.delivered = false;
    this.inTransit = false;
    this.needs = new NeedsSystem(personality);
    this.containment = new Containment();

    // Use first frame of idle animation
    this.billboardSprite = new BillboardSprite(
      personality.sprite.idle[0],
      '#00ff41',
    );
    // Start idle animation cycling with directional frames
    this.billboardSprite.setDirectionalAnimation(personality.sprite.idle, '#00ff41', 0.8);

    this._chamberGroup = null;
    this._spriteAdded = false;

    // Egg-in-chamber state
    this._eggInChamber = false;
    this._eggSprite = null;
    this._eggTimer = 0;
    this._eggStage = -1;
    this._wiggleTimer = 0;

    // Aquarium movement
    this._aquariumBounds = null;
    this._waypoints = [];
    this._glassFront = null;
    this._decorations = [];
    this._moveTarget = null;
    this._moveState = 'pausing'; // 'pausing', 'moving', 'charging', 'pacing'
    this._pauseTimer = 2.0;     // initial pause before first move
    this._waypointIndex = 0;
    this._paceDir = 1;
    this._paceTimer = 0;
    this._currentX = 0;
    this._currentZ = 0;
    this._forwardX = 0;
    this._forwardZ = -1;

    // Random bang state
    this._randomBangTimer = RANDOM_BANG_CHECK_MIN + Math.random() * (RANDOM_BANG_CHECK_MAX - RANDOM_BANG_CHECK_MIN);
    this._randomBangChance = RANDOM_BANG_BASE_CHANCE;
    this._randomBanging = false;
    this._randomBangTimeLeft = 0;

    // Enclosure items — care triggers gated behind these
    this._enclosureItems = { food: false, water: false, toy: false };

    // Glass repair interaction trigger (created in attachToChamber)
    this._repairTrigger = null;
    this._careTriggers = []; // physical care interaction triggers
  }

  attachToChamber(chamberInfo) {
    this._chamberGroup = chamberInfo.group;
    this.containment.setGlassPanels(chamberInfo.glassPanels);

    // Aquarium metadata
    this._aquariumBounds = chamberInfo.aquariumBounds;
    this._glassFront = chamberInfo.glassFront;

    if (chamberInfo.decorationPoints) {
      this._waypoints = chamberInfo.decorationPoints;
      this._decorations = createDecorations(this.game.scene, chamberInfo.decorationPoints);
    }

    // Start at first waypoint or aquarium center
    if (this._waypoints.length > 0) {
      this._currentX = this._waypoints[0].x;
      this._currentZ = this._waypoints[0].z;
    } else {
      const pos = chamberInfo.group.position;
      this._currentX = pos.x;
      this._currentZ = pos.z;
    }

    this.billboardSprite.setPosition(this._currentX, SPRITE_Y, this._currentZ);
    // Sprite NOT added to scene here — stays hidden until delivered

    // Glass repair interaction trigger — on observation side of glass
    this._createRepairTrigger(chamberInfo);

    // Physical care triggers — on observation side of glass, bypasses server
    this._createCareTriggers(chamberInfo);
  }

  _createRepairTrigger(chamberInfo) {
    const gf = chamberInfo.glassFront;
    if (!gf) return;

    // Position trigger on the player side of the glass
    const offset = gf.facing === 'south' ? -1.0 : 1.0;
    const triggerX = chamberInfo.group.position.x;
    const triggerZ = gf.z + offset;

    const geo = new THREE.BoxGeometry(2.0, 1.6, 0.8);
    const mat = new THREE.MeshBasicMaterial({ visible: false });
    this._repairTrigger = new THREE.Mesh(geo, mat);
    this._repairTrigger.position.set(triggerX, 0.8, triggerZ);

    this._repairTrigger.userData.interactable = {
      promptText: '[E] Repair Glass',
      interact: () => {
        this.containment.repairPartial(GLASS_REPAIR_AMOUNT);
      },
    };
    this._repairTrigger.userData._checkCondition = () => {
      return this.delivered && this.state !== TamaState.ESCAPED && this.containment.glassHealth < 100;
    };

    this.game.scene.add(this._repairTrigger);
    this.game.player.interaction.addInteractable(this._repairTrigger);
  }

  _createCareTriggers(chamberInfo) {
    const gf = chamberInfo.glassFront;
    if (!gf) return;

    const offset = gf.facing === 'south' ? -1.0 : 1.0;
    const baseX = chamberInfo.group.position.x;
    const triggerZ = gf.z + offset;

    const actions = [
      { name: 'FEED', label: '[E] Feed', xOff: -3, itemKey: 'food' },
      { name: 'WATER', label: '[E] Change Water', xOff: 0, itemKey: 'water' },
      { name: 'PLAY', label: '[E] Give Toy', xOff: 3, itemKey: 'toy' },
    ];

    for (const action of actions) {
      const trigger = new THREE.Mesh(
        new THREE.BoxGeometry(1.5, 1.6, 0.8),
        new THREE.MeshBasicMaterial({ visible: false })
      );
      trigger.position.set(baseX + action.xOff, 0.8, triggerZ);

      const actionName = action.name;
      const itemKey = action.itemKey;
      trigger.userData.interactable = {
        promptText: action.label,
        interact: () => {
          this.needs.doAction(actionName);
        },
      };
      trigger.userData._checkCondition = () => {
        return this.delivered &&
          this._enclosureItems[itemKey] &&
          this.state !== TamaState.ESCAPED &&
          !this.needs.isOnCooldown(actionName);
      };

      this.game.scene.add(trigger);
      this.game.player.interaction.addInteractable(trigger);
      this._careTriggers.push(trigger);
    }
  }

  update(dt) {
    // Egg hatching in chamber — skip normal logic
    if (this._eggInChamber) {
      this._updateEggInChamber(dt);
      return;
    }

    // 1. Decay needs (only if active — controlled by NightManager)
    if (this.active) {
      this.needs.update(dt);
    }

    // 2. State transitions (only while contained/agitated)
    if (this.state === TamaState.CONTAINED || this.state === TamaState.AGITATED) {
      const wasAgitated = this.state === TamaState.AGITATED;
      const isAgitated = this.needs.isAgitated();

      if (isAgitated && !wasAgitated) {
        this.state = TamaState.AGITATED;
        this._onAgitated();
      } else if (!isAgitated && wasAgitated) {
        this.state = TamaState.CONTAINED;
        this._onCalmed();
      }

      // 3. Update containment
      const result = this.containment.update(
        this.state === TamaState.AGITATED,
        this.personality.containmentStressRate,
        dt,
      );

      if (result.stageChanged && !result.breached) {
        this.game.emit('containment:cracking', {
          tamaId: this.id,
          stage: result.stage,
          health: this.containment.glassHealth,
          roomId: this.personality.roomId,
        });
      }

      if (result.breached) {
        this._onBreach();
      }
    }

    // 3b. Random bang check (only when contained + active + not already agitated)
    if (this.active && this.state === TamaState.CONTAINED) {
      this._updateRandomBang(dt);
      this._updatePlayerVisit();
    }

    // 4. Movement
    if (this._spriteAdded && this.state !== TamaState.ESCAPED) {
      this._updateMovement(dt);
    }

    // 5. Sprite animation + facing direction
    if (this._spriteAdded && this.state !== TamaState.ESCAPED) {
      if (this.game.camera) {
        const cameraPos = this.game.camera.getWorldPosition(_cameraVec);
        this.billboardSprite.setFacingDirection(this._forwardX, this._forwardZ, cameraPos);
      }
      this.billboardSprite.update(dt);
    }
  }

  // --- Egg-in-chamber lifecycle ---

  startEggInChamber(elapsedTime) {
    this._eggSprite = new BillboardSprite(EGG_FRAMES[0], '#88ccff');
    this._eggSprite.setAnimation([EGG_FRAMES[0]], '#88ccff', 999);
    this._eggSprite.setPosition(this._currentX, SPRITE_Y, this._currentZ);
    this._eggSprite.addTo(this.game.scene);
    this._eggInChamber = true;
    this._eggTimer = elapsedTime || 0;
    this._eggStage = -1;
    this._wiggleTimer = 0;

    // Apply correct initial stage based on elapsed time
    const EGG_TOTAL_TIME = 180;
    const stageTime = EGG_TOTAL_TIME / 4;
    const initialStage = Math.min(3, Math.floor(this._eggTimer / stageTime));
    this._applyEggStage(initialStage);
  }

  _updateEggInChamber(dt) {
    if (!this._eggSprite) return;

    const EGG_TOTAL_TIME = 180;
    const EGG_STAGE_COUNT = 4;
    const WIGGLE_SPEED = 6.0;
    const WIGGLE_AMPLITUDE = 0.08;

    this._eggTimer += dt;
    const stageTime = EGG_TOTAL_TIME / EGG_STAGE_COUNT;
    const newStage = Math.min(EGG_STAGE_COUNT - 1, Math.floor(this._eggTimer / stageTime));

    if (newStage !== this._eggStage) {
      this._applyEggStage(newStage);
    }

    // Wiggle during stage 2
    if (this._eggStage === 2) {
      this._wiggleTimer += dt;
      this._eggSprite.sprite.material.rotation = Math.sin(this._wiggleTimer * WIGGLE_SPEED) * WIGGLE_AMPLITUDE;
    } else if (this._eggSprite.sprite) {
      this._eggSprite.sprite.material.rotation = 0;
    }

    // Hatch at stage 3
    if (newStage >= 3) {
      this._hatchInChamber();
    }

    this._eggSprite.update(dt);
  }

  _applyEggStage(stage) {
    this._eggStage = stage;
    if (!this._eggSprite) return;

    if (stage <= 2) {
      this._eggSprite.setAnimation([EGG_FRAMES[stage]], '#88ccff', 999);
    }
    // Stage 3 handled by _hatchInChamber
  }

  _hatchInChamber() {
    // Remove egg sprite
    if (this._eggSprite) {
      this._eggSprite.removeFromParent();
      this._eggSprite.dispose();
      this._eggSprite = null;
    }

    this._eggInChamber = false;
    this._eggStage = -1;
    this.delivered = true;

    // Show tama sprite in chamber
    this.showInChamber();
    this.active = true;

    this.game.emit('tama:hatched', { tamaId: this.id, roomId: this.personality.roomId });
  }

  showInChamber() {
    if (!this._spriteAdded) {
      this.billboardSprite.setPosition(this._currentX, SPRITE_Y, this._currentZ);
      this.billboardSprite.addTo(this.game.scene);
      this._spriteAdded = true;
    }
  }

  hideFromChamber() {
    if (this._spriteAdded) {
      this.billboardSprite.removeFromParent();
      this._spriteAdded = false;
    }
  }

  _updateMovement(dt) {
    if (!this._aquariumBounds || this._waypoints.length === 0) return;

    switch (this._moveState) {
      case 'pausing':
        this._pauseTimer -= dt;
        if (this._pauseTimer <= 0) {
          this._pickNextWaypoint();
          this._moveState = 'moving';
        }
        break;

      case 'moving':
        this._moveToward(this._moveTarget, CALM_SPEED, dt);
        if (this._distTo(this._moveTarget) < ARRIVE_DIST) {
          this._moveState = 'pausing';
          this._pauseTimer = PAUSE_MIN + Math.random() * (PAUSE_MAX - PAUSE_MIN);
        }
        break;

      case 'charging': {
        const glassTgt = this._getGlassTarget();
        this._moveToward(glassTgt, AGITATED_SPEED, dt);
        if (this._distTo(glassTgt) < ARRIVE_DIST) {
          // Hit the glass — micro shake
          if (this.game.player && this.game.player.cameraEffects) {
            this.game.player.cameraEffects.shake(0.03, 0.3);
          }
          this._moveState = 'pacing';
          this._paceTimer = PACE_DURATION;
          this._paceDir = Math.random() > 0.5 ? 1 : -1;
        }
        break;
      }

      case 'pacing': {
        // Pace back and forth along the glass front
        const bounds = this._aquariumBounds;
        this._currentX += this._paceDir * AGITATED_SPEED * dt;
        this._forwardX = this._paceDir;
        this._forwardZ = 0;
        if (this._currentX >= bounds.maxX - 0.5) {
          this._currentX = bounds.maxX - 0.5;
          this._paceDir = -1;
        } else if (this._currentX <= bounds.minX + 0.5) {
          this._currentX = bounds.minX + 0.5;
          this._paceDir = 1;
        }
        this.billboardSprite.sprite.position.x = this._currentX;

        this._paceTimer -= dt;
        if (this._paceTimer <= 0) {
          // 50% chance to charge again, 50% to keep pacing
          if (Math.random() > 0.5) {
            this._moveState = 'charging';
          } else {
            this._paceTimer = PACE_DURATION;
          }
        }
        break;
      }
    }
  }

  _pickNextWaypoint() {
    this._waypointIndex = (this._waypointIndex + 1) % this._waypoints.length;
    const wp = this._waypoints[this._waypointIndex];
    this._moveTarget = { x: wp.x, z: wp.z };
  }

  _getGlassTarget() {
    if (!this._glassFront) return { x: this._currentX, z: this._currentZ };
    // Move to glass at a random x position within bounds
    const bounds = this._aquariumBounds;
    const x = this._currentX; // charge straight ahead
    const margin = 0.5;
    const clampedX = Math.max(bounds.minX + margin, Math.min(bounds.maxX - margin, x));
    // Move to the glass front z with a small offset to not clip through
    const glassZ = this._glassFront.z;
    const offset = this._glassFront.facing === 'south' ? 0.4 : -0.4;
    return { x: clampedX, z: glassZ + offset };
  }

  _moveToward(target, speed, dt) {
    if (!target) return;
    const dx = target.x - this._currentX;
    const dz = target.z - this._currentZ;
    const dist = Math.sqrt(dx * dx + dz * dz);
    if (dist < 0.01) return;

    // Update facing direction
    this._forwardX = dx / dist;
    this._forwardZ = dz / dist;

    const step = Math.min(speed * dt, dist);
    this._currentX += (dx / dist) * step;
    this._currentZ += (dz / dist) * step;

    this.billboardSprite.sprite.position.x = this._currentX;
    this.billboardSprite.sprite.position.z = this._currentZ;
  }

  _distTo(target) {
    if (!target) return Infinity;
    const dx = target.x - this._currentX;
    const dz = target.z - this._currentZ;
    return Math.sqrt(dx * dx + dz * dz);
  }

  _updateRandomBang(dt) {
    // Chance creeps back up over time
    this._randomBangChance = Math.min(
      RANDOM_BANG_BASE_CHANCE,
      this._randomBangChance + RANDOM_BANG_CHANCE_RECOVERY * dt
    );

    if (this._randomBanging) {
      // Currently banging — deal damage over duration
      const dmgPerSec = RANDOM_BANG_DAMAGE / RANDOM_BANG_DURATION;
      this.containment.takeDamage(dmgPerSec * dt);

      this._randomBangTimeLeft -= dt;
      if (this._randomBangTimeLeft <= 0) {
        // Stop banging, return to calm movement
        this._randomBanging = false;
        this._moveState = 'pausing';
        this._pauseTimer = 2.0;
        this.billboardSprite.setDirectionalAnimation(this.personality.sprite.idle, '#00ff41', 0.8);
        this.billboardSprite.clearGlitch();
        this._randomBangTimer = RANDOM_BANG_CHECK_MIN + Math.random() * (RANDOM_BANG_CHECK_MAX - RANDOM_BANG_CHECK_MIN);
      }
      return;
    }

    // Countdown to next check
    this._randomBangTimer -= dt;
    if (this._randomBangTimer <= 0) {
      this._randomBangTimer = RANDOM_BANG_CHECK_MIN + Math.random() * (RANDOM_BANG_CHECK_MAX - RANDOM_BANG_CHECK_MIN);

      if (Math.random() < this._randomBangChance) {
        // Start a random bang episode
        this._randomBanging = true;
        this._randomBangTimeLeft = RANDOM_BANG_DURATION;
        this._moveState = 'charging';

        // Visual feedback — agitated look during bang
        this.billboardSprite.setDirectionalAnimation(this.personality.sprite.agitated, '#ff4444', 0.3);
        this.billboardSprite.setGlitch(0.2);

        // Emit thud event + nearby camera shake
        this.game.emit('tama:bang', {
          tamaId: this.id,
          roomId: this.personality.roomId,
          position: { x: this._currentX, z: this._currentZ },
        });

        const player = this.game.player;
        if (player) {
          const dx = player.position.x - this._currentX;
          const dz = player.position.z - this._currentZ;
          const dist = Math.sqrt(dx * dx + dz * dz);
          if (dist < 15) {
            const intensity = 0.03 * (1 - dist / 15);
            player.cameraEffects.shake(intensity, 0.4);
          }
        }
      }
    }
  }

  _updatePlayerVisit() {
    const player = this.game.player;
    if (!player) return;

    const dx = player.position.x - this._currentX;
    const dz = player.position.z - this._currentZ;
    const dist = Math.sqrt(dx * dx + dz * dz);

    if (dist < RANDOM_BANG_VISIT_RANGE) {
      this._randomBangChance = RANDOM_BANG_VISIT_CHANCE;
    }
  }

  _onAgitated() {
    this.billboardSprite.setDirectionalAnimation(this.personality.sprite.agitated, '#ff4444', 0.3);
    this.billboardSprite.setGlitch(0.3);

    // Switch to charging behavior
    this._moveState = 'charging';

    if (this.game.lightingManager) {
      this.game.lightingManager.setAgitatedFlicker(this.personality.roomId, true);
    }

    this.game.emit('tama:agitated', {
      tamaId: this.id,
      roomId: this.personality.roomId,
    });
  }

  _onCalmed() {
    this.billboardSprite.setDirectionalAnimation(this.personality.sprite.idle, '#00ff41', 0.8);
    this.billboardSprite.clearGlitch();

    // Return to calm wandering
    this._moveState = 'pausing';
    this._pauseTimer = 1.0;

    if (this.game.lightingManager) {
      this.game.lightingManager.setAgitatedFlicker(this.personality.roomId, false);
    }

    this.game.emit('tama:calmed', {
      tamaId: this.id,
      roomId: this.personality.roomId,
    });
  }

  _onBreach() {
    this.state = TamaState.ESCAPED;

    this.billboardSprite.removeFromParent();
    this._spriteAdded = false;

    this.game.emit('containment:breach', {
      tamaId: this.id,
      roomId: this.personality.roomId,
    });

    if (this.game.lightingManager) {
      this.game.lightingManager.triggerFlicker(this.personality.roomId, 'surge', 2.0);
    }

    if (this.game.player && this.game.player.cameraEffects) {
      this.game.player.cameraEffects.shake(0.12, 1.5);
    }
  }

  careAction(actionName) {
    if (this.state === TamaState.ESCAPED) return false;
    return this.needs.doAction(actionName);
  }

  setEnclosureItem(itemType, placed) {
    if (itemType in this._enclosureItems) {
      this._enclosureItems[itemType] = placed;
    }
  }

  getUIData() {
    return {
      id: this.id,
      name: this.name,
      personality: this.personality.description,
      status: this.state,
      delivered: this.delivered,
      inTransit: this.inTransit,
      sprite: this.state === TamaState.AGITATED
        ? this.personality.sprite.agitated[0]
        : this.personality.sprite.idle[0],
      needs: { ...this.needs.needs },
      waterLevel: this.needs.waterLevel,
      contentment: this.needs.getContentment(),
      glassHealth: this.containment.glassHealth,
      crackStage: this.containment.crackStage,
      cooldowns: {
        FEED: this.needs.isOnCooldown('FEED'),
        WATER: this.needs.isOnCooldown('WATER'),
        PLAY: this.needs.isOnCooldown('PLAY'),
      },
    };
  }

  reset() {
    // Clean up egg state
    if (this._eggSprite) {
      this._eggSprite.removeFromParent();
      this._eggSprite.dispose();
      this._eggSprite = null;
    }
    this._eggInChamber = false;
    this._eggStage = -1;
    this._eggTimer = 0;
    this._wiggleTimer = 0;

    this.state = TamaState.CONTAINED;
    this.active = false;
    this.inTransit = false;
    this._enclosureItems = { food: false, water: false, toy: false };
    this.needs.reset();
    this.containment.reset();
    this.billboardSprite.clearGlitch();
    this.billboardSprite.setDirectionalAnimation(this.personality.sprite.idle, '#00ff41', 0.8);

    // Reset movement
    this._moveState = 'pausing';
    this._pauseTimer = 2.0;
    this._waypointIndex = 0;

    // Reset random bang state
    this._randomBangTimer = RANDOM_BANG_CHECK_MIN + Math.random() * (RANDOM_BANG_CHECK_MAX - RANDOM_BANG_CHECK_MIN);
    this._randomBangChance = RANDOM_BANG_BASE_CHANCE;
    this._randomBanging = false;
    this._randomBangTimeLeft = 0;

    if (this.game.lightingManager) {
      this.game.lightingManager.setAgitatedFlicker(this.personality.roomId, false);
    }

    // Reset position
    if (this._chamberGroup) {
      if (this._waypoints.length > 0) {
        this._currentX = this._waypoints[0].x;
        this._currentZ = this._waypoints[0].z;
      } else {
        const pos = this._chamberGroup.position;
        this._currentX = pos.x;
        this._currentZ = pos.z;
      }
      this.billboardSprite.setPosition(this._currentX, SPRITE_Y, this._currentZ);
    }

    // Only show sprite if already delivered
    if (this.delivered) {
      if (!this._spriteAdded) {
        this.billboardSprite.addTo(this.game.scene);
        this._spriteAdded = true;
      }
    } else {
      // Not delivered — ensure sprite is NOT in scene
      if (this._spriteAdded) {
        this.billboardSprite.removeFromParent();
        this._spriteAdded = false;
      }
    }
  }
}
