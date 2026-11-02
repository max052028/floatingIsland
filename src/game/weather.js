// Weather as a small state machine with smoothly blended parameters.
// No rendering here; the world reads `params` / `flash` each frame.

/**
 * Target parameters per weather type.
 * cloud: sky cover 0..1      dark: how overcast/dim 0..1
 * rain/snow/petals: precipitation intensity 0..1
 * fog: extra fog density 0..1      wind: 0..1
 * growth: crop growth multiplier   weight: how often it is picked
 */
export const WEATHER = {
  clear: { label: '晴朗', icon: '☀️', cloud: 0.12, dark: 0, wind: 0.25, growth: 1, weight: 30 },
  cloudy: { label: '多雲', icon: '⛅', cloud: 0.65, dark: 0.22, wind: 0.35, growth: 1, weight: 20 },
  fog: { label: '起霧', icon: '🌫️', cloud: 0.4, dark: 0.12, fog: 1, wind: 0.1, growth: 1, weight: 8 },
  drizzle: { label: '細雨', icon: '🌦️', cloud: 0.8, dark: 0.32, rain: 0.35, wind: 0.3, growth: 1.25, weight: 12 },
  rain: { label: '下雨', icon: '🌧️', cloud: 0.92, dark: 0.48, rain: 0.8, wind: 0.5, growth: 1.5, weight: 12 },
  storm: { label: '雷雨', icon: '⛈️', cloud: 1, dark: 0.7, rain: 1, wind: 1, storm: true, growth: 1.5, weight: 4 },
  snow: { label: '下雪', icon: '🌨️', cloud: 0.8, dark: 0.2, snow: 0.85, wind: 0.2, growth: 0.6, weight: 7 },
  petals: { label: '花瓣飄落', icon: '🌸', cloud: 0.25, dark: 0, petals: 0.85, wind: 0.55, growth: 1.1, weight: 7 },
};

const PARAM_KEYS = ['cloud', 'dark', 'rain', 'snow', 'petals', 'fog', 'wind'];

export class WeatherSystem {
  constructor({ rng = Math.random, initial = 'clear' } = {}) {
    this.rng = rng;
    this.type = initial;
    this.params = {};
    for (const k of PARAM_KEYS) this.params[k] = WEATHER[initial][k] ?? 0;
    /** Lightning flash brightness 0..1 (decays quickly). */
    this.flash = 0;
    this.nextChange = 70 + rng() * 70;
    this.lightningTimer = 4;
    this.echoTimer = 0;
  }

  get def() {
    return WEATHER[this.type];
  }

  growthMultiplier() {
    return this.def.growth ?? 1;
  }

  /** Switch to a weather type now and keep it for at least `hold` seconds. */
  force(type, hold = 120) {
    if (!WEATHER[type]) return false;
    this.type = type;
    this.nextChange = hold;
    return true;
  }

  pickNext() {
    const entries = Object.entries(WEATHER).filter(([id]) => id !== this.type);
    const total = entries.reduce((s, [, d]) => s + d.weight, 0);
    let r = this.rng() * total;
    for (const [id, d] of entries) {
      r -= d.weight;
      if (r <= 0) return id;
    }
    return entries[0][0];
  }

  update(dt) {
    this.nextChange -= dt;
    if (this.nextChange <= 0) {
      this.type = this.pickNext();
      this.nextChange = 70 + this.rng() * 70;
    }

    const a = 1 - Math.exp(-dt / 5);
    for (const k of PARAM_KEYS) {
      this.params[k] += ((this.def[k] ?? 0) - this.params[k]) * a;
    }

    // Decay first so a fresh strike is seen at full brightness for at least one frame.
    this.flash *= Math.exp(-dt * 7);
    if (this.flash < 0.001) this.flash = 0;

    if (this.def.storm) {
      this.lightningTimer -= dt;
      if (this.lightningTimer <= 0) {
        this.flash = 1;
        this.lightningTimer = 3 + this.rng() * 9;
        this.echoTimer = 0.1 + this.rng() * 0.12;
      }
    }
    if (this.echoTimer > 0) {
      this.echoTimer -= dt;
      if (this.echoTimer <= 0) this.flash = Math.max(this.flash, 0.7);
    }
  }
}
