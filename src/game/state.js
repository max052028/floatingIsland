// Pure game logic: no DOM, no three.js. Everything the player can do goes through here,
// so it can be unit-tested and the renderer only has to react to the events it emits.

import { BUILD_R, DAY_SECONDS } from '../constants.js';
import { BUILDINGS, CROPS, ITEMS, RECIPES, REGROW_PROGRESS, RESIDENTS } from './data.js';

export const MAX_ORDERS = 4;
const SAVE_VERSION = 1;

export const cellKey = (x, z) => `${x},${z}`;
const ok = (message, extra = {}) => ({ ok: true, message, ...extra });
const fail = (message) => ({ ok: false, message });

export class GameState {
  constructor({ rng = Math.random } = {}) {
    this.rng = rng;
    this.coins = 40;
    this.inventory = {};
    /** @type {Map<string, {x:number,z:number,kind:'plot'|'building',crop:null|{id:string,progress:number},building?:string}>} */
    this.cells = new Map();
    this.orders = [];
    /** In-game hour, 0..24 */
    this.time = 8;
    this.day = 1;
    /** Debug multiplier for how fast time (and crops) advance. */
    this.timeScale = 1;
    this.nextOrderId = 1;
    this.orderTimer = 30;
    this.listeners = new Map();
  }

  /** A brand-new game with a small starter layout so there is something to do immediately. */
  static fresh(opts) {
    const s = new GameState(opts);
    s.setBuilding(2, -2, 'workbench');
    s.setBuilding(-2, -2, 'lantern');
    s.setBuilding(-4, 0, 'flowerbed');
    s.setBuilding(4, 1, 'tree');
    for (const x of [-1, 0, 1]) {
      s.cells.set(cellKey(x, 1), { x, z: 1, kind: 'plot', crop: { id: 'wheat', progress: x === 1 ? 30 : 12 } });
    }
    s.orders.push(s.makeOrder({ wheat: 3 }, 0, 420));
    s.orders.push(s.makeOrder({ carrot: 2 }, 1, 480));
    return s;
  }

  // ---- events -----------------------------------------------------------------------

