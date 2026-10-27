import { describe, expect, it } from 'vitest';
import {
  ButtonEdgeDetector,
  NEUTRAL_STATE,
  SNAP_TURN_RADIANS,
  STICK_DEADZONE,
  SnapTurnController,
  TURN_RATE_RAD_PER_SEC,
  advanceVrTurnYaw,
  applyDeadzone,
  clampUnit,
  composeJoystickState,
  computeVrWorldTransform,
  prefersLastAxisPair,
  readPrimaryStick,
  readSecondaryStick,
} from '../joystickMath';

describe('applyDeadzone', () => {
  it('ignores small centre values', () => {
    expect(applyDeadzone(0.05)).toBe(0);
    expect(applyDeadzone(-0.1)).toBe(0);
    expect(applyDeadzone(STICK_DEADZONE)).toBe(0);
  });

  it('rescales full deflection to 1', () => {
    expect(applyDeadzone(1)).toBeCloseTo(1, 5);
    expect(applyDeadzone(-1)).toBeCloseTo(-1, 5);
  });

  it('keeps the sign and smooth mid range', () => {
    const mid = applyDeadzone(0.58);
    expect(mid).toBeGreaterThan(0.4);
    expect(mid).toBeLessThan(0.6);
    expect(applyDeadzone(-0.58)).toBeCloseTo(-mid, 5);
  });

  it('handles non finite numbers safely', () => {
    expect(applyDeadzone(NaN)).toBe(0);
    expect(clampUnit(5)).toBe(1);
    expect(clampUnit(-5)).toBe(-1);
  });
});

describe('readPrimaryStick', () => {
  it('reads the standard left stick', () => {
    expect(readPrimaryStick([0.8, -0.9, 0, 0])).toEqual({
      x: applyDeadzone(0.8),
      y: -applyDeadzone(-0.9),
    });
  });

  it('uses the last axis pair for XR thumbstick controllers', () => {
    const axes = [0, 0, 0.5, -0.7];
    expect(readPrimaryStick(axes, true)).toEqual({
      x: applyDeadzone(0.5),
      y: -applyDeadzone(-0.7),
    });
  });

  it('falls back to the touchpad when the thumbstick is centred', () => {
    const axes = [-0.6, 0.4, 0, 0];
    expect(readPrimaryStick(axes, true)).toEqual({
      x: applyDeadzone(-0.6),
      y: -applyDeadzone(0.4),
    });
  });

  it('returns a neutral stick with no axes', () => {
    expect(readPrimaryStick([])).toEqual({ x: 0, y: 0 });
    expect(readSecondaryStick([1, 1])).toEqual({ x: 0, y: 0 });
  });
});

describe('composeJoystickState', () => {
  it('maps left stick to movement and right stick to turning', () => {
    const state = composeJoystickState(
      { x: 0.3, y: 0.9 },
      { x: -0.8, y: 0 },
      '2 mandos XR',
      2
    );
    expect(state.moveX).toBeCloseTo(0.3);
    expect(state.moveY).toBeCloseTo(0.9);
    expect(state.lookX).toBeCloseTo(-0.8);
    expect(state.connected).toBe(true);
    expect(state.sourceCount).toBe(2);
  });

  it('clamps diagonal movement to unit speed', () => {
    const state = composeJoystickState({ x: 1, y: 1 }, null, 'mando', 1);
    expect(Math.hypot(state.moveX, state.moveY)).toBeCloseTo(1, 5);
    expect(state.lookX).toBe(0);
  });

  it('disables stick turning with a single controller', () => {
    const state = composeJoystickState(null, { x: 0.9, y: 0.2 }, 'mando', 1);
    expect(state.lookX).toBe(0);
    expect(state.moveX).toBeCloseTo(0.9);
  });

  it('is neutral without sources', () => {
    const state = composeJoystickState(null, null, '', 0);
    expect(state.moveX).toBe(0);
    expect(state.moveY).toBe(0);
    expect(state.connected).toBe(false);
    expect(NEUTRAL_STATE.connected).toBe(false);
  });
});

