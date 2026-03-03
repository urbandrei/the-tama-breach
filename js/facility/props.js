import * as THREE from 'three';

// Shared materials
const metalMat = new THREE.MeshStandardMaterial({ color: 0x666677, roughness: 0.4, metalness: 0.6 });
const darkMetalMat = new THREE.MeshStandardMaterial({ color: 0x444455, roughness: 0.5, metalness: 0.7 });
const woodMat = new THREE.MeshStandardMaterial({ color: 0x5c4033, roughness: 0.9 });
const crateMat = new THREE.MeshStandardMaterial({ color: 0x4a3828, roughness: 0.85 });
const glassMat = new THREE.MeshStandardMaterial({
  color: 0x88ccff,
  transparent: true,
  opacity: 0.25,
  side: THREE.DoubleSide,
  roughness: 0.1,
  metalness: 0.2,
  depthWrite: false,
});
const pipeMat = new THREE.MeshStandardMaterial({ color: 0x556666, roughness: 0.5, metalness: 0.5 });
const screenMat = new THREE.MeshStandardMaterial({ color: 0x112244, emissive: 0x0a1a3a, emissiveIntensity: 0.5 });
const panelMat = new THREE.MeshStandardMaterial({ color: 0x555555, roughness: 0.6, metalness: 0.4 });
const tankMat = new THREE.MeshStandardMaterial({ color: 0x556677, roughness: 0.4, metalness: 0.5 });

// Returns { group, colliders }
function makeResult(group, colliders = []) {
  return { group, colliders };
}

// --- DESK ---
export function createDesk(x, z, rotation = 0) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  g.rotation.y = rotation;

  // Table top
  const top = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.06, 0.6), woodMat);
  top.position.y = 0.75;
  top.castShadow = true;
  top.receiveShadow = true;
  g.add(top);

  // 4 legs
  const legGeo = new THREE.BoxGeometry(0.06, 0.72, 0.06);
  const offsets = [[-0.54, -0.24], [0.54, -0.24], [-0.54, 0.24], [0.54, 0.24]];
  for (const [ox, oz] of offsets) {
    const leg = new THREE.Mesh(legGeo, darkMetalMat);
    leg.position.set(ox, 0.36, oz);
    g.add(leg);
  }

  // Monitor on desk
  const monitor = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.35, 0.04), screenMat);
  monitor.position.set(0, 1.0, -0.1);
  g.add(monitor);

  const collider = new THREE.Mesh(
    new THREE.BoxGeometry(1.2, 0.78, 0.6),
    new THREE.MeshBasicMaterial({ visible: false })
  );
  collider.position.set(0, 0.39, 0);
  g.add(collider);

  return makeResult(g, [collider]);
}

// --- SHELF ---
export function createShelf(x, z, rotation = 0) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  g.rotation.y = rotation;

  const shelfGeo = new THREE.BoxGeometry(1.5, 0.04, 0.4);
  for (let i = 0; i < 4; i++) {
    const shelf = new THREE.Mesh(shelfGeo, metalMat);
    shelf.position.y = 0.5 + i * 0.55;
    shelf.receiveShadow = true;
    g.add(shelf);
  }

  // Vertical supports
  const postGeo = new THREE.BoxGeometry(0.04, 2.2, 0.04);
  for (const ox of [-0.72, 0.72]) {
    for (const oz of [-0.18, 0.18]) {
      const post = new THREE.Mesh(postGeo, darkMetalMat);
      post.position.set(ox, 1.1, oz);
      g.add(post);
    }
  }

  const collider = new THREE.Mesh(
    new THREE.BoxGeometry(1.5, 2.2, 0.4),
    new THREE.MeshBasicMaterial({ visible: false })
  );
  collider.position.y = 1.1;
  g.add(collider);

  return makeResult(g, [collider]);
}

// --- HABITAT EXTENSION (containment room enclosure beyond glass wall) ---
// extensionSide: 'north' or 'south' — which direction the habitat extends from the room
const habitatWallMat = new THREE.MeshStandardMaterial({ color: 0x555555, roughness: 0.85 });
const habitatFloorMat = new THREE.MeshStandardMaterial({ color: 0x3a3a3a, roughness: 0.92 });

