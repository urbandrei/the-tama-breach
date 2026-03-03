// Facility layout data - all room and hallway definitions
// Coordinate system: X = east/west, Z = north/south, Y = up
//
// Grid layout (3 columns, rooms on aligned rows):
//
//   Row z=40:  CONTAIN-A(-30)   WATER-FILT(0)   CONTAIN-B(30)
//   Row z=16:  ELECTRICAL(-30)  CENTRAL-HUB(0)  SERVER-RM(30)
//   Row z=-8:  CONTAIN-D(-30)   LOADING-DOCK(0) CONTAIN-C(30)
//              (none)           STORAGE(0,-24)   (none)
//              (none)           ENTRYWAY(0,-40)  (none)
//
// All hallways are strictly N-S or E-W (axis-aligned).

export const WALL_THICKNESS = 0.3;
export const DOOR_WIDTH = 2.5;   // matches HALLWAY_WIDTH for clean junctions
export const DOOR_HEIGHT = 2.8;
export const HALLWAY_WIDTH = 2.5;
export const HALLWAY_HEIGHT = 4.0;

export const rooms = [
  {
    id: 'entryway',
    label: 'Entryway',
    center: [0, -40],
    size: [8, 6],
    ceilingHeight: 4.0,
    lightColor: 0xcccccc,
    lightIntensity: 0.8,
    propType: 'entryway',
  },
  {
    id: 'storage',
    label: 'Storage',
    center: [0, -24],
    size: [6, 6],
    ceilingHeight: 4.0,
    lightColor: 0xaa8855,
    lightIntensity: 0.5,
    propType: 'storage',
  },
  {
    id: 'loading_dock',
    label: 'Loading Dock',
    center: [0, -8],
    size: [12, 10],
    ceilingHeight: 4.0,
    lightColor: 0xdd8833,
    lightIntensity: 1.0,
    propType: 'loading_dock',
  },
  {
    id: 'central_hub',
    label: 'Central Hub',
    center: [0, 16],
    size: [20, 16],
    ceilingHeight: 4.0,
    lightColor: 0xddccaa,
    lightIntensity: 1.2,
    propType: 'central_hub',
  },
  {
    id: 'electrical',
    label: 'Electrical',
    center: [-30, 16],
    size: [8, 8],
    ceilingHeight: 4.0,
    lightColor: 0xccaa33,
    lightIntensity: 0.9,
    propType: 'electrical',
  },
  {
    id: 'server_room',
    label: 'Server Room',
    center: [30, 16],
    size: [10, 8],
    ceilingHeight: 4.0,
    lightColor: 0x5588cc,
    lightIntensity: 0.6,
    propType: 'server_room',
  },
  {
    id: 'water_filtration',
    label: 'Water Filtration',
    center: [0, 40],
    size: [10, 8],
    ceilingHeight: 4.0,
    lightColor: 0x88bbdd,
    lightIntensity: 0.8,
    propType: 'water_filtration',
  },
  {
    id: 'contain_a',
    label: 'Containment A',
    center: [-30, 40],
    size: [14, 10],
    ceilingHeight: 4.0,
    lightColor: 0x44cc66,
    lightIntensity: 0.7,
    propType: 'containment',
  },
  {
    id: 'contain_b',
    label: 'Containment B',
    center: [30, 40],
    size: [14, 10],
    ceilingHeight: 4.0,
    lightColor: 0x44cc66,
    lightIntensity: 0.7,
    propType: 'containment',
  },
  {
    id: 'contain_c',
    label: 'Containment C',
    center: [30, -8],
    size: [14, 10],
    ceilingHeight: 4.0,
    lightColor: 0x44cc66,
    lightIntensity: 0.7,
    propType: 'containment',
  },
  {
    id: 'contain_d',
    label: 'Containment D',
    center: [-30, -8],
    size: [14, 10],
    ceilingHeight: 4.0,
    lightColor: 0x44cc66,
    lightIntensity: 0.7,
    propType: 'containment',
  },
];

