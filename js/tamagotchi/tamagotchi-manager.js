import { Tamagotchi } from './tamagotchi.js';
import { PERSONALITIES, TAMA_ORDER } from './personality.js';

export class TamagotchiManager {
  constructor(game) {
    this.game = game;
    this.tamas = {};
    this._tamaList = [];

    for (const id of TAMA_ORDER) {
      const personality = PERSONALITIES[id];
      const tama = new Tamagotchi(personality, game);
      this.tamas[id] = tama;
      this._tamaList.push(tama);
    }
  }

  attachToFacility(chamberMap) {
    for (const tama of this._tamaList) {
      const roomId = tama.personality.roomId;
      const chamberInfo = chamberMap[roomId];
      if (chamberInfo) {
        tama.attachToChamber(chamberInfo.group, chamberInfo.glassPanels);
      } else {
        console.warn(`No chamber found for ${tama.id} in room ${roomId}`);
      }
    }
  }

  update(dt) {
    for (const tama of this._tamaList) {
      tama.update(dt);
    }
  }

  getAllUIData() {
    return this._tamaList.map(t => t.getUIData());
  }

  getUIData(tamaId) {
    const tama = this.tamas[tamaId];
    return tama ? tama.getUIData() : null;
  }

  careAction(tamaId, actionName) {
    const tama = this.tamas[tamaId];
    if (!tama) return false;
    return tama.careAction(actionName);
  }

  getTama(tamaId) {
    return this.tamas[tamaId] || null;
  }

  resetAll() {
    for (const tama of this._tamaList) {
      tama.reset();
    }
  }
}
