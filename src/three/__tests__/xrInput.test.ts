import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { WTSXrInput } from '../xrInput';

function makePad(axes: number[], pressedIndex = -1): Gamepad {
  const buttons = Array.from({ length: 6 }, (_, index) => ({
    pressed: index === pressedIndex,
    touched: false,
    value: index === pressedIndex ? 1 : 0,
  }));
  return {
    id: 'Meta Quest Touch',
    index: 0,
    connected: true,
    axes,
    buttons,
    mapping: 'xr-standard',
    timestamp: 0,
    hapticActuators: [],
    vibrationActuator: null,
  } as unknown as Gamepad;
}

function makeSession(sources: unknown[]): XRSession {
  return { inputSources: sources } as unknown as XRSession;
}

function makeHarness() {
  const scene = new THREE.Scene();
  const renderer = {
    xr: { getController: () => new THREE.Group() },
  } as unknown as THREE.WebGLRenderer;
  const actions = {
    onOk: vi.fn(),
    onPrev: vi.fn(),
    onNext: vi.fn(),
    onAudio: vi.fn(),
    onSos: vi.fn(),
    onHelp: vi.fn(),
  };
  const input = new WTSXrInput(renderer, scene, actions);
  return { scene, actions, input };
}

describe('WTSXrInput', () => {
  it('adds two XR controller groups with laser pointers to the scene', () => {
    const { scene, input } = makeHarness();
    expect(scene.children).toHaveLength(2);
    expect(input.leftController.children).toHaveLength(1);
    expect(input.rightController.children).toHaveLength(1);
    input.dispose();
    expect(scene.children).toHaveLength(0);
  });

  it('is neutral with no XR session and no desktop gamepads', () => {
    const { input } = makeHarness();
    const state = input.poll(null);
    expect(state.connected).toBe(false);
    expect(state.moveX).toBe(0);
    expect(state.moveY).toBe(0);
    expect(input.getStatus().count).toBe(0);
  });

  it('maps the left XR stick to movement and the right stick to turning', () => {
    const { input, actions } = makeHarness();
    const session = makeSession([
      {
        handedness: 'left',
        profiles: ['oculus-touch', 'generic-trigger'],
        targetRayMode: 'tracked-pointer',
        gamepad: makePad([0, 0, 0, -1]),
      },
      {
        handedness: 'right',
        profiles: ['oculus-touch', 'generic-trigger'],
        targetRayMode: 'tracked-pointer',
        gamepad: makePad([0, 0, 0.9, 0], 0),
      },
    ]);
    input.setActive(true, session);

    const state = input.poll(session);
    expect(state.moveY).toBeCloseTo(1); // -axes[3] = forward
    expect(state.lookX).toBeGreaterThan(0.8);
    expect(state.sourceCount).toBe(2);
    expect(actions.onOk).toHaveBeenCalledOnce(); // trigger rising edge
    expect(input.getStatus().labels.join(' ')).toContain('Meta Quest');
    expect(input.getStatus().count).toBe(2);

    // Holding the trigger must not fire OK again
    input.poll(session);
    expect(actions.onOk).toHaveBeenCalledOnce();

    input.setActive(false, null);
    expect(input.getStatus().count).toBe(0);
  });

  it('walks forward with the gaze-only headset button fallback', () => {
    const { input } = makeHarness();
    const session = makeSession([]);
    input.setActive(true, session);

    const gazeEvents = input.leftController as unknown as {
      dispatchEvent: (event: { type: string; data?: unknown }) => void;
    };
    gazeEvents.dispatchEvent({
      type: 'selectstart',
      data: { targetRayMode: 'gaze' },
    });
    const state = input.poll(session);
    expect(state.moveY).toBe(1);
    expect(state.sourceCount).toBe(1);
    expect(input.getStatus().gazeFallback).toBe(true);

    gazeEvents.dispatchEvent({
      type: 'selectend',
      data: { targetRayMode: 'gaze' },
    });
    expect(input.poll(session).moveY).toBe(0);
  });

  it('routes beacon, audio, SOS and help buttons to the right actions', () => {
    const { input, actions } = makeHarness();
    const session = makeSession([
      {
        handedness: 'left',
        profiles: ['generic-trigger'],
        targetRayMode: 'tracked-pointer',
        gamepad: makePad([0, 0, 0, 0], 3),
      },
    ]);
    input.setActive(true, session);
    input.poll(session);
    expect(actions.onHelp).toHaveBeenCalledOnce();

    // A fresh source id re-arms the edge detector for a different button
    const session2 = makeSession([
      {
        handedness: 'right',
        profiles: ['generic-trigger'],
        targetRayMode: 'tracked-pointer',
        gamepad: makePad([0, 0, 0, 0], 4),
      },
    ]);
    input.poll(session2);
    expect(actions.onNext).toHaveBeenCalledOnce();
  });
});
