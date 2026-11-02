import { BUILDINGS, CROPS, ITEMS, RECIPES, RESIDENTS, TOOLS } from '../game/data.js';
import { WEATHER } from '../game/weather.js';

/** Tiny DOM helper. */
function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (k === 'disabled') node.disabled = !!v;
    else if (k.startsWith('on')) node.addEventListener(k.slice(2).toLowerCase(), v);
    else node.setAttribute(k, v);
  }
  for (const c of [].concat(children)) if (c != null) node.append(c);
  return node;
}

const pad = (n) => String(n).padStart(2, '0');

export function formatClock(hour) {
  const h = Math.floor(hour);
  return `${pad(h)}:${pad(Math.floor((hour - h) * 60))}`;
}

function phaseIcon(hour) {
  if (hour >= 5 && hour < 7.5) return '🌅';
  if (hour >= 7.5 && hour < 17) return '☀️';
  if (hour >= 17 && hour < 20) return '🌇';
  return '🌙';
}

const itemChips = (items, have = null) =>
  Object.entries(items).map(([id, n]) => {
    const enough = have ? have(id) >= n : true;
    const label = have ? `${ITEMS[id].emoji} ${Math.min(have(id), 99)}/${n}` : `${ITEMS[id].emoji} ×${n}`;
    return el('span', { class: `chip${have ? (enough ? ' ok' : ' short') : ''}`, title: ITEMS[id].name, text: label });
  });

export class Hud {
  /**
   * @param {object} opts
   * @param {import('../game/state.js').GameState} opts.state
   * @param {import('../game/weather.js').WeatherSystem} opts.weather
   * @param {{tool:string, seed:string, building:string}} opts.selection
   * @param {{onToggleCamera:()=>void, onFulfill:(id:number)=>void, onCraft:(id:string)=>void}} opts.handlers
   */
  constructor({ state, weather, selection, handlers }) {
    this.state = state;
    this.weather = weather;
    this.selection = selection;
    this.handlers = handlers;
    this.cameraMode = 'iso';
    this.craftOpen = false;
    this.clockTimer = 0;
    this.dirty = { status: true, inventory: true, orders: true, toolbar: true, craft: false, help: true };

    this.root = document.getElementById('hud');
    this.build();

    state.on('coins', () => {
      this.dirty.status = true;
      this.dirty.toolbar = true;
    });
    state.on('inventory', () => {
      this.dirty.inventory = true;
      this.dirty.orders = true;
      this.dirty.craft = true;
    });
    state.on('orders', () => (this.dirty.orders = true));
  }

  // ---- layout ------------------------------------------------------------------------------

  build() {
    this.coinsEl = el('span', { class: 'coins' });
    this.clockEl = el('span', { class: 'clock' });
    this.weatherEl = el('span', { class: 'wx' });
    this.statusEl = el('div', { id: 'status', class: 'panel' }, [this.coinsEl, this.clockEl, this.weatherEl]);

    this.inventoryEl = el('div', { id: 'inventory', class: 'panel' });

    this.ordersListEl = el('div', { class: 'list' });
    this.ordersEl = el('aside', { id: 'orders', class: 'panel' }, [
      el('h3', { text: '📋 地面居民的訂單' }),
      this.ordersListEl,
      el('p', { class: 'note', text: '做好的東西會用繩籃送到地面。' }),
    ]);

    this.toastsEl = el('div', { id: 'toasts' });
    this.hintEl = el('div', { id: 'hint' });
    this.subbarEl = el('div', { id: 'subbar', class: 'panel' });
    this.toolbarEl = el('div', { id: 'toolbar', class: 'panel' });
    this.bottomEl = el('div', { id: 'bottom' }, [this.hintEl, this.subbarEl, this.toolbarEl]);

    this.camBtn = el('button', { id: 'cam', class: 'panel btn', onClick: () => this.handlers.onToggleCamera() });
    this.helpEl = el('div', { id: 'help', class: 'panel' });

    this.craftBody = el('div', { class: 'craft-body' });
    this.craftEl = el('div', { id: 'craft', class: 'modal', hidden: '' }, [
      el('div', { class: 'modal-card panel' }, [
        el('div', { class: 'modal-head' }, [
          el('h3', { text: '🧰 工作台' }),
          el('button', { class: 'btn small', text: '✕', onClick: () => this.closeCraft() }),
        ]),
        this.craftBody,
      ]),
    ]);

    this.root.append(
      this.statusEl,
      this.inventoryEl,
      this.ordersEl,
      this.toastsEl,
      this.bottomEl,
      this.camBtn,
      this.helpEl,
      this.craftEl,
    );
  }

