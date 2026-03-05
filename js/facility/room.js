import * as THREE from 'three';
import { WALL_THICKNESS, DOOR_WIDTH, DOOR_HEIGHT } from './layout-data.js';

// Shared materials
const floorMat = new THREE.MeshStandardMaterial({ color: 0x444444, roughness: 0.92 });
const ceilingMat = new THREE.MeshStandardMaterial({ color: 0x3a3a3a, roughness: 0.9 });
const wallMat = new THREE.MeshStandardMaterial({ color: 0x555555, roughness: 0.85 });
const glassWallMat = new THREE.MeshStandardMaterial({
  color: 0x88ccff,
  transparent: true,
  opacity: 0.25,
  roughness: 0.1,
  metalness: 0.2,
  depthWrite: false,
});

export class Room {
  constructor(roomData, doorways, options = {}) {
    this.id = roomData.id;
    this.data = roomData;
    this.group = new THREE.Group();
    this.group.name = `room_${this.id}`;
    this.colliders = [];
    this.glassPanels = [];

    this._glassWall = options.glassWall || null;
    this._noCeiling = options.noCeiling || false;

    const [cx, cz] = roomData.center;
    const [w, d] = roomData.size;
    const h = roomData.ceilingHeight;

    this.group.position.set(cx, 0, cz);

    // Doorways that belong to this room
    const myDoorways = doorways.filter(dw => dw.roomId === this.id);

    this._buildFloor(w, d);
    if (!this._noCeiling) this._buildCeiling(w, d, h);
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
      // X-walls extend past Z-walls at corners for clean L-shapes (overshoot avoids coplanar z-fighting)
      { side: 'north', length: w + WALL_THICKNESS + 0.02, pos: [0, h / 2, hd], along: 'x' },
      { side: 'south', length: w + WALL_THICKNESS + 0.02, pos: [0, h / 2, -hd], along: 'x' },
      { side: 'east', length: d, pos: [hw, h / 2, 0], along: 'z' },
      { side: 'west', length: d, pos: [-hw, h / 2, 0], along: 'z' },
    ];

    for (const wd of wallDefs) {
      const sideDoorways = doorways.filter(dw => dw.wallSide === wd.side);

      if (sideDoorways.length === 0) {
        // Solid wall (or glass wall) - no doorways
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
    const isGlass = this._glassWall === wd.side;
    const mat = isGlass ? glassWallMat : wallMat;
    const isXWall = wd.along === 'x';

    const wall = new THREE.Mesh(
      new THREE.BoxGeometry(
        isXWall ? wd.length : WALL_THICKNESS,
        h,
        isXWall ? WALL_THICKNESS : wd.length
      ),
      mat
    );
    wall.position.set(...wd.pos);
    if (!isGlass) {
      wall.castShadow = true;
      wall.receiveShadow = true;
    }
    this.group.add(wall);
    this.colliders.push(wall);

    if (isGlass) {
      this.glassPanels.push(wall);
    }
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
        new THREE.BoxGeometry(
          isXWall ? DOOR_WIDTH : WALL_THICKNESS,
          lintelH,
          isXWall ? WALL_THICKNESS : DOOR_WIDTH
        ),
        wallMat
      );
      if (isXWall) {
        lintel.position.set(wd.pos[0] + doorCenter, lintelY, wd.pos[2]);
      } else {
        lintel.position.set(wd.pos[0], lintelY, wd.pos[2] + doorCenter);
      }
      lintel.castShadow = true;
      lintel.receiveShadow = true;
      this.group.add(lintel);
      this.colliders.push(lintel);
    }
  }

  _addWallSegment(wd, h, centerOffset, segLen, isXWall) {
    const seg = new THREE.Mesh(
      new THREE.BoxGeometry(
        isXWall ? segLen : WALL_THICKNESS,
        h,
        isXWall ? WALL_THICKNESS : segLen
      ),
      wallMat
    );
    if (isXWall) {
      seg.position.set(wd.pos[0] + centerOffset, wd.pos[1], wd.pos[2]);
    } else {
      seg.position.set(wd.pos[0], wd.pos[1], wd.pos[2] + centerOffset);
    }
    seg.castShadow = true;
    seg.receiveShadow = true;
    this.group.add(seg);
    this.colliders.push(seg);
  }
}
