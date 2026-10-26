import React from 'react';
import { PriorityColor, ReceiverLinkState, SurvivorBeacon } from '../types/wts';
import { Volume2, VolumeX, Radio, AlertTriangle, ShieldCheck, Info } from 'lucide-react';

interface ReceiverWidgetProps {
  beacons: SurvivorBeacon[];
  selectedIndex: number;
  links: Record<string, ReceiverLinkState>;
  receiverBatteryPct: number;
  audioEnabled: boolean;
  canRescueNearbyId: string | null;
  compactMobile?: boolean;
  onPrevBeacon: () => void;
  onNextBeacon: () => void;
  onSelectBeaconIndex: (idx: number) => void;
  onToggleAudio: () => void;
  onActionOk: () => void;
}

const SparklineSvg: React.FC<{
  data: number[];
  color: string;
  dimmed: boolean;
}> = ({ data, color, dimmed }) => {
  if (data.length < 2) return <div className="w-24 h-5" />;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const span = Math.max(0.4, max - min);
  const w = 104;
  const h = 22;

  const points = data
    .map((v, idx) => {
      const x = (idx / (data.length - 1)) * w;
      const y = h - 2 - ((v - min) / span) * (h - 4);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

  return (
    <svg
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      className={dimmed ? 'opacity-40' : 'opacity-95'}
    >
      <polyline
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={points}
      />
    </svg>
  );
};

const SignalBarsGraphic: React.FC<{ bars: number; darkScreen?: boolean }> = ({
  bars,
  darkScreen = false,
}) => {
  return (
    <div className="flex items-end gap-[3px] h-5" aria-label={`Señal ${bars} de 5 barras`}>
      {[1, 2, 3, 4, 5].map((level) => {
        const active = level <= bars;
        const heightPct = level * 20;
        return (
          <span
            key={level}
            style={{ height: `${heightPct}%` }}
            className={`w-[5px] rounded-[1px] transition-all duration-150 ${
              active
                ? darkScreen
                  ? 'bg-sky-400'
                  : 'bg-slate-900'
                : darkScreen
                ? 'bg-slate-700'
                : 'bg-slate-300'
            }`}
          />
        );
      })}
    </div>
  );
};

const materialNameEs: Record<string, string> = {
  wood: 'Madera',
  brick: 'Ladrillo',
  concrete: 'Hormigón',
  steel: 'Acero',
};

export const ReceiverWidget: React.FC<ReceiverWidgetProps> = ({
  beacons,
  selectedIndex,
  links,
  receiverBatteryPct,
  audioEnabled,
  canRescueNearbyId,
  compactMobile = false,
  onPrevBeacon,
  onNextBeacon,
  onSelectBeaconIndex,
  onToggleAudio,
  onActionOk,
}) => {
  const beacon = beacons[selectedIndex] ?? beacons[0];
  const link = beacon ? links[beacon.id] : undefined;
  const pkt = link?.lastPacket ?? null;

  const activePriority: PriorityColor | null =
    beacon && !beacon.rescued && pkt ? pkt.priority : null;

  const uniqueMaterials = Array.from(new Set(link?.blockingMaterials ?? []));
  const canExtractHere = Boolean(canRescueNearbyId);

  return (
    <div className="select-none flex flex-col items-center">
      {/* Quick channel tabs above antenna */}
      <div className="flex items-center gap-1 mb-1.5 bg-slate-900/85 backdrop-blur-md px-2 py-1 rounded-full border border-slate-700/80 shadow-md">
        {beacons.map((b, idx) => {
          const bLink = links[b.id];
          const bSos = bLink?.lastPacket?.sosAlert && !b.rescued;
          const isSelected = idx === selectedIndex;
          return (
            <button
              key={b.id}
              type="button"
              onClick={() => onSelectBeaconIndex(idx)}
              className={`px-2 py-0.5 rounded-full text-[11px] font-bold tracking-tight transition flex items-center gap-1 ${
                isSelected
                  ? 'bg-sky-500 text-slate-950 shadow'
                  : b.rescued
                  ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-700/50'
                  : 'text-slate-300 hover:bg-slate-800'
              }`}
            >
              <span>{b.id.replace('WTS ', '#')}</span>
              {b.rescued && <span>✓</span>}
              {bSos && (
                <span className="w-1.5 h-1.5 rounded-full bg-orange-400 animate-ping" />
              )}
            </button>
          );
        })}
      </div>

      {/* Physical Stubby 433 MHz Antenna on top-left matching chaleco.png */}
      <div className="w-full flex items-end pl-5 -mb-1 pointer-events-none">
        <div className="relative flex flex-col items-center">
          <div
            className={`w-3.5 h-9 rounded-t-full bg-gradient-to-r from-slate-800 via-slate-600 to-slate-800 border border-slate-500/60 shadow-inner ${
              compactMobile ? 'h-6' : 'h-9'
            }`}
          />
          <div className="w-5 h-2.5 bg-slate-800 border-x border-t border-slate-600 rounded-t-sm" />
          {link && link.signalBars > 0 && !beacon?.rescued && (
            <Radio
              size={14}
              className="text-sky-400 absolute -top-3.5 -right-4 animate-pulse"
            />
          )}
        </div>
        <span className="ml-2 mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-300 bg-slate-900/75 px-1.5 py-0.5 rounded">
          RF Sub-GHz · 433 MHz
        </span>
      </div>

      {/* Rugged Handheld Receiver Body */}
      <div
        className={`relative rounded-[22px] bg-gradient-to-b from-slate-700 via-slate-800 to-slate-900 border-2 border-slate-500/70 shadow-2xl p-3 ${
          compactMobile ? 'w-[286px]' : 'w-[312px]'
        }`}
      >
        {/* Recessed Transflective LCD Display matching chaleco.png */}
        <div className="rounded-xl bg-[#e6ecef] text-slate-900 border-[3px] border-slate-900 shadow-inner p-2.5">
          {/* Header: WTS 014 + Battery + Signal Bars */}
          <div className="flex items-center justify-between border-b border-slate-400/80 pb-1.5">
            <div>
              <div className="font-mono font-black text-base leading-none tracking-tight text-slate-900 flex items-center gap-1.5">
                <span>{beacon?.id ?? 'WTS ---'}</span>
                {pkt?.sosAlert && !beacon?.rescued && (
                  <span className="px-1.5 py-0.5 text-[10px] font-extrabold bg-orange-600 text-white rounded animate-pulse">
                    SOS
                  </span>
                )}
              </div>
              <div className="text-[10px] font-semibold text-slate-600 mt-0.5">
                Chaleco: {pkt ? `${pkt.batteryPct}%` : '--%'} · RX:{' '}
                {Math.round(receiverBatteryPct)}%
              </div>
            </div>
            <SignalBarsGraphic bars={beacon?.rescued ? 5 : link?.signalBars ?? 0} />
          </div>

          {/* Link freshness / SOS / Rescued status banner */}
          {beacon?.rescued ? (
            <div className="my-3 py-3 px-2 rounded-lg bg-emerald-100 border border-emerald-400 text-emerald-950 text-center">
              <ShieldCheck size={20} className="mx-auto mb-1 text-emerald-700" />
              <div className="font-bold text-xs uppercase">
                Superviviente Rescatado
              </div>
              <div className="text-[11px] text-emerald-800">
                Puesto a salvo en el segundo {beacon.rescuedAtSec}s
              </div>
            </div>
          ) : (
            <>
              {link?.isLost ? (
                <div className="mt-1.5 px-2 py-1 rounded bg-red-100 border border-red-300 text-red-900 text-[11px] font-bold flex items-center gap-1.5">
                  <AlertTriangle size={13} className="shrink-0 text-red-700" />
                  <span>
                    {pkt
                      ? `SIN COMUNICACIÓN RF · Último dato hace ${Math.round(
                          link.packetAgeSec
                        )}s`
                      : 'SIN RECEPCIÓN 433 MHz · Rodea escombros'}
                  </span>
                </div>
              ) : link?.isStale ? (
                <div className="mt-1.5 px-2 py-1 rounded bg-amber-100 border border-amber-300 text-amber-900 text-[11px] font-bold flex items-center justify-between">
                  <span>DATO DESACTUALIZADO</span>
                  <span>hace {link.packetAgeSec.toFixed(0)} s</span>
                </div>
              ) : pkt?.sosAlert ? (
                <div className="mt-1.5 px-2 py-1 rounded bg-orange-100 border border-orange-400 text-orange-950 text-[11px] font-extrabold text-center">
                  ¡ALERTA: POSIBLE SOS POR GOLPES RÍTMICOS!
                </div>
              ) : (
                <div className="mt-1 text-[10px] font-medium text-emerald-800 flex items-center justify-between">
                  <span>Enlace 433 MHz activo</span>
                  <span>
                    {pkt ? `Actualizado hace ${link?.packetAgeSec.toFixed(1)}s` : 'Esperando trama…'}
                  </span>
                </div>
              )}

              {/* Telemetry Rows matching chaleco.png: Pulso, SpO2, Temp, RSSI */}
              <div className="mt-1.5 space-y-1 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-800 w-16">♥ Pulso</span>
                  <span
                    className={`font-mono font-bold w-14 text-right ${
                      link?.isStale ? 'text-slate-500' : 'text-slate-950'
                    }`}
                  >
                    {pkt ? `${pkt.hr} lpm` : '--'}
                  </span>
                  <SparklineSvg
                    data={beacon.hrWaveHistory}
                    color="#0f172a"
                    dimmed={Boolean(link?.isStale || !pkt)}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-800 w-16">O₂ SpO₂</span>
                  <span
                    className={`font-mono font-bold w-14 text-right ${
                      pkt && pkt.spo2 < 92
                        ? 'text-red-700'
                        : link?.isStale
                        ? 'text-slate-500'
                        : 'text-slate-950'
                    }`}
                  >
                    {pkt ? `${pkt.spo2}%` : '--%'}
                  </span>
                  <SparklineSvg
                    data={beacon.spo2WaveHistory}
                    color="#0f172a"
                    dimmed={Boolean(link?.isStale || !pkt)}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-800 w-16">🌡 Temp.</span>
                  <span
                    className={`font-mono font-bold w-14 text-right ${
                      pkt?.pwmActive
                        ? 'text-orange-700'
                        : link?.isStale
                        ? 'text-slate-500'
                        : 'text-slate-950'
                    }`}
                    title={
                      pkt?.pwmActive
                        ? `Capa térmica PWM activa (${pkt.pwmDuty}%)`
                        : 'Capa térmica en reposo'
                    }
                  >
                    {pkt
                      ? `${pkt.tempC.toFixed(1)}°${pkt.pwmActive ? '⚡' : ''}`
                      : '--.-°'}
                  </span>
                  <SparklineSvg
                    data={beacon.tempHistory}
                    color={pkt?.pwmActive ? '#c2410c' : '#0f172a'}
                    dimmed={Boolean(link?.isStale || !pkt)}
                  />
                </div>

                <div className="flex items-center justify-between pt-1 border-t border-slate-300">
                  <span className="font-extrabold text-slate-900">RSSI</span>
                  <span className="font-mono text-[11px] font-bold text-slate-700">
                    {link && link.signalBars > 0
                      ? `${link.rssiDbm} dBm`
                      : 'Sin portadora'}
                  </span>
                  <SignalBarsGraphic bars={link?.signalBars ?? 0} />
                </div>
              </div>

              {/* Obstacle / Non-GPS hint */}
              <div className="mt-1.5 pt-1 border-t border-slate-300/80 flex items-center justify-between text-[10px] text-slate-600">
                <span>
                  {uniqueMaterials.length > 0
                    ? `Atenúan: ${uniqueMaterials
                        .map((m) => materialNameEs[m] ?? m)
                        .join(', ')}`
                    : 'Trayecto despejado (433 MHz)'}
                </span>
                <span className="font-semibold">No es GPS</span>
              </div>
            </>
          )}
        </div>

        {/* 4 Physical Priority LEDs row matching chaleco.png: VERDE, AMARILLO, ROJO, NEGRO */}
        <div className="mt-2.5 px-1">
          <div className="grid grid-cols-4 gap-1 text-center">
            {(
              [
                {
                  key: 'VERDE',
                  onCls:
                    'bg-emerald-400 shadow-[0_0_12px_#34d399] border-emerald-200',
                  offCls: 'bg-emerald-950 border-slate-600',
                },
                {
                  key: 'AMARILLO',
                  onCls:
                    'bg-yellow-400 shadow-[0_0_12px_#facc15] border-yellow-100',
                  offCls: 'bg-yellow-950 border-slate-600',
                },
                {
                  key: 'ROJO',
                  onCls:
                    'bg-red-500 shadow-[0_0_14px_#ef4444] border-red-200 animate-pulse',
                  offCls: 'bg-red-950 border-slate-600',
                },
                {
                  key: 'NEGRO',
                  onCls:
                    'bg-slate-300 shadow-[0_0_10px_#cbd5e1] border-white ring-2 ring-slate-950',
                  offCls: 'bg-slate-950 border-slate-600',
                },
              ] as const
            ).map((led) => {
              const isLit = activePriority === led.key;
              return (
                <div key={led.key} className="flex flex-col items-center">
                  <span
                    className={`w-4 h-4 rounded-full border-2 transition-all ${
                      isLit ? led.onCls : led.offCls
                    }`}
                  />
                  <span
                    className={`mt-1 text-[9px] font-extrabold tracking-tight ${
                      isLit ? 'text-white' : 'text-slate-400'
                    }`}
                  >
                    {led.key}
                  </span>
                </div>
              );
            })}
          </div>
          <div className="mt-1 flex items-center justify-center gap-1 text-[9px] text-slate-400 text-center leading-tight">
            <Info size={10} className="shrink-0 text-sky-400" />
            <span>Prioridad educativa tipo START · No diagnóstico real ni deduce fallecimiento</span>
          </div>
        </div>

        {/* Physical Tactile Navigation Buttons matching chaleco.png: ◀, top ♪, OK, ▶ */}
        <div className="mt-2.5 flex items-end justify-center gap-3">
          <button
            type="button"
            onClick={onPrevBeacon}
            title="Baliza anterior (Tecla Z)"
            className="w-12 h-11 rounded-xl bg-slate-900 hover:bg-slate-950 active:translate-y-0.5 border-2 border-slate-600 shadow-md text-slate-100 font-black text-base flex items-center justify-center transition"
          >
            ◀
          </button>

          <div className="flex flex-col items-center gap-1.5">
            <button
              type="button"
              onClick={onToggleAudio}
              title="Activar/silenciar sonido guía RSSI"
              className={`px-2.5 h-6 rounded-lg border text-[10px] font-bold flex items-center gap-1 transition ${
                audioEnabled
                  ? 'bg-sky-900/80 border-sky-400 text-sky-200'
                  : 'bg-slate-900 border-slate-600 text-slate-400'
              }`}
            >
              {audioEnabled ? <Volume2 size={12} /> : <VolumeX size={12} />}
              <span>Audio</span>
            </button>

            <button
              type="button"
              onClick={onActionOk}
              title="Confirmar rescate al localizar a la persona (Tecla E / Enter)"
              className={`w-14 h-12 rounded-xl border-2 font-black text-xs tracking-wide shadow-lg active:translate-y-0.5 transition flex flex-col items-center justify-center ${
                canExtractHere
                  ? 'bg-emerald-500 hover:bg-emerald-400 border-emerald-200 text-slate-950 animate-bounce'
                  : 'bg-slate-900 hover:bg-slate-950 border-slate-500 text-white'
              }`}
            >
              <span>OK</span>
              <span className="text-[8px] font-bold uppercase">
                {canExtractHere ? '¡RESCATAR!' : 'Marcar'}
              </span>
            </button>
          </div>

          <button
            type="button"
            onClick={onNextBeacon}
            title="Siguiente baliza (Tecla X)"
            className="w-12 h-11 rounded-xl bg-slate-900 hover:bg-slate-950 active:translate-y-0.5 border-2 border-slate-600 shadow-md text-slate-100 font-black text-base flex items-center justify-center transition"
          >
            ▶
          </button>
        </div>
      </div>
    </div>
  );
};
