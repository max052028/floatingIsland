import * as THREE from 'three';
import { clamp, mulberry32 } from '../util/noise.js';

const WHITE = new THREE.Color(1, 1, 1);
const GREY = new THREE.Color(0x6f747e);

/**
 * Drifting cloud puffs plus the endless "sea of clouds" far beneath the island.
 *
 * Three families of puffs, all faded in/out by the current cloud cover:
 *  - overhead: huge and high, mostly seen from the third-person camera
 *  - ring:     a loose ring at the horizon
 *  - low:      wisps drifting below the island, which is what the 45° camera actually sees
 */
export class Clouds {
  constructor(scene) {
    this.group = new THREE.Group();
    scene.add(this.group);

    // smooth shading + a finer sphere keeps clouds soft instead of looking like boulders
    this.mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1 });
    const puffGeo = new THREE.IcosahedronGeometry(1, 3);
    const rnd = mulberry32(31);

    const N = 30;
    const order = Array.from({ length: N }, (_, i) => i);
    for (let i = N - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }

    this.puffs = [];
    for (let i = 0; i < N; i++) {
      const family = i % 5 === 0 ? 'overhead' : i % 5 <= 2 ? 'low' : 'ring';

      const g = new THREE.Group();
      const parts = 4 + Math.floor(rnd() * 3);
      for (let p = 0; p < parts; p++) {
        const m = new THREE.Mesh(puffGeo, this.mat);
        const s = 1.2 + rnd() * 1.2;
        m.scale.set(s * 1.2, s * 0.7, s);
        m.position.set((p - (parts - 1) / 2) * 1.5 + (rnd() - 0.5) * 0.6, (rnd() - 0.5) * 0.5 + (p % 2 ? 0.2 : 0), (rnd() - 0.5) * 1.2);
        g.add(m);
      }

      let baseScale;
      let radius;
      let height;
      let threshold = (order[i] + 0.5) / N;
      if (family === 'overhead') {
        baseScale = 7 + rnd() * 5;
        radius = rnd() * 40;
        height = 40 + rnd() * 12;
      } else if (family === 'low') {
        baseScale = 2.6 + rnd() * 2.6;
        radius = 14 + rnd() * 46;
        height = -34 + rnd() * 20;
        threshold *= 0.5; // there are always some clouds beneath the island
      } else {
        baseScale = 2.6 + rnd() * 3;
        radius = 42 + rnd() * 70;
        height = -10 + rnd() * 26;
      }

      this.puffs.push({
        group: g,
        baseScale,
        angle: rnd() * Math.PI * 2,
        radius,
        height,
        speed: (0.005 + rnd() * 0.01) * (rnd() < 0.5 ? 1 : -1),
        threshold,
        s: 0,
      });
      this.group.add(g);
    }

    // The sea of clouds: a huge flat plane plus lumpy puffs rising out of it.
    this.seaMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const sea = new THREE.Mesh(new THREE.PlaneGeometry(2400, 2400), this.seaMat);
    sea.rotation.x = -Math.PI / 2;
    sea.position.y = -60;
    this.group.add(sea);

    const seaPuffs = new THREE.InstancedMesh(puffGeo, this.mat, 240);
    const dummy = new THREE.Object3D();
    for (let i = 0; i < seaPuffs.count; i++) {
      const a = rnd() * Math.PI * 2;
      const r = 25 + Math.pow(rnd(), 0.6) * 480;
      dummy.position.set(Math.cos(a) * r, -60 + (rnd() - 0.3) * 2.5, Math.sin(a) * r);
      dummy.scale.set(14 + rnd() * 34, 3.5 + rnd() * 6, 14 + rnd() * 34);
      dummy.rotation.set(0, rnd() * 3, 0);
      dummy.updateMatrix();
      seaPuffs.setMatrixAt(i, dummy.matrix);
    }
    this.group.add(seaPuffs);

    this._initialised = false;
  }

  /**
   * @param {number} dt
   * @param {{cloud:number, wind:number, dark:number}} w
   * @param {{horizon: THREE.Color}} sky
   */
  update(dt, w, sky) {
    const first = !this._initialised;
    this._initialised = true;
    const ease = 1 - Math.exp(-dt * 0.7);

    for (const p of this.puffs) {
      p.angle += p.speed * dt * (0.3 + w.wind * 1.5);
      p.group.position.set(Math.cos(p.angle) * p.radius, p.height, Math.sin(p.angle) * p.radius);
      const vis = clamp((w.cloud - p.threshold) * 6 + 0.5, 0, 1);
      p.s = first ? vis : p.s + (vis - p.s) * ease;
      p.group.visible = p.s > 0.01;
      p.group.scale.setScalar(Math.max(p.baseScale * p.s, 0.0001));
    }

    this.mat.color.copy(WHITE).lerp(GREY, clamp(w.dark * 1.2, 0, 1));
    this.seaMat.color.copy(sky.horizon).multiplyScalar(0.92);
  }
}
