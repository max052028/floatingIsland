// On-screen controls for touch devices: the floating joystick and the action button that is used
// in the third-person view (the 45° view acts by tapping the cell itself).

const TOOL_ICON = { farm: '🌱', build: '🔨', remove: '🧹' };

/**
 * @param {object} opts
 * @param {import('../camera/input.js').Input} opts.input
 * @param {import('./hud.js').Hud} opts.hud
 */
export function createTouchUi({ input, hud }) {
  const root = document.getElementById('hud');

  const stickEl = document.createElement('div');
  stickEl.id = 'stick';
  stickEl.hidden = true;
  const base = document.createElement('div');
  base.className = 'base';
  const knob = document.createElement('div');
  knob.className = 'knob';
  stickEl.append(base, knob);

  const act = document.createElement('button');
  act.id = 'act';
  act.className = 'panel';
  act.setAttribute('aria-label', '執行動作');
  const ico = document.createElement('span');
  ico.className = 'ico';
  const txt = document.createElement('span');
  txt.className = 'txt';
  txt.textContent = '動作';
  act.append(ico, txt);
  // pointerdown rather than click: it should react the moment the thumb lands
  act.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    input.pressedQueue.push('Space');
    act.classList.add('pressed');
  });
  for (const type of ['pointerup', 'pointercancel', 'pointerleave']) {
    act.addEventListener(type, () => act.classList.remove('pressed'));
  }

  root.append(stickEl, act);

  let lastIcon = '';
  let lastReady = null;
  let wasActive = false;

  return {
    update() {
      const s = input.stick;
      if (s.active) {
        if (!wasActive) stickEl.hidden = false;
        base.style.transform = `translate(${s.ox}px, ${s.oy}px) translate(-50%, -50%)`;
        knob.style.transform = `translate(${s.kx}px, ${s.ky}px) translate(-50%, -50%)`;
      } else if (wasActive) {
        stickEl.hidden = true;
      }
      wasActive = s.active;

      const icon = TOOL_ICON[hud.selection.tool] ?? '✋';
      if (icon !== lastIcon) {
        lastIcon = icon;
        ico.textContent = icon;
      }
      const ready = hud.hintEl.classList.contains('ok');
      if (ready !== lastReady) {
        lastReady = ready;
        act.classList.toggle('ready', ready);
      }
    },
  };
}
