import * as THREE from 'three';
import { clamp, mulberry32, smoothstep } from '../util/noise.js';

// Three's lights are physically based: an intensity of PI roughly matches the "1.0" you'd
// expect from older tutorials, so keyframe intensities below are multiplied by this.
const L = Math.PI;

const KEYS = [
  { h: 0, zen: 0x070b24, hor: 0x1a2250, sun: 0x6f8cff, sunI: 0, hemiSky: 0x3a4c92, hemiGnd: 0x1c2240, hemiI: 0.52, night: 1 },
  { h: 5, zen: 0x101840, hor: 0x40386e, sun: 0x8fa0ff, sunI: 0, hemiSky: 0x44559a, hemiGnd: 0x242946, hemiI: 0.55, night: 0.9 },
  { h: 6.2, zen: 0x45609e, hor: 0xff9f78, sun: 0xffb27a, sunI: 0.5, hemiSky: 0x8f9ed0, hemiGnd: 0x5a4f58, hemiI: 0.62, night: 0.25 },
  { h: 8.5, zen: 0x3f8fe6, hor: 0xc9e6ff, sun: 0xfff1d6, sunI: 1.1, hemiSky: 0xbcd8ff, hemiGnd: 0x6d6a55, hemiI: 0.7, night: 0 },
  { h: 16, zen: 0x3f8fe6, hor: 0xc9e6ff, sun: 0xfff1d6, sunI: 1.1, hemiSky: 0xbcd8ff, hemiGnd: 0x6d6a55, hemiI: 0.7, night: 0 },
  { h: 17.8, zen: 0x4a74c4, hor: 0xffcf9a, sun: 0xffc486, sunI: 0.9, hemiSky: 0xd3c4c0, hemiGnd: 0x65574a, hemiI: 0.62, night: 0.05 },
  { h: 19, zen: 0x3a3f8a, hor: 0xff8a62, sun: 0xff9360, sunI: 0.55, hemiSky: 0x8c86b8, hemiGnd: 0x4a3f48, hemiI: 0.5, night: 0.3 },
  { h: 20.4, zen: 0x181f52, hor: 0x7b4a80, sun: 0xff7a60, sunI: 0.05, hemiSky: 0x54609f, hemiGnd: 0x2f2a45, hemiI: 0.52, night: 0.8 },
  { h: 22, zen: 0x090e2c, hor: 0x1c2658, sun: 0x6f8cff, sunI: 0, hemiSky: 0x3a4c92, hemiGnd: 0x1c2240, hemiI: 0.52, night: 1 },
  { h: 24, zen: 0x070b24, hor: 0x1a2250, sun: 0x6f8cff, sunI: 0, hemiSky: 0x3a4c92, hemiGnd: 0x1c2240, hemiI: 0.52, night: 1 },
].map((k) => ({
  ...k,
  zen: new THREE.Color(k.zen),
  hor: new THREE.Color(k.hor),
  sun: new THREE.Color(k.sun),
  hemiSky: new THREE.Color(k.hemiSky),
  hemiGnd: new THREE.Color(k.hemiGnd),
}));

const makeCur = () => ({
  zen: new THREE.Color(),
  hor: new THREE.Color(),
  sun: new THREE.Color(),
  hemiSky: new THREE.Color(),
  hemiGnd: new THREE.Color(),
  sunI: 0,
  hemiI: 0,
  night: 0,
});

function sample(hour, out) {
  let i = 0;
  while (i < KEYS.length - 2 && hour >= KEYS[i + 1].h) i++;
  const a = KEYS[i];
  const b = KEYS[i + 1];
  const t = clamp((hour - a.h) / (b.h - a.h), 0, 1);
  const s = t * t * (3 - 2 * t);
  out.zen.copy(a.zen).lerp(b.zen, s);
  out.hor.copy(a.hor).lerp(b.hor, s);
  out.sun.copy(a.sun).lerp(b.sun, s);
  out.hemiSky.copy(a.hemiSky).lerp(b.hemiSky, s);
  out.hemiGnd.copy(a.hemiGnd).lerp(b.hemiGnd, s);
  out.sunI = a.sunI + (b.sunI - a.sunI) * s;
  out.hemiI = a.hemiI + (b.hemiI - a.hemiI) * s;
  out.night = a.night + (b.night - a.night) * s;
}

