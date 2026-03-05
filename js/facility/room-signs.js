import * as THREE from 'three';
import { rooms, doorways, DOOR_WIDTH, DOOR_HEIGHT, WALL_THICKNESS } from './layout-data.js';

const SIGN_WIDTH = 1.6;   // how far the sign extends into the hallway
const SIGN_HEIGHT = 0.35;
// Top of sign aligns with top of door frame
const SIGN_Y = DOOR_HEIGHT - SIGN_HEIGHT / 2;

// Center rooms sit on the inner edge of the hallway loop
const INNER_ROOMS = new Set(['lab', 'food_processing', 'server_room', 'generator_room']);

export class RoomSigns {
  constructor(scene) {
    this._signs = [];
    this._materials = [];
    this._buildSigns(scene);
  }

  setAlert(active) {
    const hex = active ? 0xff2222 : 0x00ff41;
    for (const mat of this._materials) {
      mat.emissive.setHex(hex);
    }
  }

  _buildSigns(scene) {
    for (const dw of doorways) {
      const roomData = rooms.find(r => r.id === dw.roomId);
      if (!roomData) continue;

      const [cx, cz] = roomData.center;
      const [w, h] = roomData.size;
      const halfW = w / 2;
      const halfH = h / 2;

      let doorX, doorZ;
      let extendX = 0, extendZ = 0;
      let signRotY;
      // Offset along wall to right side of door (facing door from hallway)
      let rightX = 0, rightZ = 0;

      switch (dw.wallSide) {
        case 'north':
          doorX = cx + dw.position;
          doorZ = cz + halfH;
          extendZ = 1;
          signRotY = Math.PI / 2;
          // Facing south from hallway → right is -X
          rightX = -DOOR_WIDTH / 2;
          break;
        case 'south':
          doorX = cx + dw.position;
          doorZ = cz - halfH;
          extendZ = -1;
          signRotY = Math.PI / 2;
          // Facing north from hallway → right is +X
          rightX = DOOR_WIDTH / 2;
          break;
        case 'east':
          doorX = cx + halfW;
          doorZ = cz + dw.position;
          extendX = 1;
          signRotY = 0;
          // Facing west from hallway → right is +Z
          rightZ = DOOR_WIDTH / 2;
          break;
        case 'west':
          doorX = cx - halfW;
          doorZ = cz + dw.position;
          extendX = -1;
          signRotY = 0;
          // Facing east from hallway → right is -Z
          rightZ = -DOOR_WIDTH / 2;
          break;
        default:
          continue;
      }

      // Inner rooms: sign on left side of door; outer rooms: right side
      const side = INNER_ROOMS.has(dw.roomId) ? -1 : 1;
      const wallOffset = WALL_THICKNESS / 2;
      const signX = doorX + side * rightX + extendX * (SIGN_WIDTH / 2 + wallOffset);
      const signZ = doorZ + side * rightZ + extendZ * (SIGN_WIDTH / 2 + wallOffset);

      const sign = this._createSign(roomData.label);
      sign.group.position.set(signX, SIGN_Y, signZ);
      sign.group.rotation.y = signRotY;
      scene.add(sign.group);
      this._signs.push(sign.group);
      this._materials.push(sign.material);
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

    const material = new THREE.MeshStandardMaterial({
      color: 0x000000,
      emissive: 0x00ff41,
      emissiveIntensity: 0.8,
      emissiveMap: texture,
      transparent: true,
    });

    // Front face (default +Z)
    const frontGeo = new THREE.PlaneGeometry(SIGN_WIDTH, SIGN_HEIGHT);
    const frontMesh = new THREE.Mesh(frontGeo, material);

    // Back face — rotation alone mirrors correctly, no UV flip needed
    const backGeo = new THREE.PlaneGeometry(SIGN_WIDTH, SIGN_HEIGHT);
    const backMesh = new THREE.Mesh(backGeo, material);
    backMesh.rotation.y = Math.PI;

    const group = new THREE.Group();
    group.add(frontMesh);
    group.add(backMesh);

    return { group, material };
  }
}
