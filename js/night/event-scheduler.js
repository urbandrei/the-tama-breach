export class EventScheduler {
  constructor(game) {
    this.game = game;
    this._oneShots = [];
    this._repeating = [];
  }

  /** Schedule a one-shot event at a specific game hour (0-6, where 0=12AM) */
  atHour(gameHour, callback) {
    this._oneShots.push({ hour: gameHour, callback, fired: false });
  }

  /** Schedule a repeating event every `intervalSeconds` real seconds */
  every(intervalSeconds, callback) {
    // Stagger first fire by random fraction of interval
    this._repeating.push({
      interval: intervalSeconds,
      timer: intervalSeconds * (0.3 + Math.random() * 0.7),
      callback,
    });
  }

  update(dt, gameHour) {
    // One-shot events
    for (const evt of this._oneShots) {
      if (!evt.fired && gameHour >= evt.hour) {
        evt.fired = true;
        evt.callback();
      }
    }

    // Repeating events
    for (const evt of this._repeating) {
      evt.timer -= dt;
      if (evt.timer <= 0) {
        evt.timer = evt.interval;
        evt.callback();
      }
    }
  }

  reset() {
    this._oneShots = [];
    this._repeating = [];
  }
}
