import { getNearestNode } from './nav-graph.js';
import { findPath } from './pathfinding.js';
import { checkDetection } from './detection.js';

export const CreatureState = Object.freeze({
  WANDER: 'wander',
  ALERT: 'alert',
  CHASE: 'chase',
  INVESTIGATE: 'investigate',
  FROZEN: 'frozen',
  RETURN: 'return',
});

const ARRIVE_DIST = 1.5;
const WANDER_PAUSE_MIN = 2.0;
const WANDER_PAUSE_MAX = 4.0;
const CHASE_REPATH_INTERVAL = 1.0;
const CHASE_LOSS_TIME = 8.0;
const ALERT_LOCK_TIME = 1.0;
const INVESTIGATE_DURATION = 8.0;
const INVESTIGATE_SCAN_SPEED = 1.5;
const PREDICT_DISTANCE = 5.0;
const FROZEN_DURATION = 2.0;
const HIT_DISTANCE = 1.2;
const TELEPORT_MIN = 15.0;
const TELEPORT_MAX = 20.0;

export class CreatureAI {
  constructor(graph, personality, startX, startZ) {
    this.graph = graph;
    this.personality = personality;
    this.ai = personality.ai;

    // Position
    this.x = startX;
    this.z = startZ;

    // Facing direction (normalized)
    this.forwardX = 0;
    this.forwardZ = -1;

    // State
    this.state = CreatureState.WANDER;
    this._prevState = CreatureState.WANDER;
    this._path = [];
    this._pathIndex = 0;
    this._stateTimer = 0;
    this._repathTimer = 0;
    this._pauseTimer = randomFloat(WANDER_PAUSE_MIN, WANDER_PAUSE_MAX);
    this._paused = true;
    this._lastKnownPlayerX = 0;
    this._lastKnownPlayerZ = 0;
    this._lastKnownPlayerDirX = 0;
    this._lastKnownPlayerDirZ = 0;
    this._teleportTimer = randomFloat(TELEPORT_MIN, TELEPORT_MAX);
    this._chaseLossTimer = 0;
    this._hitCooldown = 0;
    this._freezePlayerPos = null;
    this._investigateTargetX = 0;
    this._investigateTargetZ = 0;
    this._investigateArrived = false;
    this._scanAngle = 0;
  }

  update(dt, playerPos, playerState, onHit) {
    switch (this.state) {
      case CreatureState.WANDER:
        this._updateWander(dt, playerPos, playerState);
        break;
      case CreatureState.ALERT:
        this._updateAlert(dt, playerPos, playerState);
        break;
      case CreatureState.CHASE:
        this._updateChase(dt, playerPos, playerState, onHit);
        break;
      case CreatureState.INVESTIGATE:
        this._updateInvestigate(dt, playerPos, playerState);
        break;
      case CreatureState.FROZEN:
        this._updateFrozen(dt);
        break;
      case CreatureState.RETURN:
        this._updateReturn(dt);
        break;
    }
  }

  setReturn(targetX, targetZ) {
    this.state = CreatureState.RETURN;
    this._pathTo(targetX, targetZ);
    this._paused = false;
  }

  onNoise(x, z) {
    // Ignore noise when chasing, frozen, or returning
    if (this.state === CreatureState.CHASE ||
        this.state === CreatureState.FROZEN ||
        this.state === CreatureState.RETURN ||
        this.state === CreatureState.ALERT) return;

    const dx = x - this.x;
    const dz = z - this.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    const hearingRange = this.ai.soundRange * 1.5;

    if (dist > hearingRange) return;

    if (this.state === CreatureState.INVESTIGATE) {
      // Update target if new noise is closer
      const oldDx = this._investigateTargetX - this.x;
      const oldDz = this._investigateTargetZ - this.z;
      const oldDist = Math.sqrt(oldDx * oldDx + oldDz * oldDz);
      if (dist < oldDist) {
        this._startInvestigate(x, z);
      }
      return;
    }

    // WANDER → INVESTIGATE
    this._startInvestigate(x, z);
  }

  // --- State updates ---

  _updateWander(dt, playerPos, playerState) {
    // Teleport behavior (Glitch)
    if (this.ai.behavior === 'teleport') {
      this._teleportTimer -= dt;
      if (this._teleportTimer <= 0) {
        this._teleportTimer = randomFloat(TELEPORT_MIN, TELEPORT_MAX);
        this._teleportToRandomNode();
      }
    }

    // Detection check (omnidirectional when idle/paused — creature is looking around)
    const detection = this._detect(playerPos, playerState, this._paused);
    if (detection.detected) {
      this._startAlert(playerPos);
      return;
    }

    // Pausing between waypoints
    if (this._paused) {
      this._pauseTimer -= dt;
      if (this._pauseTimer <= 0) {
        this._paused = false;
        this._pathToRandomNode();
      }
      return;
    }

    // Follow path
    this._followPath(dt, this.ai.wanderSpeed);

    // Arrived at destination
    if (this._pathIndex >= this._path.length) {
      this._paused = true;
      this._pauseTimer = randomFloat(WANDER_PAUSE_MIN, WANDER_PAUSE_MAX);
    }
  }

