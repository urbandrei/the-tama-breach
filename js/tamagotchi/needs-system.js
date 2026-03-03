import { clamp } from '../utils/math-utils.js';

const ACTIONS = {
  FEED:  { need: 'hunger',     amount: 15 },
  PLAY:  { need: 'happiness',  amount: 12 },
  SCOLD: { need: 'discipline', amount: 18 },
};

const COOLDOWN_SECONDS = 3.0;

const CONTENTMENT_WEIGHTS = {
  hunger: 0.4,
  happiness: 0.35,
  discipline: 0.25,
};

export class NeedsSystem {
  constructor(personality) {
    this.personality = personality;
    this.needs = { hunger: 100, happiness: 100, discipline: 100 };
    this._cooldowns = { FEED: 0, PLAY: 0, SCOLD: 0 };
  }

  update(dt) {
    const rates = this.personality.decayRates;
    this.needs.hunger     = clamp(this.needs.hunger     - rates.hunger * dt, 0, 100);
    this.needs.happiness  = clamp(this.needs.happiness  - rates.happiness * dt, 0, 100);
    this.needs.discipline = clamp(this.needs.discipline - rates.discipline * dt, 0, 100);

    for (const action of Object.keys(this._cooldowns)) {
      if (this._cooldowns[action] > 0) {
        this._cooldowns[action] = Math.max(0, this._cooldowns[action] - dt);
      }
    }

    return this.getContentment();
  }

  getContentment() {
    let sum = 0;
    for (const [need, weight] of Object.entries(CONTENTMENT_WEIGHTS)) {
      sum += this.needs[need] * weight;
    }
    return sum;
  }

  isAgitated() {
    return this.getContentment() < this.personality.agitationThreshold;
  }

  doAction(actionName) {
    const actionDef = ACTIONS[actionName];
    if (!actionDef) return false;
    if (this._cooldowns[actionName] > 0) return false;

    let amount = actionDef.amount;
    if (actionName === this.personality.preferredAction) {
      amount += this.personality.preferredBonus;
    }

    this.needs[actionDef.need] = clamp(this.needs[actionDef.need] + amount, 0, 100);
    this._cooldowns[actionName] = COOLDOWN_SECONDS;
    return true;
  }

  isOnCooldown(actionName) {
    return this._cooldowns[actionName] > 0;
  }

  reset() {
    this.needs.hunger = 100;
    this.needs.happiness = 100;
    this.needs.discipline = 100;
    this._cooldowns.FEED = 0;
    this._cooldowns.PLAY = 0;
    this._cooldowns.SCOLD = 0;
  }
}
