// Keyboard / mouse / touch state, collected here so the rest of the game can poll it each frame.
//
// Touch gestures depend on the camera mode (set with `setMode`):
//   45° view  : one finger drags to pan, a short tap acts on that cell, two fingers pinch to
//               zoom / twist to rotate (and drag to pan).
//   3rd person: a finger that lands on the left side becomes a floating joystick, a finger on the
//               right side looks around, and two fingers on the right pinch to zoom. The action
//               itself is the on-screen button (see ui/touch.js), which pushes `Space`.

const isTyping = (target) => target instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName);

const TAP_MAX_MS = 420;
const TAP_SLOP = 10; // px a finger may wander and still count as a tap
const STICK_RADIUS = 56; // px
const STICK_DEADZONE = 0.14;
const STICK_ZONE = 0.45; // left share of the screen where a finger becomes the joystick
const LOOK_SENSITIVITY = 1.1;

const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));

export class Input {
  /** @param {HTMLCanvasElement} canvas */
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.pressedQueue = [];
    this.clickQueue = [];
    /** Pointer position in normalised device coordinates, or null when there is nothing to aim at. */
    this.pointer = null;
    this.dragDelta = { x: 0, y: 0 };
    this.wheelDelta = 0;
    this.dragging = false;

    /** A touch shorter than this (ms) and barely moving counts as a tap. */
    this.tapMaxMs = TAP_MAX_MS;
    /** 'iso' | 'third' — decides what touch gestures mean. */
    this.mode = 'iso';
    /** True once a finger has touched the screen. */
    this.touched = false;
    this.touches = new Map();
    this.gesture = null; // two-finger gesture state
    this.panDelta = { x: 0, y: 0 }; // px, from touch drags
    this.pinchZoom = 1; // multiplicative: >1 = fingers spread apart
    this.twist = 0; // radians, clockwise on screen is positive
    /** Floating joystick. x / y are -1..1 (screen space, y points down); ox/oy and kx/ky are px. */
    this.stick = { active: false, x: 0, y: 0, ox: 0, oy: 0, kx: 0, ky: 0 };

