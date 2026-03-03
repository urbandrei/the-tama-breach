import { NeedsSystem } from './needs-system.js';
import { Containment } from './containment.js';
import { BillboardSprite } from '../sprites/billboard-sprite.js';
import { TamaState } from './personality.js';
import { createDecorations } from './aquarium-decorations.js';

const CALM_SPEED = 1.2;       // units/sec
const AGITATED_SPEED = 3.5;   // units/sec
const PAUSE_MIN = 3.0;        // seconds
const PAUSE_MAX = 6.0;        // seconds
const PACE_DURATION = 2.5;    // seconds before possibly charging again
const ARRIVE_DIST = 0.3;      // distance to consider "arrived" at waypoint
const SPRITE_Y = 0.6;         // vertical position of sprite

export class Tamagotchi {
  constructor(personality, game) {
    this.personality = personality;
    this.game = game;
    this.id = personality.id;
    this.name = personality.name;

    this.state = TamaState.CONTAINED;
    this.needs = new NeedsSystem(personality);
    this.containment = new Containment();

    // Use first frame of idle animation
    this.billboardSprite = new BillboardSprite(
      personality.sprite.idle[0],
      '#00ff41',
    );
    // Start idle animation cycling
    this.billboardSprite.setAnimation(personality.sprite.idle, '#00ff41', 0.8);

    this._chamberGroup = null;
    this._spriteAdded = false;

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
    this.billboardSprite.addTo(this.game.scene);
    this._spriteAdded = true;
  }

  update(dt) {
    // 1. Decay needs
    this.needs.update(dt);

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

    // 4. Movement
    if (this._spriteAdded && this.state !== TamaState.ESCAPED) {
      this._updateMovement(dt);
    }

    // 5. Sprite animation
    if (this._spriteAdded && this.state !== TamaState.ESCAPED) {
      this.billboardSprite.update(dt);
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

  _onAgitated() {
    this.billboardSprite.setAnimation(this.personality.sprite.agitated, '#ff4444', 0.3);
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
    this.billboardSprite.setAnimation(this.personality.sprite.idle, '#00ff41', 0.8);
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

  getUIData() {
    return {
      id: this.id,
      name: this.name,
      personality: this.personality.description,
      status: this.state,
      sprite: this.state === TamaState.AGITATED
        ? this.personality.sprite.agitated[0]
        : this.personality.sprite.idle[0],
      needs: { ...this.needs.needs },
      contentment: this.needs.getContentment(),
      glassHealth: this.containment.glassHealth,
      crackStage: this.containment.crackStage,
      cooldowns: {
        FEED: this.needs.isOnCooldown('FEED'),
        PLAY: this.needs.isOnCooldown('PLAY'),
        SCOLD: this.needs.isOnCooldown('SCOLD'),
      },
    };
  }

  reset() {
    this.state = TamaState.CONTAINED;
    this.needs.reset();
    this.containment.reset();
    this.billboardSprite.clearGlitch();
    this.billboardSprite.setAnimation(this.personality.sprite.idle, '#00ff41', 0.8);

    // Reset movement
    this._moveState = 'pausing';
    this._pauseTimer = 2.0;
    this._waypointIndex = 0;

    if (this.game.lightingManager) {
      this.game.lightingManager.setAgitatedFlicker(this.personality.roomId, false);
    }

    if (this._chamberGroup && !this._spriteAdded) {
      // Start at first waypoint
      if (this._waypoints.length > 0) {
        this._currentX = this._waypoints[0].x;
        this._currentZ = this._waypoints[0].z;
      } else {
        const pos = this._chamberGroup.position;
        this._currentX = pos.x;
        this._currentZ = pos.z;
      }
      this.billboardSprite.setPosition(this._currentX, SPRITE_Y, this._currentZ);
      this.billboardSprite.addTo(this.game.scene);
      this._spriteAdded = true;
    }
  }
}
