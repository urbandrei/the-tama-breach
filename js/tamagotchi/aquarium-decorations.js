import { BillboardSprite } from '../sprites/billboard-sprite.js';

const DECORATION_ART = {
  plant: [
    '  \\|/  ',
    ' -(#)- ',
    '  /|\\  ',
    '  _|_  ',
  ],
  rock: [
    '  /\\__ ',
    ' /    \\',
    ' \\____/',
  ],
  ball: [
    ' .---. ',
    '( o  )',
    " '---' ",
  ],
  terminal: [
    ' .-----.',
    ' |>_   |',
    ' |_____|',
    '  |   | ',
  ],
  tube: [
    ' [===] ',
    '  |~|  ',
    '  |~|  ',
    '  |_|  ',
  ],
};

const DECORATION_SCALE = 0.4;
const DECORATION_COLOR = '#338833';

/**
 * Create billboard sprites for aquarium decorations.
 * @param {THREE.Scene} scene
 * @param {Array<{x, z, type}>} points - world-coordinate decoration positions
 * @returns {Array<{sprite: BillboardSprite, x: number, z: number, type: string}>}
 */
export function createDecorations(scene, points) {
  const decorations = [];

  for (const pt of points) {
    const art = DECORATION_ART[pt.type];
    if (!art) continue;

    const sprite = new BillboardSprite(art, DECORATION_COLOR);
    sprite.sprite.scale.multiplyScalar(DECORATION_SCALE / 0.8); // adjust from default 0.8 scale
    sprite.setPosition(pt.x, 0.4, pt.z);
    sprite.addTo(scene);

    decorations.push({ sprite, x: pt.x, z: pt.z, type: pt.type });
  }

  return decorations;
}
