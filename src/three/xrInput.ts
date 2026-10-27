import * as THREE from 'three';
import {
  ButtonEdgeDetector,
  JoystickState,
  NEUTRAL_STATE,
  Stick2D,
  composeJoystickState,
  prefersLastAxisPair,
  readPrimaryStick,
  readSecondaryStick,
} from './joystickMath';

/* ------------------------------------------------------------------ *
 * WTS · WEBXR / GAMEPAD INPUT
 * One input layer for physical VR thumbsticks, the standard desktop
 * Gamepad API, hand-tracking pinches and gaze-only headsets.
 * ------------------------------------------------------------------ */

export interface XrInputActions {
  /** Trigger / A / pinch: OK (confirm rescue). */
  onOk: () => void;
  onPrev: () => void;
  onNext: () => void;
  onAudio: () => void;
  onSos: () => void;
  onHelp: () => void;
}

export interface XrInputStatus {
  connected: boolean;
  count: number;
  labels: string[];
  hasGamepad: boolean;
  gazeFallback: boolean;
}

interface PadSource {
  id: string;
  handedness: string;
  gamepad: Gamepad;
  profiles: ReadonlyArray<string>;
}

type Handedness = 'left' | 'right';

function shortPadName(id: string): string {
  if (!id) return 'Mando';
  const cleaned = id.replace(/\(.*?\)/g, '').replace(/vendor:|product:/gi, '').trim();
  if (/oculus|quest|meta/i.test(cleaned)) return 'Meta Quest';
  if (/index|valve|knuckles/i.test(cleaned)) return 'Valve Index';
  if (/xbox/i.test(cleaned)) return 'Xbox';
  if (/playstation|dualsense|dualshock/i.test(cleaned)) return 'PlayStation';
  return cleaned.length > 22 ? `${cleaned.slice(0, 22)}…` : cleaned;
}

function addSticks(a: Stick2D | null, b: Stick2D): Stick2D {
  if (!a) return b;
  return {
    x: Math.max(-1, Math.min(1, a.x + b.x)),
    y: Math.max(-1, Math.min(1, a.y + b.y)),
  };
}

export class WTSXrInput {
  readonly leftController: THREE.Group;
  readonly rightController: THREE.Group;

  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private actions: XrInputActions;
  private edges = new ButtonEdgeDetector();
  private session: XRSession | null = null;
  private active = false;
  private gazeHeld = false;
  private handGroups = new Map<Handedness, THREE.Group>();
  private lasers: THREE.Group[] = [];
  private lastState: JoystickState = NEUTRAL_STATE;
  private lastStatus: XrInputStatus = {
    connected: false,
    count: 0,
    labels: [],
    hasGamepad: false,
    gazeFallback: false,
  };

  constructor(
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    actions: XrInputActions
  ) {
    this.renderer = renderer;
    this.scene = scene;
    this.actions = actions;

    this.leftController = renderer.xr.getController(0);
    this.rightController = renderer.xr.getController(1);

    for (const [index, controller] of [
      this.leftController,
      this.rightController,
    ].entries()) {
      controller.name = `WTS_XR_Controller_${index}`;
      const laser = this.createLaser();
      controller.add(laser);
      this.lasers.push(laser);
      this.bindControllerEvents(controller);
    }

    scene.add(this.leftController, this.rightController);
  }

  /* ----------------------------- visuals -------------------------- */

