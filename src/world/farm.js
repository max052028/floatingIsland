import * as THREE from 'three';
import { cellKey } from '../game/state.js';
import { clamp, hashCell, mulberry32, smoothstep } from '../util/noise.js';

// ---- shared geometry & materials -----------------------------------------------------------

const GEO = {
  stem: new THREE.CylinderGeometry(0.014, 0.02, 1, 5).translate(0, 0.5, 0),
  cone: new THREE.ConeGeometry(1, 1, 5).translate(0, 0.5, 0),
  blob: new THREE.IcosahedronGeometry(1, 1),
  box: new THREE.BoxGeometry(1, 1, 1),
  cyl: new THREE.CylinderGeometry(1, 1, 1, 8).translate(0, 0.5, 0),
};

const mat = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.9, ...extra });

const DRY_SOIL = new THREE.Color(0x8a5d3b);
const WET_SOIL = new THREE.Color(0x54392a);
const GREEN = new THREE.Color(0x6bbf59);
const GOLD = new THREE.Color(0xe0b84a);

const M = {
  soil: mat(DRY_SOIL),
  furrow: mat(0x6e4a30),
  leaf: mat(0x6bbf59),
  leafDark: mat(0x4e9c4a),
  wheatHead: mat(0xe3bd4e),
  carrotTop: mat(0xff8f3a),
  tomato: mat(0xe5483c),
  lavender: mat(0x9a7bd8),
  strawberry: mat(0xe33b55),
  wood: mat(0xb98a5a),
  woodDark: mat(0x7d5a3a),
  stone: [mat(0xa9a7a2), mat(0x9c9a97), mat(0xb4b1ab)],
  metal: mat(0xc0c4cc, { metalness: 0.3 }),
  red: mat(0xd9534f),
  lamp: mat(0xffd27a, { emissive: 0xffb347, emissiveIntensity: 0.4 }),
  flowers: [0xff8fb1, 0xfff0a0, 0xffffff, 0xb79bff, 0xffb15c].map((c) => mat(c)),
  foliage: [mat(0x4f9a56), mat(0x5ba85b), mat(0x468f52)],
};

function mesh(geo, material, { x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1, rx = 0, ry = 0, rz = 0, cast = true } = {}) {
  const m = new THREE.Mesh(geo, material);
  m.position.set(x, y, z);
  m.scale.set(sx, sy, sz);
  m.rotation.set(rx, ry, rz);
  m.castShadow = cast;
  m.receiveShadow = true;
  return m;
}

// ---- crops ---------------------------------------------------------------------------------

/** Wraps a crop model: scales it with growth and reveals "ripe" parts near the end. */
class CropVisual {
  constructor(group, parts = [], recolor = null, dispose = null) {
    this.group = group;
    this.parts = parts;
    this.recolor = recolor;
    this.disposeFn = dispose;
  }

  update(g, t, phase) {
    const grow = 0.3 + 0.7 * smoothstep(0, 1, g);
    const pulse = g >= 1 ? 1 + 0.03 * Math.sin(t * 4 + phase) : 1;
    this.group.scale.setScalar(grow * pulse);
    for (const p of this.parts) {
      const k = smoothstep(p.from, 1, g);
      p.mesh.visible = k > 0.02;
      p.mesh.scale.copy(p.base).multiplyScalar(Math.max(k, 0.0001));
    }
    this.recolor?.(g);
  }

  dispose() {
    this.disposeFn?.();
  }
}

const part = (mesh, from) => ({ mesh, from, base: mesh.scale.clone() });

