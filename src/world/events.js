import * as THREE from 'three';
import { clamp, smoothstep } from '../util/noise.js';

const moveToward = (a, b, d) => (Math.abs(b - a) <= d ? b : a + Math.sign(b - a) * d);

/** Base class: an event that fades in, lasts a while, then fades out. */
class SkyEvent {
  constructor({ fadeIn = 5, fadeOut = 7 } = {}) {
    this.intensity = 0;
    this.target = 0;
    this.timeLeft = 0;
    this.fadeIn = fadeIn;
    this.fadeOut = fadeOut;
  }

  get active() {
    return this.target > 0 || this.intensity > 0.001;
  }

  start(duration) {
    this.target = 1;
    this.timeLeft = duration;
  }

  stop() {
    this.target = 0;
  }

  tick(dt) {
    if (this.target > 0) {
      this.timeLeft -= dt;
      if (this.timeLeft <= 0) this.target = 0;
    }
    const rate = this.target > this.intensity ? 1 / this.fadeIn : 1 / this.fadeOut;
    this.intensity = moveToward(this.intensity, this.target, dt * rate);
  }
}

// ---------------------------------------------------------------------------------------
// Aurora: a few huge, softly rippling curtains hanging in the northern sky.
// ---------------------------------------------------------------------------------------

