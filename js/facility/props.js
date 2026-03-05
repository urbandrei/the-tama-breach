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

  // Walls (BoxGeometry — visible + collider in one mesh)
  const wt = 0.3;
  const colliders = [floorCol];

  // Back wall (far end, opposite the glass)
  const backWall = new THREE.Mesh(
    new THREE.BoxGeometry(roomW, ceilingH, wt),
    habitatWallMat
  );
  backWall.position.set(0, ceilingH / 2, zSign * halfExtD);
  backWall.castShadow = true;
  backWall.receiveShadow = true;
  g.add(backWall);
  colliders.push(backWall);

  // Left wall (west side)
  const leftWall = new THREE.Mesh(
    new THREE.BoxGeometry(wt, ceilingH, extensionD),
    habitatWallMat
  );
  leftWall.position.set(-halfW, ceilingH / 2, 0);
  leftWall.castShadow = true;
  leftWall.receiveShadow = true;
  g.add(leftWall);
  colliders.push(leftWall);

  // Right wall (east side)
  const rightWall = new THREE.Mesh(
    new THREE.BoxGeometry(wt, ceilingH, extensionD),
    habitatWallMat
  );
  rightWall.position.set(halfW, ceilingH / 2, 0);
  rightWall.castShadow = true;
  rightWall.receiveShadow = true;
  g.add(rightWall);
  colliders.push(rightWall);

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

// --- ELEVATOR SHAFT ---
const SHAFT_HEIGHT = 35;
const SHAFT_WALL_COLOR = 0x2a2a30;
const BAND_COLOR = 0x334455;
const BAND_EMISSIVE = 0x112233;
const BAND_SPACING = 4.0;
const PLATFORM_Y = 0;

const shaftWallMat = new THREE.MeshStandardMaterial({
  color: SHAFT_WALL_COLOR,
  roughness: 0.9,
  side: THREE.DoubleSide,
});