const CROP_BUILDERS = {
  wheat(rnd) {
    const group = new THREE.Group();
    const stalkMat = M.leaf.clone();
    const parts = [];
    for (let i = 0; i < 9; i++) {
      const a = i * 2.4 + rnd();
      const r = 0.06 + (i % 3) * 0.09;
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      const h = 0.55 + rnd() * 0.2;
      group.add(mesh(GEO.stem, stalkMat, { x, z, sy: h, rx: (rnd() - 0.5) * 0.15, rz: (rnd() - 0.5) * 0.15 }));
      const head = mesh(GEO.blob, M.wheatHead, { x, y: h, z, sx: 0.035, sy: 0.1, sz: 0.035 });
      parts.push(part(head, 0.6));
      group.add(head);
    }
    return new CropVisual(
      group,
      parts,
      (g) => stalkMat.color.lerpColors(GREEN, GOLD, smoothstep(0.55, 1, g)),
      () => stalkMat.dispose(),
    );
  },

  carrot(rnd) {
    const group = new THREE.Group();
    const parts = [];
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2 + rnd() * 0.4;
      const h = 0.3 + rnd() * 0.2;
      group.add(
        mesh(GEO.cone, i % 2 ? M.leaf : M.leafDark, {
          x: Math.cos(a) * 0.07,
          z: Math.sin(a) * 0.07,
          sx: 0.05,
          sy: h,
          sz: 0.05,
          rx: Math.sin(a) * 0.5,
          rz: -Math.cos(a) * 0.5,
        }),
      );
    }
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + 0.5;
      const top = mesh(GEO.blob, M.carrotTop, { x: Math.cos(a) * 0.12, y: 0.015, z: Math.sin(a) * 0.12, sx: 0.07, sy: 0.04, sz: 0.07 });
      parts.push(part(top, 0.55));
      group.add(top);
    }
    return new CropVisual(group, parts);
  },

  tomato(rnd) {
    const group = new THREE.Group();
    const parts = [];
    group.add(mesh(GEO.stem, M.woodDark, { sy: 0.75, sx: 1.5, sz: 1.5 }));
    group.add(mesh(GEO.blob, M.leafDark, { y: 0.3, sx: 0.26, sy: 0.24, sz: 0.26 }));
    group.add(mesh(GEO.blob, M.leaf, { x: 0.08, y: 0.45, z: 0.04, sx: 0.18, sy: 0.16, sz: 0.18 }));
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 + rnd();
      const t = mesh(GEO.blob, M.tomato, {
        x: Math.cos(a) * 0.22,
        y: 0.18 + rnd() * 0.3,
        z: Math.sin(a) * 0.22,
        sx: 0.075,
        sy: 0.075,
        sz: 0.075,
      });
      parts.push(part(t, 0.7));
      group.add(t);
    }
    return new CropVisual(group, parts);
  },

  lavender(rnd) {
    const group = new THREE.Group();
    const parts = [];
    group.add(mesh(GEO.blob, M.leafDark, { y: 0.08, sx: 0.22, sy: 0.1, sz: 0.22 }));
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2 + rnd() * 0.5;
      const r = 0.05 + rnd() * 0.12;
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      const h = 0.4 + rnd() * 0.2;
      group.add(mesh(GEO.stem, M.leaf, { x, z, sy: h, rx: Math.sin(a) * 0.12, rz: -Math.cos(a) * 0.12 }));
      const bloom = mesh(GEO.cone, M.lavender, { x, y: h - 0.05, z, sx: 0.04, sy: 0.2, sz: 0.04 });
      parts.push(part(bloom, 0.5));
      group.add(bloom);
    }
    return new CropVisual(group, parts);
  },

  strawberry(rnd) {
    const group = new THREE.Group();
    const parts = [];
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      group.add(
        mesh(GEO.blob, i % 2 ? M.leaf : M.leafDark, {
          x: Math.cos(a) * 0.15,
          y: 0.08,
          z: Math.sin(a) * 0.15,
          sx: 0.14,
          sy: 0.07,
          sz: 0.14,
        }),
      );
    }
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 + rnd();
      const berry = mesh(GEO.blob, M.strawberry, {
        x: Math.cos(a) * 0.2,
        y: 0.1,
        z: Math.sin(a) * 0.2,
        sx: 0.055,
        sy: 0.07,
        sz: 0.055,
      });
      parts.push(part(berry, 0.65));
      group.add(berry);
    }
    return new CropVisual(group, parts);
  },
};

// ---- buildings -----------------------------------------------------------------------------

