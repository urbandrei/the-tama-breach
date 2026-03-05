/**
 * Player detection system for escaped creatures.
 * Checks vision cone and sound-based detection.
 */

const CROUCH_RANGE_MULT = 0.4; // crouching reduces detection ranges by 60%

/**
 * Check if a creature can detect the player.
 *
 * @param {object} creaturePos  - {x, z} world position of the creature
 * @param {object} creatureFwd  - {x, z} normalized facing direction
 * @param {object} playerPos    - {x, z} world position of the player
 * @param {object} playerState  - {isSprinting, isCrouching, isPushingCart}
 * @param {object} ai           - personality.ai config {detectionRange, detectionAngle, soundRange}
 * @param {boolean} omnidirectional - if true, skip vision cone angle check (360° detection)
 * @returns {{ detected: boolean, direction: {x: number, z: number} }}
 */
export function checkDetection(creaturePos, creatureFwd, playerPos, playerState, ai, omnidirectional = false) {
  const dx = playerPos.x - creaturePos.x;
  const dz = playerPos.z - creaturePos.z;
  const distSq = dx * dx + dz * dz;
  const dist = Math.sqrt(distSq);

  const rangeMult = playerState.isCrouching ? CROUCH_RANGE_MULT : 1.0;

  // Direction from creature to player (normalized)
  const direction = dist > 0.001
    ? { x: dx / dist, z: dz / dist }
    : { x: 0, z: 1 };

  // 1. Sound detection: sprinting or pushing cart within soundRange
  if (playerState.isSprinting || playerState.isPushingCart) {
    const soundRange = ai.soundRange * rangeMult;
    if (dist <= soundRange) {
      return { detected: true, direction };
    }
  }

  // 2. Vision cone: within detectionRange AND within detectionAngle
  const visualRange = ai.detectionRange * rangeMult;
  if (dist <= visualRange) {
    if (omnidirectional) {
      // 360° detection (creature is idle / looking around)
      return { detected: true, direction };
    }
    // Angle between creature forward and direction to player
    const dot = creatureFwd.x * direction.x + creatureFwd.z * direction.z;
    const halfAngle = ai.detectionAngle / 2;
    // dot = cos(angle), so check if cos(angle) >= cos(halfAngle)
    if (dot >= Math.cos(halfAngle)) {
      return { detected: true, direction };
    }
  }

  return { detected: false, direction };
}
