// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

/* The 3D manager needs WebGL, which jsdom has no GPU for. Mock it so we can
   verify the complete VR controls UI and its wiring to the scene API. */
const hoisted = vi.hoisted(() => ({ manager: {} as Record<string, unknown> }));

vi.mock('../three/disasterScene', () => {
  const manager = {
    getXrCapabilities: vi.fn(() => ({
      ar: false,
      vr: true,
      active: null,
      controllers: 2,
      labels: ['IZQ · Meta Quest', 'DER · Meta Quest'],
      hasGamepad: true,
    })),
    setGraphicsQuality: vi.fn(),
    setVrTurnMode: vi.fn(),
    setInspectorPreset: vi.fn(),
    highlightInspectorPart: vi.fn(),
    pulseReceiverButton3D: vi.fn(),
    pulseControllers: vi.fn(),
    setTouchMove: vi.fn(),
    startVrSession: vi.fn(async () => true),
    startMixedReality: vi.fn(async () => false),
    stopMixedReality: vi.fn(async () => undefined),
    dispose: vi.fn(),
  };
  Object.assign(hoisted.manager, manager);
  function WTSThreeSceneManager() {
    return manager;
  }
  return { WTSThreeSceneManager };
});

import { App } from '../App';

const manager = hoisted.manager as Record<
  string,
  ReturnType<typeof vi.fn>
>;

beforeAll(() => {
  // jsdom lacks pointer capture and layout boxes; provide deterministic ones.
  if (!HTMLElement.prototype.setPointerCapture) {
    HTMLElement.prototype.setPointerCapture = () => undefined;
    HTMLElement.prototype.releasePointerCapture = () => undefined;
  }
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('VR joystick UI', () => {
  it('shows the VR button and the physical controller status chip', async () => {
    render(<App />);
    expect(
      screen.getByRole('button', { name: /Jugar en VR/i })
    ).toBeTruthy();
    await waitFor(() => {
      expect(screen.getByText(/2 mandos XR/)).toBeTruthy();
      expect(screen.getByText(/Meta Quest/)).toBeTruthy();
    });
  });

  it('opens the VR control map and switches the comfort turn mode', async () => {
    render(<App />);
    await waitFor(() => expect(screen.getByText(/2 mandos XR/)).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: /Jugar en VR/i }));

    expect(
      screen.getByText('Controles con joystick · Modo VR')
    ).toBeTruthy();
    expect(screen.getByText('Joystick IZQUIERDO')).toBeTruthy();
    expect(screen.getByText('Joystick DERECHO')).toBeTruthy();
    expect(screen.getByText(/2 mando\(s\) detectado\(s\)/)).toBeTruthy();
    expect(
      screen.getByRole('button', { name: /Entrar a VR/ })
    ).toHaveProperty('disabled', false);

    fireEvent.click(screen.getByRole('button', { name: 'POR PASOS' }));
    expect(manager.setVrTurnMode).toHaveBeenCalledWith('snap');
    expect(screen.getByText(/Giros de 30°/)).toBeTruthy();
  });

  it('starts an immersive-vr session from the modal', async () => {
    render(<App />);
    await waitFor(() => expect(screen.getByText(/2 mandos XR/)).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: /Jugar en VR/i }));
    fireEvent.click(screen.getByRole('button', { name: /Entrar a VR/ }));
    await waitFor(() => {
      expect(manager.startVrSession).toHaveBeenCalledOnce();
    });
  });

  it('renders two analogue joysticks that drive movement and release to zero', () => {
    render(<App />);
    const sticks = document.querySelectorAll('.wts-joystick');
    expect(sticks.length).toBe(2);

    const stick = sticks[0] as HTMLElement;
    stick.getBoundingClientRect = () =>
      ({
        left: 0,
        top: 0,
        width: 98,
        height: 98,
        right: 98,
        bottom: 98,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }) as DOMRect;

    fireEvent.pointerDown(stick, { pointerId: 1, clientX: 49, clientY: 12 });
    expect(manager.setTouchMove).toHaveBeenCalledWith(1, 0, 0);
    expect(stick.className).toContain('is-active');

    fireEvent.pointerUp(stick, { pointerId: 1, clientX: 49, clientY: 12 });
    expect(manager.setTouchMove).toHaveBeenLastCalledWith(0, 0, 0);
    expect(stick.className).not.toContain('is-active');
  });
});
