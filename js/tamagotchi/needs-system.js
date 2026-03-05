import { clamp } from '../utils/math-utils.js';

const ACTIONS = {
  FEED:  { need: 'hunger',    amount: 15 },
  WATER: { need: null,        amount: 0  },  // special: refills waterLevel
  PLAY:  { need: 'happiness', amount: 12 },
};

const COOLDOWN_SECONDS = 3.0;

const CONTENTMENT_WEIGHTS = {
  hunger: 0.4,
  thirst: 0.35,
  happiness: 0.25,
};

// Water container mechanics
const WATER_DRAIN_RATE = 1.5;    // waterLevel drains per second (tama "drinks")
const THIRST_FILL_RATE = 2.0;    // thirst goes UP per second when water available
const THIRST_BASE_DECAY = 1.0;   // base thirst decay when no water (multiplied by personality rate)

export class NeedsSystem {
  constructor(personality) {
    this.personality = personality;
    this.needs = { hunger: 100, thirst: 100, happiness: 100 };
    this.waterLevel = 100;        // 0-100, physical water container in room
    this._cooldowns = { FEED: 0, WATER: 0, PLAY: 0 };
    this.decayMultiplier = 1.0;

    // Per-need multipliers (set by InfrastructureManager)
    this.hungerDecayMultiplier = 1.0;
    this.thirstDecayMultiplier = 1.0;

    // Panic mode (generator down) — 3x all decay
    this.panicMode = false;
  }

  update(dt) {
    const rates = this.personality.decayRates;
    const m = this.decayMultiplier;
    const panicMult = this.panicMode ? 3.0 : 1.0;

    // Hunger: always decays
    this.needs.hunger = clamp(
      this.needs.hunger - rates.hunger * m * this.hungerDecayMultiplier * panicMult * dt,
      0, 100
    );

    // Happiness: always decays
    this.needs.happiness = clamp(
      this.needs.happiness - rates.happiness * m * panicMult * dt,
      0, 100
    );

    // Thirst: depends on water container
    if (this.waterLevel > 0) {
      // Tama has water — thirst goes UP (recovering)
      this.needs.thirst = clamp(
        this.needs.thirst + THIRST_FILL_RATE * this.thirstDecayMultiplier * panicMult * dt,
        0, 100
      );
      // Water container drains as tama drinks
      this.waterLevel = clamp(
        this.waterLevel - WATER_DRAIN_RATE * this.thirstDecayMultiplier * panicMult * dt,
        0, 100
      );
    } else {
      // No water — thirst goes DOWN
      this.needs.thirst = clamp(
        this.needs.thirst - rates.thirst * m * this.thirstDecayMultiplier * panicMult * dt,
        0, 100
      );
    }

    // Cooldowns
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

    if (actionName === 'WATER') {
      // Refill water container
      this.waterLevel = 100;
    } else {
      let amount = actionDef.amount;
      if (actionName === this.personality.preferredAction) {
        amount += this.personality.preferredBonus;
      }
      this.needs[actionDef.need] = clamp(this.needs[actionDef.need] + amount, 0, 100);
    }

    this._cooldowns[actionName] = COOLDOWN_SECONDS;
    return true;
  }

  isOnCooldown(actionName) {
    return this._cooldowns[actionName] > 0;
  }

  reset() {
    this.needs.hunger = 100;
    this.needs.thirst = 100;
    this.needs.happiness = 100;
    this.waterLevel = 100;
    this._cooldowns.FEED = 0;
    this._cooldowns.WATER = 0;
    this._cooldowns.PLAY = 0;
    this.decayMultiplier = 1.0;
    this.hungerDecayMultiplier = 1.0;
    this.thirstDecayMultiplier = 1.0;
    this.panicMode = false;
  }
}