// All hallways are axis-aligned (pure N-S or E-W)
export const hallways = [
  // === Center column (N-S, x=0) ===
  // entryway(z=-40) north wall z=-37 → storage(z=-24) south wall z=-27
  { id: 'hall_entry_storage', start: [0, -37], end: [0, -27] },
  // storage(z=-24) north wall z=-21 → loading_dock(z=-8) south wall z=-13
  { id: 'hall_storage_dock', start: [0, -21], end: [0, -13] },
  // loading_dock(z=-8) north wall z=-3 → central_hub(z=16) south wall z=8
  { id: 'hall_dock_hub', start: [0, -3], end: [0, 8] },
  // central_hub(z=16) north wall z=24 → water_filt(z=40) south wall z=36
  { id: 'hall_hub_water', start: [0, 24], end: [0, 36] },

  // === West column (N-S, x=-30) ===
  // contain_d(z=-8) north wall z=-3 → electrical(z=16) south wall z=12
  { id: 'hall_contd_elec', start: [-30, -3], end: [-30, 12] },
  // electrical(z=16) north wall z=20 → contain_a(z=40) south wall z=35
  { id: 'hall_elec_conta', start: [-30, 20], end: [-30, 35] },

  // === East column (N-S, x=30) ===
  // contain_c(z=-8) north wall z=-3 → server_room(z=16) south wall z=12
  { id: 'hall_contc_server', start: [30, -3], end: [30, 12] },
  // server_room(z=16) north wall z=20 → contain_b(z=40) south wall z=35
  { id: 'hall_server_contb', start: [30, 20], end: [30, 35] },

  // === Row z=40 (E-W) ===
  // contain_a east wall x=-23 → water_filt west wall x=-5
  { id: 'hall_conta_water', start: [-23, 40], end: [-5, 40] },
  // water_filt east wall x=5 → contain_b west wall x=23
  { id: 'hall_water_contb', start: [5, 40], end: [23, 40] },

  // === Row z=16 (E-W) ===
  // electrical east wall x=-26 → central_hub west wall x=-10
  { id: 'hall_elec_hub', start: [-26, 16], end: [-10, 16] },
  // central_hub east wall x=10 → server_room west wall x=25
  { id: 'hall_hub_server', start: [10, 16], end: [25, 16] },

  // === Row z=-8 (E-W) ===
  // contain_d east wall x=-23 → loading_dock west wall x=-6
  { id: 'hall_contd_dock', start: [-23, -8], end: [-6, -8] },
  // loading_dock east wall x=6 → contain_c west wall x=23
  { id: 'hall_dock_contc', start: [6, -8], end: [23, -8] },
];

// Doorway definitions: one per room-hallway connection
// wallSide: which wall of the room the door is on
// position: offset along that wall (0 = center)
export const doorways = [
  // --- Entryway ---
  // South wall is solid (no exterior exit)
  { roomId: 'entryway', wallSide: 'north', position: 0 },  // → hall_entry_storage

  // --- Storage ---
  { roomId: 'storage', wallSide: 'south', position: 0 },   // ← hall_entry_storage
  { roomId: 'storage', wallSide: 'north', position: 0 },   // → hall_storage_dock

  // --- Loading Dock ---
  { roomId: 'loading_dock', wallSide: 'south', position: 0 },  // ← hall_storage_dock
  { roomId: 'loading_dock', wallSide: 'north', position: 0 },  // → hall_dock_hub
  { roomId: 'loading_dock', wallSide: 'west', position: 0 },   // → hall_contd_dock
  { roomId: 'loading_dock', wallSide: 'east', position: 0 },   // → hall_dock_contc

  // --- Central Hub ---
  { roomId: 'central_hub', wallSide: 'south', position: 0 },   // ← hall_dock_hub
  { roomId: 'central_hub', wallSide: 'north', position: 0 },   // → hall_hub_water
  { roomId: 'central_hub', wallSide: 'west', position: 0 },    // → hall_elec_hub
  { roomId: 'central_hub', wallSide: 'east', position: 0 },    // → hall_hub_server

  // --- Electrical ---
  { roomId: 'electrical', wallSide: 'east', position: 0 },     // ← hall_elec_hub
  { roomId: 'electrical', wallSide: 'north', position: 0 },    // → hall_elec_conta
  { roomId: 'electrical', wallSide: 'south', position: 0 },    // ← hall_contd_elec

  // --- Server Room ---
  { roomId: 'server_room', wallSide: 'west', position: 0 },    // ← hall_hub_server
  { roomId: 'server_room', wallSide: 'north', position: 0 },   // → hall_server_contb
  { roomId: 'server_room', wallSide: 'south', position: 0 },   // ← hall_contc_server

  // --- Water Filtration ---
  { roomId: 'water_filtration', wallSide: 'south', position: 0 },  // ← hall_hub_water
  { roomId: 'water_filtration', wallSide: 'west', position: 0 },   // → hall_conta_water
  { roomId: 'water_filtration', wallSide: 'east', position: 0 },   // → hall_water_contb

  // --- Containment A ---
  { roomId: 'contain_a', wallSide: 'south', position: 0 },    // ← hall_elec_conta
  { roomId: 'contain_a', wallSide: 'east', position: 0 },     // ← hall_conta_water

  // --- Containment B ---
  { roomId: 'contain_b', wallSide: 'south', position: 0 },    // ← hall_server_contb
  { roomId: 'contain_b', wallSide: 'west', position: 0 },     // ← hall_water_contb

  // --- Containment C ---
  { roomId: 'contain_c', wallSide: 'north', position: 0 },    // → hall_contc_server
  { roomId: 'contain_c', wallSide: 'west', position: 0 },     // ← hall_dock_contc

  // --- Containment D ---
  { roomId: 'contain_d', wallSide: 'north', position: 0 },    // → hall_contd_elec
  { roomId: 'contain_d', wallSide: 'east', position: 0 },     // → hall_contd_dock
];