  // ---- public API --------------------------------------------------------------------------

  toast(text, kind = 'info') {
    const t = el('div', { class: `toast ${kind}`, text });
    this.toastsEl.prepend(t);
    while (this.toastsEl.children.length > 4) this.toastsEl.lastChild.remove();
    setTimeout(() => {
      t.classList.add('out');
      setTimeout(() => t.remove(), 400);
    }, 3400);
  }

  setHint(label, ok) {
    const key = `${label}|${ok}`;
    if (key === this._hintKey) return;
    this._hintKey = key;
    this.hintEl.textContent = label;
    this.hintEl.className = label ? (ok ? 'on ok' : 'on no') : '';
  }

  setCameraMode(mode) {
    this.cameraMode = mode;
    this.dirty.help = true;
  }

  get modalOpen() {
    return this.craftOpen;
  }

  selectTool(id) {
    if (!TOOLS[id]) return;
    this.selection.tool = id;
    this.dirty.toolbar = true;
  }

  /** Tab: cycle through seeds (farm) or buildings (build). */
  cycleOption() {
    const sel = this.selection;
    const cycle = (ids, current) => ids[(ids.indexOf(current) + 1) % ids.length];
    if (sel.tool === 'farm') sel.seed = cycle(Object.keys(CROPS), sel.seed);
    else if (sel.tool === 'build') sel.building = cycle(Object.keys(BUILDINGS), sel.building);
    this.dirty.toolbar = true;
  }

  openCraft() {
    this.craftOpen = true;
    this.craftEl.hidden = false;
    this.dirty.craft = true;
  }

  closeCraft() {
    this.craftOpen = false;
    this.craftEl.hidden = true;
  }

  toggleCraft() {
    if (this.craftOpen) this.closeCraft();
    else this.openCraft();
  }

  closeModals() {
    this.closeCraft();
  }

  update(dt) {
    this.clockTimer -= dt;
    if (this.clockTimer <= 0) {
      this.clockTimer = 0.25;
      this.renderClock();
      this.updateOrderTimers();
    }
    if (this.dirty.status) this.renderStatus();
    if (this.dirty.inventory) this.renderInventory();
    if (this.dirty.orders) this.renderOrders();
    if (this.dirty.toolbar) this.renderToolbar();
    if (this.dirty.help) this.renderHelp();
    if (this.dirty.craft && this.craftOpen) this.renderCraft();
    this.dirty.craft = false;
  }

  // ---- renderers ---------------------------------------------------------------------------

  renderStatus() {
    this.dirty.status = false;
    this.coinsEl.textContent = `🪙 ${this.state.coins}`;
  }

  renderClock() {
    const s = this.state;
    this.clockEl.textContent = `${phaseIcon(s.time)} 第 ${s.day} 天 ${formatClock(s.time)}`;
    const def = WEATHER[this.weather.type];
    this.weatherEl.textContent = `${def.icon} ${def.label}`;
  }

  renderInventory() {
    this.dirty.inventory = false;
    const entries = Object.entries(this.state.inventory).filter(([, n]) => n > 0);
    this.inventoryEl.hidden = entries.length === 0;
    this.inventoryEl.replaceChildren(
      el('span', { class: 'label', text: '背包' }),
      ...entries.map(([id, n]) => el('span', { class: 'chip', title: ITEMS[id].name, text: `${ITEMS[id].emoji} ${n}` })),
    );
  }

  renderOrders() {
    this.dirty.orders = false;
    const s = this.state;
    this.orderRefs = [];
    if (s.orders.length === 0) {
      this.ordersListEl.replaceChildren(el('p', { class: 'empty', text: '目前沒有訂單，居民很快就會來拜託你。' }));
      return;
    }
    const cards = s.orders.map((order) => {
      const resident = RESIDENTS[order.resident];
      const can = s.hasItems(order.items);
      const ttl = el('i');
      this.orderRefs.push({ order, ttl });
      return el('div', { class: `order${can ? ' ready' : ''}` }, [
        el('div', { class: 'order-head' }, [
          el('span', { class: 'avatar', text: resident.emoji }),
          el('span', { class: 'who', text: resident.name }),
          el('span', { class: 'reward', text: `🪙 ${order.reward}` }),
        ]),
        el('div', { class: 'order-items' }, itemChips(order.items, (id) => s.count(id))),
        el('div', { class: 'ttl' }, ttl),
        el('button', { class: 'btn small', disabled: !can, text: '🧺 送下去', onClick: () => this.handlers.onFulfill(order.id) }),
      ]);
    });
    this.ordersListEl.replaceChildren(...cards);
    this.updateOrderTimers();
  }

