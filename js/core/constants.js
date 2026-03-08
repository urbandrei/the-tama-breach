// Player movement
export const PLAYER_SPEED = 5;
export const PLAYER_SPRINT_MULTIPLIER = 1.8;
export const PLAYER_JUMP_FORCE = 5;
export const PLAYER_GRAVITY = 20;
export const PLAYER_STAND_HEIGHT = 1.7;
export const PLAYER_CROUCH_HEIGHT = 0.8;
export const PLAYER_RADIUS = 0.35;
export const PLAYER_CROUCH_SPEED_MULTIPLIER = 0.5;
export const PLAYER_CART_SPEED_MULTIPLIER = 0.4;
export const PLAYER_ACCELERATION = 25;
export const PLAYER_DECELERATION = 15;

// Stamina
export const PLAYER_MAX_STAMINA = 100;
export const PLAYER_STAMINA_DRAIN = 20;
export const PLAYER_STAMINA_REGEN = 15;
export const PLAYER_STAMINA_REGEN_DELAY = 1.0;

// Mouse
export const MOUSE_SENSITIVITY = 0.002;
export const PITCH_MIN = -Math.PI / 3;          // -60° (looking all the way down opens device)
export const PITCH_MAX = Math.PI / 2 - 0.01;

// Device look-down open
export const DEVICE_OPEN_PITCH = -Math.PI / 3;       // pitch that triggers device open
export const DEVICE_REARM_PITCH = -Math.PI / 3 + 0.01; // essentially immediate re-arm
export const DEVICE_CLOSE_BUFFER_PX = 30;             // px above device top edge to trigger close
export const DEVICE_OPEN_COOLDOWN = 0.05;             // brief grace period after close

// Camera
export const CAMERA_FOV = 75;
export const CAMERA_NEAR = 0.1;
export const CAMERA_FAR = 100;
export const CAMERA_FOV_SPRINT = 85;
export const CAMERA_FOV_CROUCH = 70;

// Head bob
export const HEAD_BOB_FREQUENCY = 8;
export const HEAD_BOB_AMPLITUDE_Y = 0.04;
export const HEAD_BOB_AMPLITUDE_X = 0.02;
export const HEAD_BOB_SPRINT_MULTIPLIER = 1.4;

// Flashlight
export const FLASHLIGHT_ANGLE = Math.PI / 6;
export const FLASHLIGHT_PENUMBRA = 0.5;
export const FLASHLIGHT_DISTANCE = 15;
export const FLASHLIGHT_INTENSITY = 5;
export const FLASHLIGHT_COLOR = 0xfff4e0;

// Interaction
export const INTERACT_RANGE = 2.5;

// Physics
export const COLLISION_RAY_COUNT = 8;
export const GROUND_RAY_OFFSET = 0.1;

// Game states
export const GameState = Object.freeze({
  MENU: 'MENU',
  NIGHT_INTRO: 'NIGHT_INTRO',
  PLAYING: 'PLAYING',
  DEVICE_OPEN: 'DEVICE_OPEN',
  TASK_ACTIVE: 'TASK_ACTIVE',
  PAUSED: 'PAUSED',
  DEATH: 'DEATH',
  NIGHT_OUTRO: 'NIGHT_OUTRO',
  VICTORY: 'VICTORY',
});
