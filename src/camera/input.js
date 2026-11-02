// Keyboard / mouse state, collected here so the rest of the game can poll it each frame.

const isTyping = (target) => target instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName);

export class Input {
  /** @param {HTMLCanvasElement} canvas */
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.pressedQueue = [];
    this.clickQueue = [];
    /** Pointer position in normalised device coordinates, or null when not over the canvas. */
    this.pointer = null;
    this.dragDelta = { x: 0, y: 0 };
    this.wheelDelta = 0;
    this.dragging = false;

    window.addEventListener('keydown', (e) => {
      if (isTyping(e.target)) return;
      if (['Space', 'Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
      if (!e.repeat) this.pressedQueue.push(e.code);
      this.keys.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());

    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener('pointerdown', (e) => {
      this.updatePointer(e);
      if (e.button === 0) {
        this.clickQueue.push({ x: this.pointer.x, y: this.pointer.y });
      } else if (e.button === 2) {
        this.dragging = true;
        canvas.setPointerCapture(e.pointerId);
      }
    });
    canvas.addEventListener('pointermove', (e) => {
      this.updatePointer(e);
      if (this.dragging) {
        this.dragDelta.x += e.movementX;
        this.dragDelta.y += e.movementY;
      }
    });
    canvas.addEventListener('pointerup', (e) => {
      if (e.button === 2) {
        this.dragging = false;
        if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
      }
    });
    canvas.addEventListener('pointerleave', () => {
      if (!this.dragging) this.pointer = null;
    });
    canvas.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        this.wheelDelta += e.deltaY;
      },
      { passive: false },
    );
  }

  updatePointer(e) {
    const r = this.canvas.getBoundingClientRect();
    this.pointer = { x: ((e.clientX - r.left) / r.width) * 2 - 1, y: -((e.clientY - r.top) / r.height) * 2 + 1 };
  }

  down(code) {
    return this.keys.has(code);
  }

  /** WASD / arrow keys as a movement intent: x = right, y = forward. */
  axis() {
    const x = (this.down('KeyD') || this.down('ArrowRight') ? 1 : 0) - (this.down('KeyA') || this.down('ArrowLeft') ? 1 : 0);
    const y = (this.down('KeyW') || this.down('ArrowUp') ? 1 : 0) - (this.down('KeyS') || this.down('ArrowDown') ? 1 : 0);
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
}
