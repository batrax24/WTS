import React, { useState } from 'react';
import {
  GameMode,
  ScenarioOverrides,
  SurvivorBeacon,
  WTSExplanationLog,
} from '../types/wts';
import {
  BatteryWarning,
  ChevronDown,
  ChevronUp,
  Eye,
  HandMetal,
  Map,
  RadioTower,
  Snowflake,
  Sparkles,
  UserX,
  Watch,
} from 'lucide-react';

interface ScenarioLabPanelProps {
  mode: GameMode;
  overrides: ScenarioOverrides;
  activeBeacon: SurvivorBeacon | undefined;
  showRfRays: boolean;
  tabletopMode: boolean;
  logs: WTSExplanationLog[];
  onToggleOverride: (
    key: keyof ScenarioOverrides | 'sensorContactLoss'
  ) => void;
  onTriggerSosSequence: () => void;
  onToggleRfRays: () => void;
  onToggleTabletop: () => void;
}

export const ScenarioLabPanel: React.FC<ScenarioLabPanelProps> = ({
  mode,
  overrides,
  activeBeacon,
  showRfRays,
  tabletopMode,
  logs,
  onToggleOverride,
  onTriggerSosSequence,
  onToggleRfRays,
  onToggleTabletop,
}) => {
  const [collapsed, setCollapsed] = useState(false);

  const sensorLost = activeBeacon ? !activeBeacon.sensorContactOk : false;
  const latestLog = logs[0];

  const toneBadge: Record<WTSExplanationLog['tone'], string> = {
    info: 'border-sky-500/50 bg-sky-950/80 text-sky-100',
    warn: 'border-amber-500/60 bg-amber-950/85 text-amber-100',
    alert: 'border-orange-500/70 bg-orange-950/85 text-orange-100',
    success: 'border-emerald-500/70 bg-emerald-950/85 text-emerald-100',
  };

  return (
    <div className="w-full max-w-[355px] space-y-2">
      {/* Live WTS System Explanation Banner (always visible so every action explains what WTS is doing!) */}
      {latestLog && (
        <div
          className={`rounded-2xl border backdrop-blur-md p-2.5 shadow-xl transition-all ${
            toneBadge[latestLog.tone]
          }`}
        >
          <div className="flex items-center justify-between text-[10px] font-extrabold uppercase tracking-wider opacity-85 mb-0.5">
            <span className="flex items-center gap-1">
              <Sparkles size={11} />
              <span>Qué hace el WTS · {latestLog.module}</span>
            </span>
            <span className="font-mono">{latestLog.timeLabel}</span>
          </div>
          <div className="text-xs font-bold leading-snug">{latestLog.title}</div>
          <p className="text-[11px] opacity-90 leading-snug mt-0.5">
            {latestLog.detail}
          </p>
        </div>
      )}

      {/* Collapsible Scenario Activation Panel */}
      <div className="rounded-2xl bg-slate-900/90 backdrop-blur-md border border-slate-700/80 shadow-xl overflow-hidden text-slate-100">
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          className="w-full px-3 py-2 flex items-center justify-between text-xs font-extrabold tracking-wide bg-slate-800/80 hover:bg-slate-800 transition"
        >
          <span>Panel de Situaciones y Eventos WTS</span>
          {collapsed ? <ChevronDown size={15} /> : <ChevronUp size={15} />}
        </button>

        {!collapsed && (
          <div className="p-2.5 space-y-2">
            <div className="grid grid-cols-2 gap-1.5">
              <button
                type="button"
                onClick={() => onToggleOverride('coldEnvironment')}
                className={`p-2 rounded-xl border text-left text-[11px] font-bold flex items-center gap-1.5 transition ${
                  overrides.coldEnvironment
                    ? 'bg-orange-600/30 border-orange-400 text-orange-100'
                    : 'bg-slate-800/80 border-slate-700 hover:border-slate-500 text-slate-200'
                }`}
              >
                <Snowflake size={14} className="shrink-0 text-sky-300" />
                <span>Frío / Hipotermia</span>
              </button>

              <button
                type="button"
                onClick={() => onToggleOverride('forcedImmobility')}
                className={`p-2 rounded-xl border text-left text-[11px] font-bold flex items-center gap-1.5 transition ${
                  overrides.forcedImmobility
                    ? 'bg-amber-600/30 border-amber-400 text-amber-100'
                    : 'bg-slate-800/80 border-slate-700 hover:border-slate-500 text-slate-200'
                }`}
              >
                <Watch size={14} className="shrink-0 text-amber-300" />
                <span>Inmovilidad</span>
              </button>

              <button
                type="button"
                onClick={onTriggerSosSequence}
                className="p-2 rounded-xl border bg-slate-800/80 border-slate-700 hover:border-amber-400 hover:bg-amber-500/20 text-left text-[11px] font-bold flex items-center gap-1.5 text-slate-100 active:scale-95 transition"
              >
                <HandMetal size={14} className="shrink-0 text-orange-400" />
                <span>Golpes SOS</span>
              </button>

              <button
                type="button"
                onClick={() => onToggleOverride('weakSignalShield')}
                className={`p-2 rounded-xl border text-left text-[11px] font-bold flex items-center gap-1.5 transition ${
                  overrides.weakSignalShield
                    ? 'bg-purple-600/30 border-purple-400 text-purple-100'
                    : 'bg-slate-800/80 border-slate-700 hover:border-slate-500 text-slate-200'
                }`}
              >
                <RadioTower size={14} className="shrink-0 text-purple-300" />
                <span>Señal débil RF</span>
              </button>

              <button
                type="button"
                onClick={() => onToggleOverride('lowBatteryTest')}
                className={`p-2 rounded-xl border text-left text-[11px] font-bold flex items-center gap-1.5 transition ${
                  overrides.lowBatteryTest
                    ? 'bg-red-600/30 border-red-400 text-red-100'
                    : 'bg-slate-800/80 border-slate-700 hover:border-slate-500 text-slate-200'
                }`}
              >
                <BatteryWarning size={14} className="shrink-0 text-red-300" />
                <span>Batería baja</span>
              </button>

              <button
                type="button"
                onClick={() => onToggleOverride('sensorContactLoss')}
                className={`p-2 rounded-xl border text-left text-[11px] font-bold flex items-center gap-1.5 transition ${
                  sensorLost
                    ? 'bg-slate-600/60 border-slate-300 text-white'
                    : 'bg-slate-800/80 border-slate-700 hover:border-slate-500 text-slate-200'
                }`}
              >
                <UserX size={14} className="shrink-0 text-slate-300" />
                <span>Sin sensor (Negro)</span>
              </button>
            </div>

            {mode === 'rescatista' && (
              <div className="pt-1.5 border-t border-slate-800 grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  onClick={onToggleRfRays}
                  className={`px-2 py-1.5 rounded-lg border text-[10px] font-bold flex items-center justify-center gap-1 transition ${
                    showRfRays
                      ? 'bg-sky-600/30 border-sky-400 text-sky-200'
                      : 'bg-slate-800/60 border-slate-700 text-slate-300'
                  }`}
                >
                  <Eye size={12} />
                  <span>{showRfRays ? 'Ocultar Rayos RF' : 'Ver Rayos RF 3D'}</span>
                </button>

                <button
                  type="button"
                  onClick={onToggleTabletop}
                  className={`px-2 py-1.5 rounded-lg border text-[10px] font-bold flex items-center justify-center gap-1 transition ${
                    tabletopMode
                      ? 'bg-emerald-600/30 border-emerald-400 text-emerald-200'
                      : 'bg-slate-800/60 border-slate-700 text-slate-300'
                  }`}
                >
                  <Map size={12} />
                  <span>{tabletopMode ? 'Vista 1ª Persona' : 'Vista Maqueta'}</span>
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
