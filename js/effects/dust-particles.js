import * as THREE from 'three';
import { FLASHLIGHT_ANGLE } from '../core/constants.js';

const PARTICLE_COUNT = 300;
const BOX_W = 20;
const BOX_H = 4;
const BOX_D = 20;
const DRIFT_SPEED = 0.15; // units/sec max drift
const HALF_W = BOX_W / 2;
const HALF_D = BOX_D / 2;

const vertexShader = `
  uniform vec3 uFlashlightPos;
  uniform vec3 uFlashlightDir;
  uniform float uFlashlightAngle;
  uniform float uFlashlightOn;

  varying float vBrightness;

  void main() {
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vec4 mvPos = viewMatrix * worldPos;

    // Distance from flashlight
    vec3 toParticle = worldPos.xyz - uFlashlightPos;
    float dist = length(toParticle);

    // Cone check
    float brightness = 0.04; // ambient base (barely visible)
    if (uFlashlightOn > 0.5 && dist < 12.0) {
      vec3 toNorm = normalize(toParticle);
      float cosAngle = dot(toNorm, uFlashlightDir);
      float cosCone = cos(uFlashlightAngle);

      if (cosAngle > cosCone) {
        // Inside cone — brightness based on how centered + how close
        float coneFactor = (cosAngle - cosCone) / (1.0 - cosCone);
        float distFactor = 1.0 - (dist / 12.0);
        brightness += coneFactor * distFactor * 0.7;
      }

      // Proximity glow (close to flashlight source regardless of cone)
      if (dist < 3.0) {
        brightness += (1.0 - dist / 3.0) * 0.15;
      }
    }

    vBrightness = clamp(brightness, 0.0, 1.0);
    gl_PointSize = mix(1.5, 3.5, vBrightness);
    gl_Position = projectionMatrix * mvPos;
  }
`;

const fragmentShader = `
  varying float vBrightness;

  void main() {
    // Circular point
    vec2 center = gl_PointCoord - 0.5;
    if (dot(center, center) > 0.25) discard;

    float alpha = vBrightness * 0.8;
    gl_FragColor = vec4(0.85, 0.85, 0.80, alpha);
  }
`;

export class DustParticles {
  constructor(game) {
    this.game = game;

    // Particle positions (world space) and velocities
    const positions = new Float32Array(PARTICLE_COUNT * 3);
    this._velocities = new Float32Array(PARTICLE_COUNT * 3);

    // Initial spawn around origin (will be repositioned on first update)
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const i3 = i * 3;
      positions[i3]     = (Math.random() - 0.5) * BOX_W;
      positions[i3 + 1] = Math.random() * BOX_H;
      positions[i3 + 2] = (Math.random() - 0.5) * BOX_D;

      this._velocities[i3]     = (Math.random() - 0.5) * DRIFT_SPEED;
      this._velocities[i3 + 1] = (Math.random() - 0.5) * DRIFT_SPEED * 0.3;
      this._velocities[i3 + 2] = (Math.random() - 0.5) * DRIFT_SPEED;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    this._material = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: {
        uFlashlightPos: { value: new THREE.Vector3() },
        uFlashlightDir: { value: new THREE.Vector3(0, 0, -1) },
        uFlashlightAngle: { value: FLASHLIGHT_ANGLE },
        uFlashlightOn: { value: 1.0 },
      },
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    // Points at world origin — positions are in world space
    this._points = new THREE.Points(geometry, this._material);
    this._points.frustumCulled = false;
    game.scene.add(this._points);

    // Reusable vectors
    this._flashWorldPos = new THREE.Vector3();
    this._flashWorldDir = new THREE.Vector3();
    this._firstUpdate = true;
  }

  update(dt) {
    const player = this.game.player;
    const px = player.position.x;
    const py = player.position.y;
    const pz = player.position.z;

    const posAttr = this._points.geometry.getAttribute('position');
    const arr = posAttr.array;

    // On first update, scatter particles around the player's actual position
    if (this._firstUpdate) {
      this._firstUpdate = false;
      for (let i = 0; i < PARTICLE_COUNT; i++) {
        const i3 = i * 3;
        arr[i3]     = px + (Math.random() - 0.5) * BOX_W;
        arr[i3 + 1] = (py - 1) + Math.random() * BOX_H;
        arr[i3 + 2] = pz + (Math.random() - 0.5) * BOX_D;
      }
    }

    // Drift particles and recycle ones that are too far from the player
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const i3 = i * 3;

      // Drift
      arr[i3]     += this._velocities[i3] * dt;
      arr[i3 + 1] += this._velocities[i3 + 1] * dt;
      arr[i3 + 2] += this._velocities[i3 + 2] * dt;

      // Check if particle is outside the box centered on the player
      const dx = arr[i3] - px;
      const dy = arr[i3 + 1] - (py - 1);
      const dz = arr[i3 + 2] - pz;

      // Respawn on the opposite edge when leaving the box
      if (dx > HALF_W)       arr[i3]     = px - HALF_W + Math.random() * 0.5;
      else if (dx < -HALF_W) arr[i3]     = px + HALF_W - Math.random() * 0.5;

      if (dy > BOX_H)   arr[i3 + 1] = (py - 1) + Math.random() * 0.5;
      else if (dy < 0)  arr[i3 + 1] = (py - 1) + BOX_H - Math.random() * 0.5;

      if (dz > HALF_D)       arr[i3 + 2] = pz - HALF_D + Math.random() * 0.5;
      else if (dz < -HALF_D) arr[i3 + 2] = pz + HALF_D - Math.random() * 0.5;

      // Randomize velocity for respawned particles at edges
      if (Math.abs(dx) > HALF_W - 0.5 || Math.abs(dz) > HALF_D - 0.5) {
        this._velocities[i3]     = (Math.random() - 0.5) * DRIFT_SPEED;
        this._velocities[i3 + 1] = (Math.random() - 0.5) * DRIFT_SPEED * 0.3;
        this._velocities[i3 + 2] = (Math.random() - 0.5) * DRIFT_SPEED;
      }
    }
    posAttr.needsUpdate = true;

    // Update flashlight uniforms
    const flashlight = player.flashlight;
    const uniforms = this._material.uniforms;

    uniforms.uFlashlightOn.value = flashlight.isOn ? 1.0 : 0.0;

    // Get flashlight world position and direction
    flashlight.light.getWorldPosition(this._flashWorldPos);
    uniforms.uFlashlightPos.value.copy(this._flashWorldPos);

    // Flashlight direction = toward target in world space
    flashlight.light.target.getWorldPosition(this._flashWorldDir);
    this._flashWorldDir.sub(this._flashWorldPos).normalize();
    uniforms.uFlashlightDir.value.copy(this._flashWorldDir);
  }
}
