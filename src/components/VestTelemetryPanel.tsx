import React from 'react';
import { SurvivorBeacon } from '../types/wts';
import {
  Activity,
  BatteryCharging,
  Cpu,
  Flame,
  HandMetal,
  Radio,
  ArrowRightCircle,
} from 'lucide-react';

interface VestTelemetryPanelProps {
  beacon: SurvivorBeacon;
  elapsedSec: number;
  onTapSos: () => void;
  onMoveNudge: () => void;
  onSwitchToRescuer: () => void;
}

export const VestTelemetryPanel: React.FC<VestTelemetryPanelProps> = ({
  beacon,
  elapsedSec,
  onTapSos,
  onMoveNudge,
  onSwitchToRescuer,
}) => {
  const sinceTx = elapsedSec - beacon.lastTxFlashAt;
  const txGlowing = sinceTx >= 0 && sinceTx < 0.45;

  const priorityColors: Record<string, string> = {
    VERDE: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50',
    AMARILLO: 'bg-amber-500/20 text-amber-300 border-amber-500/50',
    ROJO: 'bg-red-500/25 text-red-200 border-red-500/60',
    NEGRO: 'bg-slate-600/30 text-slate-200 border-slate-400/60',
  };

  return (
    <div className="w-full max-w-[355px] rounded-2xl bg-slate-900/90 backdrop-blur-md border border-slate-700/80 shadow-2xl p-3.5 text-slate-100 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-2">
        <div>
          <div className="text-[11px] uppercase tracking-wider text-sky-400 font-bold">
            Modo Portador del Arnés
          </div>
          <h2 className="text-base font-black tracking-tight flex items-center gap-2">
            <span>Chaleco {beacon.id}</span>
            <span
              className={`text-[10px] px-2 py-0.5 rounded-full border font-extrabold ${
                priorityColors[beacon.priority]
              }`}
            >
              {beacon.priority}
            </span>
          </h2>
        </div>

        <div className="text-right">
          <div className="flex items-center justify-end gap-1 text-xs font-bold">
            <BatteryCharging
              size={14}
              className={
                beacon.batteryPct < 20 ? 'text-red-400' : 'text-emerald-400'
              }
            />
            <span>{Math.round(beacon.batteryPct)}%</span>
          </div>
          <div className="text-[10px] text-slate-400 font-mono">
            {beacon.powerConsumptionMw} mW
          </div>
        </div>
      </div>

      {/* Biometric & IMU Grid */}
      <div className="grid grid-cols-4 gap-1.5 text-center">
        <div className="rounded-xl bg-slate-800/80 p-1.5 border border-slate-700/60">
          <div className="text-[10px] text-slate-400">Pulso</div>
          <div className="font-mono font-bold text-sm text-rose-300">
            {Math.round(beacon.hr)}
          </div>
          <div className="text-[9px] text-slate-500">lpm</div>
        </div>
        <div className="rounded-xl bg-slate-800/80 p-1.5 border border-slate-700/60">
          <div className="text-[10px] text-slate-400">SpO₂</div>
          <div className="font-mono font-bold text-sm text-sky-300">
            {Math.round(beacon.spo2)}%
          </div>
          <div className="text-[9px] text-slate-500">PPG</div>
        </div>
        <div className="rounded-xl bg-slate-800/80 p-1.5 border border-slate-700/60">
          <div className="text-[10px] text-slate-400">Temp.</div>
          <div className="font-mono font-bold text-sm text-amber-300">
            {beacon.tempC.toFixed(1)}°
          </div>
          <div className="text-[9px] text-slate-500">Cutánea</div>
        </div>
        <div className="rounded-xl bg-slate-800/80 p-1.5 border border-slate-700/60">
          <div className="text-[10px] text-slate-400">IMU</div>
          <div className="font-mono font-bold text-sm text-emerald-300">
            {beacon.imuG.toFixed(2)}g
          </div>
          <div className="text-[9px] text-slate-500">
            Quieto {Math.round(beacon.stillnessSec)}s
          </div>
        </div>
      </div>

      {/* Interactive Rhythmic SOS Tap Box */}
      <div className="rounded-xl bg-slate-800/90 border border-slate-700 p-2.5 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold flex items-center gap-1.5 text-amber-300">
            <HandMetal size={14} />
            <span>IMU Dorsal · Golpes Rítmicos SOS</span>
          </span>
          <span className="text-[10px] font-mono text-slate-300">
            Confianza: {beacon.sosConfidence}%
          </span>
        </div>

        {/* Confidence / Cadence bar */}
        <div className="w-full h-2 rounded-full bg-slate-950 overflow-hidden">
          <div
            style={{ width: `${beacon.sosConfidence}%` }}
            className={`h-full transition-all duration-150 ${
              beacon.sosAlert
                ? 'bg-orange-500'
                : beacon.sosConfidence > 45
                ? 'bg-amber-400'
                : 'bg-sky-400'
            }`}
          />
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={onTapSos}
            className={`flex-1 py-2 px-3 rounded-xl font-extrabold text-xs border shadow-md active:scale-95 transition flex items-center justify-center gap-1.5 ${
              beacon.sosAlert
                ? 'bg-orange-600 hover:bg-orange-500 border-orange-300 text-white'
                : 'bg-amber-500 hover:bg-amber-400 border-amber-200 text-slate-950'
            }`}
          >
            <span>
              {beacon.sosAlert
                ? '¡POSIBLE SOS ACTIVO! (Golpear de nuevo)'
                : 'GOLPEAR ARNÉS SOS (Espacio)'}
            </span>
          </button>

          <button
            type="button"
            onClick={onMoveNudge}
            title="Moverse ligeramente (también con WASD / Flechas)"
            className="px-2.5 py-2 rounded-xl bg-slate-700 hover:bg-slate-600 border border-slate-500 text-[11px] font-bold text-slate-100 active:scale-95 transition flex items-center gap-1"
          >
            <Activity size={13} />
            <span>Mover</span>
          </button>
        </div>
      </div>

      {/* Flexible Thermal Layer PWM Widget */}
      <div className="rounded-xl bg-slate-800/75 border border-slate-700/80 p-2.5">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs font-bold flex items-center gap-1.5 text-orange-300">
            <Flame size={14} />
            <span>Capa Térmica Flexible · PWM</span>
          </span>
          <span className="text-[11px] font-mono font-bold text-orange-200">
            {beacon.pwmActive ? `ACTIVA · ${beacon.pwmDuty}%` : 'EN REPOSO (0%)'}
          </span>
        </div>

        <div className="flex items-center gap-2.5">
          {/* Animated Serpentine Coil SVG matching chaleco.png */}
          <svg
            width="92"
            height="34"
            viewBox="0 0 92 34"
            className="shrink-0 rounded-lg bg-slate-950/80 border border-slate-700 p-1"
          >
            <path
              d="M 8 8 L 8 25 A 5 5 0 0 0 18 25 L 18 9 A 5 5 0 0 1 28 9 L 28 25 A 5 5 0 0 0 38 25 L 38 9 A 5 5 0 0 1 48 9 L 48 25 A 5 5 0 0 0 58 25 L 58 9 A 5 5 0 0 1 68 9 L 68 25 A 5 5 0 0 0 78 25 L 78 10"
              fill="none"
              stroke={
                beacon.pwmActive
                  ? `rgba(255, ${Math.round(135 - beacon.pwmPulseWave * 55)}, 32, ${
                      0.38 + beacon.pwmPulseWave * 0.62
                    })`
                  : '#64748b'
              }
              strokeWidth="3.5"
              strokeLinecap="round"
            />
          </svg>

          <div className="text-[11px] text-slate-300 leading-snug">
            {beacon.pwmActive ? (
              <span>
                Pulsos térmicos aportando calor gradual ({beacon.tempC.toFixed(1)}{' '}
                °C) · Consumo elevado ({beacon.powerConsumptionMw} mW).
              </span>
            ) : (
              <span>
                Sin gasto térmico. Activa <b>Frío / Hipotermia</b> en el panel de
                situaciones para ver la respuesta PWM.
              </span>
            )}
          </div>
        </div>
      </div>

      {/* TinyML + 433 MHz RF Local Status */}
      <div className="rounded-xl bg-slate-950/75 border border-slate-800 p-2.5 space-y-1.5 text-[11px]">
        <div className="flex items-center justify-between text-sky-300 font-bold">
          <span className="flex items-center gap-1">
            <Cpu size={13} />
            <span>{beacon.tinymlStateLabel}</span>
          </span>
        </div>
        <p className="text-slate-400 leading-tight">{beacon.priorityReason}</p>
        <div className="flex items-center justify-between pt-1 border-t border-slate-800/90 text-[10px]">
          <span className="flex items-center gap-1.5 font-semibold text-slate-300">
            <Radio
              size={12}
              className={
                txGlowing ? 'text-sky-400 scale-125 transition' : 'text-slate-500'
              }
            />
            <span>
              Baliza 433 MHz: cada {beacon.txIntervalSec.toFixed(1)}s (Trama #
              {beacon.seqCounter})
            </span>
          </span>
          <span className={txGlowing ? 'text-sky-400 font-bold' : 'text-slate-500'}>
            {txGlowing ? '● TX RF' : 'Autónomo'}
          </span>
        </div>
      </div>

      {/* Quick transition CTA to Rescuer Mode */}
      <button
        type="button"
        onClick={onSwitchToRescuer}
        className="w-full py-2.5 px-3 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-black text-xs flex items-center justify-center gap-2 shadow-lg transition active:scale-[0.99]"
      >
        <span>Ir a Modo Rescatista y buscar con RSSI</span>
        <ArrowRightCircle size={16} />
      </button>
    </div>
  );
};
