import { test } from 'node:test';
import assert from 'node:assert/strict';

import { GameState, MAX_ORDERS } from '../src/game/state.js';
import { CROPS, ITEMS, RECIPES, BUILDINGS } from '../src/game/data.js';
import { describeAction } from '../src/game/actions.js';
import { mulberry32 } from '../src/util/noise.js';

const newState = (seed = 1) => new GameState({ rng: mulberry32(seed) });

test('planting costs coins and creates a growing crop', () => {
  const s = newState();
  const before = s.coins;
  const res = s.plant(0, 0, 'wheat');
  assert.equal(res.ok, true);
  assert.equal(s.coins, before - CROPS.wheat.seedCost);
  assert.equal(s.getCell(0, 0).crop.id, 'wheat');
  assert.equal(s.cropProgress(0, 0), 0);
});

test('cannot plant outside the build radius, on occupied cells, or without coins', () => {
  const s = newState();
  assert.equal(s.plant(20, 0, 'wheat').ok, false);
  s.plant(0, 0, 'wheat');
  assert.equal(s.plant(0, 0, 'carrot').ok, false);
  s.coins = 0;
  assert.equal(s.plant(1, 0, 'wheat').ok, false);
});

test('crops ripen over time, faster in the rain, and can be harvested', () => {
  const s = newState();
  s.plant(0, 0, 'wheat');
  assert.equal(s.harvest(0, 0).ok, false, 'unripe crop cannot be harvested');

  s.update(CROPS.wheat.grow / 2, 1);
  assert.ok(Math.abs(s.cropProgress(0, 0) - 0.5) < 1e-9);
  s.update(CROPS.wheat.grow / 4, 2); // rain doubles growth
  assert.equal(s.cropProgress(0, 0), 1);

  const res = s.harvest(0, 0);
  assert.equal(res.ok, true);
  const [lo, hi] = CROPS.wheat.yield;
  assert.ok(s.count('wheat') >= lo && s.count('wheat') <= hi);
  assert.equal(s.getCell(0, 0).crop, null, 'single-harvest crop is gone');
  assert.equal(s.getCell(0, 0).kind, 'plot', 'soil stays tilled');
});

test('regrowing crops stay and ripen again sooner', () => {
  const s = newState();
  s.plant(0, 0, 'tomato');
  s.update(CROPS.tomato.grow, 1);
  assert.equal(s.harvest(0, 0).ok, true);
  const p = s.cropProgress(0, 0);
  assert.ok(p > 0 && p < 1);
});

test('building costs coins, removing refunds half', () => {
  const s = newState();
  s.coins = 100;
  assert.equal(s.build(1, 1, 'lantern').ok, true);
  assert.equal(s.coins, 100 - BUILDINGS.lantern.cost);
  assert.equal(s.build(1, 1, 'tree').ok, false, 'cell already occupied');
  const res = s.remove(1, 1);
  assert.equal(res.ok, true);
  assert.equal(s.coins, 100 - BUILDINGS.lantern.cost + Math.floor(BUILDINGS.lantern.cost / 2));
  assert.equal(s.getCell(1, 1), undefined);
});

test('crafting needs a workbench and ingredients', () => {
  const s = newState();
  s.add('wheat', 3);
  assert.equal(s.craft('bread').ok, false, 'no workbench yet');
  s.setBuilding(2, 2, 'workbench');
  assert.equal(s.craft('bread').ok, true);
  assert.equal(s.count('wheat'), 0);
  assert.equal(s.count('bread'), 1);
  assert.equal(s.craft('bread').ok, false, 'out of wheat');
  assert.ok(RECIPES.bread);
});

test('fulfilling an order consumes items and pays the reward', () => {
  const s = newState();
  const order = s.makeOrder({ wheat: 2 }, 0, 300);
  s.orders.push(order);
  assert.equal(s.fulfillOrder(order.id).ok, false, 'not enough wheat');
  s.add('wheat', 2);
  const coins = s.coins;
  const res = s.fulfillOrder(order.id);
  assert.equal(res.ok, true);
  assert.equal(s.coins, coins + order.reward);
  assert.equal(s.count('wheat'), 0);
  assert.equal(s.orders.length, 0);
  assert.ok(order.reward >= ITEMS.wheat.value * 2, 'rewards beat the raw value');
});