const BUILDING_BUILDERS = {
  workbench() {
    const g = new THREE.Group();
    g.add(mesh(GEO.box, M.wood, { y: 0.52, sx: 0.9, sy: 0.1, sz: 0.55 }));
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        g.add(mesh(GEO.box, M.woodDark, { x: sx * 0.38, y: 0.25, z: sz * 0.2, sx: 0.07, sy: 0.5, sz: 0.07 }));
      }
    }
    g.add(mesh(GEO.box, M.woodDark, { y: 0.2, sx: 0.8, sy: 0.04, sz: 0.42 }));
    g.add(mesh(GEO.box, M.red, { x: -0.2, y: 0.61, sx: 0.2, sy: 0.08, sz: 0.13 }));
    g.add(mesh(GEO.box, M.metal, { x: 0.18, y: 0.585, z: 0.08, sx: 0.36, sy: 0.02, sz: 0.07, ry: 0.4 }));
    g.add(mesh(GEO.cyl, M.stone[0], { x: 0.3, y: 0.57, z: -0.12, sx: 0.05, sy: 0.07, sz: 0.05 }));
    return g;
  },

  lantern() {
    const g = new THREE.Group();
    g.add(mesh(GEO.cyl, M.stone[1], { sx: 0.13, sy: 0.08, sz: 0.13 }));
    g.add(mesh(GEO.cyl, M.woodDark, { sx: 0.04, sy: 1.0, sz: 0.04 }));
    g.add(mesh(GEO.box, M.lamp, { y: 0.95, sx: 0.2, sy: 0.26, sz: 0.2, cast: false }));
    g.add(mesh(GEO.cone, M.woodDark, { y: 1.2, sx: 0.19, sy: 0.15, sz: 0.19 }));
    return g;
  },

  flowerbed(_rnd, x, z) {
    const g = new THREE.Group();
    g.add(mesh(GEO.box, M.woodDark, { y: 0.09, sx: 0.92, sy: 0.18, sz: 0.92 }));
    g.add(mesh(GEO.box, M.soil, { y: 0.18, sx: 0.8, sy: 0.04, sz: 0.8 }));
    const r = mulberry32((hashCell(x, z) * 1e6) | 0);
    for (let i = 0; i < 8; i++) {
      const fx = (r() - 0.5) * 0.66;
      const fz = (r() - 0.5) * 0.66;
      const h = 0.14 + r() * 0.14;
      g.add(mesh(GEO.stem, M.leaf, { x: fx, y: 0.19, z: fz, sy: h }));
      g.add(mesh(GEO.blob, M.flowers[Math.floor(r() * M.flowers.length)], { x: fx, y: 0.19 + h, z: fz, sx: 0.07, sy: 0.05, sz: 0.07 }));
    }
    return g;
  },

  tree(_rnd, x, z) {
    const g = new THREE.Group();
    const h = hashCell(x, z);
    const s = 0.85 + h * 0.4;
    const f = M.foliage[Math.floor(h * 3) % 3];
    g.add(mesh(GEO.cyl, M.woodDark, { sx: 0.1 * s, sy: 0.55 * s, sz: 0.1 * s }));
    g.add(mesh(GEO.cone, f, { y: 0.35 * s, sx: 0.55 * s, sy: 0.9 * s, sz: 0.55 * s }));
    g.add(mesh(GEO.cone, f, { y: 0.8 * s, sx: 0.4 * s, sy: 0.8 * s, sz: 0.4 * s }));
    g.rotation.y = h * 6;
    return g;
  },

  path(_rnd, x, z) {
    const g = new THREE.Group();
    g.add(mesh(GEO.box, M.stone[Math.floor(hashCell(x, z) * 3) % 3], { y: 0.025, sx: 0.96, sy: 0.05, sz: 0.96 }));
    return g;
  },
};

// ---- the world layer -----------------------------------------------------------------------

const LAMP_POOL = 6;

