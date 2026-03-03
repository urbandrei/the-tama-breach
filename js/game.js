import * as THREE from 'three';
import { CAMERA_FOV, CAMERA_NEAR, CAMERA_FAR, GameState } from './core/constants.js';
import { Input } from './core/input.js';
import { Physics } from './core/physics.js';
import { PlayerController } from './player/player-controller.js';

export class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.state = GameState.PLAYING;

    // Event bus
    this._listeners = {};

    // Renderer
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false,
    });
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.BasicShadowMap;
    this.renderer.toneMapping = THREE.LinearToneMapping;

    // Scene
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x000000);
    this.scene.fog = new THREE.FogExp2(0x000000, 0.025);

    // Camera
    this.camera = new THREE.PerspectiveCamera(
      CAMERA_FOV,
      window.innerWidth / window.innerHeight,
      CAMERA_NEAR,
      CAMERA_FAR,
    );

    // Core systems
    this.input = new Input(canvas);
    this.physics = new Physics();

    // Player
    this.player = new PlayerController(this);

    // Systems (set by main.js)
    this.facility = null;
    this.lightingManager = null;
    this.tamagotchiManager = null;
    this.deviceManager = null;

    // Clock
    this._clock = new THREE.Clock();
    this._running = false;

    // Resize handler
    this._onResize = this._onResize.bind(this);
    window.addEventListener('resize', this._onResize);

    // Pointer lock on click (not while device is open)
    canvas.addEventListener('click', () => {
      if (!this.input.isPointerLocked && this.state !== GameState.DEVICE_OPEN) {
        this.input.requestPointerLock();
      }
    });
  }

  // Event bus methods
  on(event, callback) {
    if (!this._listeners[event]) this._listeners[event] = [];
    this._listeners[event].push(callback);
  }

  off(event, callback) {
    const list = this._listeners[event];
    if (!list) return;
    const idx = list.indexOf(callback);
    if (idx !== -1) list.splice(idx, 1);
  }

  emit(event, data) {
    const list = this._listeners[event];
    if (!list) return;
    for (const cb of list) {
      cb(data);
    }
  }

  start() {
    this._running = true;
    this._clock.start();
    this._loop();
  }

  stop() {
    this._running = false;
  }

  _loop() {
    if (!this._running) return;
    requestAnimationFrame(() => this._loop());

    const dt = Math.min(this._clock.getDelta(), 0.1);

    this._update(dt);
    this.renderer.render(this.scene, this.camera);
    this.input.resetFrame();
  }

  _update(dt) {
    if (this.state === GameState.PLAYING || this.state === GameState.DEVICE_OPEN) {
      this.player.update(dt);
      if (this.facility) this.facility.update(dt);
      if (this.tamagotchiManager) this.tamagotchiManager.update(dt);
      if (this.lightingManager) this.lightingManager.update(dt);
      if (this.deviceManager) this.deviceManager.update(dt);
    }
  }

  _onResize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }
}