  updateOrderTimers() {
    for (const { order, ttl } of this.orderRefs ?? []) {
      const f = Math.max(0, Math.min(1, order.ttl / order.maxTtl));
      ttl.style.width = `${f * 100}%`;
      ttl.classList.toggle('low', f < 0.2);
    }
  }

  renderToolbar() {
    this.dirty.toolbar = false;
    const { selection: sel, state } = this;

    // tools
    const tools = Object.entries(TOOLS).map(([id, t]) =>
      el('button', {
        class: `btn tool${sel.tool === id ? ' sel' : ''}`,
        title: `${t.name} (${t.key})`,
        onClick: () => this.selectTool(id),
      }, [el('span', { class: 'ico', text: t.emoji }), el('span', { class: 'lbl', text: t.name }), el('kbd', { text: t.key })]),
    );
    tools.push(
      el('button', { class: 'btn tool', title: '工作台 (4)', onClick: () => this.toggleCraft() }, [
        el('span', { class: 'ico', text: '🧰' }),
        el('span', { class: 'lbl', text: '製作' }),
        el('kbd', { text: '4' }),
      ]),
    );
    this.toolbarEl.replaceChildren(...tools);

    // options for the current tool
    let options = [];
    if (sel.tool === 'farm') {
      options = Object.entries(CROPS).map(([id, def]) =>
        el('button', {
          class: `chip btn opt${sel.seed === id ? ' sel' : ''}${state.coins < def.seedCost ? ' short' : ''}`,
          title: `${ITEMS[id].name}：約 ${def.grow} 秒成熟${def.regrow ? '，可重複收成' : ''}`,
          onClick: () => {
            sel.seed = id;
            this.dirty.toolbar = true;
          },
          text: `${ITEMS[id].emoji} ${ITEMS[id].name} ${def.seedCost}🪙`,
        }),
      );
    } else if (sel.tool === 'build') {
      options = Object.entries(BUILDINGS).map(([id, def]) =>
        el('button', {
          class: `chip btn opt${sel.building === id ? ' sel' : ''}${state.coins < def.cost ? ' short' : ''}`,
          onClick: () => {
            sel.building = id;
            this.dirty.toolbar = true;
          },
          text: `${def.emoji} ${def.name} ${def.cost}🪙`,
        }),
      );
    } else {
      options = [el('span', { class: 'note', text: '點選要移除的作物或建築（建築退回一半金幣）' })];
    }
    this.subbarEl.replaceChildren(...options);
  }

  renderHelp() {
    this.dirty.help = false;
    const iso = this.cameraMode === 'iso';
    this.camBtn.textContent = iso ? '🎥 切換到第三人稱 (C)' : '🎥 切換到 45° 視角 (C)';
    const lines = iso
      ? ['WASD 平移　Q/E 或右鍵拖曳 旋轉　滾輪 縮放', '左鍵 執行動作　Tab 切換種子/建築']
      : ['WASD 走路（Shift 加速）　右鍵拖曳 環顧（往上拖可仰望天空）', '空白鍵或左鍵 對面前的格子執行動作'];
    lines.push('1 耕作　2 建造　3 移除　4 製作　F2 除錯面板');
    this.helpEl.replaceChildren(...lines.map((t) => el('div', { text: t })));
  }

  renderCraft() {
    const s = this.state;
    const hasBench = s.countBuildings('workbench') > 0;
    if (!hasBench) {
      this.craftBody.replaceChildren(el('p', { class: 'empty', text: '需要先蓋一座工作台（建造 → 🧰 工作台）。' }));
      return;
    }
    const rows = Object.entries(RECIPES).map(([id, recipe]) => {
      const [outId] = Object.keys(recipe.out);
      const can = s.hasItems(recipe.in);
      return el('div', { class: `recipe${can ? ' ready' : ''}` }, [
        el('div', { class: 'out' }, [
          el('span', { class: 'ico', text: ITEMS[outId].emoji }),
          el('span', { text: ITEMS[outId].name }),
          el('span', { class: 'have', text: `持有 ${s.count(outId)}` }),
        ]),
        el('div', { class: 'in' }, itemChips(recipe.in, (i) => s.count(i))),
        el('button', { class: 'btn small', disabled: !can, text: '製作', onClick: () => this.handlers.onCraft(id) }),
      ]);
    });
    this.craftBody.replaceChildren(...rows);
  }
}