function glowTexture() {
  const size = 128;
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const g = cv.getContext('2d');
  const grd = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grd.addColorStop(0, 'rgba(255,220,150,1)');
  grd.addColorStop(0.3, 'rgba(255,190,100,0.45)');
  grd.addColorStop(1, 'rgba(255,170,80,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Keeps the 3D objects for every cell in sync with the game state. */
export class FarmWorld {
  constructor(scene, state) {
    this.state = state;
    this.group = new THREE.Group();
    scene.add(this.group);

    this.cellGroups = new Map();
    this.crops = new Map(); // key -> { visual, x, z, phase }
    this.lanterns = [];
    this.lanternsDirty = true;

    this.glowMat = new THREE.SpriteMaterial({
      map: glowTexture(),
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: false,
    });

    // A fixed pool of real lights (so shader programs never need recompiling); each one is
    // parked on a lantern at night.
    this.lamps = [];
    for (let i = 0; i < LAMP_POOL; i++) {
      const l = new THREE.PointLight(0xffb867, 0, 7, 2);
      l.position.set(0, -100, 0);
      scene.add(l);
      this.lamps.push(l);
    }

    state.on('cell', ({ x, z }) => this.syncCell(x, z));
    this.syncAll();
  }

  syncAll() {
    for (const key of [...this.cellGroups.keys()]) this.removeCell(key);
    for (const cell of this.state.cells.values()) this.syncCell(cell.x, cell.z);
  }

  removeCell(key) {
    const g = this.cellGroups.get(key);
    if (g) this.group.remove(g);
    this.cellGroups.delete(key);
    this.crops.get(key)?.visual.dispose();
    this.crops.delete(key);
    this.lanternsDirty = true;
  }

  syncCell(x, z) {
    const key = cellKey(x, z);
    this.removeCell(key);
    const cell = this.state.getCell(x, z);
    if (!cell) return;

    const g = new THREE.Group();
    g.position.set(x, 0, z);
    const rnd = mulberry32((hashCell(x, z) * 1e6) | 0 || 1);

    if (cell.kind === 'plot') {
      g.add(mesh(GEO.box, M.soil, { y: 0.035, sx: 0.94, sy: 0.07, sz: 0.94, cast: false }));
      for (const fz of [-0.26, 0, 0.26]) {
        g.add(mesh(GEO.box, M.furrow, { y: 0.073, z: fz, sx: 0.84, sy: 0.008, sz: 0.07, cast: false }));
      }
      if (cell.crop) {
        const visual = CROP_BUILDERS[cell.crop.id](rnd);
        visual.group.position.y = 0.07;
        g.add(visual.group);
        this.crops.set(key, { visual, x, z, phase: rnd() * 6 });
      }
    } else if (cell.kind === 'building') {
      const b = BUILDING_BUILDERS[cell.building](rnd, x, z);
      g.add(b);
      if (cell.building === 'lantern') {
        const glow = new THREE.Sprite(this.glowMat);
        glow.position.set(0, 0.97, 0);
        glow.scale.set(1.9, 1.9, 1);
        g.add(glow);
      }
    }

    this.group.add(g);
    this.cellGroups.set(key, g);
    this.lanternsDirty = true;
  }

  /**
   * @param {number} dt
   * @param {number} t seconds, for animation
   * @param {number} night 0..1
   * @param {{rain:number, snow:number}} w
   */
  update(dt, t, night, w) {
    for (const c of this.crops.values()) {
      const g = this.state.cropProgress(c.x, c.z) ?? 0;
      c.visual.update(g, t, c.phase);
    }

    // soil darkens in the rain
    const wet = clamp(w.rain * 1.2, 0, 1);
    M.soil.color.lerpColors(DRY_SOIL, WET_SOIL, wet);

    // lanterns glow at night
    const lampLevel = smoothstep(0.35, 0.85, night);
    M.lamp.emissiveIntensity = 0.4 + lampLevel * 2.6;
    this.glowMat.opacity = lampLevel * 0.9;

    if (this.lanternsDirty) {
      this.lanterns = [];
      for (const c of this.state.cells.values()) {
        if (c.kind === 'building' && c.building === 'lantern') this.lanterns.push(c);
      }
      this.lanternsDirty = false;
      for (let i = 0; i < this.lamps.length; i++) {
        const c = this.lanterns[i];
        if (c) this.lamps[i].position.set(c.x, 1.1, c.z);
        else this.lamps[i].position.set(0, -100, 0);
      }
    }
    const live = Math.min(this.lanterns.length, this.lamps.length);
    for (let i = 0; i < this.lamps.length; i++) {
      this.lamps[i].intensity = i < live ? lampLevel * 12 : 0;
    }
  }
}
