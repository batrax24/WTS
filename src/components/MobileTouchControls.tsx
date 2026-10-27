import React, { useRef, useState } from 'react';
import { GameMode } from '../types/wts';
import { HandMetal, ShieldCheck } from 'lucide-react';
import { VirtualJoystick } from './VirtualJoystick';

interface MobileTouchControlsProps {
  mode: GameMode;
  canRescueNearby: boolean;
  onSetMove: (forward: number, strafe: number, turn: number) => void;
  onTapSos: () => void;
  onRescueOk: () => void;
}

/**
 * Analogue twin-stick controls for touch screens / XR DOM overlays.
 * Left stick walks, right stick turns; both feed the same axes as physical
 * VR thumbsticks and desktop gamepads.
 */
export const MobileTouchControls: React.FC<MobileTouchControlsProps> = ({
  mode,
  canRescueNearby,
  onSetMove,
  onTapSos,
  onRescueOk,
}) => {
  const moveRef = useRef({ forward: 0, strafe: 0 });
  const turnRef = useRef(0);
  const [moveLabel, setMoveLabel] = useState('');

  if (mode === 'inspector') return null;

  const push = () => {
    onSetMove(moveRef.current.forward, moveRef.current.strafe, turnRef.current);
  };

  const handleMove = (x: number, y: number) => {
    moveRef.current = { forward: y, strafe: x };
    setMoveLabel(
      Math.hypot(x, y) < 0.05
        ? ''
        : `${y > 0 ? '▲' : y < 0 ? '▼' : ''}${x > 0 ? '▶' : x < 0 ? '◀' : ''}`
    );
    push();
  };

  const handleTurn = (x: number) => {
    turnRef.current = x * 2.35;
    push();
  };

  return (
    <div className="flex items-end justify-between gap-2 pointer-events-none select-none">
      {/* Left analogue stick: head-relative movement */}
      <div className="pointer-events-auto bg-slate-900/80 backdrop-blur-md border border-slate-700/80 rounded-2xl p-2 shadow-xl">
        <VirtualJoystick
          label={mode === 'chaleco' ? 'MOVERSE' : 'CAMINAR'}
          hint="WASD / stick izq."
          size={98}
          tone="sky"
          onChange={handleMove}
        />
        <div className="h-3 text-center text-[9px] font-bold text-sky-300/80">
          {moveLabel}
        </div>
      </div>

      {/* Right side: turn stick + contextual action button */}
      <div className="pointer-events-auto flex flex-col items-end gap-1.5">
        <div className="bg-slate-900/80 backdrop-blur-md border border-slate-700/80 rounded-2xl p-1.5 shadow-xl">
          <VirtualJoystick
            label="GIRAR"
            axis="x"
            size={78}
            tone="amber"
            onChange={handleTurn}
          />
        </div>

        {mode === 'chaleco' ? (
          <button
            type="button"
            onClick={onTapSos}
            className="px-3.5 py-2.5 rounded-2xl bg-amber-500 hover:bg-amber-400 active:scale-95 text-slate-950 font-black text-[11px] border-2 border-amber-200 shadow-xl flex items-center gap-1.5"
          >
            <HandMetal size={15} />
            <span>GOLPE SOS</span>
          </button>
        ) : canRescueNearby ? (
          <button
            type="button"
            onClick={onRescueOk}
            className="px-3.5 py-2.5 rounded-2xl bg-emerald-500 hover:bg-emerald-400 active:scale-95 text-slate-950 font-black text-[11px] border-2 border-emerald-200 shadow-xl flex items-center gap-1.5 animate-bounce"
          >
            <ShieldCheck size={16} />
            <span>¡RESCATAR!</span>
          </button>
        ) : null}
      </div>
    </div>
  );
};