  on(type, fn) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type).add(fn);
    return () => this.listeners.get(type)?.delete(fn);
  }

  emit(type, data) {
    this.listeners.get(type)?.forEach((fn) => fn(data));
  }

  // ---- grid helpers -----------------------------------------------------------------

  isBuildable(x, z) {
    return Number.isInteger(x) && Number.isInteger(z) && Math.hypot(x, z) <= BUILD_R;
  }

  getCell(x, z) {
    return this.cells.get(cellKey(x, z));
  }

  setBuilding(x, z, id) {
    this.cells.set(cellKey(x, z), { x, z, kind: 'building', crop: null, building: id });
  }

  countBuildings(id) {
    let n = 0;
    for (const c of this.cells.values()) if (c.kind === 'building' && c.building === id) n++;
    return n;
  }

  /** 0..1 growth of the crop in a cell, or null if there is none. */
  cropProgress(x, z) {
    const cell = this.getCell(x, z);
    if (!cell?.crop) return null;
    return Math.min(1, cell.crop.progress / CROPS[cell.crop.id].grow);
  }

  // ---- inventory --------------------------------------------------------------------

  count(id) {
    return this.inventory[id] ?? 0;
  }

  add(id, n) {
    this.inventory[id] = this.count(id) + n;
  }

  hasItems(items) {
    return Object.entries(items).every(([id, n]) => this.count(id) >= n);
  }

  takeItems(items) {
    for (const [id, n] of Object.entries(items)) {
      this.inventory[id] = this.count(id) - n;
      if (this.inventory[id] <= 0) delete this.inventory[id];
    }
  }

  // ---- player actions ---------------------------------------------------------------

  plant(x, z, cropId) {
    const def = CROPS[cropId];
    if (!def) return fail('未知的種子');
    if (!this.isBuildable(x, z)) return fail('這裡不能種植');
    const cell = this.getCell(x, z);
    if (cell?.kind === 'building') return fail('這裡已經有建築了');
    if (cell?.crop) return fail('這裡已經種了作物');
    if (this.coins < def.seedCost) return fail('金幣不足');
    this.coins -= def.seedCost;
    this.cells.set(cellKey(x, z), { x, z, kind: 'plot', crop: { id: cropId, progress: 0 } });
    this.emit('cell', { x, z });
    this.emit('coins');
    return ok(`種下了${ITEMS[cropId].name}`);
  }

  harvest(x, z) {
    const cell = this.getCell(x, z);
    if (!cell?.crop) return fail('這裡沒有作物');
    const id = cell.crop.id;
    const def = CROPS[id];
    if (cell.crop.progress < def.grow) return fail('還沒成熟');
    const [lo, hi] = def.yield;
    const n = lo + Math.floor(this.rng() * (hi - lo + 1));
    this.add(id, n);
    cell.crop = def.regrow ? { id, progress: def.grow * REGROW_PROGRESS } : null;
    this.emit('cell', { x, z });
    this.emit('inventory');
    return ok(`收成了 ${n} 個${ITEMS[id].name}`, { gained: { [id]: n } });
  }

  build(x, z, buildingId) {
    const def = BUILDINGS[buildingId];
    if (!def) return fail('未知的建築');
    if (!this.isBuildable(x, z)) return fail('這裡不能建造');
    if (this.getCell(x, z)) return fail('這裡已經有東西了');
    if (this.coins < def.cost) return fail('金幣不足');
    this.coins -= def.cost;
    this.setBuilding(x, z, buildingId);
    this.emit('cell', { x, z });
    this.emit('coins');
    return ok(`建造了${def.name}`);
  }

  remove(x, z) {
    const cell = this.getCell(x, z);
    if (!cell) return fail('這裡沒有東西');
    let refund = 0;
    if (cell.kind === 'building') {
      refund = Math.floor(BUILDINGS[cell.building].cost / 2);
      this.coins += refund;
    }
    this.cells.delete(cellKey(x, z));
    this.emit('cell', { x, z });
    if (refund) this.emit('coins');
    return ok(refund ? `移除了，退回 ${refund} 金幣` : '移除了');
  }

  craft(recipeId) {
    const recipe = RECIPES[recipeId];
    if (!recipe) return fail('未知的配方');
    if (this.countBuildings('workbench') === 0) return fail('需要先建造工作台');
    if (!this.hasItems(recipe.in)) return fail('材料不足');
    this.takeItems(recipe.in);
    for (const [id, n] of Object.entries(recipe.out)) this.add(id, n);
    this.emit('inventory');
    const [outId] = Object.keys(recipe.out);
    return ok(`製作了${ITEMS[outId].name}`);
  }

  fulfillOrder(orderId) {
    const order = this.orders.find((o) => o.id === orderId);
    if (!order) return fail('訂單已經不存在了');
    if (!this.hasItems(order.items)) return fail('物品不夠');
    this.takeItems(order.items);
    this.coins += order.reward;
    this.orders = this.orders.filter((o) => o.id !== orderId);
    this.emit('inventory');
    this.emit('coins');
    this.emit('orders');
    return ok(`${RESIDENTS[order.resident].name}收到了，給了你 ${order.reward} 金幣`, { order });
  }

  // ---- orders -----------------------------------------------------------------------

  makeOrder(items, residentIndex, ttl) {
    const value = Object.entries(items).reduce((sum, [id, n]) => sum + ITEMS[id].value * n, 0);
    const bonus = 1.3 + this.rng() * 0.3;
    return {
      id: this.nextOrderId++,
      resident: residentIndex,
      items,
      reward: Math.max(1, Math.round(value * bonus)),
      ttl,
      maxTtl: ttl,
    };
  }

  generateOrder() {
    const crops = Object.keys(CROPS);
    const crafted = this.countBuildings('workbench') > 0 ? Object.keys(RECIPES) : [];
    const useCrafted = crafted.length > 0 && this.rng() < 0.45;
    const pool = [...(useCrafted ? crafted : crops)];
    const kinds = Math.min(pool.length, this.rng() < 0.35 ? 2 : 1);
    const items = {};
    for (let i = 0; i < kinds; i++) {
      const id = pool.splice(Math.floor(this.rng() * pool.length), 1)[0];
      items[id] = useCrafted ? 1 + (this.rng() < 0.3 ? 1 : 0) : 1 + Math.floor(this.rng() * 3);
    }
    const resident = Math.floor(this.rng() * RESIDENTS.length);
    return this.makeOrder(items, resident, 300 + Math.floor(this.rng() * 180));
  }

  // ---- simulation -------------------------------------------------------------------

  update(dt, growthMul = 1) {
    const scaled = dt * this.timeScale;

    this.time += (scaled / DAY_SECONDS) * 24;
    while (this.time >= 24) {
      this.time -= 24;
      this.day++;
    }

    for (const cell of this.cells.values()) {
      if (!cell.crop) continue;
      const grow = CROPS[cell.crop.id].grow;
      if (cell.crop.progress < grow) {
        cell.crop.progress = Math.min(grow, cell.crop.progress + scaled * growthMul);
      }
    }

    let ordersChanged = false;
    for (const order of this.orders) order.ttl -= scaled;
    const before = this.orders.length;
    this.orders = this.orders.filter((o) => o.ttl > 0);
    if (this.orders.length !== before) ordersChanged = true;

    this.orderTimer -= scaled;
    if (this.orderTimer <= 0) {
      this.orderTimer = 40 + this.rng() * 30;
      if (this.orders.length < MAX_ORDERS) {
        this.orders.push(this.generateOrder());
        ordersChanged = true;
      }
    }
    if (ordersChanged) this.emit('orders');
  }

  // ---- persistence ------------------------------------------------------------------

  serialize() {
    return {
      v: SAVE_VERSION,
      coins: this.coins,
      inventory: this.inventory,
      time: this.time,
      day: this.day,
      nextOrderId: this.nextOrderId,
      orderTimer: this.orderTimer,
      orders: this.orders,
      cells: [...this.cells.values()],
    };
  }

  static deserialize(data, opts) {
    if (!data || data.v !== SAVE_VERSION) return null;
    const s = new GameState(opts);
    s.coins = Number.isFinite(data.coins) ? data.coins : s.coins;
    s.time = Number.isFinite(data.time) ? data.time : s.time;
    s.day = Number.isFinite(data.day) ? data.day : s.day;
    s.nextOrderId = Number.isFinite(data.nextOrderId) ? data.nextOrderId : 1;
    s.orderTimer = Number.isFinite(data.orderTimer) ? data.orderTimer : s.orderTimer;
    for (const [id, n] of Object.entries(data.inventory ?? {})) {
      if (ITEMS[id] && n > 0) s.inventory[id] = n;
    }
    for (const o of data.orders ?? []) {
      const valid =
        RESIDENTS[o.resident] && o.items && Object.keys(o.items).every((id) => ITEMS[id]) && o.ttl > 0;
      if (valid) s.orders.push(o);
    }
    for (const c of data.cells ?? []) {
      if (!s.isBuildable(c.x, c.z)) continue;
      if (c.kind === 'building' && BUILDINGS[c.building]) {
        s.setBuilding(c.x, c.z, c.building);
      } else if (c.kind === 'plot') {
        const crop = c.crop && CROPS[c.crop.id] ? { id: c.crop.id, progress: Math.max(0, c.crop.progress) } : null;
        s.cells.set(cellKey(c.x, c.z), { x: c.x, z: c.z, kind: 'plot', crop });
      }
    }
    return s;
  }
}
