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
const WANDER_PAUSE_MIN = 0.5;
const WANDER_PAUSE_MAX = 2.0;
const DIRECT_CHASE_RANGE = 6.0;
const CHASE_REPATH_INTERVAL = 0.5;
const CHASE_LOSS_TIME = 12.0;
const ALERT_LOCK_TIME = 0.5;
const ALERT_APPROACH_SPEED_MULT = 0.7;
const INVESTIGATE_SCAN_SPEED = 1.5;
const INVESTIGATE_PATROL_RADIUS = 6.0;
const INVESTIGATE_PATROL_PAUSE = 0.3;
const INVESTIGATE_PATROL_COUNT = 2;
const PREDICT_DISTANCE = 10.0;
const FROZEN_DURATION = 0.4;
const HIT_DISTANCE = 1.2;
const TELEPORT_MIN = 15.0;
const TELEPORT_MAX = 20.0;

export class CreatureAI {
  constructor(graph, personality, startX, startZ, doors) {
    this.graph = graph;
    this.personality = personality;
    this.ai = personality.ai;
    this.doors = doors || [];

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
    this._investigatePatrolNodes = [];
    this._investigatePatrolIndex = 0;
    this._investigatePatrolPause = 0;
    this._scanAngle = 0;

    // Escalation — escaped specimens get harder over time (B1)
    this._escapeTimer = 0;
    this._escalationSpeedCap = 2.0;
    this._escalationRangeCap = 2.0;
    this._escalationHuntTime = 30; // seconds before active hunting
  }

  /** Escalation multiplier — increases over time while escaped (B1). */
  get _speedMult() {
    return Math.min(this._escalationSpeedCap, 1 + this._escapeTimer * 0.05);
  }
  get _rangeMult() {
    return Math.min(this._escalationRangeCap, 1 + this._escapeTimer * 0.03);
  }

  update(dt, playerPos, playerState, onHit) {
    this._escapeTimer += dt;

    // After escalation hunt time, actively pathfind toward last known player pos
    if (this.state === CreatureState.WANDER && this._escapeTimer >= this._escalationHuntTime) {
      this._startInvestigate(playerPos.x, playerPos.z);
    }

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
        this._updateFrozen(dt, playerPos);
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

    // Follow path (escalated speed — B1)
    this._followPath(dt, this.ai.wanderSpeed * this._speedMult);

    // Arrived at destination
    if (this._pathIndex >= this._path.length) {
      this._paused = true;
      this._pauseTimer = randomFloat(WANDER_PAUSE_MIN, WANDER_PAUSE_MAX);
    }
  }

  _updateAlert(dt, playerPos, playerState) {
    // Walk toward player while alert (not stationary)
    const alertSpeed = this.ai.wanderSpeed * ALERT_APPROACH_SPEED_MULT * this._speedMult;
    this._followPath(dt, alertSpeed);
    this._repathTimer -= dt;
    if (this._repathTimer <= 0) {
      this._repathTimer = 0.5;
      this._pathTo(playerPos.x, playerPos.z);
    }

    // Face the player AFTER movement (overrides _followPath's direction)
    const dx = playerPos.x - this.x;
    const dz = playerPos.z - this.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    if (dist > 0.001) {
      this.forwardX = dx / dist;
      this.forwardZ = dz / dist;
    }

    // Directional detection (creature is facing the player)
    const detection = this._detect(playerPos, playerState, false);

    this._stateTimer += dt;

    if (detection.detected) {
      this._lastKnownPlayerX = playerPos.x;
      this._lastKnownPlayerZ = playerPos.z;
      if (this._stateTimer >= ALERT_LOCK_TIME) {
        this._startChase(playerPos);
      }
    } else {
      // Detection lost — investigate where we last saw the player (no pause)
      this._startInvestigate(this._lastKnownPlayerX, this._lastKnownPlayerZ);
    }
  }

