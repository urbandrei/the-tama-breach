import * as THREE from 'three';
import { rooms, hallways, doorways, DOOR_WIDTH, DOOR_HEIGHT, HALLWAY_WIDTH, WALL_THICKNESS } from './layout-data.js';

const STRIP_HEIGHT = 0.05;
const STRIP_DEPTH = 0.04;
const STRIP_Y = STRIP_HEIGHT / 2; // sit on floor
const ROOM_INSET = WALL_THICKNESS / 2; // offset strips past wall inner face
const HALL_INSET = WALL_THICKNESS / 2; // offset hallway strips past wall inner face

export class EdgeStrips {
  constructor(scene) {
    // color: black so strips are invisible under room lighting.
    // Only the emissive channel (ramped during blackout) makes them glow.
    this._material = new THREE.MeshStandardMaterial({
      color: 0x000000,
      emissive: 0x00ff41,
      emissiveIntensity: 0,
    });

    this._buildRoomStrips(scene);
    this._buildHallwayStrips(scene);
    this._buildDoorStrips(scene);
  }

  setIntensity(value) {
    this._material.emissiveIntensity = value;
  }

  setAlert(active) {
    this._material.emissive.setHex(active ? 0xff2222 : 0x00ff41);
  }

  _buildRoomStrips(scene) {
    for (const room of rooms) {
      const [cx, cz] = room.center;
      const [w, h] = room.size;
      const halfW = w / 2;
      const halfH = h / 2;

      const roomDoors = doorways.filter(d => d.roomId === room.id);
      const doorsByWall = { north: [], south: [], east: [], west: [] };
      for (const d of roomDoors) {
        doorsByWall[d.wallSide].push(d.position);
      }

      // North wall (z = cz + halfH), strip runs along X, inset toward room (-Z)
      this._createWallStrips(scene, cx, cz + halfH - ROOM_INSET, w, 'x', doorsByWall.north);
      // South wall (z = cz - halfH), inset toward room (+Z)
      this._createWallStrips(scene, cx, cz - halfH + ROOM_INSET, w, 'x', doorsByWall.south);
      // East wall (x = cx + halfW), inset toward room (-X)
      this._createWallStrips(scene, cx + halfW - ROOM_INSET, cz, h, 'z', doorsByWall.east);
      // West wall (x = cx - halfW), inset toward room (+X)
      this._createWallStrips(scene, cx - halfW + ROOM_INSET, cz, h, 'z', doorsByWall.west);
    }
  }

  _createWallStrips(scene, wallX, wallZ, wallLength, axis, doorPositions) {
    const halfDoor = DOOR_WIDTH / 2;
    const gaps = doorPositions.map(p => [p - halfDoor, p + halfDoor]);
    gaps.sort((a, b) => a[0] - b[0]);

    const halfLen = wallLength / 2;
    const segments = [];
    let cursor = -halfLen;

    for (const [gStart, gEnd] of gaps) {
      if (gStart > cursor) {
        segments.push([cursor, gStart]);
      }
      cursor = Math.max(cursor, gEnd);
    }
    if (cursor < halfLen) {
      segments.push([cursor, halfLen]);
    }

    for (const [s, e] of segments) {
      const segLen = e - s;
      if (segLen < 0.01) continue;

      const midOffset = (s + e) / 2;
      const geo = axis === 'x'
        ? new THREE.BoxGeometry(segLen, STRIP_HEIGHT, STRIP_DEPTH)
        : new THREE.BoxGeometry(STRIP_DEPTH, STRIP_HEIGHT, segLen);

      const mesh = new THREE.Mesh(geo, this._material);

      if (axis === 'x') {
        mesh.position.set(wallX + midOffset, STRIP_Y, wallZ);
      } else {
        mesh.position.set(wallX, STRIP_Y, wallZ + midOffset);
      }

      scene.add(mesh);
    }
  }

  _buildHallwayStrips(scene) {
    for (const hall of hallways) {
      // Corner patches get L-shaped strips along outer walls only
      if (hall.id.startsWith('corner_')) {
        this._buildCornerStrips(scene, hall);
        continue;
      }

      const [sx, sz] = hall.start;
      const [ex, ez] = hall.end;

      const dx = ex - sx;
      const dz = ez - sz;
      const length = Math.sqrt(dx * dx + dz * dz);
      if (length < 0.01) continue;

      const midX = (sx + ex) / 2;
      const midZ = (sz + ez) / 2;

      const halfHW = HALLWAY_WIDTH / 2;

      if (sx === ex) {
        // N-S hallway: walls on east/west sides
        const geo = new THREE.BoxGeometry(STRIP_DEPTH, STRIP_HEIGHT, length);

        const leftStrip = new THREE.Mesh(geo, this._material);
        leftStrip.position.set(sx - halfHW + HALL_INSET, STRIP_Y, midZ);
        scene.add(leftStrip);

        const rightStrip = new THREE.Mesh(geo.clone(), this._material);
        rightStrip.position.set(sx + halfHW - HALL_INSET, STRIP_Y, midZ);
        scene.add(rightStrip);
      } else {
        // E-W hallway: walls on north/south sides
        const geo = new THREE.BoxGeometry(length, STRIP_HEIGHT, STRIP_DEPTH);

        const leftStrip = new THREE.Mesh(geo, this._material);
        leftStrip.position.set(midX, STRIP_Y, sz - halfHW + HALL_INSET);
        scene.add(leftStrip);

        const rightStrip = new THREE.Mesh(geo.clone(), this._material);
        rightStrip.position.set(midX, STRIP_Y, sz + halfHW - HALL_INSET);
        scene.add(rightStrip);
      }
    }
  }

