import * as THREE from 'three';
import { BUILD_R, ISLAND_R } from '../constants.js';
import { mulberry32, noise2 } from '../util/noise.js';

const SEG = 72; // vertices around the outline
const TOP_RINGS = 16; // rings on the walkable top surface
const UNDER_RINGS = 14; // rings on the rocky underside
const DEPTH = 12; // how far the island hangs down
const RIM_T = 0.88; // fraction of the radius where the top starts to curve down
const RIM_DROP = 0.4;

/** Outline radius of the island at a given angle (slightly irregular, never a perfect circle). */
export function edgeRadius(theta) {
  return (
    ISLAND_R *
    (1 + 0.05 * Math.sin(3 * theta + 1.3) + 0.035 * Math.sin(5 * theta + 0.4) + 0.02 * Math.sin(9 * theta + 2.1))
  );
}

/** Ground height at (x, z): flat in the middle, rolling off at the rim. */
export function heightAt(x, z) {
  const R = edgeRadius(Math.atan2(z, x));
  const t = Math.hypot(x, z) / R;
  if (t <= RIM_T) return 0;
  const d = Math.min((t - RIM_T) / (1 - RIM_T), 1.5);
  return -RIM_DROP * d * d;
}

/** True if (x, z) is safely on the island (used to keep the player from walking off). */
export function insideIsland(x, z, margin = 0) {
  const R = edgeRadius(Math.atan2(z, x)) * 0.94;
  return Math.hypot(x, z) <= R - margin;
}