export function createElevatorShaft(cx, cz, roomW, roomD) {
  const g = new THREE.Group();
  g.name = 'elevator_shaft';

  const hw = roomW / 2;
  const hd = roomD / 2;
  const shaftH = SHAFT_HEIGHT;

  // Shaft walls (extend from room ceiling height up to SHAFT_HEIGHT)
  const roomCeil = 4.0;
  const extH = shaftH - roomCeil;

  // North wall
  const northWall = new THREE.Mesh(
    new THREE.PlaneGeometry(roomW, extH),
    shaftWallMat
  );
  northWall.position.set(cx, roomCeil + extH / 2, cz + hd);
  northWall.rotation.y = Math.PI;
  g.add(northWall);

  // South wall
  const southWall = new THREE.Mesh(
    new THREE.PlaneGeometry(roomW, extH),
    shaftWallMat
  );
  southWall.position.set(cx, roomCeil + extH / 2, cz - hd);
  g.add(southWall);

  // West wall
  const westWall = new THREE.Mesh(
    new THREE.PlaneGeometry(roomD, extH),
    shaftWallMat
  );
  westWall.position.set(cx - hw, roomCeil + extH / 2, cz);
  westWall.rotation.y = Math.PI / 2;
  g.add(westWall);

  // East wall
  const eastWall = new THREE.Mesh(
    new THREE.PlaneGeometry(roomD, extH),
    shaftWallMat
  );
  eastWall.position.set(cx + hw, roomCeil + extH / 2, cz);
  eastWall.rotation.y = -Math.PI / 2;
  g.add(eastWall);

  // Emissive light bands on shaft walls (horizontal strips at intervals)
  const bandMat = new THREE.MeshStandardMaterial({
    color: BAND_COLOR,
    emissive: BAND_EMISSIVE,
    emissiveIntensity: 1.5,
    roughness: 0.3,
  });

  const bands = [];
  const bandH = 0.15;
  const bandCount = Math.floor(shaftH / BAND_SPACING);

  for (let i = 0; i < bandCount; i++) {
    const y = BAND_SPACING + i * BAND_SPACING;

    // Band on west wall
    const bandW = new THREE.Mesh(
      new THREE.PlaneGeometry(roomD - 1, bandH),
      bandMat
    );
    bandW.position.set(cx - hw + 0.05, y, cz);
    bandW.rotation.y = Math.PI / 2;
    g.add(bandW);
    bands.push(bandW);

    // Band on east wall (door side)
    const bandE = new THREE.Mesh(
      new THREE.PlaneGeometry(roomD - 1, bandH),
      bandMat
    );
    bandE.position.set(cx + hw - 0.05, y, cz);
    bandE.rotation.y = -Math.PI / 2;
    g.add(bandE);
    bands.push(bandE);
  }

  // Dark cap at shaft top (hides the open top)
  const capMat = new THREE.MeshStandardMaterial({ color: 0x000000, side: THREE.DoubleSide });
  const cap = new THREE.Mesh(new THREE.PlaneGeometry(roomW, roomD), capMat);
  cap.rotation.x = Math.PI / 2;
  cap.position.set(cx, shaftH, cz);
  g.add(cap);

  // Dense fog layers filling the shaft — starts low, becomes impenetrable above
  const fogLayers = 16;
  const fogBottom = shaftH * 0.15; // fog starts low
  const fogTop = shaftH - 0.3;
  for (let i = 0; i < fogLayers; i++) {
    const t = i / (fogLayers - 1); // 0 at bottom, 1 at top
    const y = fogBottom + t * (fogTop - fogBottom);
    const opacity = 0.06 + t * t * t * 0.85; // cubic ramp: 0.06 → 0.91
    const fogMat = new THREE.MeshBasicMaterial({
      color: 0x050810,
      transparent: true,
      opacity,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const fogPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(roomW + 0.5, roomD + 0.5),
      fogMat
    );
    fogPlane.rotation.x = Math.PI / 2;
    fogPlane.position.set(cx, y, cz);
    fogPlane.renderOrder = 999;
    g.add(fogPlane);
  }

  // Platform (movable slab)
  const platformMat = new THREE.MeshStandardMaterial({ color: 0x555566, roughness: 0.5, metalness: 0.6 });
  const platform = new THREE.Group();

  // Platform floor
  const slab = new THREE.Mesh(
    new THREE.BoxGeometry(roomW - 1, 0.15, roomD - 1),
    platformMat
  );
  slab.receiveShadow = true;
  platform.add(slab);

  // Railing posts
  const railMat = new THREE.MeshStandardMaterial({ color: 0x666677, roughness: 0.4, metalness: 0.7 });
  const railH = 1.2;
  const railGeo = new THREE.BoxGeometry(0.08, railH, 0.08);
  const pHW = (roomW - 1) / 2 - 0.2;
  const pHD = (roomD - 1) / 2 - 0.2;

  // Posts on west, north, south sides (east side open for doors)
  const railPositions = [
    [-pHW, railH / 2, -pHD],  // west-south corner
    [-pHW, railH / 2, pHD],   // west-north corner
    [-pHW, railH / 2, 0],     // west midpoint
    [pHW, railH / 2, -pHD],   // east-south corner (end of south rail)
    [pHW, railH / 2, pHD],    // east-north corner (end of north rail)
  ];
  for (const [rx, ry, rz] of railPositions) {
    const post = new THREE.Mesh(railGeo, railMat);
    post.position.set(rx, ry, rz);
    platform.add(post);
  }

  // Top rail bars — west side + north/south sides (no east rail, doors there)
  const barGeoD = new THREE.BoxGeometry(0.06, 0.06, roomD - 1.4);
  const westBar = new THREE.Mesh(barGeoD, railMat);
  westBar.position.set(-pHW, railH, 0);
  platform.add(westBar);

  const barGeoW = new THREE.BoxGeometry(roomW - 1.4, 0.06, 0.06);
  for (const side of [-1, 1]) {
    const bar = new THREE.Mesh(barGeoW, railMat);
    bar.position.set(0, railH, side * pHD);
    platform.add(bar);
  }

  platform.position.set(cx, PLATFORM_Y, cz);
  g.add(platform);

  // Elevator doors (two panels that slide apart on east wall, at room level)
  const doorMat = new THREE.MeshStandardMaterial({ color: 0x667788, roughness: 0.35, metalness: 0.7 });
  const doorH = 2.8;
  const doorPanelW = 1.8;

  const leftDoor = new THREE.Mesh(
    new THREE.BoxGeometry(0.12, doorH, doorPanelW),
    doorMat
  );
  leftDoor.position.set(cx + hw, doorH / 2, cz + doorPanelW / 2);
  g.add(leftDoor);

  const rightDoor = new THREE.Mesh(
    new THREE.BoxGeometry(0.12, doorH, doorPanelW),
    doorMat
  );
  rightDoor.position.set(cx + hw, doorH / 2, cz - doorPanelW / 2);
  g.add(rightDoor);

  // Door colliders
  const invisMat = new THREE.MeshBasicMaterial({ visible: false });
  const leftDoorCol = new THREE.Mesh(
    new THREE.BoxGeometry(0.4, doorH, doorPanelW),
    invisMat
  );
  leftDoorCol.position.copy(leftDoor.position);
  g.add(leftDoorCol);

  const rightDoorCol = new THREE.Mesh(
    new THREE.BoxGeometry(0.4, doorH, doorPanelW),
    invisMat
  );
  rightDoorCol.position.copy(rightDoor.position);
  g.add(rightDoorCol);

  // Store refs for ElevatorManager to animate
  g.userData = {
    elevatorPlatform: platform,
    elevatorDoors: { left: leftDoor, right: rightDoor },
    elevatorDoorColliders: { left: leftDoorCol, right: rightDoorCol },
    elevatorBands: bands,
    shaftHeight: SHAFT_HEIGHT,
    bandSpacing: BAND_SPACING,
    roomCenter: [cx, cz],
  };

  const colliders = [leftDoorCol, rightDoorCol];

  return makeResult(g, colliders);
}

// --- SECURITY CAMERA ---
const camBodyMat = new THREE.MeshStandardMaterial({ color: 0x333340, roughness: 0.6, metalness: 0.5 });
const camLensMat = new THREE.MeshStandardMaterial({ color: 0x111118, roughness: 0.2, metalness: 0.8 });

export function createSecurityCamera(x, y, z, facingZ) {
  const g = new THREE.Group();
  g.position.set(x, y, z);

  // Camera body
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.15, 0.15), camBodyMat);
  g.add(body);

  // Lens (cylinder protruding forward)
  const lens = new THREE.Mesh(
    new THREE.CylinderGeometry(0.04, 0.05, 0.1, 6),
    camLensMat
  );
  lens.rotation.x = Math.PI / 2;
  lens.position.z = facingZ * 0.12;
  g.add(lens);

  // Mount bracket (connects to wall)
  const bracket = new THREE.Mesh(
    new THREE.BoxGeometry(0.06, 0.06, 0.15),
    darkMetalMat
  );
  bracket.position.set(0, 0.1, -facingZ * 0.05);
  g.add(bracket);

  // LED indicator
  const ledMat = new THREE.MeshStandardMaterial({
    color: 0x00ff44,
    emissive: 0x00ff44,
    emissiveIntensity: 1.0,
  });
  const led = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, 0.03), ledMat);
  led.position.set(0.08, 0.06, facingZ * 0.05);
  g.add(led);

  g.userData = { cameraLed: led };

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
    case 'lab':
      results.push(createDesk(cx - 3, cz + 2, Math.PI));
      results.push(createDesk(cx + 3, cz + 2, Math.PI));
      results.push(createShelf(cx, cz - 3, 0));
      break;

    case 'food_processing':
      results.push(createShelf(cx - 3, cz, Math.PI / 2));
      results.push(createShelf(cx + 3, cz, -Math.PI / 2));
      results.push(createCrate(cx, cz - 3));
      break;

    case 'generator_room':
      // Panels on west wall (back, away from door)
      results.push(createElectricalPanel(cx - hw + 0.5, cz, Math.PI / 2));
      results.push(createElectricalPanel(cx - hw + 0.5, cz + 2, Math.PI / 2));
      results.push(createElectricalPanel(cx - hw + 0.5, cz - 2, Math.PI / 2));
      // Barrels on east side
      results.push(createBarrel(cx + 2, cz + 2));
      results.push(createBarrel(cx + 2, cz - 2));
      break;

    case 'elevator':
      results.push(createElevatorShaft(cx, cz, w, d));
      break;

    case 'command_center':
      results.push(createDesk(cx - 2, cz + 2, Math.PI));
      results.push(createDesk(cx + 2, cz + 2, Math.PI));
      results.push(createDesk(cx, cz - 2, 0));
      results.push(createShelf(cx - hw + 1, cz, Math.PI / 2));
      break;

    case 'containment': {
      // Habitat extension beyond the glass wall
      const extSide = (roomData.id === 'contain_a' || roomData.id === 'contain_b') ? 'north' : 'south';
      results.push(createHabitat(cx, cz, w, d, roomData.ceilingHeight, extSide, 4));
      // Monitoring desk in observation area (room interior)
      const deskZ = extSide === 'north' ? cz - 2 : cz + 2;
      results.push(createDesk(cx - 3, deskZ, extSide === 'north' ? 0 : Math.PI));
      // Security camera on wall opposite the glass, high up
      const camZ = extSide === 'north' ? cz - hd + 0.2 : cz + hd - 0.2;
      const camFacingZ = extSide === 'north' ? 1 : -1;
      results.push(createSecurityCamera(cx + 4, 3.2, camZ, camFacingZ));
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

    case 'storage':
      results.push(createShelf(cx + hw - 1.5, cz + 1, -Math.PI / 2));
      results.push(createShelf(cx + hw - 1.5, cz - 2, -Math.PI / 2));
      results.push(createCrate(cx - 1, cz - 2, 0.7));
      break;
  }

  return results;
}