export function createHabitat(cx, cz, roomW, roomD, ceilingH, extensionSide, extensionD) {
  const g = new THREE.Group();
  g.name = 'containment_habitat';

  const halfRoomD = roomD / 2;
  const halfW = roomW / 2;
  const halfExtD = extensionD / 2;

  // Habitat position: extends beyond the room's back wall
  const zSign = extensionSide === 'north' ? 1 : -1;
  const roomEdgeZ = cz + zSign * halfRoomD;          // where room wall was
  const habitatCenterZ = roomEdgeZ + zSign * halfExtD; // center of habitat
  const habitatFarZ = roomEdgeZ + zSign * extensionD;  // far wall

  g.position.set(cx, 0, habitatCenterZ);

  // Floor
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(roomW, extensionD),
    habitatFloorMat
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  g.add(floor);

  // Floor collider
  const floorCol = new THREE.Mesh(
    new THREE.BoxGeometry(roomW, 0.1, extensionD),
    new THREE.MeshBasicMaterial({ visible: false })
  );
  floorCol.position.y = -0.05;
  g.add(floorCol);

  // Ceiling
  const ceiling = new THREE.Mesh(
    new THREE.PlaneGeometry(roomW, extensionD),
    habitatFloorMat
  );
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.y = ceilingH;
  g.add(ceiling);

  // Back wall (far end, opposite the glass)
  const backWallRotY = extensionSide === 'north' ? Math.PI : 0;
  const backWall = new THREE.Mesh(
    new THREE.PlaneGeometry(roomW, ceilingH),
    habitatWallMat
  );
  backWall.position.set(0, ceilingH / 2, zSign * halfExtD);
  backWall.rotation.y = backWallRotY;
  backWall.receiveShadow = true;
  g.add(backWall);

  // Left wall (west side)
  const leftWall = new THREE.Mesh(
    new THREE.PlaneGeometry(extensionD, ceilingH),
    habitatWallMat
  );
  leftWall.position.set(-halfW, ceilingH / 2, 0);
  leftWall.rotation.y = Math.PI / 2;
  leftWall.receiveShadow = true;
  g.add(leftWall);

  // Right wall (east side)
  const rightWall = new THREE.Mesh(
    new THREE.PlaneGeometry(extensionD, ceilingH),
    habitatWallMat
  );
  rightWall.position.set(halfW, ceilingH / 2, 0);
  rightWall.rotation.y = -Math.PI / 2;
  rightWall.receiveShadow = true;
  g.add(rightWall);

  // Colliders for the 3 solid walls
  const colliders = [floorCol];
  const invisMat = new THREE.MeshBasicMaterial({ visible: false });
  const wt = 0.3; // wall thickness for colliders

  // Back wall collider
  const backCol = new THREE.Mesh(
    new THREE.BoxGeometry(roomW, ceilingH, wt),
    invisMat
  );
  backCol.position.set(0, ceilingH / 2, zSign * halfExtD);
  g.add(backCol);
  colliders.push(backCol);

  // Left wall collider
  const leftCol = new THREE.Mesh(
    new THREE.BoxGeometry(wt, ceilingH, extensionD),
    invisMat
  );
  leftCol.position.set(-halfW, ceilingH / 2, 0);
  g.add(leftCol);
  colliders.push(leftCol);

  // Right wall collider
  const rightCol = new THREE.Mesh(
    new THREE.BoxGeometry(wt, ceilingH, extensionD),
    invisMat
  );
  rightCol.position.set(halfW, ceilingH / 2, 0);
  g.add(rightCol);
  colliders.push(rightCol);

  // Decoration waypoints (world coordinates — inside the habitat)
  const margin = 1.0;
  const innerMinX = cx - halfW + margin;
  const innerMaxX = cx + halfW - margin;
  // minZ/maxZ in world coords, ensuring minZ < maxZ
  const worldZ1 = roomEdgeZ + zSign * margin;
  const worldZ2 = habitatFarZ - zSign * margin;
  const innerMinZ = Math.min(worldZ1, worldZ2);
  const innerMaxZ = Math.max(worldZ1, worldZ2);

  const midX = cx;
  const midZ = (innerMinZ + innerMaxZ) / 2;

  // Glass front z = roomEdgeZ (where the room's glass wall is)
  g.userData = {
    aquariumBounds: { minX: innerMinX, maxX: innerMaxX, minZ: innerMinZ, maxZ: innerMaxZ },
    glassFront: {
      z: roomEdgeZ,
      facing: extensionSide === 'north' ? 'south' : 'north',
    },
    decorationPoints: [
      { x: innerMinX + 0.5, z: innerMaxZ - 0.3, type: 'plant' },
      { x: innerMaxX - 0.5, z: innerMaxZ - 0.5, type: 'rock' },
      { x: midX, z: midZ, type: 'ball' },
      { x: innerMinX + 1.5, z: innerMinZ + 0.3, type: 'terminal' },
      { x: innerMaxX - 1.5, z: innerMinZ + 0.5, type: 'tube' },
    ],
  };

  return makeResult(g, colliders);
}