export function createIsland() {
  const group = new THREE.Group();

  // ---- body: one lathe-like surface covering the grassy top and the rocky underside ----
  const grassA = new THREE.Color(0x7cc46b);
  const grassB = new THREE.Color(0x5aa65a);
  const lip = new THREE.Color(0x92d273);
  const soil = new THREE.Color(0x7a5538);
  const rockA = new THREE.Color(0x8c8179);
  const rockB = new THREE.Color(0x565a70);
  const tmp = new THREE.Color();

  const total = TOP_RINGS + 1 + UNDER_RINGS;
  const positions = new Float32Array(total * SEG * 3);
  const colors = new Float32Array(total * SEG * 3);

  for (let i = 0; i < total; i++) {
    const onTop = i <= TOP_RINGS;
    for (let j = 0; j < SEG; j++) {
      const theta = (j / SEG) * Math.PI * 2;
      const R = edgeRadius(theta);
      let rs;
      let y;

      if (onTop) {
        const t = i / TOP_RINGS;
        const d = Math.max(0, (t - RIM_T) / (1 - RIM_T));
        rs = t;
        y = -RIM_DROP * d * d;
        const x = Math.cos(theta) * rs * R;
        const z = Math.sin(theta) * rs * R;
        tmp.copy(grassA).lerp(grassB, noise2(x * 0.3 + 10, z * 0.3 - 4));
        if (t > 0.9) tmp.lerp(lip, (t - 0.9) / 0.1);
        if (i === TOP_RINGS) tmp.lerp(soil, 0.65);
      } else {
        const k = i - TOP_RINGS; // 1..UNDER_RINGS
        const u = k / UNDER_RINGS;
        const n = noise2(Math.cos(theta) * 2.2 + k * 0.9, Math.sin(theta) * 2.2 + k * 0.45);
        rs = Math.pow(1 - u, 0.85) * (1 + (n - 0.5) * 0.35 * (1 - u));
        y = -RIM_DROP - DEPTH * Math.pow(u, 0.78) + (k < UNDER_RINGS ? (n - 0.5) * 1.3 * (1 - u) : 0);
        tmp.copy(soil).lerp(rockA, Math.min(1, u * 3.2)).lerp(rockB, Math.max(0, u - 0.3) / 0.7);
        tmp.offsetHSL(0, 0, (n - 0.5) * 0.08);
      }

      const idx = (i * SEG + j) * 3;
      positions[idx] = Math.cos(theta) * rs * R;
      positions[idx + 1] = y;
      positions[idx + 2] = Math.sin(theta) * rs * R;
      colors[idx] = tmp.r;
      colors[idx + 1] = tmp.g;
      colors[idx + 2] = tmp.b;
    }
  }

  const indices = [];
  for (let i = 0; i < total - 1; i++) {
    for (let j = 0; j < SEG; j++) {
      const a = i * SEG + j;
      const b = i * SEG + ((j + 1) % SEG);
      const c = (i + 1) * SEG + j;
      const d = (i + 1) * SEG + ((j + 1) % SEG);
      indices.push(a, b, c, b, d, c);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();

  const body = new THREE.Mesh(
    geo,
    new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.95, metalness: 0 }),
  );
  body.receiveShadow = true;
  body.castShadow = true;
  group.add(body);

  // ---- decoration on the outer rim (the inner area is reserved for the player's buildings) ----
  const rnd = mulberry32(20241102);
  const dummy = new THREE.Object3D();

  /** Random point in the ring between BUILD_R + inner and the rim. */
  const rimPoint = (inner, maxT) => {
    const theta = rnd() * Math.PI * 2;
    const R = edgeRadius(theta);
    const rMin = BUILD_R + inner;
    const rMax = R * maxT;
    const r = rMin + (rMax - rMin) * Math.sqrt(rnd());
    return { x: Math.cos(theta) * r, z: Math.sin(theta) * r, theta };
  };

  // grass tufts
  const tuftGeo = new THREE.ConeGeometry(0.07, 0.35, 4);
  tuftGeo.translate(0, 0.17, 0);
  const tufts = new THREE.InstancedMesh(
    tuftGeo,
    new THREE.MeshStandardMaterial({ flatShading: true, roughness: 1 }),
    420,
  );
  for (let i = 0; i < tufts.count; i++) {
    const p = rimPoint(0.35, 0.93);
    dummy.position.set(p.x, heightAt(p.x, p.z), p.z);
    dummy.rotation.set((rnd() - 0.5) * 0.4, rnd() * Math.PI, (rnd() - 0.5) * 0.4);
    dummy.scale.setScalar(0.7 + rnd() * 0.9);
    dummy.updateMatrix();
    tufts.setMatrixAt(i, dummy.matrix);
    tufts.setColorAt(i, tmp.copy(grassB).lerp(lip, rnd()).offsetHSL(0, 0, -0.06 + rnd() * 0.08));
  }
  group.add(tufts);

  // little flowers
  const flowerGeo = new THREE.IcosahedronGeometry(0.07, 0);
  const flowers = new THREE.InstancedMesh(
    flowerGeo,
    new THREE.MeshStandardMaterial({ flatShading: true, roughness: 0.8 }),
    90,
  );
  const petals = [0xfff3b0, 0xffb3c7, 0xffffff, 0xc7b3ff, 0xffd08a];
  for (let i = 0; i < flowers.count; i++) {
    const p = rimPoint(0.4, 0.9);
    dummy.position.set(p.x, heightAt(p.x, p.z) + 0.12, p.z);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.setScalar(0.8 + rnd() * 0.8);
    dummy.updateMatrix();
    flowers.setMatrixAt(i, dummy.matrix);
    flowers.setColorAt(i, tmp.set(petals[Math.floor(rnd() * petals.length)]));
  }
  group.add(flowers);

  // rocks
  const rocks = new THREE.InstancedMesh(
    new THREE.IcosahedronGeometry(0.45, 0),
    new THREE.MeshStandardMaterial({ color: 0x9a9a9f, flatShading: true, roughness: 1 }),
    14,
  );
  for (let i = 0; i < rocks.count; i++) {
    const p = rimPoint(0.6, 0.86);
    dummy.position.set(p.x, heightAt(p.x, p.z) + 0.1, p.z);
    dummy.rotation.set(rnd() * 3, rnd() * 3, rnd() * 3);
    dummy.scale.set(0.6 + rnd() * 0.9, 0.5 + rnd() * 0.6, 0.6 + rnd() * 0.9);
    dummy.updateMatrix();
    rocks.setMatrixAt(i, dummy.matrix);
  }
  rocks.castShadow = true;
  rocks.receiveShadow = true;
  group.add(rocks);

  // trees around the rim
  const trunkGeo = new THREE.CylinderGeometry(0.11, 0.16, 1, 5);
  trunkGeo.translate(0, 0.5, 0);
  const lowGeo = new THREE.ConeGeometry(0.95, 1.7, 6);
  lowGeo.translate(0, 0.85, 0);
  const highGeo = new THREE.ConeGeometry(0.7, 1.4, 6);
  highGeo.translate(0, 0.7, 0);
  const TREES = 9;
  const trunks = new THREE.InstancedMesh(trunkGeo, new THREE.MeshStandardMaterial({ color: 0x7b5a3c, flatShading: true }), TREES);
  const lows = new THREE.InstancedMesh(lowGeo, new THREE.MeshStandardMaterial({ flatShading: true, roughness: 0.9 }), TREES);
  const highs = new THREE.InstancedMesh(highGeo, new THREE.MeshStandardMaterial({ flatShading: true, roughness: 0.9 }), TREES);
  for (let i = 0; i < TREES; i++) {
    const theta = (i / TREES) * Math.PI * 2 + rnd() * 0.5;
    const R = edgeRadius(theta);
    const r = R * (0.82 + rnd() * 0.06);
    const x = Math.cos(theta) * r;
    const z = Math.sin(theta) * r;
    const s = 0.9 + rnd() * 0.7;
    const green = tmp.set(0x4f9a56).offsetHSL((rnd() - 0.5) * 0.05, 0, (rnd() - 0.5) * 0.08);

    dummy.rotation.set(0, rnd() * 6, 0);
    dummy.position.set(x, heightAt(x, z), z);
    dummy.scale.set(s, s, s);
    dummy.updateMatrix();
    trunks.setMatrixAt(i, dummy.matrix);

    dummy.position.set(x, heightAt(x, z) + 0.7 * s, z);
    dummy.updateMatrix();
    lows.setMatrixAt(i, dummy.matrix);
    lows.setColorAt(i, green);

    dummy.position.set(x, heightAt(x, z) + 1.7 * s, z);
    dummy.scale.set(s * 0.9, s * 0.9, s * 0.9);
    dummy.updateMatrix();
    highs.setMatrixAt(i, dummy.matrix);
    highs.setColorAt(i, green);
  }
  for (const m of [trunks, lows, highs]) {
    m.castShadow = true;
    m.receiveShadow = true;
    group.add(m);
  }

  return { group, heightAt, edgeRadius, insideIsland };
}
