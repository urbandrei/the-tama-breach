export const TamaState = Object.freeze({
  CONTAINED: 'contained',
  AGITATED: 'agitated',
  ESCAPING: 'escaping',
  ESCAPED: 'escaped',
  LURED: 'lured',
  RECAPTURED: 'recaptured',
});

export const PERSONALITIES = {
  nibbles: {
    id: 'nibbles',
    name: 'Nibbles',
    description: 'Curious and hungry',
    roomId: 'contain_a',
    sprite: {
      idle: [
        [
          '    .--.    ',
          '   / o o\\   ',
          '  |   >  |  ',
          '   \\_--_/   ',
          '    /||\\    ',
          '   / || \\   ',
        ],
        [
          '    .--.    ',
          '   / o o\\   ',
          '  |   <  |  ',
          '   \\_--_/   ',
          '    /||\\    ',
          '   /  ||\\   ',
        ],
      ],
      agitated: [
        [
          '    .--.    ',
          '   / O O\\   ',
          '  |   <  |  ',
          '   \\_!!_/   ',
          '   ~/||\\~   ',
          '   / || \\   ',
        ],
        [
          '    .--.    ',
          '   / O O\\   ',
          '  |   >  |  ',
          '   \\_!!_/   ',
          '  ~/||\\~    ',
          '   / || \\   ',
        ],
      ],
    },
    decayRates: { hunger: 1.8, thirst: 1.0, happiness: 0.8 },
    agitationThreshold: 25,
    containmentStressRate: 2.0,
    preferredAction: 'FEED',
    preferredBonus: 5,
    ai: {
      wanderSpeed: 4.0,
      chaseSpeed: 7.0,
      detectionRange: 8,
      detectionAngle: Math.PI * 0.6,
      soundRange: 12,
      behavior: 'erratic',
    },
    trait: 'Needs feeding most frequently. Loud when escaped.',
  },

  void: {
    id: 'void',
    name: 'Void',
    description: 'Silent and watchful',
    roomId: 'contain_b',
    sprite: {
      idle: [
        [
          '    .==.    ',
          '   / ** \\   ',
          '  |  --  |  ',
          '   \\_==_/   ',
          '    )||(    ',
          '    /  \\    ',
        ],
        [
          '    .==.    ',
          '   / ** \\   ',
          '  |  __  |  ',
          '   \\_==_/   ',
          '    )||(    ',
          '   /    \\   ',
        ],
      ],
      agitated: [
        [
          '    .==.    ',
          '   / @@ \\   ',
          '  |  ~~  |  ',
          '   \\_==_/   ',
          '   ~)||(~   ',
          '    /  \\    ',
        ],
        [
          '    .==.    ',
          '   / @@ \\   ',
          '  |  ~   |  ',
          '   \\_==_/   ',
          '  ~)||(~    ',
          '    /  \\    ',
        ],
      ],
    },
    decayRates: { hunger: 0.8, thirst: 1.4, happiness: 0.6 },
    agitationThreshold: 25,
    containmentStressRate: 1.5,
    preferredAction: 'WATER',
    preferredBonus: 5,
    ai: {
      wanderSpeed: 2.5,
      chaseSpeed: 4.0,
      detectionRange: 18,
      detectionAngle: Math.PI,
      soundRange: 20,
      behavior: 'silent',
    },
    trait: 'Hears everything. Player must crouch nearby.',
  },

  glitch: {
    id: 'glitch',
    name: 'Glitch',
    description: 'Erratic and unstable',
    roomId: 'contain_c',
    sprite: {
      idle: [
        [
          '    /\\/\\    ',
          '   | 0 0|   ',
          '   |  ~  |  ',
          '    \\##/    ',
          '    [||]    ',
          '    /  \\    ',
        ],
        [
          '    /\\/\\    ',
          '   | 0 0|   ',
          '   |  o  |  ',
          '    \\##/    ',
          '    [||]    ',
          '   /    \\   ',
        ],
      ],
      agitated: [
        [
          '   #/\\/\\#   ',
          '   |!0 0!|  ',
          '   | ~~~ |  ',
          '    \\##/    ',
          '   #[||]#   ',
          '    /  \\    ',
        ],
        [
          '  #/\\/\\#    ',
          '   |!0 0!|  ',
          '   |~~~  |  ',
          '    \\##/    ',
          '  #[||]#    ',
          '    /  \\    ',
        ],
      ],
    },
    decayRates: { hunger: 1.2, thirst: 1.0, happiness: 1.5 },
    agitationThreshold: 25,
    containmentStressRate: 2.5,
    preferredAction: 'PLAY',
    preferredBonus: 5,
    ai: {
      wanderSpeed: 3.5,
      chaseSpeed: 5.5,
      detectionRange: 10,
      detectionAngle: Math.PI * 0.5,
      soundRange: 10,
      behavior: 'teleport',
    },
    trait: 'Device stats may lie. Causes screen glitches when near.',
  },

  feral: {
    id: 'feral',
    name: 'Feral',
    description: 'Aggressive and wild',
    roomId: 'contain_d',
    sprite: {
      idle: [
        [
          '   >/\\\\<    ',
          '  / X  X\\   ',
          '  | \\/  |   ',
          '   \\===/    ',
          '    }||{    ',
          '   _/  \\_   ',
        ],
        [
          '   >/\\\\<    ',
          '  / X  X\\   ',
          '  |  \\/|    ',
          '   \\===/    ',
          '    }||{    ',
          '  _/    \\_  ',
        ],
      ],
      agitated: [
        [
          '  !>/\\\\<!   ',
          '  / X  X\\   ',
          '  |!\\/!|    ',
          '   \\===/    ',
          '  !}||{!    ',
          '   _/  \\_   ',
        ],
        [
          ' !>/\\\\<!    ',
          '  / X  X\\   ',
          '  |!\\/! |   ',
          '   \\===/    ',
          ' !}||{!     ',
          '   _/  \\_   ',
        ],
      ],
    },
    decayRates: { hunger: 1.4, thirst: 2.0, happiness: 1.0 },
    agitationThreshold: 25,
    containmentStressRate: 3.0,
    preferredAction: 'WATER',
    preferredBonus: 5,
    ai: {
      wanderSpeed: 4.5,
      chaseSpeed: 8.0,
      detectionRange: 6,
      detectionAngle: Math.PI * 0.4,
      soundRange: 6,
      behavior: 'aggressive',
    },
    trait: 'Gets dehydrated fast. Screen pulses red during chase.',
  },
};

export const EGG_FRAMES = [
  // Stage 0: Still egg
  [
    '    .---.   ',
    '   /     \\  ',
    '  |       | ',
    '  |       | ',
    '   \\     /  ',
    '    `---\'   ',
  ],
  // Stage 1: Small crack
  [
    '    .---.   ',
    '   /  \\  \\  ',
    '  |  / \\ | ',
    '  | /    | ',
    '   \\     /  ',
    '    `---\'   ',
  ],
  // Stage 2: Big crack + wiggle
  [
    '    .---.   ',
    '   / \\|/ \\  ',
    '  | /   \\ | ',
    '  |/ \\|/  | ',
    '   \\     /  ',
    '    `---\'   ',
  ],
];

export const TAMA_ORDER = ['nibbles', 'void', 'glitch', 'feral'];

export const ROOM_TO_TAMA = {
  contain_a: 'nibbles',
  contain_b: 'void',
  contain_c: 'glitch',
  contain_d: 'feral',
};
