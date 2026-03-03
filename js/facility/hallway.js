import * as THREE from 'three';
import { HALLWAY_WIDTH, HALLWAY_HEIGHT } from './layout-data.js';

const hallFloorMat = new THREE.MeshStandardMaterial({ color: 0x3d3d3d, roughness: 0.95 });
const hallCeilMat = new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.9 });
const hallWallMat = new THREE.MeshStandardMaterial({ color: 0x4a4a4a, roughness: 0.85 });

export class Hallway {
  constructor(hallData) {
    this.id = hallData.id;
    this.group = new THREE.Group();
    this.group.name = `hall_${this.id}`;
    this.colliders = [];

    const [sx, sz] = hallData.start;
    const [ex, ez] = hallData.end;

    const dx = ex - sx;
    const dz = ez - sz;
    const length = Math.sqrt(dx * dx + dz * dz);
    const angle = Math.atan2(dx, dz);

    // Position group at midpoint, rotated to match hallway angle
    const mx = (sx + ex) / 2;
    const mz = (sz + ez) / 2;
    this.group.position.set(mx, 0, mz);
    this.group.rotation.y = angle;

    const hw = HALLWAY_WIDTH / 2;
    const h = HALLWAY_HEIGHT;

    // Floor
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(HALLWAY_WIDTH, length),
      hallFloorMat
    );
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.group.add(floor);

    // Floor collider
    const fc = new THREE.Mesh(
      new THREE.BoxGeometry(HALLWAY_WIDTH, 0.1, length),
      new THREE.MeshBasicMaterial({ visible: false })
    );
    fc.position.y = -0.05;
    this.group.add(fc);
    this.colliders.push(fc);

    // Ceiling
    const ceil = new THREE.Mesh(
      new THREE.PlaneGeometry(HALLWAY_WIDTH, length),
      hallCeilMat
    );
    ceil.rotation.x = Math.PI / 2;
    ceil.position.y = h;
    this.group.add(ceil);

    // Left wall (local -x)
    const leftWall = new THREE.Mesh(
      new THREE.PlaneGeometry(length, h),
      hallWallMat
    );
    leftWall.position.set(-hw, h / 2, 0);
    leftWall.rotation.y = Math.PI / 2;
    leftWall.receiveShadow = true;
    this.group.add(leftWall);

    const lc = new THREE.Mesh(
      new THREE.BoxGeometry(0.2, h, length),
      new THREE.MeshBasicMaterial({ visible: false })
    );
    lc.position.set(-hw, h / 2, 0);
    this.group.add(lc);
    this.colliders.push(lc);

    // Right wall (local +x)
    const rightWall = new THREE.Mesh(
      new THREE.PlaneGeometry(length, h),
      hallWallMat
    );
    rightWall.position.set(hw, h / 2, 0);
    rightWall.rotation.y = -Math.PI / 2;
    rightWall.receiveShadow = true;
    this.group.add(rightWall);

    const rc = new THREE.Mesh(
      new THREE.BoxGeometry(0.2, h, length),
      new THREE.MeshBasicMaterial({ visible: false })
    );
    rc.position.set(hw, h / 2, 0);
    this.group.add(rc);
    this.colliders.push(rc);
  }
}
