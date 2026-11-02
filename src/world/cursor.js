import * as THREE from 'three';

const OK = new THREE.Color(0x9dffb0);
const NO = new THREE.Color(0xff9a9a);
const NEUTRAL = new THREE.Color(0xffffff);

/** Highlight square drawn over the targeted cell. */
export class Cursor {
  constructor(scene) {
    this.group = new THREE.Group();
    this.fill = new THREE.Mesh(
      new THREE.PlaneGeometry(0.94, 0.94).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.28, depthWrite: false, fog: false }),
    );
    this.outline = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.PlaneGeometry(0.96, 0.96).rotateX(-Math.PI / 2)),
      new THREE.LineBasicMaterial({ color: 0xffffff, fog: false }),
    );
    this.group.add(this.fill, this.outline);
    this.group.visible = false;
    this.group.renderOrder = 5;
    scene.add(this.group);
  }

  /** @param {'ok'|'no'|'none'} state */
  show(x, z, state) {
    this.group.visible = true;
    this.group.position.set(x, 0.1, z);
    const c = state === 'ok' ? OK : state === 'no' ? NO : NEUTRAL;
    this.fill.material.color.copy(c);
    this.outline.material.color.copy(c);
  }

  hide() {
    this.group.visible = false;
  }

  update(t) {
    this.group.position.y = 0.1 + Math.sin(t * 3) * 0.015;
    this.fill.material.opacity = 0.22 + Math.sin(t * 3) * 0.06;
  }
}