const AURORA_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }`;

const AURORA_FRAG = /* glsl */ `
  uniform float uTime;
  uniform float uIntensity;
  uniform float uSeed;
  varying vec2 vUv;

  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
               mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
  }

  void main() {
    float x = vUv.x;
    float y = vUv.y;
    float ribbon = noise(vec2(x * 5.0 + uSeed + uTime * 0.05, uTime * 0.07 + uSeed));
    float streak = noise(vec2(x * 55.0 + uSeed * 3.0 + uTime * 0.2, uTime * 0.3));
    float bottom = smoothstep(0.0, 0.12, y);
    float top = 1.0 - smoothstep(0.30, 1.0, y + (ribbon - 0.5) * 0.35);
    float a = bottom * top * (0.25 + 0.75 * streak) * (0.45 + 0.9 * ribbon);
    a *= smoothstep(0.0, 0.10, x) * (1.0 - smoothstep(0.90, 1.0, x));

    vec3 green = vec3(0.25, 1.0, 0.55);
    vec3 teal = vec3(0.15, 0.8, 0.95);
    vec3 violet = vec3(0.7, 0.35, 0.95);
    vec3 col = mix(green, teal, smoothstep(0.15, 0.55, y));
    col = mix(col, violet, smoothstep(0.55, 1.0, y) * 0.85);
    gl_FragColor = vec4(col, a * uIntensity * 0.9);
  }`;

function curtainGeometry({ azimuth, span, radius, y0, y1, seed, nx = 90, ny = 14 }) {
  const pos = [];
  const uv = [];
  for (let j = 0; j <= ny; j++) {
    for (let i = 0; i <= nx; i++) {
      const u = i / nx;
      const v = j / ny;
      const a = azimuth + (u - 0.5) * span;
      const r = radius * (1 + 0.05 * Math.sin(u * 9 + seed));
      const y = y0 + (y1 - y0) * v + Math.sin(u * 7 + seed * 2) * 3 * v;
      pos.push(Math.sin(a) * r, y, -Math.cos(a) * r); // azimuth 0 = straight north (-z)
      uv.push(u, v);
    }
  }
  const idx = [];
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const a = j * (nx + 1) + i;
      const b = a + 1;
      const c = a + nx + 1;
      const d = c + 1;
      idx.push(a, b, c, b, d, c);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  return geo;
}

class Aurora extends SkyEvent {
  constructor(scene) {
    super({ fadeIn: 8, fadeOut: 10 });
    this.group = new THREE.Group();
    this.group.visible = false;
    this.materials = [];
    const defs = [
      { azimuth: -0.55, span: 1.6, radius: 150, y0: 14, y1: 80, seed: 1.3 },
      { azimuth: 0.1, span: 1.9, radius: 178, y0: 20, y1: 100, seed: 4.1 },
      { azimuth: 0.75, span: 1.4, radius: 205, y0: 28, y1: 105, seed: 7.7 },
    ];
    for (const d of defs) {
      const mat = new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        fog: false,
        toneMapped: false,
        uniforms: { uTime: { value: 0 }, uIntensity: { value: 0 }, uSeed: { value: d.seed } },
        vertexShader: AURORA_VERT,
        fragmentShader: AURORA_FRAG,
      });
      const mesh = new THREE.Mesh(curtainGeometry(d), mat);
      mesh.frustumCulled = false;
      mesh.renderOrder = -80;
      this.materials.push(mat);
      this.group.add(mesh);
    }
    scene.add(this.group);
  }

  render(time, visible) {
    this.group.visible = visible > 0.002;
    for (const m of this.materials) {
      m.uniforms.uTime.value = time;
      m.uniforms.uIntensity.value = visible;
    }
  }
}

// ---------------------------------------------------------------------------------------
// Diamond dust: tiny ice crystals glittering in the cold, clear morning air.
// ---------------------------------------------------------------------------------------

class DiamondDust extends SkyEvent {
  constructor(scene) {
    super({ fadeIn: 6, fadeOut: 8 });
    const N = 900;
    const pos = new Float32Array(N * 3);
    const phase = new Float32Array(N);
    const size = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      pos[i * 3] = (Math.random() * 2 - 1) * 20;
      pos[i * 3 + 1] = -2 + Math.random() * 20;
      pos[i * 3 + 2] = (Math.random() * 2 - 1) * 20;
      phase[i] = Math.random();
      size[i] = 0.8 + Math.random() * 1.8;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1));
    geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));

    this.material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
      uniforms: {
        uTime: { value: 0 },
        uIntensity: { value: 0 },
        uPixelRatio: { value: 1 },
        uColor: { value: new THREE.Color(0.9, 0.97, 1.0) },
      },
      vertexShader: /* glsl */ `
        attribute float aPhase;
        attribute float aSize;
        uniform float uTime;
        uniform float uPixelRatio;
        varying float vTw;
        void main() {
          vec3 p = position;
          p.x += sin(uTime * 0.3 + aPhase * 6.28) * 0.6;
          p.z += cos(uTime * 0.25 + aPhase * 9.0) * 0.6;
          p.y = mod(p.y + 2.0 - uTime * 0.35, 20.0) - 2.0;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          vTw = pow(max(0.0, sin(uTime * (1.5 + aPhase * 2.0) + aPhase * 40.0)), 6.0);
          gl_PointSize = aSize * (90.0 / max(1.0, -mv.z)) * uPixelRatio * (0.5 + vTw);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform float uIntensity;
        uniform vec3 uColor;
        varying float vTw;
        void main() {
          vec2 c = gl_PointCoord - 0.5;
          float d = length(c);
          float glow = smoothstep(0.5, 0.0, d);
          float cross = max(smoothstep(0.07, 0.0, abs(c.x)), smoothstep(0.07, 0.0, abs(c.y))) * glow;
          float a = (glow * 0.45 + cross * 0.9) * (0.25 + vTw) * uIntensity;
          gl_FragColor = vec4(uColor, a);
        }`,
    });
    this.points = new THREE.Points(geo, this.material);
    this.points.frustumCulled = false;
    this.points.visible = false;
    scene.add(this.points);
  }

  render(time, visible) {
    this.points.visible = visible > 0.002;
    this.material.uniforms.uTime.value = time;
    this.material.uniforms.uIntensity.value = visible;
  }
}

// ---------------------------------------------------------------------------------------
// Meteor shower: short bright streaks across the night sky.
// ---------------------------------------------------------------------------------------

function streakTexture() {
  const cv = document.createElement('canvas');
  cv.width = 128;
  cv.height = 8;
  const g = cv.getContext('2d');
  const grd = g.createLinearGradient(0, 0, 128, 0);
  grd.addColorStop(0, 'rgba(255,255,255,0)');
  grd.addColorStop(0.85, 'rgba(255,255,255,0.7)');
  grd.addColorStop(1, 'rgba(255,255,255,1)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 8);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

class Meteors extends SkyEvent {
  constructor(scene) {
    super({ fadeIn: 3, fadeOut: 4 });
    this.pool = [];
    const geo = new THREE.PlaneGeometry(1, 1);
    const tex = streakTexture();
    for (let i = 0; i < 8; i++) {
      const mat = new THREE.MeshBasicMaterial({
        map: tex,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        fog: false,
        toneMapped: false,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.scale.set(80, 1.6, 1);
      mesh.visible = false;
      mesh.frustumCulled = false;
      scene.add(mesh);
      this.pool.push({ mesh, life: 0, maxLife: 1, dir: new THREE.Vector3() });
    }
    this.spawnTimer = 0;
    this._z = new THREE.Vector3();
    this._x = new THREE.Vector3();
    this._y = new THREE.Vector3();
    this._m = new THREE.Matrix4();
  }

  spawn() {
    const m = this.pool.find((p) => p.life <= 0);
    if (!m) return;
    const az = Math.random() * Math.PI * 2;
    const el = THREE.MathUtils.degToRad(20 + Math.random() * 45);
    const r = 600;
    m.mesh.position.set(Math.cos(az) * Math.cos(el) * r, Math.sin(el) * r, Math.sin(az) * Math.cos(el) * r);
    // mostly horizontal tangent to the dome, tilted downwards
    const tangent = new THREE.Vector3(-Math.sin(az), 0, Math.cos(az)).multiplyScalar(Math.random() < 0.5 ? 1 : -1);
    m.dir.copy(tangent).add(new THREE.Vector3(0, -0.55, 0)).normalize();
    m.maxLife = m.life = 0.7 + Math.random() * 0.6;
    m.mesh.visible = true;
  }

  render(dt, visible, camera) {
    if (this.intensity > 0.2) {
      this.spawnTimer -= dt;
      if (this.spawnTimer <= 0) {
        this.spawn();
        this.spawnTimer = 0.4 + Math.random() * 1.0;
      }
    }
    for (const m of this.pool) {
      if (m.life <= 0) continue;
      m.life -= dt;
      if (m.life <= 0) {
        m.mesh.visible = false;
        continue;
      }
      m.mesh.position.addScaledVector(m.dir, 420 * dt);
      const t = 1 - m.life / m.maxLife;
      m.mesh.material.opacity = Math.sin(t * Math.PI) * visible;

      // face the camera while keeping the streak's long axis along its direction of travel
      const z = this._z.copy(camera.position).sub(m.mesh.position).normalize();
      const x = this._x.copy(m.dir).addScaledVector(z, -m.dir.dot(z)).normalize();
      const y = this._y.crossVectors(z, x);
      m.mesh.quaternion.setFromRotationMatrix(this._m.makeBasis(x, y, z));
    }
  }
}

// ---------------------------------------------------------------------------------------

export const EVENT_INFO = {
  aurora: { emoji: '🌌', label: '極光', text: '夜空出現了極光' },
  dust: { emoji: '💎', label: '鑽石塵', text: '空氣中飄起了閃亮的鑽石塵' },
  meteors: { emoji: '🌠', label: '流星雨', text: '流星雨開始了，快抬頭看看' },
};

const crossed = (prev, cur, mark) => (prev <= cur ? prev < mark && cur >= mark : prev < mark || cur >= mark);

/**
 * Decides when special events happen, runs them, and tells the HUD about them.
 * Events fade by time of day: aurora/meteors only show at night, diamond dust only at dawn.
 */
export class EventDirector {
  constructor(scene, { weather, announce = () => {}, rng = Math.random } = {}) {
    this.weather = weather;
    this.announce = announce;
    this.rng = rng;
    this.aurora = new Aurora(scene);
    this.dust = new DiamondDust(scene);
    this.meteors = new Meteors(scene);
    this.prevHour = null;
    this.tint = { color: new THREE.Color(0x40ffa0), amount: 0 };
  }

  setPixelRatio(pr) {
    this.dust.material.uniforms.uPixelRatio.value = pr;
  }

  /** Names of events currently running (for the debug panel). */
  get running() {
    return Object.keys(EVENT_INFO).filter((id) => this.byId(id).active);
  }

  byId(id) {
    return { aurora: this.aurora, dust: this.dust, meteors: this.meteors }[id];
  }

  /** Start an event now. Returns false for unknown ids. */
  trigger(id, duration) {
    const ev = this.byId(id);
    if (!ev) return false;
    const d = duration ?? { aurora: 110, dust: 70, meteors: 75 }[id];
    ev.start(d);
    this.weather?.force('clear', d + 25);
    const info = EVENT_INFO[id];
    this.announce({ id, ...info });
    return true;
  }

  stopAll() {
    for (const id of Object.keys(EVENT_INFO)) this.byId(id).stop();
  }

  update(dt, { hour, night, camera, time }) {
    // roll for events when the clock crosses certain times of day
    if (this.prevHour !== null) {
      if (crossed(this.prevHour, hour, 21)) {
        const r = this.rng();
        if (r < 0.4) this.trigger('aurora');
        else if (r < 0.65) this.trigger('meteors');
      }
      if (crossed(this.prevHour, hour, 5.5) && this.rng() < 0.3) this.trigger('dust');
    }
    this.prevHour = hour;

    // events end when their time of day is over
    const isNight = night > 0.4;
    if (!isNight) {
      this.aurora.stop();
      this.meteors.stop();
    }
    if (hour >= 10.5 || hour < 4.5) this.dust.stop();

    this.aurora.tick(dt);
    this.dust.tick(dt);
    this.meteors.tick(dt);

    const nightGate = smoothstep(0.5, 0.9, night);
    const dawnGate = 1 - smoothstep(9, 10.5, hour);
    const auroraVisible = this.aurora.intensity * nightGate;
    this.aurora.render(time, auroraVisible);
    this.dust.render(time, this.dust.intensity * dawnGate);
    this.meteors.render(dt, this.meteors.intensity * nightGate, camera);

    this.tint.amount = clamp(auroraVisible, 0, 1);
  }
}