    window.addEventListener('keydown', (e) => {
      if (isTyping(e.target)) return;
      if (['Space', 'Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
      if (!e.repeat) this.pressedQueue.push(e.code);
      this.keys.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.resetTouches();
    });

    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener('pointerdown', (e) => (e.pointerType === 'touch' ? this.touchDown(e) : this.mouseDown(e)));
    canvas.addEventListener('pointermove', (e) => (e.pointerType === 'touch' ? this.touchMove(e) : this.mouseMove(e)));
    canvas.addEventListener('pointerup', (e) => (e.pointerType === 'touch' ? this.touchUp(e, false) : this.mouseUp(e)));
    canvas.addEventListener('pointercancel', (e) => {
      if (e.pointerType === 'touch') this.touchUp(e, true);
    });
    canvas.addEventListener('pointerleave', (e) => {
      // a finger lifting also "leaves"; the last tapped cell should stay highlighted
      if (e.pointerType !== 'touch' && !this.dragging) this.pointer = null;
    });
    canvas.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        this.wheelDelta += e.deltaY;
      },
      { passive: false },
    );
    // iOS Safari has its own page-zoom gesture that touch-action does not always stop
    for (const type of ['gesturestart', 'gesturechange']) {
      document.addEventListener(type, (e) => e.preventDefault(), { passive: false });
    }
  }

  // ---- mouse / pen ---------------------------------------------------------------------------

  mouseDown(e) {
    this.updatePointer(e);
    if (e.button === 0) {
      this.clickQueue.push({ x: this.pointer.x, y: this.pointer.y });
    } else if (e.button === 2) {
      this.dragging = true;
      this.canvas.setPointerCapture(e.pointerId);
    }
  }

  mouseMove(e) {
    this.updatePointer(e);
    if (this.dragging) {
      this.dragDelta.x += e.movementX;
      this.dragDelta.y += e.movementY;
    }
  }

  mouseUp(e) {
    if (e.button === 2) {
      this.dragging = false;
      if (this.canvas.hasPointerCapture(e.pointerId)) this.canvas.releasePointerCapture(e.pointerId);
    }
  }

  updatePointer(e) {
    this.pointer = this.toNdc(e.clientX, e.clientY);
  }

  toNdc(clientX, clientY) {
    const r = this.canvas.getBoundingClientRect();
    return { x: ((clientX - r.left) / r.width) * 2 - 1, y: -((clientY - r.top) / r.height) * 2 + 1 };
  }

  // ---- touch ---------------------------------------------------------------------------------

  /** Called by the main loop whenever the camera mode changes; drops any gesture in progress. */
  setMode(mode) {
    if (mode === this.mode) return;
    this.mode = mode;
    this.resetTouches();
  }

  resetTouches() {
    this.touches.clear();
    this.gesture = null;
    this.stick.active = false;
    this.stick.x = this.stick.y = 0;
  }

  touchDown(e) {
    this.touched = true;
    this.canvas.setPointerCapture?.(e.pointerId);
    const t = { id: e.pointerId, x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, t0: e.timeStamp, role: 'none', moved: false };
    const others = [...this.touches.values()];

    if (this.mode === 'iso') {
      if (others.length === 0) {
        t.role = 'tap'; // becomes a pan once it moves
        this.pointer = this.toNdc(t.x, t.y); // preview the cell under the finger
      } else if (others.length === 1 && others[0].role !== 'none') {
        this.startGesture(others[0], t);
      }
    } else {
      const inStickZone = e.clientX < window.innerWidth * STICK_ZONE;
      const looks = others.filter((o) => o.role === 'look');
      if (inStickZone && !this.stick.active) {
        t.role = 'stick';
        const s = this.stick;
        s.active = true;
        s.ox = s.kx = t.x;
        s.oy = s.ky = t.y;
        s.x = s.y = 0;
      } else if (!inStickZone && looks.length === 0) {
        t.role = 'look';
      } else if (!inStickZone && looks.length === 1 && !this.stick.active) {
        this.startGesture(looks[0], t);
      }
    }
    this.touches.set(t.id, t);
  }

  startGesture(a, b) {
    a.role = b.role = 'pinch';
    a.moved = true; // never counts as a tap any more
    this.gesture = { a: a.id, b: b.id, ...this.pinchMetrics(a, b) };
  }

  pinchMetrics(a, b) {
    return {
      dist: Math.max(1, Math.hypot(b.x - a.x, b.y - a.y)),
      angle: Math.atan2(b.y - a.y, b.x - a.x),
      mx: (a.x + b.x) / 2,
      my: (a.y + b.y) / 2,
    };
  }

  touchMove(e) {
    const t = this.touches.get(e.pointerId);
    if (!t) return;
    const dx = e.clientX - t.x;
    const dy = e.clientY - t.y;
    t.x = e.clientX;
    t.y = e.clientY;

    switch (t.role) {
      case 'tap':
        if (Math.hypot(t.x - t.sx, t.y - t.sy) > TAP_SLOP) {
          t.role = 'pan';
          t.moved = true;
          this.pointer = null; // no cell highlight while dragging the map around
          this.panDelta.x += t.x - t.sx; // include what was travelled before it became a drag
          this.panDelta.y += t.y - t.sy;
        }
        break;
      case 'pan':
        this.panDelta.x += dx;
        this.panDelta.y += dy;
        break;
      case 'look':
        this.dragDelta.x += dx * LOOK_SENSITIVITY;
        this.dragDelta.y += dy * LOOK_SENSITIVITY;
        break;
      case 'stick':
        this.moveStick(t);
        break;
      case 'pinch': {
        const g = this.gesture;
        const a = this.touches.get(g?.a);
        const b = this.touches.get(g?.b);
        if (!a || !b) break;
        const m = this.pinchMetrics(a, b);
        this.pinchZoom *= m.dist / g.dist;
        this.twist += wrapAngle(m.angle - g.angle);
        this.panDelta.x += m.mx - g.mx;
        this.panDelta.y += m.my - g.my;
        Object.assign(g, m);
        break;
      }
      default:
    }
  }

  moveStick(t) {
    const s = this.stick;
    let dx = t.x - s.ox;
    let dy = t.y - s.oy;
    const len = Math.hypot(dx, dy);
    if (len > STICK_RADIUS) {
      // the joystick follows the thumb when it is dragged past the rim
      s.ox += (dx / len) * (len - STICK_RADIUS);
      s.oy += (dy / len) * (len - STICK_RADIUS);
      dx = t.x - s.ox;
      dy = t.y - s.oy;
    }
    const l = Math.min(Math.hypot(dx, dy), STICK_RADIUS);
    const mag = l / STICK_RADIUS;
    const scaled = mag < STICK_DEADZONE ? 0 : (mag - STICK_DEADZONE) / (1 - STICK_DEADZONE);
    const ang = Math.atan2(dy, dx);
    s.x = Math.cos(ang) * scaled;
    s.y = Math.sin(ang) * scaled;
    s.kx = s.ox + Math.cos(ang) * l;
    s.ky = s.oy + Math.sin(ang) * l;
  }

  touchUp(e, cancelled) {
    const t = this.touches.get(e.pointerId);
    if (!t) return;
    this.touches.delete(t.id);
    if (this.canvas.hasPointerCapture?.(e.pointerId)) this.canvas.releasePointerCapture(e.pointerId);

    if (t.role === 'stick') {
      this.stick.active = false;
      this.stick.x = this.stick.y = 0;
    } else if (t.role === 'pinch') {
      this.gesture = null;
      // the finger that is left carries on as a plain drag from where it is
      const rest = [...this.touches.values()].find((o) => o.role === 'pinch');
      if (rest) rest.role = this.mode === 'iso' ? 'pan' : 'look';
    } else if (t.role === 'tap' && !cancelled && !t.moved && e.timeStamp - t.t0 < this.tapMaxMs) {
      const p = this.toNdc(t.x, t.y);
      this.pointer = p;
      this.clickQueue.push({ x: p.x, y: p.y });
    }
  }

  // ---- polled state --------------------------------------------------------------------------

  down(code) {
    return this.keys.has(code);
  }

  /** WASD / arrow keys plus the touch joystick as a movement intent: x = right, y = forward. */
  axis() {
    let x = (this.down('KeyD') || this.down('ArrowRight') ? 1 : 0) - (this.down('KeyA') || this.down('ArrowLeft') ? 1 : 0);
    let y = (this.down('KeyW') || this.down('ArrowUp') ? 1 : 0) - (this.down('KeyS') || this.down('ArrowDown') ? 1 : 0);
    if (this.stick.active) {
      x += this.stick.x;
      y -= this.stick.y; // screen "up" is forward
      const len = Math.hypot(x, y);
      if (len > 1) {
        x /= len;
        y /= len;
      }
    }
    return { x, y };
  }

  /** Q / E as a rotation intent. */
  rotateAxis() {
    return (this.down('KeyE') ? 1 : 0) - (this.down('KeyQ') ? 1 : 0);
  }

  get sprint() {
    return this.down('ShiftLeft') || this.down('ShiftRight');
  }

  consumePressed() {
    const q = this.pressedQueue;
    this.pressedQueue = [];
    return q;
  }

  consumeClicks() {
    const q = this.clickQueue;
    this.clickQueue = [];
    return q;
  }

  consumeDrag() {
    const d = { ...this.dragDelta };
    this.dragDelta.x = 0;
    this.dragDelta.y = 0;
    return d;
  }

  consumeWheel() {
    const w = this.wheelDelta;
    this.wheelDelta = 0;
    return w;
  }

  /** Touch drag distance in px since the last call. */
  consumePan() {
    const d = { ...this.panDelta };
    this.panDelta.x = 0;
    this.panDelta.y = 0;
    return d;
  }

  /** Two-finger pinch / twist since the last call. */
  consumePinch() {
    const p = { zoom: this.pinchZoom, twist: this.twist };
    this.pinchZoom = 1;
    this.twist = 0;
    return p;
  }
}