/** Sun angle: rises at 06:00, sets at 19:00 (a 13h day and an 11h night). */
function sunPhi(hour) {
  if (hour >= 6 && hour <= 19) return (Math.PI * (hour - 6)) / 13;
  const h = hour < 6 ? hour + 24 : hour;
  return Math.PI + (Math.PI * (h - 19)) / 11;
}

const WHITE = new THREE.Color(1, 1, 1);

/** Pull a colour towards grey and darken it, to simulate overcast weather. */
function overcast(color, dark, flash) {
  const lum = color.r * 0.299 + color.g * 0.587 + color.b * 0.114;
  const k = 0.65 * dark;
  color.r += (lum * 0.9 - color.r) * k;
  color.g += (lum * 0.9 - color.g) * k;
  color.b += (lum * 0.9 - color.b) * k;
  color.multiplyScalar(1 - 0.28 * dark);
  if (flash > 0) color.lerp(WHITE, flash * 0.6);
  return color;
}

function discTexture(core, soft) {
  const size = 256;
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const g = cv.getContext('2d');
  const grd = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(core, 'rgba(255,255,255,1)');
  grd.addColorStop(Math.min(core + soft, 0.99), 'rgba(255,255,255,0.35)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * Sky dome, sun, moon, stars, and every light in the scene. Driven entirely by the
 * in-game hour plus the current weather parameters.
 */
export class Sky {
  /** @param {{shadowSize?: number}} [opts] shadowSize: sun shadow-map resolution (lower on phones). */
  constructor(scene, { shadowSize = 2048 } = {}) {
    this.cur = makeCur();
    this.sunDir = new THREE.Vector3(0, 1, 0);
    this.moonDir = new THREE.Vector3(0, -1, 0);
    /** Horizon colour after weather tinting; clouds and fog follow it. */
    this.horizon = new THREE.Color();
    /** 0 (bright day) .. 1 (deep night), after weather is taken into account only for lights. */
    this.night = 0;

    this.dome = new THREE.Mesh(
      new THREE.SphereGeometry(900, 32, 16),
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
        toneMapped: false,
        uniforms: {
          uZenith: { value: new THREE.Color() },
          uHorizon: { value: new THREE.Color() },
          uGround: { value: new THREE.Color() },
        },
        vertexShader: /* glsl */ `
          varying vec3 vDir;
          void main() {
            vDir = normalize(position);
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }`,
        fragmentShader: /* glsl */ `
          uniform vec3 uZenith;
          uniform vec3 uHorizon;
          uniform vec3 uGround;
          varying vec3 vDir;
          void main() {
            float h = vDir.y;
            vec3 col = h > 0.0
              ? mix(uHorizon, uZenith, pow(clamp(h, 0.0, 1.0), 0.55))
              : mix(uHorizon, uGround, clamp(-h * 2.5, 0.0, 1.0));
            gl_FragColor = vec4(col, 1.0);
            #include <colorspace_fragment>
          }`,
      }),
    );
    this.dome.renderOrder = -100;
    this.dome.frustumCulled = false;
    scene.add(this.dome);

    // stars
    const rnd = mulberry32(99);
    const starCount = 1400;
    const starPos = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i++) {
      const y = rnd() * 1.05 - 0.05;
      const a = rnd() * Math.PI * 2;
      const r = Math.sqrt(Math.max(0, 1 - y * y));
      starPos[i * 3] = Math.cos(a) * r * 820;
      starPos[i * 3 + 1] = y * 820;
      starPos[i * 3 + 2] = Math.sin(a) * r * 820;
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
    this.stars = new THREE.Points(
      starGeo,
      new THREE.PointsMaterial({
        color: 0xffffff,
        size: 1.8,
        sizeAttenuation: false,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        fog: false,
      }),
    );
    this.stars.frustumCulled = false;
    this.stars.renderOrder = -99;
    scene.add(this.stars);

    // sun & moon discs
    this.sunSprite = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: discTexture(0.13, 0.07), transparent: true, depthWrite: false, fog: false, toneMapped: false }),
    );
    this.sunSprite.scale.set(150, 150, 1);
    this.moonSprite = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: discTexture(0.22, 0.04),
        color: 0xdfe8ff,
        transparent: true,
        depthWrite: false,
        fog: false,
        toneMapped: false,
      }),
    );
    this.moonSprite.scale.set(80, 80, 1);
    scene.add(this.sunSprite, this.moonSprite);

    // lights
    this.sunLight = new THREE.DirectionalLight(0xffffff, 1);
    this.sunLight.castShadow = true;
    this.sunLight.shadow.mapSize.set(shadowSize, shadowSize);
    const cam = this.sunLight.shadow.camera;
    cam.left = -19;
    cam.right = 19;
    cam.top = 19;
    cam.bottom = -19;
    cam.near = 1;
    cam.far = 110;
    this.sunLight.shadow.bias = -0.0004;
    this.sunLight.shadow.normalBias = 0.04;
    this.moonLight = new THREE.DirectionalLight(0x8fa8ff, 0);
    this.hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 1);
    scene.add(this.sunLight, this.moonLight, this.hemi);

    scene.fog = new THREE.FogExp2(0xffffff, 0.005);
    this.scene = scene;

    this._zen = new THREE.Color();
    this._hor = new THREE.Color();
    this._gnd = new THREE.Color();
  }

  /**
   * @param {number} hour in-game hour 0..24
   * @param {{dark:number, flash:number, fog:number, rain:number}} w weather parameters
   * @param {{color: THREE.Color, amount: number} | null} [tint] optional glow from special
   *   events (e.g. aurora). The 45° camera never sees the sky itself, so this also colours the
   *   horizon, the sea of clouds and the light on the island.
   */
  update(hour, w, tint = null) {
    const cur = this.cur;
    sample(hour, cur);
    const dark = w.dark;
    const flash = w.flash ?? 0;
    this.night = cur.night;

    const phi = sunPhi(hour);
    this.sunDir.set(Math.cos(phi), Math.sin(phi), 0.45).normalize();
    this.moonDir.copy(this.sunDir).negate();

    // colours
    this._zen.copy(cur.zen);
    this._hor.copy(cur.hor);
    overcast(this._zen, dark, flash);
    overcast(this._hor, dark, flash);
    const glow = tint ? clamp(tint.amount, 0, 1) : 0;
    if (glow > 0) {
      // colours are linear here, so small factors already read as a strong tint
      this._zen.lerp(tint.color, glow * 0.03);
      this._hor.lerp(tint.color, glow * 0.2);
    }
    this._gnd.copy(this._hor).multiplyScalar(0.75);
    this.horizon.copy(this._hor);

    const u = this.dome.material.uniforms;
    u.uZenith.value.copy(this._zen);
    u.uHorizon.value.copy(this._hor);
    u.uGround.value.copy(this._gnd);

    // lights
    const sunUp = smoothstep(-0.02, 0.14, this.sunDir.y);
    this.sunLight.position.copy(this.sunDir).multiplyScalar(50);
    this.sunLight.color.copy(cur.sun);
    this.sunLight.intensity = cur.sunI * L * sunUp * (1 - 0.78 * dark);

    const moonUp = smoothstep(-0.05, 0.2, this.moonDir.y);
    this.moonLight.position.copy(this.moonDir).multiplyScalar(50);
    this.moonLight.intensity = 1.1 * cur.night * moonUp * (1 - 0.5 * dark);

    this.hemi.color.copy(cur.hemiSky);
    if (glow > 0) this.hemi.color.lerp(tint.color, glow * 0.4);
    this.hemi.groundColor.copy(cur.hemiGnd);
    this.hemi.intensity = cur.hemiI * L * (1 - 0.25 * dark) + flash * 3;

    // celestial bodies
    this.stars.material.opacity = clamp(smoothstep(0.55, 1, cur.night) * (1 - dark * 1.3), 0, 1);

    this.sunSprite.position.copy(this.sunDir).multiplyScalar(700);
    this.sunSprite.material.color.copy(cur.sun).lerp(WHITE, 0.35);
    this.sunSprite.material.opacity = smoothstep(-0.1, 0.03, this.sunDir.y) * (1 - 0.85 * dark);

    this.moonSprite.position.copy(this.moonDir).multiplyScalar(700);
    this.moonSprite.material.opacity = smoothstep(-0.1, 0.03, this.moonDir.y) * cur.night * (1 - 0.9 * dark);

    // fog follows the horizon so distant clouds melt into the sky
    const fog = this.scene.fog;
    fog.color.copy(this._hor);
    fog.density = 0.0048 + (w.fog ?? 0) * 0.011 + (w.rain ?? 0) * 0.002;
  }
}
