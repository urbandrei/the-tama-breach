import * as THREE from 'three';

const CANVAS_PADDING = 8;
const FONT_SIZE = 14;
const CHAR_WIDTH = 8.4;
const LINE_HEIGHT = 16;
const SPRITE_SCALE = 0.8;

const BOB_SPEED = 2.0;
const BOB_AMPLITUDE = 0.05;

export class BillboardSprite {
  constructor(asciiLines, color = '#00ff41') {
    this._color = color;
    this._bobTimer = Math.random() * Math.PI * 2;

    this._canvas = document.createElement('canvas');
    this._ctx = this._canvas.getContext('2d');
    this._texture = new THREE.CanvasTexture(this._canvas);
    this._texture.minFilter = THREE.NearestFilter;
    this._texture.magFilter = THREE.NearestFilter;

    this._renderToCanvas(asciiLines, color);

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

  _renderToCanvas(lines, color) {
    const maxLineLen = Math.max(...lines.map(l => l.length));
    const width = Math.ceil(maxLineLen * CHAR_WIDTH) + CANVAS_PADDING * 2;
    const height = lines.length * LINE_HEIGHT + CANVAS_PADDING * 2;

    this._canvas.width = width;
    this._canvas.height = height;

    const ctx = this._ctx;
    ctx.clearRect(0, 0, width, height);

    ctx.font = `${FONT_SIZE}px monospace`;
    ctx.fillStyle = color;
    ctx.textBaseline = 'top';

    for (let i = 0; i < lines.length; i++) {
      ctx.fillText(lines[i], CANVAS_PADDING, CANVAS_PADDING + i * LINE_HEIGHT);
    }

    this._texture.needsUpdate = true;
  }

  setAscii(lines, color) {
    if (color) this._color = color;
    this._renderToCanvas(lines, this._color);

    const aspect = this._canvas.width / this._canvas.height;
    this.sprite.scale.set(SPRITE_SCALE * aspect, SPRITE_SCALE, 1);
  }

  setPosition(x, y, z) {
    this._baseY = y;
    this.sprite.position.set(x, y, z);
  }

  update(dt) {
    this._bobTimer += BOB_SPEED * dt;
    this.sprite.position.y = this._baseY + Math.sin(this._bobTimer) * BOB_AMPLITUDE;
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
