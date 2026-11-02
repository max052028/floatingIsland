import * as THREE from 'three';

import { describeAction } from './game/actions.js';
import { clearSave, loadGame, saveGame } from './game/save.js';
import { GameState } from './game/state.js';
import { WeatherSystem } from './game/weather.js';

import { Input } from './camera/input.js';
import { CameraRig } from './camera/rig.js';

import { Clouds } from './world/clouds.js';
import { Cursor } from './world/cursor.js';
import { Delivery } from './world/delivery.js';
import { EventDirector } from './world/events.js';
import { FarmWorld } from './world/farm.js';
import { createIsland } from './world/island.js';
import { Player } from './world/player.js';
import { Precip } from './world/precip.js';
import { Sky } from './world/sky.js';

import { createDebugPanel } from './ui/debug.js';
import { Hud } from './ui/hud.js';

// ---- renderer -------------------------------------------------------------------------------

const canvas = document.getElementById('scene');
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
} catch (err) {
  document.body.innerHTML = '<p style="color:#fff;padding:2em;font:16px sans-serif">這個瀏覽器無法啟動 WebGL，沒辦法執行遊戲。</p>';
  throw err;
}
const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
renderer.setPixelRatio(pixelRatio);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 2000);

function resize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

// ---- game & world -----------------------------------------------------------------------------

const state = loadGame() ?? GameState.fresh();
const weather = new WeatherSystem();
const selection = { tool: 'farm', seed: 'wheat', building: 'workbench' };

const sky = new Sky(scene);
const island = createIsland();
scene.add(island.group);
const clouds = new Clouds(scene);
const precip = new Precip(scene);
const farm = new FarmWorld(scene, state);
const delivery = new Delivery(scene);
const cursor = new Cursor(scene);
const player = new Player();
scene.add(player.group);

const input = new Input(canvas);
const rig = new CameraRig(camera);

const hud = new Hud({
  state,
  weather,
  selection,
  handlers: {
    onToggleCamera: () => hud.setCameraMode(rig.toggle(player)),
    onFulfill: (id) => {
      const res = state.fulfillOrder(id);
      hud.toast(res.message, res.ok ? 'good' : 'bad');
      if (res.ok) delivery.send();
    },
    onCraft: (id) => {
      const res = state.craft(id);
      hud.toast(res.message, res.ok ? 'good' : 'bad');
    },
  },
});

const events = new EventDirector(scene, {
  weather,
  announce: (info) => hud.toast(`${info.emoji} ${info.text}`, 'event'),
});
events.setPixelRatio(pixelRatio);

let resetting = false;
const debug = createDebugPanel({
  state,
  weather,
  events,
  onReset: () => {
    resetting = true;
    clearSave();
    location.reload();
  },
});

// ---- interaction ------------------------------------------------------------------------------

const raycaster = new THREE.Raycaster();
const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const hit = new THREE.Vector3();

function cellFromNdc(ndc) {
  raycaster.setFromCamera(ndc, camera);
  if (!raycaster.ray.intersectPlane(groundPlane, hit)) return null;
  return { x: Math.round(hit.x), z: Math.round(hit.z) };
}

/** The cell the player is aiming at: under the mouse (45°) or in front of the character (3rd person). */
function targetCell() {
  if (hud.modalOpen) return null;
  if (rig.mode === 'third') return player.frontCell();
  return input.pointer ? cellFromNdc(input.pointer) : null;
}

function performAction(cell) {
  const action = describeAction(state, selection, cell.x, cell.z);
  if (!action.ok || !action.run) {
    if (action.label) hud.toast(action.label, 'bad');
    return;
  }
  const res = action.run();
  if (res.openCraft) hud.openCraft();
  else if (res.message) hud.toast(res.message, res.ok ? 'good' : 'bad');
}

function handleKey(code) {
  switch (code) {
    case 'KeyC':
      hud.setCameraMode(rig.toggle(player));
      break;
    case 'Digit1':
      hud.selectTool('farm');
      break;
    case 'Digit2':
      hud.selectTool('build');
      break;
    case 'Digit3':
      hud.selectTool('remove');
      break;
    case 'Digit4':
      hud.toggleCraft();
      break;
    case 'Tab':
      hud.cycleOption();
      break;
    case 'Escape':
      hud.closeModals();
      break;
    case 'F2':
    case 'Backquote':
      debug.toggle();
      break;
    case 'Space':
      if (rig.mode === 'third' && !hud.modalOpen) performAction(player.frontCell());
      break;
    default:
  }
}

// ---- main loop --------------------------------------------------------------------------------

const wx = { cloud: 0, dark: 0, rain: 0, snow: 0, petals: 0, fog: 0, wind: 0, flash: 0 };
const eventCtx = { hour: 0, night: 0, camera, time: 0 };
let last = null;
let elapsed = 0;

function frame(now) {
  const dt = last === null ? 0 : Math.min((now - last) / 1000, 0.1);
  last = now;
  elapsed += dt;

  // simulation
  weather.update(dt);
  state.update(dt, weather.growthMultiplier());
  Object.assign(wx, weather.params);
  wx.flash = weather.flash;

  // input
  for (const code of input.consumePressed()) handleKey(code);
  const intent = rig.update(dt, input, player);
  const speed = 4.2 * (input.sprint ? 1.8 : 1);
  player.update(dt, intent.x, intent.z, speed);
  camera.updateMatrixWorld();

  for (const click of input.consumeClicks()) {
    if (hud.modalOpen) continue;
    const cell = rig.mode === 'third' ? player.frontCell() : cellFromNdc(click);
    if (cell) performAction(cell);
  }

  // target preview
  const cell = targetCell();
  if (cell && state.isBuildable(cell.x, cell.z)) {
    const action = describeAction(state, selection, cell.x, cell.z);
    cursor.show(cell.x, cell.z, action.label ? (action.ok ? 'ok' : 'no') : 'none');
    hud.setHint(action.label, action.ok);
  } else {
    cursor.hide();
    hud.setHint('', false);
  }

  // world
  eventCtx.hour = state.time;
  eventCtx.night = sky.night;
  eventCtx.time = elapsed;
  events.update(dt, eventCtx);
  sky.update(state.time, wx, events.tint);
  clouds.update(dt, wx, sky);
  precip.update(dt, wx, elapsed);
  farm.update(dt, elapsed, sky.night, wx);
  delivery.update(dt);
  cursor.update(elapsed);

  hud.update(dt);
  debug.update();
  renderer.render(scene, camera);
}

renderer.setAnimationLoop(frame);

// ---- saving -----------------------------------------------------------------------------------

const save = () => {
  if (!resetting) saveGame(state);
};
setInterval(save, 15000);
window.addEventListener('pagehide', save);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') save();
});

hud.toast('🏝️ 歡迎來到浮空島！先試著收成或種點東西吧', 'info');

// Handy for poking around in the browser console.
window.__game = { state, weather, events, sky, clouds, precip, farm, hud, rig, player, camera, scene, renderer, selection };