// --- SERVER RACK ---
export function createServerRack(x, z, rotation = 0) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  g.rotation.y = rotation;

  // Main cabinet body
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(0.6, 2.0, 0.8),
    darkMetalMat
  );
  body.position.y = 1.0;
  body.castShadow = true;
  body.receiveShadow = true;
  g.add(body);

  // Blinking LEDs (small emissive boxes)
  for (let row = 0; row < 6; row++) {
    const led = new THREE.Mesh(
      new THREE.BoxGeometry(0.04, 0.02, 0.01),
      new THREE.MeshStandardMaterial({
        color: 0x00ff44,
        emissive: 0x00ff44,
        emissiveIntensity: 0.8,
      })
    );
    led.position.set(-0.15 + (row % 3) * 0.12, 0.5 + row * 0.2, -0.41);
    g.add(led);
  }

  const collider = new THREE.Mesh(
    new THREE.BoxGeometry(0.6, 2.0, 0.8),
    new THREE.MeshBasicMaterial({ visible: false })
  );
  collider.position.y = 1.0;
  g.add(collider);

  return makeResult(g, [collider]);
}

// --- CRATE ---
export function createCrate(x, z, scale = 1) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);

  const s = 0.8 * scale;
  const crate = new THREE.Mesh(
    new THREE.BoxGeometry(s, s, s),
    crateMat
  );
  crate.position.y = s / 2;
  crate.castShadow = true;
  crate.receiveShadow = true;
  g.add(crate);

  const collider = new THREE.Mesh(
    new THREE.BoxGeometry(s, s, s),
    new THREE.MeshBasicMaterial({ visible: false })
  );
  collider.position.y = s / 2;
  g.add(collider);

  return makeResult(g, [collider]);
}

// --- BARREL ---
export function createBarrel(x, z) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);

  const barrel = new THREE.Mesh(
    new THREE.CylinderGeometry(0.35, 0.35, 1.0, 8),
    new THREE.MeshStandardMaterial({ color: 0x3a5f3a, roughness: 0.8 })
  );
  barrel.position.y = 0.5;
  barrel.castShadow = true;
  barrel.receiveShadow = true;
  g.add(barrel);

  const collider = new THREE.Mesh(
    new THREE.BoxGeometry(0.7, 1.0, 0.7),
    new THREE.MeshBasicMaterial({ visible: false })
  );
  collider.position.y = 0.5;
  g.add(collider);

  return makeResult(g, [collider]);
}

// --- PIPE (horizontal or vertical) ---
export function createPipe(x1, z1, x2, z2, y = 2.5, radius = 0.08) {
  const g = new THREE.Group();

  const dx = x2 - x1;
  const dz = z2 - z1;
  const length = Math.sqrt(dx * dx + dz * dz);
  const angle = Math.atan2(dx, dz);

  const pipe = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius, length, 6),
    pipeMat
  );
  pipe.rotation.z = Math.PI / 2;
  pipe.rotation.y = angle;
  pipe.position.set((x1 + x2) / 2, y, (z1 + z2) / 2);
  g.add(pipe);

  return makeResult(g);
}

// --- WATER TANK ---
export function createWaterTank(x, z) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);

  const tank = new THREE.Mesh(
    new THREE.CylinderGeometry(0.6, 0.6, 2.0, 10),
    tankMat
  );
  tank.position.y = 1.0;
  tank.castShadow = true;
  g.add(tank);

  // Top cap
  const cap = new THREE.Mesh(
    new THREE.CylinderGeometry(0.65, 0.65, 0.1, 10),
    metalMat
  );
  cap.position.y = 2.05;
  g.add(cap);

  const collider = new THREE.Mesh(
    new THREE.BoxGeometry(1.2, 2.0, 1.2),
    new THREE.MeshBasicMaterial({ visible: false })
  );
  collider.position.y = 1.0;
  g.add(collider);

  return makeResult(g, [collider]);
}