  _updateChase(dt, playerPos, playerState, onHit) {
    if (this._hitCooldown > 0) this._hitCooldown -= dt;

    const dx = playerPos.x - this.x;
    const dz = playerPos.z - this.z;
    const distToPlayer = Math.sqrt(dx * dx + dz * dz);

    // Detection check (omnidirectional briefly after unfreeze so creature re-acquires player)
    if (this._postFreezeOmni > 0) this._postFreezeOmni -= dt;
    const detection = this._detect(playerPos, playerState, this._postFreezeOmni > 0);
    if (detection.detected) {
      this._chaseLossTimer = 0;
      // Track player movement direction
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
        const predictX = this._lastKnownPlayerX + this._lastKnownPlayerDirX * PREDICT_DISTANCE;
        const predictZ = this._lastKnownPlayerZ + this._lastKnownPlayerDirZ * PREDICT_DISTANCE;
        this._startInvestigate(predictX, predictZ);
        return;
      }
      // If already at last known position with no path left, investigate immediately
      // (prevents standing still staring at a wall for 12s)
      if (this._pathIndex >= this._path.length) {
        const lkDx = this._lastKnownPlayerX - this.x;
        const lkDz = this._lastKnownPlayerZ - this.z;
        if (Math.sqrt(lkDx * lkDx + lkDz * lkDz) < ARRIVE_DIST) {
          const predictX = this._lastKnownPlayerX + this._lastKnownPlayerDirX * PREDICT_DISTANCE;
          const predictZ = this._lastKnownPlayerZ + this._lastKnownPlayerDirZ * PREDICT_DISTANCE;
          this._startInvestigate(predictX, predictZ);
          return;
        }
      }
    }

    const chaseSpeed = this.ai.chaseSpeed * this._speedMult;

    // Direct pursuit when close + detected — skip waypoints entirely
    if (detection.detected && distToPlayer < DIRECT_CHASE_RANGE) {
      this.forwardX = dx / distToPlayer;
      this.forwardZ = dz / distToPlayer;
      const step = Math.min(chaseSpeed * dt, distToPlayer);
      this.x += this.forwardX * step;
      this.z += this.forwardZ * step;
    } else {
      // Waypoint pathing for longer range or when sight is lost
      this._repathTimer -= dt;
      if (this._repathTimer <= 0) {
        this._repathTimer = CHASE_REPATH_INTERVAL;
        if (detection.detected) {
          this._pathTo(playerPos.x, playerPos.z);
        } else {
          // Path toward last known position (not omniscient actual position)
          this._pathTo(this._lastKnownPlayerX, this._lastKnownPlayerZ);
        }
      }
      this._followPath(dt, chaseSpeed);
    }

    // Face toward player/last-known after movement (so next frame's detection works)
    if (detection.detected && distToPlayer > 0.001) {
      this.forwardX = dx / distToPlayer;
      this.forwardZ = dz / distToPlayer;
    } else {
      const lkDx = this._lastKnownPlayerX - this.x;
      const lkDz = this._lastKnownPlayerZ - this.z;
      const lkDist = Math.sqrt(lkDx * lkDx + lkDz * lkDz);
      if (lkDist > 0.001) {
        this.forwardX = lkDx / lkDist;
        this.forwardZ = lkDz / lkDist;
      }
    }

