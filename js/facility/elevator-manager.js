import { dampedLerp } from '../utils/math-utils.js';

const ElevatorState = Object.freeze({
  IDLE_TOP: 'idle_top',
  DESCENDING: 'descending',
  DOORS_OPENING: 'doors_opening',
  IDLE_BOTTOM: 'idle_bottom',
  DOORS_CLOSING: 'doors_closing',
  ASCENDING: 'ascending',
});

const DESCENT_SPEED = 6.0;       // units/sec
const DOOR_SLIDE_SPEED = 1.2;    // units/sec
const DOOR_SLIDE_MAX = 2.0;      // how far each panel slides open
const BAND_SCROLL_SPEED = 8.0;   // visual scroll speed during idle_top loop
const DEPART_DISTANCE = 4.0;     // player distance from platform center to trigger departure
const LINGER_TIMEOUT = 60.0;     // seconds inside elevator before "you quit" game over

export class ElevatorManager {
  constructor(game) {
    this.game = game;
    this.state = ElevatorState.IDLE_TOP;

    // Refs from shaft geometry (set in init)
    this._platform = null;
    this._doors = null;
    this._doorColliders = null;
    this._bands = null;
    this._shaftHeight = 35;
    this._bandSpacing = 4.0;
    this._roomCenter = [0, 0];
    this._roomDoor = null; // facility Door for elevator room

    // Animation state
    this._platformY = 0;
    this._doorSlide = 0; // 0=closed, DOOR_SLIDE_MAX=open
    this._bandOffset = 0;
    this._bandBasePositions = []; // original Y positions of bands

    // Arrival callback
    this._arrivedHandler = null;

    // Rush mode — fast descent + door open within ~1 second
    this._rushMode = false;

    // Delivery mode — doors stay open for cart pickup
    this._deliveryMode = false;

    // Linger timer — how long player has been inside elevator at bottom
    this._lingerTimer = 0;
    this._quitTriggered = false;
  }

  init() {
    const shaft = this.game.facility.elevatorShaft;
    if (!shaft) {
      console.warn('ElevatorManager: no shaft geometry found');
      return;
    }

    this._platform = shaft.elevatorPlatform;
    this._doors = shaft.elevatorDoors;
    this._doorColliders = shaft.elevatorDoorColliders;
    this._bands = shaft.elevatorBands;
    this._shaftHeight = shaft.shaftHeight;
    this._bandSpacing = shaft.bandSpacing;
    this._roomCenter = shaft.roomCenter;

    // Store original band Y positions
    this._bandBasePositions = this._bands.map(b => b.position.y);

    // Get elevator room door
    this._roomDoor = this.game.facility.doorsByRoom['elevator'] || null;
  }

  /** Position platform at top of shaft. Call before night intro. */
  positionAtTop() {
    this._platformY = this._shaftHeight - 2;
    if (this._platform) {
      this._platform.position.y = this._platformY;
    }
    this._doorSlide = 0;
    this._updateDoors();
    this.state = ElevatorState.IDLE_TOP;
    this._rushMode = false;
    this._deliveryMode = false;
    this._lingerTimer = 0;
    this._quitTriggered = false;

    // Lock elevator room door until arrival
    if (this._roomDoor) this._roomDoor.lock();
  }

  /** Trigger descent from top to bottom. */
  startDescent() {
    if (this.state !== ElevatorState.IDLE_TOP) return;
    this.state = ElevatorState.DESCENDING;
  }

  /** Rush descent — fast drop + door open within ~1 second. */
  rushToBottom() {
    this._rushMode = true;
    if (this.state === ElevatorState.IDLE_TOP) {
      this.state = ElevatorState.DESCENDING;
    }
  }

  /** Open doors for cart delivery — stays open until cart is picked up. */
  openDoorsForDelivery() {
    if (this.state !== ElevatorState.IDLE_TOP) return;

    // Snap platform to bottom, doors open
    this._platformY = 0;
    if (this._platform) this._platform.position.y = 0;
    this._doorSlide = DOOR_SLIDE_MAX;
    this._updateDoors();
    this._deliveryMode = true;
    this.state = ElevatorState.IDLE_BOTTOM;

    // Unlock room door so player can enter
    if (this._roomDoor) this._roomDoor.unlock();
  }

  /** Register a one-time callback for elevator:arrived. */
  onArrived(callback) {
    this._arrivedHandler = callback;
  }

  update(dt) {
    switch (this.state) {
      case ElevatorState.IDLE_TOP:
        this._animateBandLoop(dt);
        break;

      case ElevatorState.DESCENDING:
        this._animateDescent(dt);
        break;

      case ElevatorState.DOORS_OPENING:
        this._animateDoorsOpen(dt);
        break;

      case ElevatorState.IDLE_BOTTOM:
        this._checkPlayerDeparture(dt);
        break;

      case ElevatorState.DOORS_CLOSING:
        this._animateDoorsClose(dt);
        break;

      case ElevatorState.ASCENDING:
        this._animateAscent(dt);
        break;
    }
  }

  // --- Animations ---

