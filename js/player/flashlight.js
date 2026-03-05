import * as THREE from 'three';
import {
  FLASHLIGHT_ANGLE, FLASHLIGHT_PENUMBRA, FLASHLIGHT_DISTANCE,
  FLASHLIGHT_INTENSITY, FLASHLIGHT_COLOR,
} from '../core/constants.js';
import { keybindings } from '../core/keybindings.js';

export class Flashlight {
  constructor(game, parent) {
    this.game = game;
    this._isOn = true;
    this._flickerTimer = 0;
    this._isFlickering = false;

    // SpotLight attached to the pitch object (follows camera look direction)
    this.light = new THREE.SpotLight(
      FLASHLIGHT_COLOR,
      FLASHLIGHT_INTENSITY,
      FLASHLIGHT_DISTANCE,
      FLASHLIGHT_ANGLE,
      FLASHLIGHT_PENUMBRA,
    );
    this.light.position.set(0, 0, 0);

    // Target for the spotlight - placed in front of the camera
    this.light.target = new THREE.Object3D();
    this.light.target.position.set(0, 0, -1);
    parent.add(this.light.target);

    parent.add(this.light);
  }

  get isOn() {
    return this._isOn;
  }

  toggle() {
    this._isOn = !this._isOn;

    if (this._isOn) {
      // Brief flicker on activation
      this._isFlickering = true;
      this._flickerTimer = 0;
      this.light.visible = false;
    } else {
      this.light.visible = false;
    }
  }

  update(input, dt) {
    // Toggle on F key
    if (input.isKeyPressed(keybindings.getKey('flashlight'))) {
      this.toggle();
    }

    // Handle flicker on activation
    if (this._isFlickering) {
      this._flickerTimer += dt;
      if (this._flickerTimer < 0.05) {
        this.light.visible = false;
      } else if (this._flickerTimer < 0.1) {
        this.light.visible = true;
      } else if (this._flickerTimer < 0.13) {
        this.light.visible = false;
      } else {
        this.light.visible = true;
        this._isFlickering = false;
      }
    } else if (this._isOn) {
      this.light.visible = true;
    }
  }
}