test('orders expire and new ones are generated up to the cap', () => {
  const s = newState(7);
  s.orders.push(s.makeOrder({ wheat: 1 }, 0, 10));
  s.update(11);
  assert.equal(s.orders.length, 0, 'expired');

  for (let i = 0; i < 40; i++) s.update(60);
  assert.ok(s.orders.length > 0);
  assert.ok(s.orders.length <= MAX_ORDERS);
  for (const o of s.orders) {
    assert.ok(Object.keys(o.items).length >= 1);
    for (const id of Object.keys(o.items)) assert.ok(ITEMS[id]);
  }
});

test('crafted goods are only requested once a workbench exists', () => {
  const s = newState(3);
  for (let i = 0; i < 200; i++) {
    const o = s.generateOrder();
    for (const id of Object.keys(o.items)) assert.ok(CROPS[id], `${id} should be a raw crop`);
  }
  s.setBuilding(2, 2, 'workbench');
  let sawCrafted = false;
  for (let i = 0; i < 200; i++) {
    const o = s.generateOrder();
    if (Object.keys(o.items).some((id) => RECIPES[id])) sawCrafted = true;
  }
  assert.ok(sawCrafted);
});

test('the clock wraps around midnight and advances the day counter', () => {
  const s = newState();
  s.time = 23.9;
  s.update(10); // 10s of a 360s day = 0.667h
  assert.equal(s.day, 2);
  assert.ok(s.time >= 0 && s.time < 1);
});

test('save data round-trips and bad entries are dropped', () => {
  const s = GameState.fresh({ rng: mulberry32(5) });
  s.add('carrot', 4);
  s.plant(3, 3, 'strawberry');
  s.coins = 123;
  s.update(20);

  const copy = GameState.deserialize(JSON.parse(JSON.stringify(s.serialize())));
  assert.equal(copy.coins, 123);
  assert.equal(copy.count('carrot'), 4);
  assert.equal(copy.getCell(3, 3).crop.id, 'strawberry');
  assert.equal(copy.orders.length, s.orders.length);
  assert.equal(copy.cells.size, s.cells.size);

  const dirty = s.serialize();
  dirty.cells.push({ x: 0, z: 0, kind: 'building', building: 'does-not-exist' });
  dirty.cells.push({ x: 99, z: 99, kind: 'plot', crop: null });
  dirty.inventory.bogus = 5;
  const cleaned = GameState.deserialize(dirty);
  assert.equal(cleaned.cells.size, s.cells.size);
  assert.equal(cleaned.count('bogus'), 0);
  assert.equal(GameState.deserialize({ v: 999 }), null);
});

test('describeAction previews what each tool would do', () => {
  const s = newState();
  const sel = { tool: 'farm', seed: 'wheat', building: 'lantern' };

  let a = describeAction(s, sel, 0, 0);
  assert.equal(a.ok, true);
  assert.match(a.label, /種植/);
  assert.equal(a.run().ok, true);

  a = describeAction(s, sel, 0, 0);
  assert.equal(a.ok, false, 'still growing');
  assert.match(a.label, /生長中/);

  s.update(CROPS.wheat.grow);
  a = describeAction(s, sel, 0, 0);
  assert.equal(a.ok, true);
  assert.match(a.label, /收成/);

  assert.equal(describeAction(s, sel, 40, 40).ok, false, 'out of range');

  s.setBuilding(2, 0, 'workbench');
  const bench = describeAction(s, sel, 2, 0);
  assert.equal(bench.ok, true);
  assert.equal(bench.run().openCraft, true);

  const build = describeAction(s, { ...sel, tool: 'build' }, 5, 5);
  assert.equal(build.ok, true);
  const remove = describeAction(s, { ...sel, tool: 'remove' }, 5, 5);
  assert.equal(remove.ok, false, 'nothing to remove on an empty cell');
});
