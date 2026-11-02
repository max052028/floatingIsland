// Turns "tool + selection + target cell" into a human-readable preview and a runnable action.
// The renderer uses `ok` to tint the cursor, the HUD shows `label`, and `run()` performs it.

import { BUILDINGS, CROPS, ITEMS } from './data.js';

const NONE = Object.freeze({ ok: false, label: '', run: null });

/**
 * @param {import('./state.js').GameState} state
 * @param {{tool: string, seed: string, building: string}} selection
 * @returns {{ok: boolean, label: string, run: null | (() => {ok: boolean, message: string, openCraft?: boolean})}}
 */
export function describeAction(state, selection, x, z) {
  if (!state.isBuildable(x, z)) return NONE;
  const cell = state.getCell(x, z);

  switch (selection.tool) {
    case 'farm':
      return describeFarm(state, selection, cell, x, z);

    case 'build': {
      const def = BUILDINGS[selection.building];
      if (!def || cell) return NONE;
      if (state.coins < def.cost) return { ok: false, label: `金幣不足（需要 ${def.cost}🪙）`, run: null };
      return {
        ok: true,
        label: `${def.emoji} 建造${def.name}（−${def.cost}🪙）`,
        run: () => state.build(x, z, selection.building),
      };
    }

    case 'remove': {
      if (!cell) return NONE;
      const what = cell.kind === 'building' ? BUILDINGS[cell.building].name : cell.crop ? ITEMS[cell.crop.id].name : '田地';
      return { ok: true, label: `🧹 移除${what}`, run: () => state.remove(x, z) };
    }

    default:
      return NONE;
  }
}

function describeFarm(state, selection, cell, x, z) {
  if (cell?.kind === 'building') {
    const def = BUILDINGS[cell.building];
    if (cell.building === 'workbench') {
      return { ok: true, label: '🧰 使用工作台', run: () => ({ ok: true, message: '', openCraft: true }) };
    }
    return { ok: false, label: `${def.emoji} ${def.name}`, run: null };
  }

  if (cell?.crop) {
    const item = ITEMS[cell.crop.id];
    const p = state.cropProgress(x, z);
    if (p >= 1) {
      return { ok: true, label: `✅ 收成${item.name}`, run: () => state.harvest(x, z) };
    }
    return { ok: false, label: `⏳ ${item.name} 生長中 ${Math.floor(p * 100)}%`, run: null };
  }

  const def = CROPS[selection.seed];
  if (!def) return NONE;
  const item = ITEMS[selection.seed];
  if (state.coins < def.seedCost) {
    return { ok: false, label: `金幣不足（需要 ${def.seedCost}🪙）`, run: null };
  }
  return {
    ok: true,
    label: `🌱 種植${item.name}（−${def.seedCost}🪙）`,
    run: () => state.plant(x, z, selection.seed),
  };
}
