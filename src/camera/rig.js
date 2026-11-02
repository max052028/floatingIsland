import * as THREE from 'three';
import { clamp, lerp, smoothstep } from '../util/noise.js';

const ISO_PITCH = Math.PI / 4; // the 45° view
const ISO_FOV = 32;
const THIRD_FOV = 62;
const PAN_LIMIT = 11.5;
const BLEND_SECONDS = 1.1;

const moveToward = (a, b, d) => (Math.abs(b - a) <= d ? b : a + Math.sign(b - a) * d);
const damp = (current, goal, rate, dt) => current + (goal - current) * (1 - Math.exp(-rate * dt));

/**
 * Two camera modes that can be switched at any time:
 *  - 'iso':   fixed 45° pitch, orbit with Q/E or right-drag, pan with WASD, zoom with the wheel.
 *  - 'third': follows the player; WASD walks, right-drag looks around (drag up to look at the sky).
 *
 * Each mode keeps its own smoothed state and produces a pose; the final camera is a blend of
 * the two, so toggling glides smoothly instead of cutting.
 */
export class CameraRig {
  constructor(camera) {
    this.camera = camera;
    this.mode = 'iso';
    this.blend = 0; // 0 = iso, 1 = third

    this.iso = {
      yaw: Math.PI / 4,
      yawGoal: Math.PI / 4,
      dist: 38,
      distGoal: 38,
      target: new THREE.Vector3(),
      goal: new THREE.Vector3(),
    };
    this.third = {
      yaw: Math.PI / 4,
      yawGoal: Math.PI / 4,
      pitch: 0.2,
      pitchGoal: 0.2,
      dist: 5.6,
      distGoal: 5.6,
    };

    this._posIso = new THREE.Vector3();
    this._posThird = new THREE.Vector3();
    this._lookIso = new THREE.Vector3();
    this._lookThird = new THREE.Vector3();
    this._look = new THREE.Vector3();
  }

  /** Yaw of whichever mode is active (what "forward" means for WASD). */
  get yaw() {
    return this.mode === 'third' ? this.third.yaw : this.iso.yaw;
  }

  setMode(mode, player) {
    if (mode === this.mode) return;
    if (mode === 'third') {
      // continue looking the same way the 45° camera was looking
      this.third.yaw = this.third.yawGoal = this.iso.yaw;
    } else {
      // glide the 45° camera over to wherever the player has wandered
      this.iso.goal.set(player.position.x, 0, player.position.z);
      this.iso.yawGoal = this.iso.yaw = this.third.yaw;
    }
    this.mode = mode;
  }

  toggle(player) {
    this.setMode(this.mode === 'iso' ? 'third' : 'iso', player);
    return this.mode;
  }

  /**
   * Handles camera input and returns the player's movement intent in world space.
   * @returns {{x:number, z:number}}
   */
  update(dt, input, player) {
    const { iso, third } = this;
    const axis = input.axis();
    const rot = input.rotateAxis();
    const drag = input.consumeDrag();
    const wheel = input.consumeWheel();
    const intent = { x: 0, z: 0 };

    if (this.mode === 'iso') {
      iso.yawGoal += rot * 1.8 * dt - drag.x * 0.006;
      iso.distGoal = clamp(iso.distGoal * Math.exp(wheel * 0.001), 14, 50);

      // pan relative to where the camera is looking
      const fx = -Math.sin(iso.yaw);
      const fz = -Math.cos(iso.yaw);
      const rx = Math.cos(iso.yaw);
      const rz = -Math.sin(iso.yaw);
      const speed = 10 * (iso.dist / 38) * (input.sprint ? 1.8 : 1);
      iso.goal.x += (fx * axis.y + rx * axis.x) * speed * dt;
      iso.goal.z += (fz * axis.y + rz * axis.x) * speed * dt;
      const r = Math.hypot(iso.goal.x, iso.goal.z);
      if (r > PAN_LIMIT) iso.goal.multiplyScalar(PAN_LIMIT / r);
    } else {
      third.yawGoal += rot * 1.8 * dt - drag.x * 0.005;
      third.pitchGoal = clamp(third.pitchGoal + drag.y * 0.004, -0.6, 1.2);
      third.distGoal = clamp(third.distGoal * Math.exp(wheel * 0.001), 3, 10);

      const fx = -Math.sin(third.yaw);
      const fz = -Math.cos(third.yaw);
      const rx = Math.cos(third.yaw);
      const rz = -Math.sin(third.yaw);
      intent.x = fx * axis.y + rx * axis.x;
      intent.z = fz * axis.y + rz * axis.x;
    }

    // smoothing
    iso.yaw = damp(iso.yaw, iso.yawGoal, 10, dt);
    iso.dist = damp(iso.dist, iso.distGoal, 8, dt);
    iso.target.x = damp(iso.target.x, iso.goal.x, 9, dt);
    iso.target.z = damp(iso.target.z, iso.goal.z, 9, dt);
    third.yaw = damp(third.yaw, third.yawGoal, 12, dt);
    third.pitch = damp(third.pitch, third.pitchGoal, 12, dt);
    third.dist = damp(third.dist, third.distGoal, 8, dt);

    // poses
    const cp = Math.cos(ISO_PITCH);
    this._lookIso.copy(iso.target);
    this._posIso.set(
      iso.target.x + Math.sin(iso.yaw) * cp * iso.dist,
      Math.sin(ISO_PITCH) * iso.dist,
      iso.target.z + Math.cos(iso.yaw) * cp * iso.dist,
    );

    const head = player.position;
    const elev = Math.max(third.pitch, 0.05);
    const lookUp = Math.max(0, -third.pitch) * 16; // dragging past the horizon tilts the view up
    this._lookThird.set(head.x, 1.35 + lookUp, head.z);
    this._posThird.set(
      head.x + Math.sin(third.yaw) * Math.cos(elev) * third.dist,
      1.35 + Math.sin(elev) * third.dist,
      head.z + Math.cos(third.yaw) * Math.cos(elev) * third.dist,
    );

    // blend between the two poses
    this.blend = moveToward(this.blend, this.mode === 'third' ? 1 : 0, dt / BLEND_SECONDS);
    const e = smoothstep(0, 1, this.blend);
    this.camera.position.lerpVectors(this._posIso, this._posThird, e);
    this._look.lerpVectors(this._lookIso, this._lookThird, e);
    this.camera.lookAt(this._look);

    const fov = lerp(ISO_FOV, THIRD_FOV, e);
    if (Math.abs(this.camera.fov - fov) > 0.01) {
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
    }

    return intent;
  }
}
