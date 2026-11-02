import { test } from 'node:test';
import assert from 'node:assert/strict';

import { WEATHER, WeatherSystem } from '../src/game/weather.js';
import { mulberry32 } from '../src/util/noise.js';

test('parameters ease towards the target weather', () => {
  const w = new WeatherSystem({ rng: mulberry32(1), initial: 'clear' });
  w.force('rain', 1000);
  assert.equal(w.params.rain, 0);
  for (let i = 0; i < 60; i++) w.update(1);
  assert.ok(Math.abs(w.params.rain - WEATHER.rain.rain) < 0.01);
  assert.ok(Math.abs(w.params.cloud - WEATHER.rain.cloud) < 0.01);
});

test('weather changes on its own and never repeats the same type back-to-back', () => {
  const w = new WeatherSystem({ rng: mulberry32(9) });
  let last = w.type;
  let changes = 0;
  for (let i = 0; i < 5000; i++) {
    w.update(1);
    if (w.type !== last) {
      changes++;
      last = w.type;
    }
  }
  assert.ok(changes > 10);
});

test('storms produce lightning flashes that decay', () => {
  const w = new WeatherSystem({ rng: mulberry32(2), initial: 'storm' });
  let max = 0;
  for (let i = 0; i < 600; i++) {
    w.update(0.1);
    max = Math.max(max, w.flash);
  }
  assert.ok(max > 0.5, 'saw a flash');
  for (let i = 0; i < 50; i++) w.update(0.1);
  w.force('clear', 1000);
  for (let i = 0; i < 100; i++) w.update(0.1);
  assert.equal(w.flash, 0);
});

test('force ignores unknown types', () => {
  const w = new WeatherSystem({ rng: mulberry32(3) });
  assert.equal(w.force('meteor-shower-of-cats'), false);
  assert.equal(w.type, 'clear');
});
