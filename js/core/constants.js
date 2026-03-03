// Player movement
export const PLAYER_SPEED = 5;
export const PLAYER_SPRINT_MULTIPLIER = 1.8;
export const PLAYER_JUMP_FORCE = 8;
export const PLAYER_GRAVITY = 20;
export const PLAYER_STAND_HEIGHT = 1.7;
export const PLAYER_CROUCH_HEIGHT = 0.8;
export const PLAYER_RADIUS = 0.35;
export const PLAYER_CROUCH_SPEED_MULTIPLIER = 0.5;
export const PLAYER_CART_SPEED_MULTIPLIER = 0.4;
export const PLAYER_ACCELERATION = 25;
export const PLAYER_DECELERATION = 15;

// Mouse
export const MOUSE_SENSITIVITY = 0.002;
export const PITCH_MIN = -Math.PI / 2 + 0.01;
export const PITCH_MAX = Math.PI / 2 - 0.01;

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
