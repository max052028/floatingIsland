import * as THREE from 'three';
import { mulberry32 } from '../util/noise.js';

// Precipitation lives in a box around the island and wraps around, so a fixed particle
// budget is enough no matter where the camera is.
const BOX = 30; // half-width in x and z
const TOP = 32;
const BOTTOM = -8;

function dotTexture(kind) {
  const size = 64;
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const g = cv.getContext('2d');
  if (kind === 'petal') {
    g.translate(size / 2, size / 2);
    g.rotate(-0.6);
    g.fillStyle = '#fff';
    g.beginPath();
    g.ellipse(0, 0, size * 0.42, size * 0.2, 0, 0, Math.PI * 2);
    g.fill();
  } else {
    const grd = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    grd.addColorStop(0, 'rgba(255,255,255,1)');
    grd.addColorStop(0.45, 'rgba(255,255,255,0.8)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, size, size);
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

class Rain {
  constructor(scene) {
    this.N = 3200;
    this.rnd = mulberry32(5);
    this.x = new Float32Array(this.N);
    this.y = new Float32Array(this.N);
    this.z = new Float32Array(this.N);
    this.v = new Float32Array(this.N);
    for (let i = 0; i < this.N; i++) {
      this.x[i] = (this.rnd() * 2 - 1) * BOX;
      this.y[i] = BOTTOM + this.rnd() * (TOP - BOTTOM);
      this.z[i] = (this.rnd() * 2 - 1) * BOX;
      this.v[i] = 24 + this.rnd() * 10;
    }
    const attr = new THREE.BufferAttribute(new Float32Array(this.N * 6), 3);
    attr.setUsage(THREE.DynamicDrawUsage);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', attr);
    geo.setDrawRange(0, 0);
    this.mat = new THREE.LineBasicMaterial({ color: 0xb8cfff, transparent: true, opacity: 0.5, depthWrite: false });
    this.lines = new THREE.LineSegments(geo, this.mat);
    this.lines.frustumCulled = false;
    this.lines.visible = false;
    scene.add(this.lines);
  }

  update(dt, intensity, wind) {
    const count = Math.floor(this.N * intensity);
    this.lines.visible = count > 8;
    if (!this.lines.visible) return;

    const drift = wind * 7;
    const p = this.lines.geometry.attributes.position.array;
    for (let i = 0; i < count; i++) {
      let y = this.y[i] - this.v[i] * dt;
      let x = this.x[i] + drift * dt;
      let z = this.z[i];
      if (y < BOTTOM) {
        y = TOP;
        x = (this.rnd() * 2 - 1) * BOX;
        z = (this.rnd() * 2 - 1) * BOX;
      }
      if (x > BOX) x -= 2 * BOX;
      this.x[i] = x;
      this.y[i] = y;
      this.z[i] = z;
      const o = i * 6;
      p[o] = x;
      p[o + 1] = y;
      p[o + 2] = z;
      p[o + 3] = x - drift * 0.035;
      p[o + 4] = y + 0.9;
      p[o + 5] = z;
    }
    this.lines.geometry.attributes.position.needsUpdate = true;
    this.lines.geometry.setDrawRange(0, count * 2);
    this.mat.opacity = 0.2 + 0.4 * intensity;
  }
}

class FlakeField {
  constructor(scene, { count, color, size, fall, sway, kind, opacity, seed }) {
    this.N = count;
    this.fall = fall;
    this.sway = sway;
    this.baseOpacity = opacity;
    this.rnd = mulberry32(seed);
    this.ph = new Float32Array(count);
    const attr = new THREE.BufferAttribute(new Float32Array(count * 3), 3);
    attr.setUsage(THREE.DynamicDrawUsage);
    const p = attr.array;
    for (let i = 0; i < count; i++) {
      p[i * 3] = (this.rnd() * 2 - 1) * BOX;
      p[i * 3 + 1] = BOTTOM + this.rnd() * (TOP - BOTTOM);
      p[i * 3 + 2] = (this.rnd() * 2 - 1) * BOX;
      this.ph[i] = this.rnd();
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', attr);
    geo.setDrawRange(0, 0);
    this.mat = new THREE.PointsMaterial({
      map: dotTexture(kind),
      color,
      size,
      sizeAttenuation: true,
      transparent: true,
      opacity,
      depthWrite: false,
      alphaTest: 0.01,
    });
    this.points = new THREE.Points(geo, this.mat);
    this.points.frustumCulled = false;
    this.points.visible = false;
    scene.add(this.points);
  }

  update(dt, intensity, wind, t) {
    const n = Math.floor(this.N * intensity);
    this.points.visible = n > 4;
    if (!this.points.visible) return;

    const attr = this.points.geometry.attributes.position;
    const p = attr.array;
    for (let i = 0; i < n; i++) {
      const ph = this.ph[i];
      const o = i * 3;
      p[o + 1] -= this.fall * (0.7 + ph * 0.6) * dt;
      p[o] += (wind * 3 + Math.sin(t * 0.7 + ph * 20) * this.sway) * dt;
      p[o + 2] += Math.cos(t * 0.5 + ph * 17) * this.sway * 0.6 * dt;
      if (p[o + 1] < BOTTOM) {
        p[o + 1] = TOP;
        p[o] = (this.rnd() * 2 - 1) * BOX;
        p[o + 2] = (this.rnd() * 2 - 1) * BOX;
      }
      if (p[o] > BOX) p[o] -= 2 * BOX;
      else if (p[o] < -BOX) p[o] += 2 * BOX;
    }
    attr.needsUpdate = true;
    this.points.geometry.setDrawRange(0, n);
    this.mat.opacity = this.baseOpacity * Math.min(1, intensity * 1.5);
  }
}

/** Rain, snow and drifting flower petals. */
export class Precip {
  constructor(scene) {
    this.rain = new Rain(scene);
    this.snow = new FlakeField(scene, {
      count: 1800,
      color: 0xffffff,
      size: 0.36,
      fall: 1.6,
      sway: 0.9,
      kind: 'dot',
      opacity: 0.95,
      seed: 11,
    });
    this.petals = new FlakeField(scene, {
      count: 600,
      color: 0xffa3c2,
      size: 0.95,
      fall: 0.9,
      sway: 1.6,
      kind: 'petal',
      opacity: 0.95,
      seed: 12,
    });
  }

  update(dt, w, t) {
    this.rain.update(dt, w.rain, w.wind);
    this.snow.update(dt, w.snow, w.wind, t);
    this.petals.update(dt, w.petals, w.wind, t);
  }
}