    // Hit check
    if (this._hitCooldown <= 0 && distToPlayer < HIT_DISTANCE) {
      this._hitCooldown = 1.0;
      if (onHit) onHit(this);
    }
  }

  _updateInvestigate(dt, playerPos, playerState) {
    // Detection check — omnidirectional (creature is actively searching)
    const detection = this._detect(playerPos, playerState, true);
    if (detection.detected) {
      this._startAlert(playerPos);
      return;
    }

    if (!this._investigateArrived) {
      // Phase 1: Path to investigation target (escalated — B1)
      this._followPath(dt, this.ai.wanderSpeed * 1.2 * this._speedMult);

      if (this._pathIndex >= this._path.length) {
        this._investigateArrived = true;
        this._investigatePatrolNodes = this._pickPatrolNodes(
          this._investigateTargetX, this._investigateTargetZ,
        );
        this._investigatePatrolIndex = 0;
        this._investigatePatrolPause = 0;

        if (this._investigatePatrolNodes.length === 0) {
          // No patrol nodes nearby — go straight to wander
          this.state = CreatureState.WANDER;
          this._paused = false;
          this._pathToRandomNode();
          return;
        }

        const first = this._investigatePatrolNodes[0];
        this._pathTo(first.x, first.z);
      }
    } else {
      // Phase 2: Patrol nearby nodes
      if (this._investigatePatrolPause > 0) {
        // Brief scan pause at patrol node
        this._investigatePatrolPause -= dt;
        this._scanAngle += INVESTIGATE_SCAN_SPEED * dt;
        this.forwardX = Math.sin(this._scanAngle);
        this.forwardZ = Math.cos(this._scanAngle);
        return;
      }

      this._followPath(dt, this.ai.wanderSpeed * this._speedMult);

      if (this._pathIndex >= this._path.length) {
        this._investigatePatrolIndex++;

        if (this._investigatePatrolIndex >= this._investigatePatrolNodes.length) {
          // All patrol nodes visited — done, start wandering (no pause)
          this.state = CreatureState.WANDER;
          this._paused = false;
          this._pathToRandomNode();
          return;
        }

        // Brief scan pause at this node
        this._investigatePatrolPause = INVESTIGATE_PATROL_PAUSE;
        this._scanAngle = Math.atan2(this.forwardX, this.forwardZ);

        // Path to next patrol node
        const next = this._investigatePatrolNodes[this._investigatePatrolIndex];
        this._pathTo(next.x, next.z);
      }
    }
  }

  _updateFrozen(dt, playerPos) {
    this._stateTimer -= dt;
    if (this._stateTimer <= 0) {
      // Resume chasing using the player's CURRENT position (not stale freeze pos)
      if (this._freezePlayerPos) {
        this._startChase(playerPos || this._freezePlayerPos);
        this._freezePlayerPos = null;
        this._postFreezeOmni = 2.0;  // omnidirectional detection for 2s after unfreeze
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
    // Apply escalation range multiplier (B1)
    const scaledAi = {
      ...this.ai,
      detectionRange: this.ai.detectionRange * this._rangeMult,
      soundRange: this.ai.soundRange * this._rangeMult,
    };
    const result = checkDetection(
      { x: this.x, z: this.z },
      { x: this.forwardX, z: this.forwardZ },
      { x: playerPos.x, z: playerPos.z },
      playerState,
      scaledAi,
      omnidirectional,
    );
    // Closed doors block detection
    if (result.detected && this._doorBlocksView(playerPos)) {
      return { detected: false, direction: result.direction };
    }
    return result;
  }

  _doorBlocksView(playerPos) {
    for (const door of this.doors) {
      if (door._targetOpen > 0.5 || door.locked) continue;
      const doorPos = door.group.position;
      // Point-to-segment projection: is the door between us and the player?
      const abx = playerPos.x - this.x;
      const abz = playerPos.z - this.z;
      const abLenSq = abx * abx + abz * abz;
      if (abLenSq < 0.001) continue;
      const apx = doorPos.x - this.x;
      const apz = doorPos.z - this.z;
      const t = (apx * abx + apz * abz) / abLenSq;
      if (t < 0.05 || t > 0.95) continue; // door not between us
      const closestX = this.x + t * abx;
      const closestZ = this.z + t * abz;
      const dx = doorPos.x - closestX;
      const dz = doorPos.z - closestZ;
      if (dx * dx + dz * dz < 2.0 * 2.0) return true;
    }
    return false;
  }

  _startAlert(playerPos) {
    this._prevState = this.state;
    this.state = CreatureState.ALERT;
    this._stateTimer = 0;
    // Path toward the player (walk during alert, not stand still)
    this._pathTo(playerPos.x, playerPos.z);
    this._repathTimer = 0.5;
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
    this._investigatePatrolNodes = [];
    this._investigatePatrolIndex = 0;
    this._investigatePatrolPause = 0;
    this._paused = false;
    this._pathTo(targetX, targetZ);
  }

  _pathTo(targetX, targetZ) {
    const startNode = getNearestNode(this.graph, this.x, this.z);
    const endNode = getNearestNode(this.graph, targetX, targetZ);
    this._path = findPath(this.graph, startNode, endNode);
    if (this._path.length > 0) {
      this._path.push({ x: targetX, z: targetZ });
    }
    this._pathIndex = 0;

    // Skip first node if it's behind us (prevents backward zig-zag)
    if (this._path.length >= 2) {
      const first = this._path[0];
      const toTargetX = targetX - this.x;
      const toTargetZ = targetZ - this.z;
      const toFirstX = first.x - this.x;
      const toFirstZ = first.z - this.z;
      if (toTargetX * toFirstX + toTargetZ * toFirstZ < 0) {
        this._pathIndex = 1;
      }
    }
  }

  _pathToRandomNode() {
    const nodes = this.graph.nodes;
    const currentIdx = getNearestNode(this.graph, this.x, this.z);

    // Build weighted candidate list: skip nearby nodes, prefer hallways
    const candidates = [];
    for (let i = 0; i < nodes.length; i++) {
      if (i === currentIdx) continue;
      const dx = nodes[i].x - this.x;
      const dz = nodes[i].z - this.z;
      const d = Math.sqrt(dx * dx + dz * dz);
      if (d < 10) continue; // skip nearby — force long traversals
      const isHallway = nodes[i].id.startsWith('hall_') || nodes[i].id.startsWith('corner_');
      const weight = isHallway ? 3 : 1;
      for (let w = 0; w < weight; w++) candidates.push(i);
    }

    let targetIdx;
    if (candidates.length > 0) {
      targetIdx = candidates[Math.floor(Math.random() * candidates.length)];
    } else {
      targetIdx = Math.floor(Math.random() * nodes.length);
    }

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

  _pickPatrolNodes(centerX, centerZ) {
    const nodes = this.graph.nodes;
    const candidates = [];
    for (let i = 0; i < nodes.length; i++) {
      const dx = nodes[i].x - centerX;
      const dz = nodes[i].z - centerZ;
      const d = Math.sqrt(dx * dx + dz * dz);
      if (d <= INVESTIGATE_PATROL_RADIUS && d > ARRIVE_DIST) {
        candidates.push({ x: nodes[i].x, z: nodes[i].z });
      }
    }
    // Partial Fisher-Yates shuffle, pick up to INVESTIGATE_PATROL_COUNT
    const count = Math.min(INVESTIGATE_PATROL_COUNT, candidates.length);
    for (let i = 0; i < count; i++) {
      const j = i + Math.floor(Math.random() * (candidates.length - i));
      const tmp = candidates[i];
      candidates[i] = candidates[j];
      candidates[j] = tmp;
    }
    return candidates.slice(0, count);
  }

  _followPath(dt, speed) {
    if (this._pathIndex >= this._path.length) return;

    // Skip all waypoints we've already reached (don't waste frames)
    while (this._pathIndex < this._path.length) {
      const wp = this._path[this._pathIndex];
      const wdx = wp.x - this.x;
      const wdz = wp.z - this.z;
      if (Math.sqrt(wdx * wdx + wdz * wdz) >= ARRIVE_DIST) break;
      this._pathIndex++;
    }

    if (this._pathIndex >= this._path.length) return;

    const target = this._path[this._pathIndex];
    const dx = target.x - this.x;
    const dz = target.z - this.z;
    const d = Math.sqrt(dx * dx + dz * dz);

    this.forwardX = dx / d;
    this.forwardZ = dz / d;

    const step = Math.min(speed * dt, d);
    this.x += this.forwardX * step;
    this.z += this.forwardZ * step;
  }
}

function randomFloat(min, max) {
  return min + Math.random() * (max - min);
}
