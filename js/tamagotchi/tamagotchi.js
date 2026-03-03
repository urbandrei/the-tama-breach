import { NeedsSystem } from './needs-system.js';
import { Containment } from './containment.js';
import { BillboardSprite } from '../sprites/billboard-sprite.js';
import { TamaState } from './personality.js';

export class Tamagotchi {
  constructor(personality, game) {
    this.personality = personality;
    this.game = game;
    this.id = personality.id;
    this.name = personality.name;

    this.state = TamaState.CONTAINED;
    this.needs = new NeedsSystem(personality);
    this.containment = new Containment();

    this.billboardSprite = new BillboardSprite(
      personality.sprite.idle,
      '#00ff41',
    );

    this._chamberGroup = null;
    this._spriteAdded = false;
  }

  attachToChamber(chamberGroup, glassPanels) {
    this._chamberGroup = chamberGroup;
    this.containment.setGlassPanels(glassPanels);

    const pos = chamberGroup.position;
    this.billboardSprite.setPosition(pos.x, 0.6, pos.z);
    this.billboardSprite.addTo(this.game.scene);
    this._spriteAdded = true;
  }

  update(dt) {
    // 1. Decay needs
    this.needs.update(dt);

    // 2. State transitions (only while contained/agitated)
    if (this.state === TamaState.CONTAINED || this.state === TamaState.AGITATED) {
      const wasAgitated = this.state === TamaState.AGITATED;
      const isAgitated = this.needs.isAgitated();

      if (isAgitated && !wasAgitated) {
        this.state = TamaState.AGITATED;
        this._onAgitated();
      } else if (!isAgitated && wasAgitated) {
        this.state = TamaState.CONTAINED;
        this._onCalmed();
      }

      // 3. Update containment
      const result = this.containment.update(
        this.state === TamaState.AGITATED,
        this.personality.containmentStressRate,
        dt,
      );

      if (result.stageChanged && !result.breached) {
        this.game.emit('containment:cracking', {
          tamaId: this.id,
          stage: result.stage,
          health: this.containment.glassHealth,
          roomId: this.personality.roomId,
        });
      }

      if (result.breached) {
        this._onBreach();
      }
    }

    // 4. Sprite animation
    if (this._spriteAdded && this.state !== TamaState.ESCAPED) {
      this.billboardSprite.update(dt);
    }
  }

  _onAgitated() {
    this.billboardSprite.setAscii(this.personality.sprite.agitated, '#ff4444');
    this.game.emit('tama:agitated', {
      tamaId: this.id,
      roomId: this.personality.roomId,
    });
  }

  _onCalmed() {
    this.billboardSprite.setAscii(this.personality.sprite.idle, '#00ff41');
    this.game.emit('tama:calmed', {
      tamaId: this.id,
      roomId: this.personality.roomId,
    });
  }

  _onBreach() {
    this.state = TamaState.ESCAPED;

    this.billboardSprite.removeFromParent();
    this._spriteAdded = false;

    this.game.emit('containment:breach', {
      tamaId: this.id,
      roomId: this.personality.roomId,
    });

    if (this.game.lightingManager) {
      this.game.lightingManager.triggerFlicker(this.personality.roomId, 'surge', 2.0);
    }

    if (this.game.player && this.game.player.cameraEffects) {
      this.game.player.cameraEffects.shake(0.12, 1.5);
    }
  }

  careAction(actionName) {
    if (this.state === TamaState.ESCAPED) return false;
    return this.needs.doAction(actionName);
  }

  getUIData() {
    return {
      id: this.id,
      name: this.name,
      personality: this.personality.description,
      status: this.state,
      sprite: this.state === TamaState.AGITATED
        ? this.personality.sprite.agitated
        : this.personality.sprite.idle,
      needs: { ...this.needs.needs },
      contentment: this.needs.getContentment(),
      glassHealth: this.containment.glassHealth,
      crackStage: this.containment.crackStage,
      cooldowns: {
        FEED: this.needs.isOnCooldown('FEED'),
        PLAY: this.needs.isOnCooldown('PLAY'),
        SCOLD: this.needs.isOnCooldown('SCOLD'),
      },
    };
  }

  reset() {
    this.state = TamaState.CONTAINED;
    this.needs.reset();
    this.containment.reset();
    this.billboardSprite.setAscii(this.personality.sprite.idle, '#00ff41');

    if (this._chamberGroup && !this._spriteAdded) {
      const pos = this._chamberGroup.position;
      this.billboardSprite.setPosition(pos.x, 0.6, pos.z);
      this.billboardSprite.addTo(this.game.scene);
      this._spriteAdded = true;
    }
  }
}
