import * as THREE from 'three';
import { WALL_THICKNESS, DOOR_WIDTH, DOOR_HEIGHT } from './layout-data.js';

// Shared materials
const floorMat = new THREE.MeshStandardMaterial({ color: 0x444444, roughness: 0.92 });
const ceilingMat = new THREE.MeshStandardMaterial({ color: 0x3a3a3a, roughness: 0.9 });
const wallMat = new THREE.MeshStandardMaterial({ color: 0x555555, roughness: 0.85 });

export class Room {
  constructor(roomData, doorways) {
    this.id = roomData.id;
    this.data = roomData;
    this.group = new THREE.Group();
    this.group.name = `room_${this.id}`;
    this.colliders = [];

    const [cx, cz] = roomData.center;
    const [w, d] = roomData.size;
    const h = roomData.ceilingHeight;

    this.group.position.set(cx, 0, cz);

    // Doorways that belong to this room
    const myDoorways = doorways.filter(dw => dw.roomId === this.id);

    this._buildFloor(w, d);
    this._buildCeiling(w, d, h);
    this._buildWalls(w, d, h, myDoorways);
  }

  _buildFloor(w, d) {
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(w, d), floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.group.add(floor);

    // Floor collider
    const fc = new THREE.Mesh(
      new THREE.BoxGeometry(w, 0.1, d),
      new THREE.MeshBasicMaterial({ visible: false })
    );
    fc.position.y = -0.05;
    this.group.add(fc);
    this.colliders.push(fc);
  }

  _buildCeiling(w, d, h) {
    const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(w, d), ceilingMat);
    ceiling.rotation.x = Math.PI / 2;
    ceiling.position.y = h;
    this.group.add(ceiling);
  }

  _buildWalls(w, d, h, doorways) {
    const hw = w / 2;
    const hd = d / 2;

    // Each wall: [axis along wall, wall length, position, rotation, side name]
    const wallDefs = [
      { side: 'north', length: w, pos: [0, h / 2, hd], rotY: Math.PI, along: 'x' },
      { side: 'south', length: w, pos: [0, h / 2, -hd], rotY: 0, along: 'x' },
      { side: 'east', length: d, pos: [hw, h / 2, 0], rotY: -Math.PI / 2, along: 'z' },
      { side: 'west', length: d, pos: [-hw, h / 2, 0], rotY: Math.PI / 2, along: 'z' },
    ];

    for (const wd of wallDefs) {
      const sideDoorways = doorways.filter(dw => dw.wallSide === wd.side);

      if (sideDoorways.length === 0) {
        // Solid wall - no doorways
        this._addSolidWall(wd, h);
      } else {
        // Wall with doorway cutouts
        for (const dw of sideDoorways) {
          this._addWallWithDoorway(wd, h, dw.position);
        }
      }
    }
  }

  _addSolidWall(wd, h) {
    // Visual wall
    const wall = new THREE.Mesh(
      new THREE.PlaneGeometry(wd.length, h),
      wallMat
    );
    wall.position.set(...wd.pos);
    wall.rotation.y = wd.rotY;
    wall.receiveShadow = true;
    this.group.add(wall);

    // Collider
    const isXWall = wd.along === 'x';
    const collider = new THREE.Mesh(
      new THREE.BoxGeometry(
        isXWall ? wd.length : WALL_THICKNESS,
        h,
        isXWall ? WALL_THICKNESS : wd.length
      ),
      new THREE.MeshBasicMaterial({ visible: false })
    );
    collider.position.set(...wd.pos);
    this.group.add(collider);
    this.colliders.push(collider);
  }

  _addWallWithDoorway(wd, h, doorOffset) {
    const halfLen = wd.length / 2;
    const halfDoor = DOOR_WIDTH / 2;
    const doorCenter = doorOffset; // offset along wall, 0 = center

    const leftLen = halfLen + doorCenter - halfDoor;
    const rightLen = halfLen - doorCenter - halfDoor;

    const isXWall = wd.along === 'x';

    // Left segment
    if (leftLen > 0.01) {
      const leftCenter = -halfLen + leftLen / 2;
      this._addWallSegment(wd, h, leftCenter, leftLen, isXWall);
    }

    // Right segment
    if (rightLen > 0.01) {
      const rightCenter = halfLen - rightLen / 2;
      this._addWallSegment(wd, h, rightCenter, rightLen, isXWall);
    }

    // Lintel above door
    const lintelH = h - DOOR_HEIGHT;
    if (lintelH > 0.01) {
      const lintelY = DOOR_HEIGHT + lintelH / 2;

      const lintel = new THREE.Mesh(
        new THREE.PlaneGeometry(DOOR_WIDTH, lintelH),
        wallMat
      );
      if (isXWall) {
        lintel.position.set(wd.pos[0] + doorCenter, lintelY, wd.pos[2]);
      } else {
        lintel.position.set(wd.pos[0], lintelY, wd.pos[2] + doorCenter);
      }
      lintel.rotation.y = wd.rotY;
      lintel.receiveShadow = true;
      this.group.add(lintel);

      // Lintel collider
      const lc = new THREE.Mesh(
        new THREE.BoxGeometry(
          isXWall ? DOOR_WIDTH : WALL_THICKNESS,
          lintelH,
          isXWall ? WALL_THICKNESS : DOOR_WIDTH
        ),
        new THREE.MeshBasicMaterial({ visible: false })
      );
      lc.position.copy(lintel.position);
      this.group.add(lc);
      this.colliders.push(lc);
    }
  }

  _addWallSegment(wd, h, centerOffset, segLen, isXWall) {
    // Visual segment
    const seg = new THREE.Mesh(
      new THREE.PlaneGeometry(segLen, h),
      wallMat
    );
    if (isXWall) {
      seg.position.set(wd.pos[0] + centerOffset, wd.pos[1], wd.pos[2]);
    } else {
      seg.position.set(wd.pos[0], wd.pos[1], wd.pos[2] + centerOffset);
    }
    seg.rotation.y = wd.rotY;
    seg.receiveShadow = true;
    this.group.add(seg);

    // Collider
    const collider = new THREE.Mesh(
      new THREE.BoxGeometry(
        isXWall ? segLen : WALL_THICKNESS,
        h,
        isXWall ? WALL_THICKNESS : segLen
      ),
      new THREE.MeshBasicMaterial({ visible: false })
    );
    collider.position.copy(seg.position);
    this.group.add(collider);
    this.colliders.push(collider);
  }
}
