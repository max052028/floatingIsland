import { SAVE_KEY } from '../constants.js';
import { GameState } from './state.js';

export function loadGame() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    return GameState.deserialize(JSON.parse(raw));
  } catch (err) {
    console.warn('Could not load save, starting fresh.', err);
    return null;
  }
}

export function saveGame(state) {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(state.serialize()));
    return true;
  } catch (err) {
    console.warn('Could not save game.', err);
    return false;
  }
}

export function clearSave() {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch {
    /* ignore */
  }
}