  private createLaser(): THREE.Group {
    const group = new THREE.Group();
    group.visible = false;

    const lineGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, 0, -1),
    ]);
    const line = new THREE.Line(
      lineGeo,
      new THREE.LineBasicMaterial({
        color: 0x4bd6ff,
        transparent: true,
        opacity: 0.7,
        depthWrite: false,
        toneMapped: false,
      })
    );
    line.scale.z = 4.5;

    const tip = new THREE.Mesh(
      new THREE.SphereGeometry(0.009, 12, 10),
      new THREE.MeshBasicMaterial({
        color: 0xd5f6ff,
        transparent: true,
        opacity: 0.95,
        depthWrite: false,
        toneMapped: false,
      })
    );
    tip.position.z = -4.5;

    const halo = new THREE.Mesh(
      new THREE.TorusGeometry(0.018, 0.004, 8, 24),
      new THREE.MeshBasicMaterial({
        color: 0x38d7ff,
        transparent: true,
        opacity: 0.8,
        depthWrite: false,
        toneMapped: false,
      })
    );
    halo.rotation.x = -0.35;

    group.add(line, tip, halo);
    return group;
  }

  private bindControllerEvents(controller: THREE.Group): void {
    // Three.js types these controller groups with a WebXR-specific event map;
    // we only need a tiny typed subset here.
    const emitter = controller as unknown as {
      addEventListener: (
        type: string,
        listener: (event: unknown) => void
      ) => void;
    };

    emitter.addEventListener('connected', (event: unknown) => {
      const src = (event as { data?: XRInputSource }).data;
      if (!src) return;
      if (src.handedness === 'left' || src.handedness === 'right') {
        this.handGroups.set(src.handedness, controller);
      }
    });

    emitter.addEventListener('disconnected', (event: unknown) => {
      const src = (event as { data?: XRInputSource }).data;
      if (!src) return;
      if (src.handedness === 'left' || src.handedness === 'right') {
        if (this.handGroups.get(src.handedness) === controller) {
          this.handGroups.delete(src.handedness);
        }
      }
      this.edges.reset();
    });

    // Gaze-only headsets (no controllers, no gamepad): hold the headset
    // button to walk forward in the direction you are looking.
    emitter.addEventListener('selectstart', (event: unknown) => {
      const src = (event as { data?: XRInputSource }).data;
      if (src?.targetRayMode === 'gaze') {
        this.gazeHeld = true;
        return;
      }
      // Hand tracking / pinch sources have no gamepad buttons to poll.
      if (!src?.gamepad) this.actions.onOk();
    });

    emitter.addEventListener('selectend', (event: unknown) => {
      const src = (event as { data?: XRInputSource }).data;
      if (src?.targetRayMode === 'gaze') this.gazeHeld = false;
    });

    emitter.addEventListener('squeezestart', (event: unknown) => {
      const src = (event as { data?: XRInputSource }).data;
      if (!src?.gamepad) this.actions.onAudio();
    });
  }

  /* ------------------------------ API ----------------------------- */

  public setActive(active: boolean, session: XRSession | null): void {
    this.active = active;
    this.session = session;
    this.gazeHeld = false;
    this.edges.reset();
    this.handGroups.clear();
    this.lasers.forEach((laser) => (laser.visible = active));
    if (!active) {
      this.lastState = NEUTRAL_STATE;
      this.lastStatus = {
        connected: false,
        count: 0,
        labels: [],
        hasGamepad: false,
        gazeFallback: false,
      };
    }
  }

  public getHandController(hand: Handedness): THREE.Group {
    return this.handGroups.get(hand) ??
      (hand === 'left' ? this.leftController : this.rightController);
  }

  public getStatus(): XrInputStatus {
    return this.lastStatus;
  }

  public getState(): JoystickState {
    return this.lastState;
  }

  /** Polls XR input sources (or desktop gamepads outside XR). Call per frame. */
  public poll(session: XRSession | null = this.session): JoystickState {
    const sources: PadSource[] = [];

    if (session) {
      const inputs = Array.from(session.inputSources ?? []) as XRInputSource[];
      inputs.forEach((src, index) => {
        if (!src.gamepad) return;
        sources.push({
          id: `xr-${index}-${src.handedness}`,
          handedness: src.handedness,
          gamepad: src.gamepad,
          profiles: src.profiles ?? [],
        });
      });
    } else {
      const pads =
        typeof navigator !== 'undefined'
          ? navigator.getGamepads?.() ?? []
          : [];
      for (const pad of pads) {
        if (!pad || !pad.connected) continue;
        sources.push({
          id: `pad-${pad.index}`,
          handedness: 'none',
          gamepad: pad,
          profiles: [pad.id],
        });
      }
    }

    // Edge-triggered button actions + light haptic tick on every press.
    for (const src of sources) {
      const rising = this.edges.poll(src.id, src.gamepad.buttons ?? []);
      if (rising.length > 0) {
        rising.forEach((index) => this.handleButton(index));
        this.pulse(0.35, 32, src.gamepad);
      }
    }

    let left: Stick2D | null = null;
    let right: Stick2D | null = null;
    const labels: string[] = [];
    let count = 0;

    const standardPad = !session ? sources[0] : undefined;
    if (standardPad) {
      left = readPrimaryStick(standardPad.gamepad.axes, false);
      right = readSecondaryStick(standardPad.gamepad.axes);
      labels.push(shortPadName(standardPad.gamepad.id));
      count = sources.length;
    } else {
      for (const src of sources) {
        const stick = readPrimaryStick(
          src.gamepad.axes,
          prefersLastAxisPair(src.profiles)
        );
        if (src.handedness === 'left') {
          left = addSticks(left, stick);
        } else if (src.handedness === 'right') {
          right = addSticks(right, stick);
        } else if (!left) {
          left = stick;
        } else {
          right = addSticks(right, stick);
        }
        labels.push(`${src.handedness === 'left' ? 'IZQ' : src.handedness === 'right' ? 'DER' : 'MANDO'} · ${shortPadName(src.gamepad.id)}`);
        count++;
      }
    }

    // No controllers at all: gaze + headset button fallback (Cardboard style).
    if (count === 0 && this.active && this.gazeHeld) {
      left = { x: 0, y: 1 };
      labels.push('Mirada + botón');
      count = 1;
    }

    const state = composeJoystickState(left, right, labels.join(' / '), count);
    this.lastState = state;
    this.lastStatus = {
      connected: state.connected,
      count,
      labels,
      hasGamepad: sources.length > 0,
      gazeFallback: count > 0 && sources.length === 0,
    };
    return state;
  }

  private handleButton(index: number): void {
    switch (index) {
      case 0: // trigger / A / cross
        this.actions.onOk();
        break;
      case 1: // squeeze / B
        this.actions.onAudio();
        break;
      case 2: // touchpad press
        this.actions.onSos();
        break;
      case 3: // thumbstick press → toggle VR help card
        this.actions.onHelp();
        break;
      case 4: // A / X / RB
      case 15: // d-pad right (desktop gamepads)
        this.actions.onNext();
        break;
      case 5: // B / Y / LB
      case 14: // d-pad left
        this.actions.onPrev();
        break;
      case 12: // d-pad up
        this.actions.onHelp();
        break;
      case 13: // d-pad down
        this.actions.onSos();
        break;
      default:
        break;
    }
  }

  /** Short vibration on every controller (or just one specific gamepad). */
  public pulse(strength = 0.4, durationMs = 45, only?: Gamepad): void {
    const pads: Gamepad[] = [];
    if (only) {
      pads.push(only);
    } else if (this.session) {
      (Array.from(this.session.inputSources ?? []) as XRInputSource[]).forEach(
        (src) => {
          if (src.gamepad) pads.push(src.gamepad);
        }
      );
    } else {
      const gamepads =
        typeof navigator !== 'undefined'
          ? navigator.getGamepads?.() ?? []
          : [];
      for (const pad of gamepads) {
        if (pad?.connected) pads.push(pad);
      }
    }

    for (const pad of pads) {
      try {
        const actuators = pad.hapticActuators;
        actuators?.forEach((actuator) => {
          const result = actuator.pulse?.(strength, durationMs);
          if (result && typeof result.catch === 'function') result.catch(() => undefined);
        });
        const vibration = (
          pad as Gamepad & {
            vibrationActuator?: {
              playEffect?: (type: string, params: object) => Promise<unknown>;
            };
          }
        ).vibrationActuator;
        const effect = vibration?.playEffect?.('dual-rumble', {
          duration: durationMs,
          strongMagnitude: strength,
          weakMagnitude: strength * 0.6,
        });
        if (effect && typeof effect.catch === 'function') effect.catch(() => undefined);
      } catch {
        // Haptics are optional; never break gameplay for unsupported devices.
      }
    }
  }

  public dispose(): void {
    this.setActive(false, null);
    this.lasers.forEach((laser) => {
      laser.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        mesh.geometry?.dispose();
        const mats = Array.isArray(mesh.material)
          ? mesh.material
          : mesh.material
          ? [mesh.material]
          : [];
        mats.forEach((m) => m.dispose());
      });
      laser.parent?.remove(laser);
    });
    this.scene.remove(this.leftController, this.rightController);
    void this.renderer;
  }
}
