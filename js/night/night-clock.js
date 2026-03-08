export class NightClock {
  constructor(nightDuration = 540) {
    this._nightDuration = nightDuration;
    this._elapsed = 0;
  }

  update(dt) {
    this._elapsed += dt;
  }

  /** 0-6 float mapping elapsed time to 12AM-6AM */
  getGameHour() {
    const t = Math.min(this._elapsed / this._nightDuration, 1);
    return t * 6;
  }

  /** "12:00 AM" style string */
  getFormattedTime() {
    const hour = this.getGameHour();
    const h = Math.floor(hour);
    const m = Math.floor((hour - h) * 60);
    const displayHour = h === 0 ? 12 : h;
    return `${displayHour}:${m.toString().padStart(2, '0')} AM`;
  }

  isNightOver() {
    return this._elapsed >= this._nightDuration;
  }

  getRemainingSeconds() {
    return Math.max(0, this._nightDuration - this._elapsed);
  }

  get elapsed() {
    return this._elapsed;
  }

  reset(nightDuration) {
    this._nightDuration = nightDuration;
    this._elapsed = 0;
  }
}
