import * as THREE from 'three';
import { PLAYER_RADIUS, COLLISION_RAY_COUNT } from './constants.js';

export class Physics {
  constructor() {
    this.colliders = [];
    this._raycaster = new THREE.Raycaster();
    this._rayDirections = [];

    for (let i = 0; i < COLLISION_RAY_COUNT; i++) {
      const angle = (i / COLLISION_RAY_COUNT) * Math.PI * 2;
      this._rayDirections.push(new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle)));
    }
  }

  addCollider(mesh) {
    this.colliders.push(mesh);
  }

  addColliders(meshes) {
    for (const mesh of meshes) {
      this.colliders.push(mesh);
    }
  }

  clearColliders() {
    this.colliders = [];
  }

  checkGrounded(position, height) {
    this._raycaster.set(
      new THREE.Vector3(position.x, position.y, position.z),
      new THREE.Vector3(0, -1, 0)
    );
    this._raycaster.far = height + 0.1;
    const hits = this._raycaster.intersectObjects(this.colliders, false);
    if (hits.length > 0) {
      return { grounded: true, groundY: hits[0].point.y };
    }
    return { grounded: false, groundY: null };
  }

  _getWorldNormal(hit, fallbackDir) {
    if (hit.face) {
      const normal = hit.face.normal.clone();
      // Transform from object-local to world space
      normal.transformDirection(hit.object.matrixWorld);
      return normal;
    }
    return fallbackDir.clone().negate();
  }

  moveWithCollision(position, velocity, dt) {
    const desiredMove = new THREE.Vector3(
      velocity.x * dt,
      0,
      velocity.z * dt
    );

    if (desiredMove.lengthSq() < 0.0001) {
      return desiredMove;
    }

    const finalMove = desiredMove.clone();
    // Cast rays from mid-body height (offset down from eye level)
    const origin = new THREE.Vector3(position.x, position.y - 0.7, position.z);

    // First pass: resolve existing penetrations
    for (const dir of this._rayDirections) {
      this._raycaster.set(origin, dir);
      this._raycaster.far = PLAYER_RADIUS + 0.05;

      const hits = this._raycaster.intersectObjects(this.colliders, false);
      if (hits.length > 0) {
        const hit = hits[0];
        const penetration = PLAYER_RADIUS - hit.distance;
        if (penetration > 0) {
          const normal = this._getWorldNormal(hit, dir);
          normal.y = 0;
          normal.normalize();

          const pushBack = normal.multiplyScalar(penetration + 0.01);
          finalMove.add(pushBack);
        }
      }
    }

    // Second pass: check new position for remaining penetrations
    const newPos = origin.clone().add(finalMove);

    for (const dir of this._rayDirections) {
      this._raycaster.set(newPos, dir);
      this._raycaster.far = PLAYER_RADIUS;

      const hits = this._raycaster.intersectObjects(this.colliders, false);
      if (hits.length > 0) {
        const hit = hits[0];
        const penetration = PLAYER_RADIUS - hit.distance;
        if (penetration > 0) {
          const normal = this._getWorldNormal(hit, dir);
          normal.y = 0;
          normal.normalize();
          newPos.add(normal.multiplyScalar(penetration + 0.01));
        }
      }
    }

    finalMove.x = newPos.x - origin.x;
    finalMove.z = newPos.z - origin.z;

    return finalMove;
  }
}