  _buildCornerStrips(scene, hall) {
    const [sx, sz] = hall.start;
    const [ex, ez] = hall.end;
    const halfHW = HALLWAY_WIDTH / 2;
    const length = Math.abs(ex - sx);
    const midX = (sx + ex) / 2;
    const midZ = sz;

    // Outer Z edge (the side farther from Z=0) — strip runs along X
    const outerZ = midZ > 0 ? midZ + halfHW - HALL_INSET : midZ - halfHW + HALL_INSET;
    const zStrip = new THREE.Mesh(
      new THREE.BoxGeometry(length, STRIP_HEIGHT, STRIP_DEPTH),
      this._material
    );
    zStrip.position.set(midX, STRIP_Y, outerZ);
    scene.add(zStrip);

    // Outer X edge (the endpoint farther from X=0) — strip runs along Z
    const outerXEnd = Math.abs(sx) > Math.abs(ex) ? sx : ex;
    const xInset = outerXEnd > 0 ? -HALL_INSET : HALL_INSET;
    const xStrip = new THREE.Mesh(
      new THREE.BoxGeometry(STRIP_DEPTH, STRIP_HEIGHT, HALLWAY_WIDTH),
      this._material
    );
    xStrip.position.set(outerXEnd + xInset, STRIP_Y, midZ);
    scene.add(xStrip);
  }

  _buildDoorStrips(scene) {
    const doorH = DOOR_HEIGHT || 2.8;
    const halfDoor = DOOR_WIDTH / 2;
    const wallHalf = WALL_THICKNESS / 2;

    for (const dw of doorways) {
      const roomData = rooms.find(r => r.id === dw.roomId);
      if (!roomData) continue;

      const [cx, cz] = roomData.center;
      const [w, h] = roomData.size;
      const halfW = w / 2;
      const halfH = h / 2;

      let doorX, doorZ;
      const isNS = dw.wallSide === 'north' || dw.wallSide === 'south';

      // Offset strips to hallway-side face of the thick wall
      let offsetX = 0, offsetZ = 0;
      switch (dw.wallSide) {
        case 'north':
          doorX = cx + dw.position;
          doorZ = cz + halfH;
          offsetZ = wallHalf;
          break;
        case 'south':
          doorX = cx + dw.position;
          doorZ = cz - halfH;
          offsetZ = -wallHalf;
          break;
        case 'east':
          doorX = cx + halfW;
          doorZ = cz + dw.position;
          offsetX = wallHalf;
          break;
        case 'west':
          doorX = cx - halfW;
          doorZ = cz + dw.position;
          offsetX = -wallHalf;
          break;
        default:
          continue;
      }

      // Left vertical strip
      const leftGeo = new THREE.BoxGeometry(STRIP_DEPTH, doorH, STRIP_DEPTH);
      const leftStrip = new THREE.Mesh(leftGeo, this._material);
      // Right vertical strip
      const rightGeo = new THREE.BoxGeometry(STRIP_DEPTH, doorH, STRIP_DEPTH);
      const rightStrip = new THREE.Mesh(rightGeo, this._material);
      // Top horizontal strip
      let topGeo;

      if (isNS) {
        leftStrip.position.set(doorX - halfDoor, doorH / 2, doorZ + offsetZ);
        rightStrip.position.set(doorX + halfDoor, doorH / 2, doorZ + offsetZ);
        topGeo = new THREE.BoxGeometry(DOOR_WIDTH, STRIP_DEPTH, STRIP_DEPTH);
      } else {
        leftStrip.position.set(doorX + offsetX, doorH / 2, doorZ - halfDoor);
        rightStrip.position.set(doorX + offsetX, doorH / 2, doorZ + halfDoor);
        topGeo = new THREE.BoxGeometry(STRIP_DEPTH, STRIP_DEPTH, DOOR_WIDTH);
      }

      const topStrip = new THREE.Mesh(topGeo, this._material);
      topStrip.position.set(doorX + offsetX, doorH + STRIP_DEPTH, doorZ + offsetZ);

      scene.add(leftStrip);
      scene.add(rightStrip);
      scene.add(topStrip);
    }
  }
}
