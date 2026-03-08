export const NIGHT_CONFIGS = [
  {
    night: 1,
    title: 'NIGHT 1',
    briefing: 'First shift. Transport Specimen Nibbles to containment.\nComplete basic facility checks.',
    taskPool: ['electrical_qte', 'server_wires', 'water_pipes', 'storage_calibrate'],
    taskInterval: [45, 75],
    nightDuration: 540, // 9 min
    activeTamas: ['nibbles'],
    decayMultiplier: 0.6,
    transportTamaId: 'nibbles',
    transportDelay: 60,   // cart appears at ~1 min
    eggHatchTime: 120,    // hatches ~2 min after appearing (~min 3)
    setupTasks: { targetRoomId: 'contain_a', targetPosition: [-7.5, 0, 19] },
    events: {
      oneShot: [
        { hour: 2, type: 'flicker', rooms: ['hallway_north'] },
        { hour: 4, type: 'surge', duration: 1.5 },
      ],
      repeating: [
        { interval: 120, type: 'flicker_random' },
      ],
    },
  },
  {
    night: 2,
    title: 'NIGHT 2',
    briefing: 'Specimen Void has arrived. Two specimens to monitor.\nStay alert.',
    taskPool: ['electrical_qte', 'server_wires', 'water_pipes', 'storage_calibrate', 'food_sorting'],
    taskInterval: [40, 65],
    nightDuration: 540,
    activeTamas: ['nibbles', 'void'],
    decayMultiplier: 0.8,
    transportTamaId: 'void',
    transportDelay: 120,
    eggHatchTime: 120,
    setupTasks: { targetRoomId: 'contain_b', targetPosition: [7.5, 0, 19] },
    events: {
      oneShot: [
        { hour: 1.5, type: 'flicker', rooms: ['contain_b'] },
        { hour: 3, type: 'surge', duration: 2.0 },
        { hour: 4.5, type: 'flicker', rooms: ['hallway_south', 'hallway_east'] },
      ],
      repeating: [
        { interval: 90, type: 'flicker_random' },
      ],
    },
  },
  {
    night: 3,
    title: 'NIGHT 3',
    briefing: 'Specimen Glitch is unstable. Screens may lie.\nWatch the containment glass.',
    taskPool: ['electrical_qte', 'server_wires', 'water_pipes', 'storage_calibrate', 'food_sorting'],
    taskInterval: [35, 55],
    nightDuration: 570, // 9.5 min
    activeTamas: ['nibbles', 'void', 'glitch'],
    decayMultiplier: 1.0,
    transportTamaId: 'glitch',
    transportDelay: 100,  // slightly earlier (pressure)
    eggHatchTime: 120,
    setupTasks: { targetRoomId: 'contain_c', targetPosition: [-7.5, 0, -19] },
    events: {
      oneShot: [
        { hour: 1, type: 'flicker', rooms: ['contain_c'] },
        { hour: 2.5, type: 'surge', duration: 2.5 },
        { hour: 4, type: 'surge', duration: 1.5 },
      ],
      repeating: [
        { interval: 75, type: 'flicker_random' },
        { interval: 60, type: 'flicker', rooms: ['contain_c'] },
      ],
    },
  },
  {
    night: 4,
    title: 'NIGHT 4',
    briefing: 'Specimen Feral has been captured. Full containment.\nDo not let them out.',
    taskPool: ['electrical_qte', 'server_wires', 'water_pipes', 'storage_calibrate', 'food_sorting'],
    taskInterval: [30, 50],
    nightDuration: 570,
    activeTamas: ['nibbles', 'void', 'glitch', 'feral'],
    decayMultiplier: 1.3,
    transportTamaId: 'feral',
    transportDelay: 90,   // earlier + faster hatch
    eggHatchTime: 100,
    setupTasks: { targetRoomId: 'contain_d', targetPosition: [7.5, 0, -19] },
    events: {
      oneShot: [
        { hour: 1, type: 'surge', duration: 2.0 },
        { hour: 2.5, type: 'flicker', rooms: ['contain_d', 'contain_a'] },
        { hour: 3.5, type: 'surge', duration: 3.0 },
        { hour: 5, type: 'surge', duration: 2.0 },
      ],
      repeating: [
        { interval: 60, type: 'flicker_random' },
      ],
    },
  },
  {
    night: 5,
    title: 'NIGHT 5',
    briefing: 'Final shift. All specimens are agitated.\nSurvive until dawn.',
    taskPool: ['electrical_qte', 'server_wires', 'water_pipes', 'storage_calibrate', 'food_sorting'],
    taskInterval: [25, 40],
    nightDuration: 600, // 10 min
    activeTamas: ['nibbles', 'void', 'glitch', 'feral'],
    decayMultiplier: 1.6,
    events: {
      oneShot: [
        { hour: 0.5, type: 'surge', duration: 3.0 },
        { hour: 2, type: 'surge', duration: 2.0 },
        { hour: 3, type: 'flicker', rooms: ['contain_a', 'contain_b', 'contain_c', 'contain_d'] },
        { hour: 4, type: 'surge', duration: 3.0 },
        { hour: 5, type: 'surge', duration: 2.5 },
      ],
      repeating: [
        { interval: 45, type: 'flicker_random' },
        { interval: 90, type: 'surge', duration: 1.5 },
      ],
    },
  },
];
