import * as THREE from 'three';
import { edgeRadius } from './island.js';

const mat = (color) => new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.9 });

/**
 * A little rope-and-pulley dock at the island's edge. Finished orders are lowered down to
 * the residents in a basket.
 */
export class Delivery {
  constructor(scene) {
    this.group = new THREE.Group();
    scene.add(this.group);

    const theta = 0.8;
    const R = edgeRadius(theta);
    const dir = new THREE.Vector3(Math.cos(theta), 0, Math.sin(theta));
    const postPos = dir.clone().multiplyScalar(R * 0.92);
    const armEnd = dir.clone().multiplyScalar(R + 1.2);
    armEnd.y = 1.7;
    this.anchor = armEnd;

    const wood = mat(0x8a6240);
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 1.8, 6), wood);
    post.position.set(postPos.x, 0.9, postPos.z);
    post.castShadow = true;

    const len = armEnd.clone().setY(0).distanceTo(postPos.clone().setY(0));
    const arm = new THREE.Mesh(new THREE.BoxGeometry(len, 0.08, 0.08), wood);
    arm.position.set((postPos.x + armEnd.x) / 2, 1.74, (postPos.z + armEnd.z) / 2);
    arm.rotation.y = -theta;
    arm.castShadow = true;

    const brace = new THREE.Mesh(new THREE.BoxGeometry(len * 0.6, 0.05, 0.05), wood);
    brace.position.set(postPos.x + dir.x * len * 0.28, 1.35, postPos.z + dir.z * len * 0.28);
    brace.rotation.y = -theta;
    brace.rotation.z = 0.0;

    const crate = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.28, 0.4), mat(0xb98a5a));
    crate.position.set(postPos.x - dir.x * 0.5 + dir.z * 0.4, 0.14, postPos.z - dir.z * 0.5 - dir.x * 0.4);
    crate.castShadow = true;

    this.group.add(post, arm, brace, crate);
    this.baskets = [];
    this.basketMat = mat(0xc99a5e);
    this.ropeMat = new THREE.LineBasicMaterial({ color: 0xd8bf8c });
    this.goods = [0xe3bd4e, 0xff8f3a, 0xe5483c, 0x9a7bd8, 0xe33b55].map(mat);
  }

  /** Lower a basket down to the ground. */
  send() {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.19, 0.2, 8), this.basketMat);
    body.castShadow = true;
    g.add(body);
    for (let i = 0; i < 3; i++) {
      const goods = new THREE.Mesh(new THREE.IcosahedronGeometry(0.08, 0), this.goods[Math.floor(Math.random() * this.goods.length)]);
      goods.position.set((Math.random() - 0.5) * 0.25, 0.14, (Math.random() - 0.5) * 0.25);
      g.add(goods);
    }
    g.position.copy(this.anchor).setY(1.2);
    this.group.add(g);

    const rope = new THREE.Line(new THREE.BufferGeometry().setFromPoints([this.anchor.clone(), g.position.clone()]), this.ropeMat);
    rope.frustumCulled = false;
    this.group.add(rope);

    this.baskets.push({ g, rope, t: 0 });
  }

  update(dt) {
    for (let i = this.baskets.length - 1; i >= 0; i--) {
      const b = this.baskets[i];
      b.t += dt;
      b.g.position.y -= (0.8 + b.t * 3.2) * dt;
      b.g.rotation.y += dt * 0.6;
      const attr = b.rope.geometry.attributes.position;
      attr.setXYZ(0, this.anchor.x, this.anchor.y - 0.05, this.anchor.z);
      attr.setXYZ(1, b.g.position.x, b.g.position.y + 0.22, b.g.position.z);
      attr.needsUpdate = true;

      if (b.g.position.y < -50) {
        this.group.remove(b.g, b.rope);
        b.rope.geometry.dispose();
        this.baskets.splice(i, 1);
      }
    }
  }
}
