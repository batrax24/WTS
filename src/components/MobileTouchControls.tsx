import React from 'react';
import { GameMode } from '../types/wts';
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  HandMetal,
  RotateCcw,
  RotateCw,
  ShieldCheck,
} from 'lucide-react';

interface MobileTouchControlsProps {
  mode: GameMode;
  canRescueNearby: boolean;
  onSetMove: (forward: number, strafe: number, turn: number) => void;
  onTapSos: () => void;
  onRescueOk: () => void;
}

export const MobileTouchControls: React.FC<MobileTouchControlsProps> = ({
  mode,
  canRescueNearby,
  onSetMove,
  onTapSos,
  onRescueOk,
}) => {
  if (mode === 'inspector') return null;

  const stop = () => onSetMove(0, 0, 0);

  return (
    <div className="flex items-end justify-between gap-3 pointer-events-none select-none">
      {/* Directional D-Pad */}
      <div className="pointer-events-auto bg-slate-900/80 backdrop-blur-md border border-slate-700/80 rounded-2xl p-2 shadow-xl">
        <div className="text-[9px] text-center font-bold uppercase tracking-wider text-slate-400 mb-1">
          {mode === 'chaleco' ? 'Moverse (WASD)' : 'Caminar (WASD)'}
        </div>
        <div className="grid grid-cols-3 gap-1 w-[114px]">
          <button
            type="button"
            onPointerDown={() => onSetMove(0, 0, -2.0)}
            onPointerUp={stop}
            onPointerLeave={stop}
            title="Girar izquierda (Q / ←)"
            className="h-9 rounded-lg bg-slate-800 active:bg-sky-500 active:text-slate-950 border border-slate-600 flex items-center justify-center text-slate-200"
          >
            <RotateCcw size={14} />
          </button>
          <button
            type="button"
            onPointerDown={() => onSetMove(1, 0, 0)}
            onPointerUp={stop}
            onPointerLeave={stop}
            title="Avanzar (W / ↑)"
            className="h-9 rounded-lg bg-slate-800 active:bg-sky-500 active:text-slate-950 border border-slate-600 flex items-center justify-center text-slate-100"
          >
            <ArrowUp size={16} />
          </button>
          <button
            type="button"
            onPointerDown={() => onSetMove(0, 0, 2.0)}
            onPointerUp={stop}
            onPointerLeave={stop}
            title="Girar derecha (→)"
            className="h-9 rounded-lg bg-slate-800 active:bg-sky-500 active:text-slate-950 border border-slate-600 flex items-center justify-center text-slate-200"
          >
            <RotateCw size={14} />
          </button>

          <button
            type="button"
            onPointerDown={() => onSetMove(0, -1, 0)}
            onPointerUp={stop}
            onPointerLeave={stop}
            title="Paso izquierda (A)"
            className="h-9 rounded-lg bg-slate-800 active:bg-sky-500 active:text-slate-950 border border-slate-600 flex items-center justify-center text-slate-100"
          >
            <ArrowLeft size={16} />
          </button>
          <button
            type="button"
            onPointerDown={() => onSetMove(-1, 0, 0)}
            onPointerUp={stop}
            onPointerLeave={stop}
            title="Retroceder (S / ↓)"
            className="h-9 rounded-lg bg-slate-800 active:bg-sky-500 active:text-slate-950 border border-slate-600 flex items-center justify-center text-slate-100"
          >
            <ArrowDown size={16} />
          </button>
          <button
            type="button"
            onPointerDown={() => onSetMove(0, 1, 0)}
            onPointerUp={stop}
            onPointerLeave={stop}
            title="Paso derecha (D)"
            className="h-9 rounded-lg bg-slate-800 active:bg-sky-500 active:text-slate-950 border border-slate-600 flex items-center justify-center text-slate-100"
          >
            <ArrowRight size={16} />
          </button>
        </div>
      </div>

      {/* Quick Action Button for Mobile/Touch */}
      <div className="pointer-events-auto">
        {mode === 'chaleco' ? (
          <button
            type="button"
            onClick={onTapSos}
            className="px-4 py-3 rounded-2xl bg-amber-500 hover:bg-amber-400 active:scale-95 text-slate-950 font-black text-xs border-2 border-amber-200 shadow-xl flex items-center gap-1.5"
          >
            <HandMetal size={16} />
            <span>GOLPE SOS</span>
          </button>
        ) : canRescueNearby ? (
          <button
            type="button"
            onClick={onRescueOk}
            className="px-4 py-3 rounded-2xl bg-emerald-500 hover:bg-emerald-400 active:scale-95 text-slate-950 font-black text-xs border-2 border-emerald-200 shadow-xl flex items-center gap-1.5 animate-bounce"
          >
            <ShieldCheck size={17} />
            <span>¡RESCATAR PERSONA!</span>
          </button>
        ) : null}
      </div>
    </div>
  );
};
