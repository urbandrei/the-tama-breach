/**
 * Software cursor that stays confined to a target element's bounds.
 * Uses pointer lock deltas to move a visible cursor element.
 * Dispatches synthetic click events via elementFromPoint.
 */
export class SoftwareCursor {
  constructor() {
    this._active = false;
    this._x = 0;
    this._y = 0;
    this._bounds = null;
    this._hoveredEl = null;
    this._targetEl = null;

    this._onMouseMove = this._onMouseMove.bind(this);
    this._onMouseDown = this._onMouseDown.bind(this);
    this._onMouseUp = this._onMouseUp.bind(this);
    this._onPointerLockChange = this._onPointerLockChange.bind(this);

    this._buildCursor();

    // Deactivate if pointer lock is lost (e.g. user presses Escape)
    document.addEventListener('pointerlockchange', this._onPointerLockChange);
  }

  _buildCursor() {
    this._el = document.createElement('div');
    this._el.id = 'software-cursor';
    document.body.appendChild(this._el);
  }

  get active() { return this._active; }

  activate(targetEl) {
    this._active = true;
    this._targetEl = targetEl;
    this._recalcBounds();
    this._x = (this._bounds.left + this._bounds.right) / 2;
    this._y = (this._bounds.top + this._bounds.bottom) / 2;
    this._el.classList.add('active');
    this._updatePosition();

    document.addEventListener('mousemove', this._onMouseMove);
    document.addEventListener('mousedown', this._onMouseDown);
    document.addEventListener('mouseup', this._onMouseUp);
  }

  deactivate() {
    this._active = false;
    this._targetEl = null;
    this._el.classList.remove('active');
    if (this._hoveredEl) {
      this._hoveredEl.classList.remove('sc-hover');
      this._hoveredEl = null;
    }
    document.removeEventListener('mousemove', this._onMouseMove);
    document.removeEventListener('mousedown', this._onMouseDown);
    document.removeEventListener('mouseup', this._onMouseUp);
  }

  _recalcBounds() {
    if (!this._targetEl) return;
    const rect = this._targetEl.getBoundingClientRect();
    this._bounds = { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom };
  }

  _onMouseMove(e) {
    if (!this._active) return;
    // Ignore synthetic events we dispatched (prevent infinite loop)
    if (e._softwareCursor) return;
    // Recalc bounds in case of resize/scroll
    this._recalcBounds();
    this._x = Math.max(this._bounds.left, Math.min(this._bounds.right, this._x + e.movementX));
    this._y = Math.max(this._bounds.top, Math.min(this._bounds.bottom, this._y + e.movementY));
    this._updatePosition();
    this._updateHover();

    // Dispatch synthetic mousemove so canvas-based tasks (hold-steady) track the cursor
    const target = document.elementFromPoint(this._x, this._y);
    if (target) {
      const synth = new MouseEvent('mousemove', {
        bubbles: true, cancelable: true, clientX: this._x, clientY: this._y,
      });
      synth._softwareCursor = true;
      target.dispatchEvent(synth);
    }
  }

  _onMouseDown(e) {
    if (!this._active || e._softwareCursor) return;
    e.preventDefault();
    const target = document.elementFromPoint(this._x, this._y);
    if (target) {
      const synth = new MouseEvent('mousedown', {
        bubbles: true, cancelable: true, clientX: this._x, clientY: this._y, button: e.button,
      });
      synth._softwareCursor = true;
      target.dispatchEvent(synth);
    }
  }

  _onMouseUp(e) {
    if (!this._active || e._softwareCursor) return;
    e.preventDefault();
    const target = document.elementFromPoint(this._x, this._y);
    if (target) {
      const synthUp = new MouseEvent('mouseup', {
        bubbles: true, cancelable: true, clientX: this._x, clientY: this._y, button: e.button,
      });
      synthUp._softwareCursor = true;
      target.dispatchEvent(synthUp);

      const synthClick = new MouseEvent('click', {
        bubbles: true, cancelable: true, clientX: this._x, clientY: this._y, button: e.button,
      });
      synthClick._softwareCursor = true;
      target.dispatchEvent(synthClick);
    }
  }

  _updatePosition() {
    this._el.style.left = this._x + 'px';
    this._el.style.top = this._y + 'px';
  }

  _updateHover() {
    const target = document.elementFromPoint(this._x, this._y);
    if (target !== this._hoveredEl) {
      if (this._hoveredEl) this._hoveredEl.classList.remove('sc-hover');
      this._hoveredEl = target;
      if (this._hoveredEl) this._hoveredEl.classList.add('sc-hover');
    }
  }

  _onPointerLockChange() {
    if (this._active && !document.pointerLockElement) {
      this.deactivate();
    }
  }
}
