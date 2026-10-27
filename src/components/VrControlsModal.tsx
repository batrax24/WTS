import React from 'react';
import { VrTurnMode } from '../three/joystickMath';
import {
  ChevronRight,
  Crosshair,
  Gamepad2,
  Glasses,
  Hand,
  HelpCircle,
  Move,
  Radio,
  RotateCw,
  Volume2,
  X,
} from 'lucide-react';

export interface XrCapabilitiesView {
  ar: boolean;
  vr: boolean;
  active: 'ar' | 'vr' | null;
  controllers: number;
  labels: string[];
  hasGamepad: boolean;
}

interface VrControlsModalProps {
  open: boolean;
  onClose: () => void;
  onStartVr: () => void;
  onStopVr: () => void;
  caps: XrCapabilitiesView;
  turnMode: VrTurnMode;
  onTurnModeChange: (mode: VrTurnMode) => void;
}

const CONTROL_ROWS = [
  {
    icon: Move,
    key: 'Joystick IZQUIERDO',
    value: 'Caminar en la dirección que miras',
    tone: 'sky',
  },
  {
    icon: RotateCw,
    key: 'Joystick DERECHO',
    value: 'Girar suavemente (smooth turn)',
    tone: 'sky',
  },
  {
    icon: Crosshair,
    key: 'GATILLO / A',
    value: 'OK · confirmar rescate',
    tone: 'emerald',
  },
  {
    icon: Radio,
    key: 'A / X  ·  B / Y',
    value: 'Baliza siguiente / anterior',
    tone: 'violet',
  },
  {
    icon: Volume2,
    key: 'GRIP (empuñadura)',
    value: 'Activar / desactivar guía acústica RF',
    tone: 'amber',
  },
  {
    icon: HelpCircle,
    key: 'PRESIONAR STICK',
    value: 'Mostrar u ocultar la ayuda dentro del visor',
    tone: 'slate',
  },
  {
    icon: Hand,
    key: 'Sin mandos (Cardboard)',
    value: 'Mantén el botón del visor para avanzar mirando',
    tone: 'slate',
  },
];

export const VrControlsModal: React.FC<VrControlsModalProps> = ({
  open,
  onClose,
  onStartVr,
  onStopVr,
  caps,
  turnMode,
  onTurnModeChange,
}) => {
  if (!open) return null;

  const inVr = caps.active === 'vr';

  return (
    <div className="fixed inset-0 z-[60] bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-5">
      <div className="w-full max-w-xl max-h-[92vh] overflow-y-auto rounded-3xl bg-slate-900 border border-cyan-500/30 shadow-2xl p-4 sm:p-5 text-slate-100 space-y-3.5">
        <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
          <div className="flex items-center gap-2 text-cyan-300 font-extrabold text-sm">
            <Gamepad2 size={19} />
            <span>Controles con joystick · Modo VR</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white"
            aria-label="Cerrar"
          >
            <X size={18} />
          </button>
        </div>

        <p className="text-[11px] sm:text-xs text-slate-300 leading-relaxed">
          Entra en <b>immersive-vr</b> a escala real: el mundo se mueve a tu
          alrededor mientras caminas con los sticks, el receptor 433 MHz va en
          tu mano derecha y una tarjeta de ayuda flota sobre la muñeca
          izquierda. También funcionan mandos de PC por la Gamepad API.
        </p>

        {/* Controller status */}
        <div className="rounded-2xl border border-cyan-500/25 bg-cyan-950/25 px-3 py-2.5 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px]">
          <div className="flex items-center gap-1.5 font-bold text-cyan-200">
            <span
              className={`w-2 h-2 rounded-full ${
                caps.controllers > 0
                  ? 'bg-emerald-400 shadow-[0_0_10px_#34d399]'
                  : 'bg-slate-500'
              }`}
            />
            {caps.controllers > 0
              ? `${caps.controllers} mando(s) detectado(s)`
              : 'Sin mandos detectados (usa mirada + botón)'}
          </div>
          <div className="text-slate-400">
            VR:{' '}
            <b className={caps.vr ? 'text-emerald-300' : 'text-rose-300'}>
              {caps.vr ? 'disponible' : 'no disponible'}
            </b>{' '}
            · AR:{' '}
            <b className={caps.ar ? 'text-emerald-300' : 'text-slate-400'}>
              {caps.ar ? 'disponible' : 'no disponible'}
            </b>
          </div>
          {caps.labels.length > 0 && (
            <div className="w-full text-[10px] text-cyan-300/80 font-mono truncate">
              {caps.labels.join(' · ')}
            </div>
          )}
        </div>

        {/* Comfort turn mode */}
        <div className="rounded-2xl border border-slate-700 bg-slate-800/40 px-3 py-2.5 flex flex-wrap items-center gap-2">
          <div className="flex-1 min-w-[150px]">
            <div className="text-[10px] font-black tracking-wide text-cyan-200 uppercase flex items-center gap-1.5">
              <RotateCw size={13} /> Comodidad de giro
            </div>
            <div className="text-[10px] text-slate-400">
              {turnMode === 'smooth'
                ? 'Giro continuo · más fluido'
                : 'Giros de 30° · menos mareo'}
            </div>
          </div>
          <div className="flex rounded-xl overflow-hidden border border-slate-600">
            {(['smooth', 'snap'] as VrTurnMode[]).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => onTurnModeChange(mode)}
                className={`px-3 py-1.5 text-[10px] font-black transition ${
                  turnMode === mode
                    ? 'bg-cyan-400 text-slate-950'
                    : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                }`}
              >
                {mode === 'smooth' ? 'SUAVE' : 'POR PASOS'}
              </button>
            ))}
          </div>
        </div>

        {/* Control map */}
        <div className="space-y-1">
          {CONTROL_ROWS.map((row) => {
            const Icon = row.icon;
            return (
              <div
                key={row.key}
                className="flex items-center gap-2.5 rounded-xl border border-slate-800 bg-slate-800/40 px-2.5 py-1.5"
              >
                <div className="w-7 h-7 shrink-0 rounded-lg bg-cyan-500/15 border border-cyan-500/30 flex items-center justify-center text-cyan-300">
                  <Icon size={15} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[10px] font-black tracking-wide text-cyan-200 uppercase">
                    {row.key}
                  </div>
                  <div className="text-[11px] text-slate-300 truncate">
                    {row.value}
                  </div>
                </div>
                <ChevronRight size={13} className="text-slate-600 shrink-0" />
              </div>
            );
          })}
        </div>

        <div className="rounded-xl bg-slate-800/70 border border-slate-700 px-3 py-2 text-[10px] text-slate-300 leading-relaxed">
          <b className="text-amber-300">Nota:</b> WebXR exige conexión segura
          (<code>https://</code>) o reenvío de puertos <code>localhost</code>.
          Si tu navegador no soporta VR, el botón seguirá permitiendo jugar en
          3D con joysticks virtuales, teclado o un mando de PC.
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 pt-1 border-t border-slate-800">
          <button
            type="button"
            onClick={onClose}
            className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-bold text-slate-200"
          >
            Cerrar
          </button>
          <button
            type="button"
            onClick={inVr ? onStopVr : onStartVr}
            disabled={!inVr && !caps.vr}
            className="px-4 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 disabled:opacity-45 disabled:cursor-not-allowed text-slate-950 text-xs font-black flex items-center gap-1.5 shadow-lg"
          >
            <Glasses size={16} />
            <span>{inVr ? 'Salir de VR' : caps.vr ? 'Entrar a VR' : 'VR no disponible'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
