// Facility layout data - all room and hallway definitions
// Coordinate system: X = east/west, Z = north/south, Y = up
//
// Cross-shaped facility with hallway ring around 4 center rooms:
//
//   North arm:    CONTAIN-A(-7.5,19)  CONTAIN-B(7.5,19)
//                        [NORTH HALLWAY z=12.5]
//   West arm:   ELEVATOR(-19.25,5)   LAB(-5,5) | FOOD-PROC(5,5)   WATER-FILT(19.25,5)   :East arm
//               CMD-CTR(-19.25,-5)   SERVER(-5,-5)|GEN-RM(5,-5)    STORAGE(19.25,-5)
//                        [SOUTH HALLWAY z=-12.5]
//   South arm:   CONTAIN-C(-7.5,-19) CONTAIN-D(7.5,-19)
//
// Hallway ring at X=±12.5, Z=±12.5 (width 5)
// L-joint corners connect N/S to E/W hallways

export const WALL_THICKNESS = 0.3;
export const DOOR_WIDTH = 2.5;
export const DOOR_HEIGHT = 2.8;
export const HALLWAY_WIDTH = 5.0;
export const HALLWAY_HEIGHT = 4.0;

export const rooms = [
  // --- Center rooms (2x2 grid, shared walls at X=0 and Z=0) ---
  {
    id: 'lab',
    label: 'Lab',
    center: [-5, 5],
    size: [10, 10],
    ceilingHeight: 4.0,
    lightColor: 0xddccaa,
    lightIntensity: 1.0,
    propType: 'lab',
  },
  {
    id: 'food_processing',
    label: 'Food Processing',
    center: [5, 5],
    size: [10, 10],
    ceilingHeight: 4.0,
    lightColor: 0xdd8833,
    lightIntensity: 0.9,
    propType: 'food_processing',
  },
  {
    id: 'server_room',
    label: 'Server Room',
    center: [-5, -5],
    size: [10, 10],
    ceilingHeight: 4.0,
    lightColor: 0x5588cc,
    lightIntensity: 0.6,
    propType: 'server_room',
  },
  {
    id: 'generator_room',
    label: 'Generator Room',
    center: [5, -5],
    size: [10, 10],
    ceilingHeight: 4.0,
    lightColor: 0xccaa33,
    lightIntensity: 0.9,
    propType: 'generator_room',
  },

  // --- West arm rooms (door on east wall → west hallway) ---
  {
    id: 'elevator',
    label: 'Elevator',
    center: [-19.25, 5],
    size: [8.5, 10],
    ceilingHeight: 4.0,
    lightColor: 0xcccccc,
    lightIntensity: 0.8,
    propType: 'elevator',
  },
  {
    id: 'command_center',
    label: 'Command Center',
    center: [-19.25, -5],
    size: [8.5, 10],
    ceilingHeight: 4.0,
    lightColor: 0x88aacc,
    lightIntensity: 1.0,
    propType: 'command_center',
  },

  // --- East arm rooms (door on west wall → east hallway) ---
  {
    id: 'water_filtration',
    label: 'Water Filtration',
    center: [19.25, 5],
    size: [8.5, 10],
    ceilingHeight: 4.0,
    lightColor: 0x88bbdd,
    lightIntensity: 0.8,
    propType: 'water_filtration',
  },
  {
    id: 'storage',
    label: 'Storage Closet',
    center: [19.25, -5],
    size: [8.5, 10],
    ceilingHeight: 4.0,
    lightColor: 0xaa8855,
    lightIntensity: 0.5,
    propType: 'storage',
  },

  // --- North arm containment (door on south wall → north hallway) ---
  {
    id: 'contain_a',
    label: 'Containment A',
    center: [-7.5, 19],
    size: [15, 8],
    ceilingHeight: 4.0,
    lightColor: 0x44cc66,
    lightIntensity: 0.7,
    propType: 'containment',
  },
  {
    id: 'contain_b',
    label: 'Containment B',
    center: [7.5, 19],
    size: [15, 8],
    ceilingHeight: 4.0,
    lightColor: 0x44cc66,
    lightIntensity: 0.7,
    propType: 'containment',
  },

  // --- South arm containment (door on north wall → south hallway) ---
  {
    id: 'contain_c',
    label: 'Containment C',
    center: [-7.5, -19],
    size: [15, 8],
    ceilingHeight: 4.0,
    lightColor: 0x44cc66,
    lightIntensity: 0.7,
    propType: 'containment',
  },
  {
    id: 'contain_d',
    label: 'Containment D',
    center: [7.5, -19],
    size: [15, 8],
    ceilingHeight: 4.0,
    lightColor: 0x44cc66,
    lightIntensity: 0.7,
    propType: 'containment',
  },
];

// Hallway segments — all with walls:'none' since room walls form boundaries
// L-joint corners are short segments connecting perpendicular hallways
export const hallways = [
  // Main ring segments (floor + ceiling only)
  { id: 'hall_north', start: [-10, 12.5], end: [10, 12.5], walls: 'none' },
  { id: 'hall_south', start: [-10, -12.5], end: [10, -12.5], walls: 'none' },
  { id: 'hall_west', start: [-12.5, -10], end: [-12.5, 10], walls: 'none' },
  { id: 'hall_east', start: [12.5, -10], end: [12.5, 10], walls: 'none' },

  // L-joint corners (5 x 5 floor patches)
  { id: 'corner_nw', start: [-15, 12.5], end: [-10, 12.5], walls: 'none' },
  { id: 'corner_ne', start: [10, 12.5], end: [15, 12.5], walls: 'none' },
  { id: 'corner_sw', start: [-15, -12.5], end: [-10, -12.5], walls: 'none' },
  { id: 'corner_se', start: [10, -12.5], end: [15, -12.5], walls: 'none' },
];

// Doorway definitions: one per room-hallway connection
// Each room has exactly ONE door
// Doorway definitions: one per room-hallway connection
// Doors are staggered along the hallway so no two are directly across from each other
export const doorways = [
  // West hallway — inner doors (center rooms) offset +2, outer doors offset -2
  { roomId: 'lab', wallSide: 'west', position: 2 },               // Z=7
  { roomId: 'server_room', wallSide: 'west', position: 2 },       // Z=-3
  { roomId: 'elevator', wallSide: 'east', position: 0, noDoor: true }, // wall opening aligned with shaft doors (Z=5)
  { roomId: 'command_center', wallSide: 'east', position: -2 },   // Z=-7

  // East hallway — inner doors offset -2, outer doors offset +2
  { roomId: 'food_processing', wallSide: 'east', position: -2 },  // Z=3
  { roomId: 'generator_room', wallSide: 'east', position: -2 },   // Z=-7
  { roomId: 'water_filtration', wallSide: 'west', position: 2 },  // Z=7
  { roomId: 'storage', wallSide: 'west', position: 2 },           // Z=-3

  // North arm containment — already far apart (15 units), no stagger needed
  { roomId: 'contain_a', wallSide: 'south', position: 0 },
  { roomId: 'contain_b', wallSide: 'south', position: 0 },

  // South arm containment
  { roomId: 'contain_c', wallSide: 'north', position: 0 },
  { roomId: 'contain_d', wallSide: 'north', position: 0 },
];
