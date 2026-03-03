import * as THREE from 'three';
import { rooms, hallways, doorways, DOOR_WIDTH, DOOR_HEIGHT, HALLWAY_WIDTH } from './layout-data.js';

const STRIP_HEIGHT = 0.05;
const STRIP_DEPTH = 0.04;
const STRIP_Y = STRIP_HEIGHT / 2; // sit on floor
const ROOM_INSET = 0.03; // offset strips into room so they're visible from inside

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
        leftStrip.position.set(sx - halfHW, STRIP_Y, midZ);
        scene.add(leftStrip);

        const rightStrip = new THREE.Mesh(geo.clone(), this._material);
        rightStrip.position.set(sx + halfHW, STRIP_Y, midZ);
        scene.add(rightStrip);
      } else {
        // E-W hallway: walls on north/south sides
        const geo = new THREE.BoxGeometry(length, STRIP_HEIGHT, STRIP_DEPTH);

        const leftStrip = new THREE.Mesh(geo, this._material);
        leftStrip.position.set(midX, STRIP_Y, sz - halfHW);
        scene.add(leftStrip);

        const rightStrip = new THREE.Mesh(geo.clone(), this._material);
        rightStrip.position.set(midX, STRIP_Y, sz + halfHW);
        scene.add(rightStrip);
      }
    }
  }

  _buildDoorStrips(scene) {
    const doorH = DOOR_HEIGHT || 2.8;
    const halfDoor = DOOR_WIDTH / 2;

    for (const dw of doorways) {
      const roomData = rooms.find(r => r.id === dw.roomId);
      if (!roomData) continue;

      const [cx, cz] = roomData.center;
      const [w, h] = roomData.size;
      const halfW = w / 2;
      const halfH = h / 2;

      let doorX, doorZ;
      const isNS = dw.wallSide === 'north' || dw.wallSide === 'south';

      switch (dw.wallSide) {
        case 'north':
          doorX = cx + dw.position;
          doorZ = cz + halfH;
          break;
        case 'south':
          doorX = cx + dw.position;
          doorZ = cz - halfH;
          break;
        case 'east':
          doorX = cx + halfW;
          doorZ = cz + dw.position;
          break;
        case 'west':
          doorX = cx - halfW;
          doorZ = cz + dw.position;
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
        leftStrip.position.set(doorX - halfDoor, doorH / 2, doorZ);
        rightStrip.position.set(doorX + halfDoor, doorH / 2, doorZ);
        topGeo = new THREE.BoxGeometry(DOOR_WIDTH, STRIP_DEPTH, STRIP_DEPTH);
      } else {
        leftStrip.position.set(doorX, doorH / 2, doorZ - halfDoor);
        rightStrip.position.set(doorX, doorH / 2, doorZ + halfDoor);
        topGeo = new THREE.BoxGeometry(STRIP_DEPTH, STRIP_DEPTH, DOOR_WIDTH);
      }

      const topStrip = new THREE.Mesh(topGeo, this._material);
      topStrip.position.set(doorX, doorH, doorZ);

      scene.add(leftStrip);
      scene.add(rightStrip);
      scene.add(topStrip);
    }
  }
}
