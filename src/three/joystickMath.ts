/* ------------------------------------------------------------------ *
 * WTS · JOYSTICK MATH
 * Pure, framework-free helpers shared by WebXR controllers, the standard
 * Gamepad API and the on-screen virtual joysticks. Kept dependency-free
 * so it can be unit tested without a browser or WebGL context.
 * ------------------------------------------------------------------ */

export const STICK_DEADZONE = 0.16;
/** Radians per second at full deflection of the right stick. */
export const TURN_RATE_RAD_PER_SEC = 2.35;
/** Right-stick deflection required to trigger one comfort snap turn. */
export const VR_LOOK_SNAP_THRESHOLD = 0.7;
/** Degrees per snap turn. */
export const SNAP_TURN_RADIANS = (30 * Math.PI) / 180;
export type VrTurnMode = 'smooth' | 'snap';

export interface Stick2D {
  x: number;
  y: number;
}

export interface JoystickState {
  /** -1 = left, +1 = right */
  moveX: number;
  /** -1 = backward, +1 = forward */
  moveY: number;
  /** -1 = turn left, +1 = turn right */
  lookX: number;
  lookY: number;
  connected: boolean;
  sourceCount: number;
  label: string;
}

export const NEUTRAL_STATE: JoystickState = {
  moveX: 0,
  moveY: 0,
  lookX: 0,
  lookY: 0,
  connected: false,
  sourceCount: 0,
  label: 'Sin mando',
};

export function clampUnit(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.max(-1, Math.min(1, v));
}

/** Removes the stick's centre slack and rescales to a smooth 0..1 range. */
export function applyDeadzone(value: number, deadzone = STICK_DEADZONE): number {
  const v = clampUnit(value);
  const dz = Math.max(0, Math.min(0.9, deadzone));
  const abs = Math.abs(v);
  if (abs <= dz) return 0;
  return Math.sign(v) * ((abs - dz) / (1 - dz));
}

/**
 * Reads the main analogue stick of one controller.
 *
 * Meta / Oculus / Index controllers expose their thumbstick in the LAST
 * axis pair (axes[2], axes[3]) and a touchpad in the first pair, while the
 * standard Gamepad API uses axes[0], axes[1] for the left stick. When
 * `preferLastPair` is set we use the thumbstick and fall back to the
 * touchpad when the thumbstick is at rest.
 */
export function readPrimaryStick(
  axes: ReadonlyArray<number>,
  preferLastPair = false
): Stick2D {
  if (!axes || axes.length === 0) return { x: 0, y: 0 };

  if (preferLastPair && axes.length >= 4) {
    const stickX = applyDeadzone(axes[2] ?? 0);
    const stickY = applyDeadzone(axes[3] ?? 0);
    if (Math.hypot(stickX, stickY) > 0.001) {
      return { x: stickX, y: -stickY };
    }
    return {
      x: applyDeadzone(axes[0] ?? 0),
      y: -applyDeadzone(axes[1] ?? 0),
    };
  }

  return {
    x: applyDeadzone(axes[0] ?? 0),
    y: -applyDeadzone(axes[1] ?? 0),
  };
}

/** Reads the secondary stick of a standard desktop gamepad (axes 2/3). */
export function readSecondaryStick(axes: ReadonlyArray<number>): Stick2D {
  if (!axes || axes.length < 4) return { x: 0, y: 0 };
  return {
    x: applyDeadzone(axes[2] ?? 0),
    y: -applyDeadzone(axes[3] ?? 0),
  };
}

/**
 * Combines the sticks into one state. With two XR controllers the left stick
 * moves and the right stick turns. With a single controller its stick moves
 * and turning is left to the headset (head yaw).
 */
export function composeJoystickState(
  left: Stick2D | null,
  right: Stick2D | null,
  label: string,
  sourceCount: number
): JoystickState {
  const single = left ?? right;
  const move = left ?? right ?? { x: 0, y: 0 };
  const look = left && right ? right : { x: 0, y: 0 };

  // Clamp diagonal speed so moving diagonally isn't faster.
  const mag = Math.hypot(move.x, move.y);
  const scale = mag > 1 ? 1 / mag : 1;

  return {
    moveX: clampUnit(move.x * scale),
    moveY: clampUnit(move.y * scale),
    lookX: clampUnit(look.x),
    lookY: clampUnit(look.y),
    connected: sourceCount > 0 || single !== null,
    sourceCount,
    label: label || (sourceCount > 0 ? 'Mando conectado' : 'Sin mando'),
  };
}

export interface ButtonLike {
  pressed: boolean;
}

/** Detects rising edges of buttons across several input sources. */
export class ButtonEdgeDetector {
  private down = new Set<string>();

  /** Returns the indices of buttons that were pressed since the last poll. */
  poll(sourceId: string, buttons: ReadonlyArray<ButtonLike>): number[] {
    const rising: number[] = [];
    buttons.forEach((button, index) => {
      const key = `${sourceId}:${index}`;
      const isDown = Boolean(button?.pressed);
      if (isDown && !this.down.has(key)) rising.push(index);
      if (isDown) this.down.add(key);
      else this.down.delete(key);
    });
    return rising;
  }

  reset(): void {
    this.down.clear();
  }
}

/** True when the profile list looks like a Meta/Index-style XR controller. */
export function prefersLastAxisPair(profiles: ReadonlyArray<string>): boolean {
  if (!profiles) return false;
  return profiles.some((profile) =>
    /oculus|quest|rift|valve|index|knuckles|touch/i.test(profile)
  );
}

/* ------------------------------------------------------------------ *
 * VR locomotion helpers (pure, so they can be unit tested)
 * ------------------------------------------------------------------ */

export interface VrWorldTransform {
  /** Y rotation applied to the world group. */
  rotationY: number;
  positionX: number;
  positionZ: number;
}

/**
 * In VR the headset stays at the XR origin, so the disaster world moves
 * instead of the camera: a virtual point q is drawn at R(turnYaw)·(q - p).
 * R is a Three.js Y-rotation, i.e. (x,z) -> (c·x + s·z, -s·x + c·z).
 * This keeps the headset exactly above rescuer position p while real head
 * rotation is handled by the XR camera itself.
 */
export function computeVrWorldTransform(
  rescuerX: number,
  rescuerZ: number,
  turnYaw: number
): VrWorldTransform {
  const theta = turnYaw;
  const c = Math.cos(theta);
  const s = Math.sin(theta);
  return {
    rotationY: theta,
    positionX: -(c * rescuerX + s * rescuerZ),
    positionZ: s * rescuerX - c * rescuerZ,
  };
}

/**
 * Re-arms only after the stick returns near centre, so holding a deflection
 * produces exactly one step instead of spinning continuously.
 */
export class SnapTurnController {
  private armed = true;

  public poll(lookX: number): number {
    if (Math.abs(lookX) < STICK_DEADZONE) this.armed = true;
    if (this.armed && Math.abs(lookX) >= VR_LOOK_SNAP_THRESHOLD) {
      this.armed = false;
      return Math.sign(lookX) * SNAP_TURN_RADIANS;
    }
    return 0;
  }

  public reset(): void {
    this.armed = true;
  }
}

/** Advances the accumulated VR turn yaw according to the comfort mode. */
export function advanceVrTurnYaw(
  currentYaw: number,
  lookX: number,
  dt: number,
  mode: VrTurnMode,
  snap: SnapTurnController
): number {
  if (mode === 'smooth') {
    return currentYaw + clampUnit(lookX) * TURN_RATE_RAD_PER_SEC * dt;
  }
  return currentYaw + snap.poll(lookX);
}
