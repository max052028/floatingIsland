import { WEATHER } from '../game/weather.js';
import { EVENT_INFO } from '../world/events.js';
import { formatClock } from './hud.js';

/** Event id -> a good time of day to watch it (the debug buttons jump the clock there). */
const EVENT_HOURS = { aurora: 23, dust: 6.5, meteors: 23 };

/**
 * Developer panel (F2 / backtick) for poking at time, weather and special events without
 * waiting for them to happen on their own.
 */
export function createDebugPanel({ state, weather, events, onReset }) {
  const root = document.createElement('div');
  root.id = 'debug';
  root.className = 'panel';
  root.hidden = true;

  const section = (title) => {
    const s = document.createElement('div');
    s.className = 'dbg-sec';
    const h = document.createElement('h4');
    h.textContent = title;
    s.append(h);
    root.append(s);
    return s;
  };
  const button = (parent, text, onClick) => {
    const b = document.createElement('button');
    b.className = 'btn small';
    b.textContent = text;
    b.addEventListener('click', onClick);
    parent.append(b);
    return b;
  };

  // time
  const timeSec = section('時間');
  const label = document.createElement('div');
  const slider = document.createElement('input');
  slider.type = 'range';
  slider.min = '0';
  slider.max = '24';
  slider.step = '0.05';
  let scrubbing = false;
  slider.addEventListener('pointerdown', () => (scrubbing = true));
  slider.addEventListener('pointerup', () => (scrubbing = false));
  slider.addEventListener('input', () => {
    state.time = Math.min(23.99, Number(slider.value));
  });
  timeSec.append(label, slider);
  const speeds = document.createElement('div');
  speeds.className = 'row';
  for (const k of [1, 4, 16, 60]) button(speeds, `×${k}`, () => (state.timeScale = k));
  timeSec.append(speeds);

  // weather
  const wxSec = section('天氣');
  const wxRow = document.createElement('div');
  wxRow.className = 'row wrap';
  for (const [id, def] of Object.entries(WEATHER)) {
    button(wxRow, `${def.icon} ${def.label}`, () => weather.force(id, 90));
  }
  wxSec.append(wxRow);

  // events
  const evSec = section('奇景');
  const evRow = document.createElement('div');
  evRow.className = 'row wrap';
  for (const [id, info] of Object.entries(EVENT_INFO)) {
    button(evRow, `${info.emoji} ${info.label}`, () => {
      state.time = EVENT_HOURS[id];
      events.trigger(id);
    });
  }
  button(evRow, '停止全部', () => events.stopAll());
  evSec.append(evRow);

  // misc
  const miscSec = section('其他');
  const miscRow = document.createElement('div');
  miscRow.className = 'row wrap';
  button(miscRow, '+100 🪙', () => {
    state.coins += 100;
    state.emit('coins');
  });
  button(miscRow, '重置存檔', () => {
    if (confirm('確定要清除存檔並重新開始嗎？')) onReset();
  });
  miscSec.append(miscRow);

  document.getElementById('hud').append(root);

  return {
    toggle() {
      root.hidden = !root.hidden;
    },
    update() {
      if (root.hidden) return;
      label.textContent = `${formatClock(state.time)}　天氣：${weather.type}　速度 ×${state.timeScale}　進行中：${events.running.join(', ') || '無'}`;
      if (!scrubbing) slider.value = String(state.time);
    },
  };
}