// --- ELECTRICAL PANEL ---
export function createElectricalPanel(x, z, rotation = 0) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  g.rotation.y = rotation;

  // Panel box mounted on wall
  const panel = new THREE.Mesh(
    new THREE.BoxGeometry(0.8, 1.0, 0.15),
    panelMat
  );
  panel.position.y = 1.4;
  panel.castShadow = true;
  g.add(panel);

  // Switch rows
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 4; col++) {
      const sw = new THREE.Mesh(
        new THREE.BoxGeometry(0.06, 0.1, 0.04),
        metalMat
      );
      sw.position.set(-0.24 + col * 0.16, 1.15 + row * 0.25, -0.1);
      g.add(sw);
    }
  }

  return makeResult(g);
}

// --- Prop placement per room type ---
export function getPropsForRoom(roomData) {
  const [cx, cz] = roomData.center;
  const [w, d] = roomData.size;
  const hw = w / 2;
  const hd = d / 2;
  const results = [];

  switch (roomData.propType) {
    case 'entryway':
      results.push(createDesk(cx - 2, cz, 0));
      results.push(createCrate(cx + 2, cz + 1));
      break;

    case 'loading_dock':
      // Crates and barrels scattered around
      results.push(createCrate(cx - 4, cz - 3, 1.2));
      results.push(createCrate(cx - 3, cz - 3));
      results.push(createCrate(cx + 3, cz + 2));
      results.push(createBarrel(cx + 4, cz - 2));
      results.push(createBarrel(cx - 4, cz + 2));
      results.push(createCrate(cx + 2, cz - 3, 0.8));
      break;

    case 'central_hub':
      // Desks and a central desk area
      results.push(createDesk(cx - 4, cz + 3, Math.PI / 2));
      results.push(createDesk(cx - 4, cz - 3, Math.PI / 2));
      results.push(createDesk(cx + 4, cz + 3, -Math.PI / 2));
      results.push(createDesk(cx + 4, cz - 3, -Math.PI / 2));
      results.push(createShelf(cx + 7, cz, -Math.PI / 2));
      results.push(createShelf(cx - 7, cz, Math.PI / 2));
      break;

    case 'containment': {
      // Habitat extension beyond the glass wall
      const extSide = (roomData.id === 'contain_a' || roomData.id === 'contain_b') ? 'north' : 'south';
      results.push(createHabitat(cx, cz, w, d, roomData.ceilingHeight, extSide, 4));
      // Monitoring desk in observation area (room interior)
      const deskZ = extSide === 'north' ? cz - 2 : cz + 2;
      results.push(createDesk(cx - 3, deskZ, extSide === 'north' ? 0 : Math.PI));
      break;
    }

    case 'water_filtration':
      results.push(createWaterTank(cx - 2, cz - 1));
      results.push(createWaterTank(cx + 2, cz + 1));
      results.push(createPipe(cx - 2, cz - 1, cx + 2, cz + 1, 2.5));
      results.push(createBarrel(cx + 3, cz - 2));
      break;

    case 'server_room':
      // Rows of server racks
      for (let i = -1; i <= 1; i++) {
        results.push(createServerRack(cx - 2, cz + i * 2.5, 0));
        results.push(createServerRack(cx + 2, cz + i * 2.5, Math.PI));
      }
      break;

    case 'electrical':
      results.push(createElectricalPanel(cx - 3.5, cz, Math.PI / 2));
      results.push(createElectricalPanel(cx - 3.5, cz + 2, Math.PI / 2));
      results.push(createElectricalPanel(cx - 3.5, cz - 2, Math.PI / 2));
      results.push(createCrate(cx + 2, cz + 2));
      break;

    case 'storage':
      // Shelves along side walls so they don't block north/south doors
      results.push(createShelf(cx - 2, cz, Math.PI / 2));
      results.push(createShelf(cx + 2, cz, -Math.PI / 2));
      results.push(createCrate(cx + 1.5, cz - 1, 0.7));
      break;
  }

  return results;
}
