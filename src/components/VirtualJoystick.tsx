import React, { useCallback, useRef, useState } from 'react';

interface VirtualJoystickProps {
  label: string;
  hint?: string;
  /** 'both' = move, 'x' = turn only, 'y' = forward/back only */
  axis?: 'both' | 'x' | 'y';
  size?: number;
  tone?: 'sky' | 'amber' | 'emerald';
  /** x: -1..1 (right positive), y: -1..1 (up/forward positive) */
  onChange: (x: number, y: number) => void;
  onRelease?: () => void;
}

export const VirtualJoystick: React.FC<VirtualJoystickProps> = ({
  label,
  hint,
  axis = 'both',
  size = 104,
  tone = 'sky',
  onChange,
  onRelease,
}) => {
  const baseRef = useRef<HTMLDivElement | null>(null);
  const pointerRef = useRef<number | null>(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const [active, setActive] = useState(false);

  const radius = size / 2;

  const emitFromPoint = useCallback(
    (clientX: number, clientY: number) => {
      const base = baseRef.current;
      if (!base) return;
      const rect = base.getBoundingClientRect();
      let dx = clientX - (rect.left + rect.width / 2);
      let dy = clientY - (rect.top + rect.height / 2);
      const max = rect.width / 2 - 12;
      const dist = Math.hypot(dx, dy);
      if (dist > max) {
        dx = (dx / dist) * max;
        dy = (dy / dist) * max;
      }
      if (axis === 'x') dy = 0;
      if (axis === 'y') dx = 0;
      setKnob({ x: dx, y: dy });
      onChange(
        Number((dx / max).toFixed(3)),
        Number((-dy / max).toFixed(3))
      );
    },
    [axis, onChange]
  );

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (pointerRef.current !== null) return;
    pointerRef.current = e.pointerId;
    e.currentTarget.setPointerCapture(e.pointerId);
    setActive(true);
    emitFromPoint(e.clientX, e.clientY);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (pointerRef.current !== e.pointerId) return;
    e.preventDefault();
    emitFromPoint(e.clientX, e.clientY);
  };

  const release = (e: React.PointerEvent<HTMLDivElement>) => {
    if (pointerRef.current !== e.pointerId) return;
    pointerRef.current = null;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // capture may already be gone
    }
    setKnob({ x: 0, y: 0 });
    setActive(false);
    onChange(0, 0);
    onRelease?.();
  };

  const magnitude = Math.min(1, Math.hypot(knob.x, knob.y) / (radius - 12));

  return (
    <div className="wts-joystick-wrap" style={{ width: size }}>
      <div
        ref={baseRef}
        role="slider"
        aria-label={label}
        aria-valuemin={-1}
        aria-valuemax={1}
        aria-valuenow={0}
        tabIndex={0}
        className={`wts-joystick wts-joystick--${tone} ${active ? 'is-active' : ''}`}
        style={{ width: size, height: size }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={release}
        onPointerCancel={release}
        onLostPointerCapture={(e) => {
          if (pointerRef.current === e.pointerId) {
            pointerRef.current = null;
            setKnob({ x: 0, y: 0 });
            setActive(false);
            onChange(0, 0);
          }
        }}
      >
        <div className="wts-joystick__ring" />
        <div className="wts-joystick__cross wts-joystick__cross--h" />
        <div className="wts-joystick__cross wts-joystick__cross--v" />
        <div
          className="wts-joystick__knob"
          style={{
            transform: `translate(calc(-50% + ${knob.x}px), calc(-50% + ${knob.y}px))`,
            boxShadow: `0 0 ${8 + magnitude * 18}px rgba(56,189,248,${
              0.45 + magnitude * 0.45
            }), inset 0 2px 4px rgba(255,255,255,.35)`,
          }}
        >
          <span className="wts-joystick__dot" />
        </div>
        <div className="wts-joystick__arrows" aria-hidden="true">
          <span>▲</span>
          <span>▼</span>
        </div>
      </div>
      <div className="wts-joystick__label">{label}</div>
      {hint && <div className="wts-joystick__hint">{hint}</div>}
    </div>
  );
};