  _animateBandLoop(dt) {
    if (!this._bands || this._bands.length === 0) return;

    // Scroll bands upward (visual: player descending past them)
    this._bandOffset += BAND_SCROLL_SPEED * dt;
    const wrapH = this._shaftHeight;

    for (let i = 0; i < this._bands.length; i++) {
      let y = this._bandBasePositions[i] + this._bandOffset;
      y = ((y % wrapH) + wrapH) % wrapH; // wrap to 0..wrapH
      this._bands[i].position.y = y;
    }
  }

  _animateDescent(dt) {
    // Stop band loop — reset bands to base positions
    if (this._bandOffset !== 0) {
      for (let i = 0; i < this._bands.length; i++) {
        this._bands[i].position.y = this._bandBasePositions[i];
      }
      this._bandOffset = 0;
    }

    // Descend platform (rush matches band scroll speed for seamless visual transition)
    const speed = this._rushMode ? BAND_SCROLL_SPEED : DESCENT_SPEED;
    this._platformY -= speed * dt;

    if (this._platformY <= 0) {
      this._platformY = 0;
      this.state = ElevatorState.DOORS_OPENING;
    }

    if (this._platform) {
      this._platform.position.y = this._platformY;
    }

    // Move player with platform
    const player = this.game.player;
    player.position.y = this._platformY + 1.7;
    player._verticalVelocity = 0;
  }

  _animateDoorsOpen(dt) {
    const doorSpeed = this._rushMode ? 10.0 : DOOR_SLIDE_SPEED;
    this._doorSlide += doorSpeed * dt;

    if (this._doorSlide >= DOOR_SLIDE_MAX) {
      this._doorSlide = DOOR_SLIDE_MAX;
      this.state = ElevatorState.IDLE_BOTTOM;
      this._rushMode = false;

      // Unlock elevator room door
      if (this._roomDoor) this._roomDoor.unlock();

      // Fire arrived event
      this.game.emit('elevator:arrived');
      if (this._arrivedHandler) {
        this._arrivedHandler();
        this._arrivedHandler = null;
      }
    }

    this._updateDoors();
  }

  _isPlayerInside() {
    const player = this.game.player;
    const [cx, cz] = this._roomCenter;
    const dx = player.position.x - cx;
    const dz = player.position.z - cz;
    return Math.sqrt(dx * dx + dz * dz) <= DEPART_DISTANCE;
  }

  _checkPlayerDeparture(dt) {
    // In delivery mode, doors stay open until cart is picked up
    if (this._deliveryMode) return;

    if (!this._isPlayerInside()) {
      // Player left — start closing
      this._lingerTimer = 0;
      this.state = ElevatorState.DOORS_CLOSING;
      return;
    }

    // Player is lingering inside — count toward quit
    this._lingerTimer += dt;
    if (this._lingerTimer >= LINGER_TIMEOUT && !this._quitTriggered) {
      this._quitTriggered = true;
      if (this._roomDoor) this._roomDoor.lock();
      this.state = ElevatorState.DOORS_CLOSING;
    }
  }

  _animateDoorsClose(dt) {
    // If player steps back in before doors finish closing (and not quitting), reopen
    if (!this._quitTriggered && this._isPlayerInside()) {
      this.state = ElevatorState.DOORS_OPENING;
      this._rushMode = false; // normal speed reopen
      return;
    }

    this._doorSlide -= DOOR_SLIDE_SPEED * dt;

    if (this._doorSlide <= 0) {
      this._doorSlide = 0;

      if (this._quitTriggered) {
        // Player lingered too long — ascend and trigger quit
        this.state = ElevatorState.ASCENDING;
        this.game.emit('elevator:quit');
      } else {
        // Normal departure — ascend
        this.state = ElevatorState.ASCENDING;
      }

      this.game.emit('elevator:departed');
    }

    this._updateDoors();
  }

  _animateAscent(dt) {
    this._platformY += DESCENT_SPEED * 1.5 * dt; // ascend faster

    if (this._platformY >= this._shaftHeight - 2) {
      this._platformY = this._shaftHeight - 2;
      this.state = ElevatorState.IDLE_TOP;
    }

    if (this._platform) {
      this._platform.position.y = this._platformY;
    }

    // Move player with platform during quit ascent
    if (this._quitTriggered) {
      const player = this.game.player;
      player.position.y = this._platformY + 1.7;
      player._verticalVelocity = 0;
    }
  }

  _updateDoors() {
    if (!this._doors) return;
    const [cx, cz] = this._roomCenter;

    // Left door slides +Z, right door slides -Z
    if (this._doors.left) {
      this._doors.left.position.z = cz + 1.8 / 2 + this._doorSlide;
    }
    if (this._doors.right) {
      this._doors.right.position.z = cz - 1.8 / 2 - this._doorSlide;
    }

    // Move colliders with doors
    if (this._doorColliders) {
      if (this._doorColliders.left) {
        this._doorColliders.left.position.z = this._doors.left.position.z;
      }
      if (this._doorColliders.right) {
        this._doorColliders.right.position.z = this._doors.right.position.z;
      }
    }
  }
}
