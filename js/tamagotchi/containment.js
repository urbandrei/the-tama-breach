export const CrackStage = Object.freeze({
  CLEAN: 'clean',
  HAIRLINE: 'hairline',
  MAJOR: 'major',
  CRITICAL: 'critical',
  BREACHED: 'breached',
});

const CRACK_COLORS = {
  clean:    { color: 0x88ccff, opacity: 0.25 },
  hairline: { color: 0x99aacc, opacity: 0.30 },
  major:    { color: 0xcc8866, opacity: 0.40 },
  critical: { color: 0xff4444, opacity: 0.55 },
};

export class Containment {
  constructor() {
    this.glassHealth = 100;
    this.crackStage = CrackStage.CLEAN;
    this._prevCrackStage = CrackStage.CLEAN;
    this._glassPanels = [];
    this._breached = false;
  }

  setGlassPanels(panels) {
    this._glassPanels = panels;
  }

  update(isAgitated, stressRate, dt) {
    if (this._breached) {
      return { breached: true, stageChanged: false, stage: CrackStage.BREACHED };
    }

    if (isAgitated) {
      this.glassHealth = Math.max(0, this.glassHealth - stressRate * dt);
    }

    this._prevCrackStage = this.crackStage;
    if (this.glassHealth <= 0) {
      this.crackStage = CrackStage.BREACHED;
      this._breached = true;
    } else if (this.glassHealth <= 25) {
      this.crackStage = CrackStage.CRITICAL;
    } else if (this.glassHealth <= 50) {
      this.crackStage = CrackStage.MAJOR;
    } else if (this.glassHealth <= 75) {
      this.crackStage = CrackStage.HAIRLINE;
    } else {
      this.crackStage = CrackStage.CLEAN;
    }

    const stageChanged = this.crackStage !== this._prevCrackStage;

    if (stageChanged) {
      this._updateGlassVisuals();
    }

    return { breached: this._breached, stageChanged, stage: this.crackStage };
  }

  _updateGlassVisuals() {
    if (this.crackStage === CrackStage.BREACHED) {
      for (const panel of this._glassPanels) {
        panel.visible = false;
      }
      return;
    }

    const style = CRACK_COLORS[this.crackStage];
    if (!style) return;

    for (const panel of this._glassPanels) {
      panel.material = panel.material.clone();
      panel.material.color.setHex(style.color);
      panel.material.opacity = style.opacity;
      panel.material.needsUpdate = true;
    }
  }

  takeDamage(amount) {
    if (this._breached) return;
    this.glassHealth = Math.max(0, this.glassHealth - amount);
    const prev = this.crackStage;
    this._recalcStage();
    if (this._breached) return; // let normal update() handle breach
    if (this.crackStage !== prev) {
      this._updateGlassVisuals();
    }
  }

  repairPartial(amount) {
    if (this._breached) return;
    this.glassHealth = Math.min(100, this.glassHealth + amount);
    const prev = this.crackStage;
    this._recalcStage();
    if (this.crackStage !== prev) {
      this._updateGlassVisuals();
    }
  }

  _recalcStage() {
    if (this.glassHealth <= 0) {
      this.crackStage = CrackStage.BREACHED;
    } else if (this.glassHealth <= 25) {
      this.crackStage = CrackStage.CRITICAL;
    } else if (this.glassHealth <= 50) {
      this.crackStage = CrackStage.MAJOR;
    } else if (this.glassHealth <= 75) {
      this.crackStage = CrackStage.HAIRLINE;
    } else {
      this.crackStage = CrackStage.CLEAN;
    }
  }

  repair() {
    this.glassHealth = 100;
    this.crackStage = CrackStage.CLEAN;
    this._breached = false;

    for (const panel of this._glassPanels) {
      panel.visible = true;
    }
    this._updateGlassVisuals();
  }

  reset() {
    this.repair();
  }
}