  _updateAlert(dt, playerPos, playerState) {
    // Stop moving, face the player
    const dx = playerPos.x - this.x;
    const dz = playerPos.z - this.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    if (dist > 0.001) {
      this.forwardX = dx / dist;
      this.forwardZ = dz / dist;
    }

    // Directional detection (creature is now facing the player)
    const detection = this._detect(playerPos, playerState, false);

    this._stateTimer += dt;

    if (detection.detected) {
      // Player stays visible — check if lock-in time elapsed
      if (this._stateTimer >= ALERT_LOCK_TIME) {
        this._startChase(playerPos);
      }
    } else {
      // Player broke detection during alert — return to previous state
      if (this._prevState === CreatureState.INVESTIGATE) {
        this.state = CreatureState.INVESTIGATE;
      } else {
        this.state = CreatureState.WANDER;
        this._paused = true;
        this._pauseTimer = randomFloat(WANDER_PAUSE_MIN, WANDER_PAUSE_MAX);
      }
    }
  }

  _updateChase(dt, playerPos, playerState, onHit) {
    // Tick hit cooldown
    if (this._hitCooldown > 0) this._hitCooldown -= dt;

    // Track player movement direction for prediction
    const prevLastX = this._lastKnownPlayerX;
    const prevLastZ = this._lastKnownPlayerZ;

    // Detection check (to track loss)
    const detection = this._detect(playerPos, playerState);
    if (detection.detected) {
      this._chaseLossTimer = 0;
      // Compute player movement direction
      const moveDx = playerPos.x - this._lastKnownPlayerX;
      const moveDz = playerPos.z - this._lastKnownPlayerZ;
      const moveDist = Math.sqrt(moveDx * moveDx + moveDz * moveDz);
      if (moveDist > 0.1) {
        this._lastKnownPlayerDirX = moveDx / moveDist;
        this._lastKnownPlayerDirZ = moveDz / moveDist;
      }
      this._lastKnownPlayerX = playerPos.x;
      this._lastKnownPlayerZ = playerPos.z;
    } else {
      this._chaseLossTimer += dt;
      if (this._chaseLossTimer >= CHASE_LOSS_TIME) {
        // Predict where player was heading
        const predictX = this._lastKnownPlayerX + this._lastKnownPlayerDirX * PREDICT_DISTANCE;
        const predictZ = this._lastKnownPlayerZ + this._lastKnownPlayerDirZ * PREDICT_DISTANCE;

        if (this.ai.behavior === 'aggressive') {
          // Feral: investigate predicted position aggressively
          this._startInvestigate(predictX, predictZ);
        } else {
          this._startInvestigate(predictX, predictZ);
        }
        return;
      }
    }

    // Re-path periodically toward player
    this._repathTimer -= dt;
    if (this._repathTimer <= 0) {
      this._repathTimer = CHASE_REPATH_INTERVAL;
      this._pathTo(playerPos.x, playerPos.z);
    }

    // Follow path at chase speed
    this._followPath(dt, this.ai.chaseSpeed);

    // Hit check (with cooldown to prevent rapid-fire hits)
    if (this._hitCooldown <= 0) {
      const hitDx = playerPos.x - this.x;
      const hitDz = playerPos.z - this.z;
      const distToPlayer = Math.sqrt(hitDx * hitDx + hitDz * hitDz);
      if (distToPlayer < HIT_DISTANCE) {
        this._hitCooldown = 1.0;
        if (onHit) onHit(this);
      }
    }
  }

  _updateInvestigate(dt, playerPos, playerState) {
    // Detection check — go to alert if spotted
    const detection = this._detect(playerPos, playerState, this._investigateArrived);
    if (detection.detected) {
      this._startAlert(playerPos);
      return;
    }

    if (!this._investigateArrived) {
      // Path to investigation target
      this._followPath(dt, this.ai.wanderSpeed * 1.2);

      if (this._pathIndex >= this._path.length) {
        this._investigateArrived = true;
        this._stateTimer = INVESTIGATE_DURATION;
        this._scanAngle = Math.atan2(this.forwardX, this.forwardZ);
      }
    } else {
      // Look around — rotate forward direction slowly
      this._stateTimer -= dt;
      if (this._stateTimer <= 0) {
        // Done investigating — return to wander
        this.state = CreatureState.WANDER;
        this._paused = true;
        this._pauseTimer = randomFloat(WANDER_PAUSE_MIN, WANDER_PAUSE_MAX);
        return;
      }

      // Scan by rotating
      this._scanAngle += INVESTIGATE_SCAN_SPEED * dt;
      this.forwardX = Math.sin(this._scanAngle);
      this.forwardZ = Math.cos(this._scanAngle);
    }
  }