describe('ButtonEdgeDetector', () => {
  it('fires once per press, not while held', () => {
    const detector = new ButtonEdgeDetector();
    const pressed = [{ pressed: true }, { pressed: false }];
    expect(detector.poll('left', pressed)).toEqual([0]);
    expect(detector.poll('left', pressed)).toEqual([]);
    expect(detector.poll('left', [{ pressed: false }, { pressed: true }])).toEqual([1]);
  });

  it('keeps separate state per source', () => {
    const detector = new ButtonEdgeDetector();
    const pressed = [{ pressed: true }];
    expect(detector.poll('left', pressed)).toEqual([0]);
    expect(detector.poll('right', pressed)).toEqual([0]);
  });

  it('resets cleanly', () => {
    const detector = new ButtonEdgeDetector();
    detector.poll('x', [{ pressed: true }]);
    detector.reset();
    expect(detector.poll('x', [{ pressed: true }])).toEqual([0]);
  });
});

describe('prefersLastAxisPair', () => {
  it('detects XR thumbstick controller profiles', () => {
    expect(prefersLastAxisPair(['oculus-touch', 'generic-trigger'])).toBe(true);
    expect(prefersLastAxisPair(['meta-quest-touch-plus'])).toBe(true);
    expect(prefersLastAxisPair(['generic-trigger-squeeze-thumbstick'])).toBe(false);
    expect(prefersLastAxisPair([])).toBe(false);
  });
});

describe('VR locomotion helpers', () => {
  it('keeps the world centred on the headset when the rescuer is at origin', () => {
    const origin = computeVrWorldTransform(0, 0, 0);
    expect(origin.rotationY).toBeCloseTo(0);
    expect(origin.positionX).toBeCloseTo(0);
    expect(origin.positionZ).toBeCloseTo(0);
    expect(computeVrWorldTransform(0, 0, 1.2).positionX).toBeCloseTo(0);
    expect(computeVrWorldTransform(0, 0, 1.2).positionZ).toBeCloseTo(0);
  });

  it('places the rescuer position exactly under the XR origin after turning', () => {
    for (const [x, z, yaw] of [
      [3, -7, 0.6],
      [-12, 4, -1.1],
      [8, 9, 2.4],
    ]) {
      const t = computeVrWorldTransform(x, z, yaw);
      // xr(q) = R(t.rotationY)·q + t.position. Rescuer p must map to xr = 0.
      const c = Math.cos(t.rotationY);
      const s = Math.sin(t.rotationY);
      const xrX = c * x + s * z + t.positionX;
      const xrZ = -s * x + c * z + t.positionZ;
      expect(xrX).toBeCloseTo(0, 6);
      expect(xrZ).toBeCloseTo(0, 6);
    }
  });

  it('turns smoothly at the configured rate', () => {
    const snap = new SnapTurnController();
    const yaw = advanceVrTurnYaw(0, 1, 0.5, 'smooth', snap);
    expect(yaw).toBeCloseTo(TURN_RATE_RAD_PER_SEC * 0.5, 6);
    expect(advanceVrTurnYaw(yaw, -1, 0.5, 'smooth', snap)).toBeCloseTo(0, 6);
  });

  it('snap-turns once per stick deflection and re-arms at centre', () => {
    const snap = new SnapTurnController();
    expect(advanceVrTurnYaw(0, 1, 0.016, 'snap', snap)).toBeCloseTo(
      SNAP_TURN_RADIANS
    );
    // Holding the stick does not spin continuously
    expect(advanceVrTurnYaw(SNAP_TURN_RADIANS, 1, 0.016, 'snap', snap)).toBeCloseTo(
      SNAP_TURN_RADIANS
    );
    snap.poll(0); // recentre
    expect(advanceVrTurnYaw(0, -1, 0.016, 'snap', snap)).toBeCloseTo(
      -SNAP_TURN_RADIANS
    );
  });
});
