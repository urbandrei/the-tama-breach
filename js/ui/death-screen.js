/**
 * Simple death screen: fade to black, then show retry overlay.
 */
export class DeathScreen {
  constructor() {
    this._el = null;
    this._timers = [];
  }

  show(onRetry) {
    this.cleanup();

    this._el = document.createElement('div');
    this._el.className = 'death-screen';
    document.getElementById('ui-root').appendChild(this._el);

    // Immediate black
    this._el.innerHTML = '<div class="death-black"></div>';

    // Retry overlay after brief pause
    this._timers.push(setTimeout(() => {
      this._el.innerHTML = `
        <div class="death-retry">
          <div class="death-title">TERMINATED</div>
          <div class="death-msg">Specimen containment failure.</div>
          <button class="death-btn">RETRY</button>
        </div>
      `;
      const btn = this._el.querySelector('.death-btn');
      btn.addEventListener('click', () => {
        this.cleanup();
        onRetry();
      }, { once: true });

      // Also allow Enter/Space
      this._keyHandler = (e) => {
        if (e.code === 'Enter' || e.code === 'Space') {
          e.preventDefault();
          this.cleanup();
          onRetry();
        }
      };
      document.addEventListener('keydown', this._keyHandler);
    }, 1000));
  }

  cleanup() {
    for (const t of this._timers) {
      clearTimeout(t);
      clearInterval(t);
    }
    this._timers = [];
    if (this._el) {
      this._el.remove();
      this._el = null;
    }
    if (this._keyHandler) {
      document.removeEventListener('keydown', this._keyHandler);
      this._keyHandler = null;
    }
  }
}