  _updateFrozen(dt) {
    this._stateTimer -= dt;
    if (this._stateTimer <= 0) {
      // Resume chasing the player after freeze
      if (this._freezePlayerPos) {
        this._startChase(this._freezePlayerPos);
        this._freezePlayerPos = null;
      } else {
        this.state = CreatureState.WANDER;
        this._paused = true;
        this._pauseTimer = randomFloat(WANDER_PAUSE_MIN, WANDER_PAUSE_MAX);
      }
    }
  }

  _updateReturn(dt) {
    this._followPath(dt, this.ai.wanderSpeed);

    if (this._pathIndex >= this._path.length) {
      // Arrived at home room
      return true; // signals arrival to creature-manager
    }
    return false;
  }

  freeze(playerPos) {
    this.state = CreatureState.FROZEN;
    this._stateTimer = FROZEN_DURATION;
    this._path = [];
    this._pathIndex = 0;
    this._freezePlayerPos = playerPos || null;
  }

  // --- Helpers ---

  _detect(playerPos, playerState, omnidirectional = false) {
    return checkDetection(
      { x: this.x, z: this.z },
      { x: this.forwardX, z: this.forwardZ },
      { x: playerPos.x, z: playerPos.z },
      playerState,
      this.ai,
      omnidirectional,
    );
  }

  _startAlert(playerPos) {
    this._prevState = this.state;
    this.state = CreatureState.ALERT;
    this._stateTimer = 0;
    this._path = [];
    this._pathIndex = 0;
    // Face the player immediately
    const dx = playerPos.x - this.x;
    const dz = playerPos.z - this.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    if (dist > 0.001) {
      this.forwardX = dx / dist;
      this.forwardZ = dz / dist;
    }
    this._lastKnownPlayerX = playerPos.x;
    this._lastKnownPlayerZ = playerPos.z;
  }

  _startChase(playerPos) {
    this.state = CreatureState.CHASE;
    this._chaseLossTimer = 0;
    this._repathTimer = 0; // path immediately
    this._lastKnownPlayerX = playerPos.x;
    this._lastKnownPlayerZ = playerPos.z;
    this._lastKnownPlayerDirX = 0;
    this._lastKnownPlayerDirZ = 0;
    this._pathTo(playerPos.x, playerPos.z);
  }

  _startInvestigate(targetX, targetZ) {
    this.state = CreatureState.INVESTIGATE;
    this._investigateTargetX = targetX;
    this._investigateTargetZ = targetZ;
    this._investigateArrived = false;
    this._paused = false;
    this._pathTo(targetX, targetZ);
  }

  _pathTo(targetX, targetZ) {
    const startNode = getNearestNode(this.graph, this.x, this.z);
    const endNode = getNearestNode(this.graph, targetX, targetZ);
    this._path = findPath(this.graph, startNode, endNode);
    // Append the actual target position at the end for precision
    if (this._path.length > 0) {
      this._path.push({ x: targetX, z: targetZ });
    }
    this._pathIndex = 0;
  }

  _pathToRandomNode() {
    const nodes = this.graph.nodes;
    let targetIdx;

    if (this.ai.behavior === 'erratic') {
      // Nibbles: pick a far waypoint for longer wandering paths
      const currentIdx = getNearestNode(this.graph, this.x, this.z);
      let bestDist = 0;
      const candidates = [];
      for (let i = 0; i < nodes.length; i++) {
        if (i === currentIdx) continue;
        const dx = nodes[i].x - this.x;
        const dz = nodes[i].z - this.z;
        const d = Math.sqrt(dx * dx + dz * dz);
        if (d > 15) candidates.push(i);
        if (d > bestDist) {
          bestDist = d;
          targetIdx = i;
        }
      }
      if (candidates.length > 0) {
        targetIdx = candidates[Math.floor(Math.random() * candidates.length)];
      }
    } else {
      targetIdx = Math.floor(Math.random() * nodes.length);
    }

    if (targetIdx === undefined) targetIdx = Math.floor(Math.random() * nodes.length);

    const target = nodes[targetIdx];
    this._pathTo(target.x, target.z);
  }

  _teleportToRandomNode() {
    const nodes = this.graph.nodes;
    const idx = Math.floor(Math.random() * nodes.length);
    this.x = nodes[idx].x;
    this.z = nodes[idx].z;
    this._path = [];
    this._pathIndex = 0;
    this._paused = true;
    this._pauseTimer = randomFloat(1.0, 2.0);
  }

  _followPath(dt, speed) {
    if (this._pathIndex >= this._path.length) return;

    const target = this._path[this._pathIndex];
    const dx = target.x - this.x;
    const dz = target.z - this.z;
    const dist = Math.sqrt(dx * dx + dz * dz);

    if (dist < ARRIVE_DIST) {
      this._pathIndex++;
      return;
    }

    // Update facing direction
    this.forwardX = dx / dist;
    this.forwardZ = dz / dist;

    // Move
    const step = Math.min(speed * dt, dist);
    this.x += this.forwardX * step;
    this.z += this.forwardZ * step;
  }
}

function randomFloat(min, max) {
  return min + Math.random() * (max - min);
}
