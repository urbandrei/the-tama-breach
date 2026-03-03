import * as THREE from 'three';

const CANVAS_PADDING = 8;
const FONT_SIZE = 14;
const CHAR_WIDTH = 8.4;
const LINE_HEIGHT = 16;
const SPRITE_SCALE = 0.8;

const BOB_SPEED = 2.0;
const BOB_AMPLITUDE = 0.05;

export class BillboardSprite {
  constructor(asciiLinesOrFrames, color = '#00ff41') {
    this._color = color;
    this._bobTimer = Math.random() * Math.PI * 2;

    // Animation state
    this._frames = null;
    this._frameIndex = 0;
    this._frameTimer = 0;
    this._frameInterval = 0.8;

    // Glitch state
    this._glitchIntensity = 0;
    this._glitchChars = ['#', '!', '|', '%', '@', '\u2588'];

    this._canvas = document.createElement('canvas');
    this._ctx = this._canvas.getContext('2d');
    this._texture = new THREE.CanvasTexture(this._canvas);
    this._texture.minFilter = THREE.NearestFilter;
    this._texture.magFilter = THREE.NearestFilter;

    // Detect array-of-arrays (multi-frame) vs flat array
    const initialLines = this._resolveInitialLines(asciiLinesOrFrames);
    this._renderToCanvas(initialLines, color);

    const material = new THREE.SpriteMaterial({
      map: this._texture,
      transparent: true,
      depthTest: true,
      depthWrite: false,
    });

    this.sprite = new THREE.Sprite(material);

    const aspect = this._canvas.width / this._canvas.height;
    this.sprite.scale.set(SPRITE_SCALE * aspect, SPRITE_SCALE, 1);

    this._baseY = 0;
  }

  _resolveInitialLines(input) {
    if (Array.isArray(input) && input.length > 0 && Array.isArray(input[0])) {
      // Array of frames — use first frame
      return input[0];
    }
    return input;
  }

  _renderToCanvas(lines, color) {
    const maxLineLen = Math.max(...lines.map(l => l.length));
    const width = Math.ceil(maxLineLen * CHAR_WIDTH) + CANVAS_PADDING * 2;
    const height = lines.length * LINE_HEIGHT + CANVAS_PADDING * 2;

    this._canvas.width = width;
    this._canvas.height = height;

    const ctx = this._ctx;
    ctx.clearRect(0, 0, width, height);

    ctx.font = `${FONT_SIZE}px monospace`;
    ctx.textBaseline = 'top';

    if (this._glitchIntensity > 0) {
      this._renderGlitched(ctx, lines, color);
    } else {
      ctx.fillStyle = color;
      for (let i = 0; i < lines.length; i++) {
        ctx.fillText(lines[i], CANVAS_PADDING, CANVAS_PADDING + i * LINE_HEIGHT);
      }
    }

    this._texture.needsUpdate = true;
  }

  _renderGlitched(ctx, lines, baseColor) {
    const intensity = this._glitchIntensity;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineY = CANVAS_PADDING + i * LINE_HEIGHT;

      // Per-line: random X offset
      let xOffset = 0;
      if (Math.random() < intensity * 0.5) {
        xOffset = (Math.random() - 0.5) * 10;
      }

      // Per-line: random color flash
      let lineColor = baseColor;
      if (Math.random() < intensity * 0.4) {
        lineColor = Math.random() > 0.5 ? '#ff4444' : '#ffff00';
      }

      // Render char-by-char
      for (let j = 0; j < line.length; j++) {
        let ch = line[j];

        // Per-character: random replacement
        if (ch !== ' ' && Math.random() < intensity * 0.15) {
          ch = this._glitchChars[Math.floor(Math.random() * this._glitchChars.length)];
        }

        ctx.fillStyle = lineColor;
        ctx.fillText(ch, CANVAS_PADDING + xOffset + j * CHAR_WIDTH, lineY);
      }
    }
  }

  setAscii(lines, color) {
    if (color) this._color = color;
    // Stop animation when manually setting ASCII
    this._frames = null;
    this._frameIndex = 0;
    this._frameTimer = 0;

    const resolved = this._resolveInitialLines(lines);
    this._renderToCanvas(resolved, this._color);

    const aspect = this._canvas.width / this._canvas.height;
    this.sprite.scale.set(SPRITE_SCALE * aspect, SPRITE_SCALE, 1);
  }

  setAnimation(frames, color, interval) {
    if (color) this._color = color;
    this._frames = frames;
    this._frameIndex = 0;
    this._frameTimer = 0;
    this._frameInterval = interval || 0.8;

    if (frames && frames.length > 0) {
      this._renderToCanvas(frames[0], this._color);
      const aspect = this._canvas.width / this._canvas.height;
      this.sprite.scale.set(SPRITE_SCALE * aspect, SPRITE_SCALE, 1);
    }
  }

  setGlitch(intensity) {
    this._glitchIntensity = intensity;
  }

  clearGlitch() {
    this._glitchIntensity = 0;
  }

  setPosition(x, y, z) {
    this._baseY = y;
    this.sprite.position.set(x, y, z);
  }

  update(dt) {
    this._bobTimer += BOB_SPEED * dt;
    this.sprite.position.y = this._baseY + Math.sin(this._bobTimer) * BOB_AMPLITUDE;

    // Animation cycling
    if (this._frames && this._frames.length > 1) {
      this._frameTimer += dt;
      if (this._frameTimer >= this._frameInterval) {
        this._frameTimer -= this._frameInterval;
        this._frameIndex = (this._frameIndex + 1) % this._frames.length;
        this._renderToCanvas(this._frames[this._frameIndex], this._color);
      } else if (this._glitchIntensity > 0) {
        // Re-render every frame when glitched for fresh random corruption
        this._renderToCanvas(this._frames[this._frameIndex], this._color);
      }
    } else if (this._glitchIntensity > 0 && this._frames && this._frames.length === 1) {
      // Single frame but glitched — re-render for corruption
      this._renderToCanvas(this._frames[0], this._color);
    }
  }

  addTo(parent) {
    parent.add(this.sprite);
  }

  removeFromParent() {
    if (this.sprite.parent) {
      this.sprite.parent.remove(this.sprite);
    }
  }

  dispose() {
    this._texture.dispose();
    this.sprite.material.dispose();
  }
}
