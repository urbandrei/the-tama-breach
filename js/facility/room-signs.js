import * as THREE from 'three';
import { rooms, hallways, doorways, DOOR_HEIGHT } from './layout-data.js';

const SIGN_WIDTH = 2.0;
const SIGN_HEIGHT = 0.35;
const SIGN_Y = (DOOR_HEIGHT || 2.8) + 0.2;
const WALL_OFFSET = 0.15; // offset from wall face to avoid z-fighting

export class RoomSigns {
  constructor(scene) {
    this._signs = [];
    this._materials = [];
    this._destMap = this._buildDestinationMap();
    this._buildSigns(scene);
  }

  /**
   * For each doorway, find which room is on the other end of the hallway.
   * Returns a Map keyed by doorway index → destination room label.
   */
  _buildDestinationMap() {
    const destMap = new Map();

    for (let i = 0; i < doorways.length; i++) {
      const dw = doorways[i];
      const room = rooms.find(r => r.id === dw.roomId);
      if (!room) continue;

      const [cx, cz] = room.center;
      const [w, h] = room.size;

      // Compute wall-face world coordinate for this doorway
      let wallX, wallZ;
      switch (dw.wallSide) {
        case 'north': wallX = cx + dw.position; wallZ = cz + h / 2; break;
        case 'south': wallX = cx + dw.position; wallZ = cz - h / 2; break;
        case 'east':  wallX = cx + w / 2; wallZ = cz + dw.position; break;
        case 'west':  wallX = cx - w / 2; wallZ = cz + dw.position; break;
        default: continue;
      }

      // Find hallway with an endpoint matching this doorway position
      for (const hall of hallways) {
        const [sx, sz] = hall.start;
        const [ex, ez] = hall.end;

        const startDist = Math.abs(sx - wallX) + Math.abs(sz - wallZ);
        const endDist = Math.abs(ex - wallX) + Math.abs(ez - wallZ);

        let otherEnd = null;
        if (startDist < 1.5) otherEnd = [ex, ez];
        else if (endDist < 1.5) otherEnd = [sx, sz];

        if (otherEnd) {
          const destRoom = this._findRoomAtWall(otherEnd[0], otherEnd[1]);
          if (destRoom) {
            destMap.set(i, destRoom.label);
          }
          break;
        }
      }
    }

    return destMap;
  }

  /** Find which room has a wall at the given world coordinate. */
  _findRoomAtWall(x, z) {
    for (const r of rooms) {
      const [cx, cz] = r.center;
      const [w, h] = r.size;
      const tol = 1.5;

      // North wall
      if (Math.abs(z - (cz + h / 2)) < tol && x >= cx - w / 2 - tol && x <= cx + w / 2 + tol) return r;
      // South wall
      if (Math.abs(z - (cz - h / 2)) < tol && x >= cx - w / 2 - tol && x <= cx + w / 2 + tol) return r;
      // East wall
      if (Math.abs(x - (cx + w / 2)) < tol && z >= cz - h / 2 - tol && z <= cz + h / 2 + tol) return r;
      // West wall
      if (Math.abs(x - (cx - w / 2)) < tol && z >= cz - h / 2 - tol && z <= cz + h / 2 + tol) return r;
    }
    return null;
  }

  _buildSigns(scene) {
    for (let i = 0; i < doorways.length; i++) {
      const dw = doorways[i];
      const roomData = rooms.find(r => r.id === dw.roomId);
      if (!roomData) continue;

      const [cx, cz] = roomData.center;
      const [w, h] = roomData.size;
      const halfW = w / 2;
      const halfH = h / 2;

      let doorX, doorZ, hallRotY, roomRotY, offsetX, offsetZ;
      switch (dw.wallSide) {
        case 'north':
          doorX = cx + dw.position;
          doorZ = cz + halfH;
          hallRotY = 0;        // faces +Z (into hallway)
          roomRotY = Math.PI;  // faces -Z (into room)
          offsetX = 0;
          offsetZ = WALL_OFFSET;
          break;
        case 'south':
          doorX = cx + dw.position;
          doorZ = cz - halfH;
          hallRotY = Math.PI;  // faces -Z (into hallway)
          roomRotY = 0;        // faces +Z (into room)
          offsetX = 0;
          offsetZ = -WALL_OFFSET;
          break;
        case 'east':
          doorX = cx + halfW;
          doorZ = cz + dw.position;
          hallRotY = Math.PI / 2;   // faces +X (into hallway)
          roomRotY = -Math.PI / 2;  // faces -X (into room)
          offsetX = WALL_OFFSET;
          offsetZ = 0;
          break;
        case 'west':
          doorX = cx - halfW;
          doorZ = cz + dw.position;
          hallRotY = -Math.PI / 2;  // faces -X (into hallway)
          roomRotY = Math.PI / 2;   // faces +X (into room)
          offsetX = -WALL_OFFSET;
          offsetZ = 0;
          break;
        default:
          continue;
      }

      // Hallway-facing sign: shows this room's name (so you know what you're entering)
      const hallSign = this._createSign(roomData.label);
      hallSign.mesh.position.set(doorX + offsetX, SIGN_Y, doorZ + offsetZ);
      hallSign.mesh.rotation.y = hallRotY;
      scene.add(hallSign.mesh);
      this._signs.push(hallSign.mesh);
      this._materials.push(hallSign.material);

      // Room-interior-facing sign: shows where the hallway leads (destination)
      const destLabel = this._destMap.get(i);
      if (destLabel) {
        const roomSign = this._createSign(destLabel);
        roomSign.mesh.position.set(doorX - offsetX, SIGN_Y, doorZ - offsetZ);
        roomSign.mesh.rotation.y = roomRotY;
        scene.add(roomSign.mesh);
        this._signs.push(roomSign.mesh);
        this._materials.push(roomSign.material);
      }
    }
  }

  _createSign(label) {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 48;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#0a1a0a';
    ctx.fillRect(0, 0, 256, 48);

    ctx.font = '16px "Press Start 2P", monospace';
    ctx.fillStyle = '#00ff41';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, 128, 24);

    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;

    // Always visible — signs glow at all times
    const material = new THREE.MeshStandardMaterial({
      color: 0x000000,
      emissive: 0x00ff41,
      emissiveIntensity: 0.8,
      emissiveMap: texture,
      transparent: true,
    });

    const geo = new THREE.PlaneGeometry(SIGN_WIDTH, SIGN_HEIGHT);
    return { mesh: new THREE.Mesh(geo, material), material };
  }
}
