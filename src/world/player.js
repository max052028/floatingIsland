import * as THREE from 'three';
import { insideIsland } from './island.js';

const mat = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.85, ...extra });

/** A small low-poly gardener. Faces +z at rotation 0. */
export class Player {
  constructor() {
    this.group = new THREE.Group();
    // start with our back to the default camera (which sits towards +x, +z)
    this.facing = Math.PI * 1.25;
    this.walkT = 0;
    this.moving = false;

    const skin = mat(0xf2c9a0);
    const coat = mat(0x5fb0a8);
    const hat = mat(0xe9cf8a);
    const boots = mat(0x6b4b36);
    const scarf = mat(0xe8836b);
    const pack = mat(0x9a6b42);

    this.body = new THREE.Group();
    this.group.add(this.body);

    const add = (geo, material, x, y, z, rot = [0, 0, 0]) => {
      const m = new THREE.Mesh(geo, material);
      m.position.set(x, y, z);
      m.rotation.set(...rot);
      m.castShadow = true;
      this.body.add(m);
      return m;
    };

    add(new THREE.CapsuleGeometry(0.2, 0.36, 4, 8), coat, 0, 0.62, 0);
    add(new THREE.IcosahedronGeometry(0.17, 1), skin, 0, 1.2, 0);
    add(new THREE.CylinderGeometry(0.33, 0.33, 0.03, 12), hat, 0, 1.32, 0);
    add(new THREE.CylinderGeometry(0.17, 0.2, 0.15, 10), hat, 0, 1.4, 0);
    add(new THREE.TorusGeometry(0.17, 0.045, 6, 12), scarf, 0, 0.98, 0, [Math.PI / 2, 0, 0]);
    add(new THREE.BoxGeometry(0.24, 0.3, 0.13), pack, 0, 0.66, -0.22);
    this.feet = [add(new THREE.BoxGeometry(0.13, 0.1, 0.2), boots, -0.1, 0.06, 0.03), add(new THREE.BoxGeometry(0.13, 0.1, 0.2), boots, 0.1, 0.06, 0.03)];
    // eyes, so you can tell which way the character is looking
    const eye = mat(0x2b2b33);
    add(new THREE.SphereGeometry(0.025, 6, 6), eye, -0.06, 1.22, 0.155);
    add(new THREE.SphereGeometry(0.025, 6, 6), eye, 0.06, 1.22, 0.155);

    this.group.position.set(0, 0, 3);
  }

  get position() {
    return this.group.position;
  }

  /** The cell directly in front of the player. */
  frontCell() {
    const fx = this.position.x + Math.sin(this.facing) * 1.05;
    const fz = this.position.z + Math.cos(this.facing) * 1.05;
    return { x: Math.round(fx), z: Math.round(fz) };
  }

  /**
   * @param {number} dt
   * @param {number} mx world-space x movement intent (-1..1)
   * @param {number} mz world-space z movement intent (-1..1)
   * @param {number} speed units per second
   */
  update(dt, mx, mz, speed) {
    const len = Math.hypot(mx, mz);
    this.moving = len > 0.01;

    if (this.moving) {
      const nx = mx / len;
      const nz = mz / len;
      const target = Math.atan2(nx, nz);
      let diff = target - this.facing;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      this.facing += diff * (1 - Math.exp(-dt * 14));

      const p = this.position;
      const tx = p.x + nx * speed * dt;
      const tz = p.z + nz * speed * dt;
      // slide along the edge instead of stopping dead
      if (insideIsland(tx, tz, 0.5)) {
        p.x = tx;
        p.z = tz;
      } else if (insideIsland(tx, p.z, 0.5)) {
        p.x = tx;
      } else if (insideIsland(p.x, tz, 0.5)) {
        p.z = tz;
      }
      this.walkT += dt * speed * 2.2;
    } else {
      this.walkT *= Math.exp(-dt * 8);
    }

    this.group.rotation.y = this.facing;
    const bob = this.moving ? Math.abs(Math.sin(this.walkT)) * 0.07 : 0;
    this.body.position.y = bob;
    this.body.rotation.z = this.moving ? Math.sin(this.walkT) * 0.05 : 0;
    this.feet[0].position.z = 0.03 + (this.moving ? Math.sin(this.walkT) * 0.1 : 0);
    this.feet[1].position.z = 0.03 - (this.moving ? Math.sin(this.walkT) * 0.1 : 0);
  }
}
