export class Input {
  constructor(canvas) {
    this.canvas = canvas;

    this._keys = new Map();
    this._keysPressed = new Map();
    this._mouseX = 0;
    this._mouseY = 0;
    this._mouseButtons = new Set();
    this._mouseButtonsPressed = new Set();
    this._isPointerLocked = false;

    this._onKeyDown = this._onKeyDown.bind(this);
    this._onKeyUp = this._onKeyUp.bind(this);
    this._onMouseMove = this._onMouseMove.bind(this);
    this._onMouseDown = this._onMouseDown.bind(this);
    this._onMouseUp = this._onMouseUp.bind(this);
    this._onPointerLockChange = this._onPointerLockChange.bind(this);

    document.addEventListener('keydown', this._onKeyDown);
    document.addEventListener('keyup', this._onKeyUp);
    document.addEventListener('mousemove', this._onMouseMove);
    document.addEventListener('mousedown', this._onMouseDown);
    document.addEventListener('mouseup', this._onMouseUp);
    document.addEventListener('pointerlockchange', this._onPointerLockChange);
  }

  _onKeyDown(e) {
    if (!this._keys.get(e.code)) {
      this._keysPressed.set(e.code, true);
    }
    this._keys.set(e.code, true);
  }

  _onKeyUp(e) {
    this._keys.set(e.code, false);
  }

  _onMouseMove(e) {
    if (this._isPointerLocked) {
      this._mouseX += e.movementX;
      this._mouseY += e.movementY;
    }
  }

  _onMouseDown(e) {
    if (!this._mouseButtons.has(e.button)) {
      this._mouseButtonsPressed.add(e.button);
    }
    this._mouseButtons.add(e.button);
  }

  _onMouseUp(e) {
    this._mouseButtons.delete(e.button);
  }

  _onPointerLockChange() {
    this._isPointerLocked = document.pointerLockElement === this.canvas;
  }

  isKeyDown(code) {
    return this._keys.get(code) || false;
  }

  isKeyPressed(code) {
    return this._keysPressed.get(code) || false;
  }

  isMouseButtonDown(button) {
    return this._mouseButtons.has(button);
  }

  isMouseButtonPressed(button) {
    return this._mouseButtonsPressed.has(button);
  }

  getMouseDelta() {
    return { x: this._mouseX, y: this._mouseY };
  }

  get isPointerLocked() {
    return this._isPointerLocked;
  }

  requestPointerLock() {
    this.canvas.requestPointerLock();
  }

  releasePointerLock() {
    if (this._isPointerLocked) {
      document.exitPointerLock();
    }
  }

  resetFrame() {
    this._mouseX = 0;
    this._mouseY = 0;
    this._keysPressed.clear();
    this._mouseButtonsPressed.clear();
  }

  dispose() {
    document.removeEventListener('keydown', this._onKeyDown);
    document.removeEventListener('keyup', this._onKeyUp);
    document.removeEventListener('mousemove', this._onMouseMove);
    document.removeEventListener('mousedown', this._onMouseDown);
    document.removeEventListener('mouseup', this._onMouseUp);
    document.removeEventListener('pointerlockchange', this._onPointerLockChange);
  }
}
