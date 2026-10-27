import React, { useEffect, useRef, useState } from 'react';
import { WTSSimulationEngine } from './simulation/wtsEngine';
import { WTSSoundEngine } from './audio/soundEngine';
import {
  InspectorPreset,
  WTSThreeSceneManager,
} from './three/disasterScene';
import { GameMode, SimulationSnapshot } from './types/wts';
import { ReceiverWidget } from './components/ReceiverWidget';
import { VestTelemetryPanel } from './components/VestTelemetryPanel';
import { ScenarioLabPanel } from './components/ScenarioLabPanel';
import { MobileTouchControls } from './components/MobileTouchControls';
import { DeviceInspectorOverlay } from './components/DeviceInspectorOverlay';
import {
  MissionOutcomeOverlay,
  SchematicReferenceModal,
  TutorialModal,
} from './components/TutorialAndModals';
import { VrControlsModal, XrCapabilitiesView } from './components/VrControlsModal';
import {
  Clock,
  Gamepad2,
  Glasses,
  HelpCircle,
  Image as ImageIcon,
  Layers,
  Radio,
  RotateCcw,
  Shield,
  Sliders,
  Sparkles,
  Eye,
  EyeOff,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { GraphicsQuality } from './three/visualAssets';
import { VrTurnMode } from './three/joystickMath';

export const App: React.FC = () => {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const overlayRootRef = useRef<HTMLDivElement | null>(null);
  const soundRef = useRef<WTSSoundEngine | null>(null);
  const engineRef = useRef<WTSSimulationEngine | null>(null);
  const sceneRef = useRef<WTSThreeSceneManager | null>(null);

  if (!soundRef.current) {
    soundRef.current = new WTSSoundEngine();
  }
  if (!engineRef.current) {
    engineRef.current = new WTSSimulationEngine(soundRef.current.handleEvent);
  }

  const [snap, setSnap] = useState<SimulationSnapshot>(() =>
    engineRef.current!.getSnapshot()
  );
  const [muted, setMuted] = useState(false);
  const [tutorialOpen, setTutorialOpen] = useState(true);
  const [schematicOpen, setSchematicOpen] = useState(false);
  const [outcomeDismissed, setOutcomeDismissed] = useState(false);
  const [xrInfoBanner, setXrInfoBanner] = useState<string | null>(null);
  const [vrOpen, setVrOpen] = useState(false);
  const [vrTurnMode, setVrTurnMode] = useState<VrTurnMode>('smooth');
  const [xrCaps, setXrCaps] = useState<XrCapabilitiesView>({
    ar: false,
    vr: false,
    active: null,
    controllers: 0,
    labels: [],
    hasGamepad: false,
  });
  const [graphics, setGraphics] = useState<GraphicsQuality>(() =>
    window.innerWidth < 900 || (navigator.hardwareConcurrency ?? 8) <= 4
      ? 'media'
      : 'alta'
  );
  const [hudVisible, setHudVisible] = useState(true);

  const [inspectorPreset, setInspectorPreset] =
    useState<InspectorPreset>('ambos');
  const [selectedHotspotId, setSelectedHotspotId] =
    useState<string>('mcu_tinyml');

  // Mobile responsive panel selector ('dispositivo' | 'situaciones' | 'minimizado')
  const [mobileDrawer, setMobileDrawer] = useState<
    'dispositivo' | 'situaciones' | 'minimizado'
  >('dispositivo');

  useEffect(() => {
    const container = viewportRef.current;
    const engine = engineRef.current!;
    if (!container) return;

    const manager = new WTSThreeSceneManager(container, engine, {
      onSelectHotspot: (partId) => {
        setSelectedHotspotId(partId);
        manager.highlightInspectorPart(partId);
      },
      onReceiverButton: (action) => {
        soundRef.current?.unlock();
        manager.pulseReceiverButton3D(action);
        manager.pulseControllers(action === 'ok' ? 0.75 : 0.28, action === 'ok' ? 95 : 30);
        if (action === 'prev') engine.selectBeaconByDelta(-1);
        else if (action === 'next') engine.selectBeaconByDelta(1);
        else if (action === 'aux') engine.toggleAudioGuide();
        else if (action === 'ok') engine.attemptRescue();
      },
      onVestTap: () => {
        soundRef.current?.unlock();
        engine.registerVestTap();
      },
    });
    sceneRef.current = manager;

    const syncInterval = window.setInterval(() => {
      setSnap(engine.getSnapshot());
      setXrCaps(
        manager.getXrCapabilities() ?? {
          ar: false,
          vr: false,
          active: null,
          controllers: 0,
          labels: [],
          hasGamepad: false,
        }
      );
    }, 90);

    return () => {
      window.clearInterval(syncInterval);
      manager.dispose();
      sceneRef.current = null;
    };
  }, []);

  useEffect(() => {
    sceneRef.current?.setGraphicsQuality(graphics);
  }, [graphics]);

  useEffect(() => {
    sceneRef.current?.setVrTurnMode(vrTurnMode);
  }, [vrTurnMode]);

  const cycleGraphics = () => {
    setGraphics((current) =>
      current === 'alta' ? 'media' : current === 'media' ? 'baja' : 'alta'
    );
  };

  const unlockAudio = () => {
    soundRef.current?.unlock();
  };

  const handleVrButton = () => {
    unlockAudio();
    if (xrCaps.active === 'vr') {
      void sceneRef.current?.stopMixedReality();
      return;
    }
    setVrOpen(true);
  };

  const handleStartVr = async () => {
    setVrOpen(false);
    const manager = sceneRef.current;
    if (!manager) return;
    const ok = await manager.startVrSession();
    if (!ok) {
      setXrInfoBanner(
        'No se pudo iniciar immersive-vr. Puedes seguir jugando con joysticks virtuales, teclado o un mando de PC.'
      );
      window.setTimeout(() => setXrInfoBanner(null), 7000);
    }
  };

  const handleStopVr = () => {
    setVrOpen(false);
    void sceneRef.current?.stopMixedReality();
  };

  const handleModeChange = (m: GameMode) => {
    unlockAudio();
    engineRef.current?.setMode(m);
    if (m === 'inspector') {
      sceneRef.current?.setInspectorPreset(inspectorPreset);
      sceneRef.current?.highlightInspectorPart(selectedHotspotId);
    }
    setSnap(engineRef.current!.getSnapshot());
  };

  const handleRestart = () => {
    unlockAudio();
    engineRef.current?.reset();
    setOutcomeDismissed(false);
    setSnap(engineRef.current!.getSnapshot());
  };

  const handleToggleMute = () => {
    const next = !muted;
    setMuted(next);
    soundRef.current?.setMuted(next);
  };

  const handleMixedRealityButton = async () => {
    unlockAudio();
    const manager = sceneRef.current;
    if (!manager) return;

    if (snap.xrActive) {
      await manager.stopMixedReality();
      return;
    }

    if (xrCaps.ar && overlayRootRef.current) {
      const ok = await manager.startMixedReality(overlayRootRef.current);
      if (!ok) {
        setXrInfoBanner(
          'No se pudo iniciar la cámara XR. Jugando en modo 3D interactivo de navegador.'
        );
      }
    } else {
      // Fallback explanation + activate tabletop spatial view so user experiences spatial maqueta
      engineRef.current?.setMode('rescatista');
      if (!snap.rescuer.tabletopCameraMode) {
        engineRef.current?.toggleTabletopCamera();
      }
      setXrInfoBanner(
        'Este navegador no dispone de cámara WebXR (immersive-ar): se ha activado la Vista Maqueta Espacial 3D interactiva (compatible con ratón, teclado y pantalla táctil).'
      );
      window.setTimeout(() => setXrInfoBanner(null), 6500);
    }
  };

  const formatTimer = (sec: number) => {
    const m = Math.floor(sec / 60)
      .toString()
      .padStart(2, '0');
    const s = Math.floor(sec % 60)
      .toString()
      .padStart(2, '0');
    return `${m}:${s}`;
  };

  const vest014 = snap.beacons[0];
  const activeBeacon = snap.beacons[snap.rescuer.selectedBeaconIndex];
  const activeLink = activeBeacon ? snap.links[activeBeacon.id] : undefined;
  const signalBars = activeBeacon?.rescued ? 5 : activeLink?.signalBars ?? 0;
  const headingDeg = Math.round(
    ((snap.rescuer.headingRad * 180) / Math.PI + 360) % 360
  );

  return (
    <div
      ref={overlayRootRef}
      onPointerDown={unlockAudio}
      className={`relative w-full h-full overflow-hidden select-none text-slate-100 ${
        hudVisible ? '' : 'wts-hud-hidden'
      }`}
    >
      {/* Full-Screen 3D / WebXR Viewport */}
      <div ref={viewportRef} className="absolute inset-0 z-0" />

      {/* Cinematic screen overlays (vignette, scanlines, HUD frame corners) */}
      <div className="wts-vignette" />
      <div className="wts-scanlines" />
      <div className="wts-corner wts-corner--tl" />
      <div className="wts-corner wts-corner--tr" />
      <div className="wts-corner wts-corner--bl" />
      <div className="wts-corner wts-corner--br" />

      {/* Physical controller / gamepad status (VR joysticks) */}
      {(xrCaps.controllers > 0 || xrCaps.hasGamepad) && (
        <div className="wts-pad-chip" title="Estado de los mandos / joysticks">
          <Gamepad2 size={13} />
          <span>
            {xrCaps.controllers > 0
              ? `${xrCaps.controllers} mando${xrCaps.controllers > 1 ? 's' : ''} XR`
              : 'Mando PC'}
          </span>
          <span className="wts-pad-chip__dot" />
          <span className="wts-pad-chip__detail">
            {xrCaps.labels[0] ?? 'sticks activos'}
          </span>
        </div>
      )}

      {/* Live RF telemetry strip */}
      <div className="wts-rf-strip">
        <span className="wts-rf-dot" />
        <div>
          <div className="wts-rf-label">Enlace Sub-GHz · 433 MHz</div>
          <div className="wts-rf-value">
            {snap.mode === 'inspector'
              ? 'Inspector técnico · señal en espera'
              : `Rumbo ${headingDeg.toString().padStart(3, '0')}° · ${
                  activeLink?.isLost
                    ? 'Sin comunicación'
                    : activeLink?.isStale
                    ? 'Dato desactualizado'
                    : 'Telemetría en vivo'
                }`}
          </div>
        </div>
        <div className="wts-rf-bars" aria-label={`Señal ${signalBars} de 5 barras`}>
          {Array.from({ length: 12 }, (_, i) => (
            <span
              key={i}
              className={i < signalBars * 2.4 ? 'is-on' : ''}
              style={{
                height: `${28 + i * 5}%`,
                animationDelay: `${i * 0.07}s`,
              }}
            />
          ))}
        </div>
        <span className="wts-rf-db">
          {activeLink && signalBars > 0 ? `${activeLink.rssiDbm} dBm` : '--- dBm'}
        </span>
      </div>

      {/* WebXR Surface Placement Prompt when in AR before anchoring */}
      {snap.xrActive && !snap.xrSurfacePlaced && (
        <div className="absolute top-20 inset-x-4 z-30 flex justify-center pointer-events-none">
          <div className="px-4 py-3 rounded-2xl bg-sky-950/90 border border-sky-400 text-sky-100 text-xs font-bold shadow-2xl text-center max-w-sm">
            Apunta la cámara hacia una superficie real (mesa o suelo) y toca la
            pantalla sobre el anillo azul para colocar la zona del sismo.
          </div>
        </div>
      )}

      {/* XR / Spatial Mode Info Toast */}
      {xrInfoBanner && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 z-30 max-w-md w-[92%] px-3.5 py-2.5 rounded-2xl bg-slate-900/95 border border-sky-400/70 text-xs text-sky-100 shadow-2xl text-center">
          {xrInfoBanner}
        </div>
      )}

      {/* TOP HUD BAR */}
      <header className="relative z-20 px-2.5 sm:px-4 pt-2.5 flex flex-wrap items-center justify-between gap-2 pointer-events-none">
        {/* Left: Brand + Timer + Rescued Counter */}
        <div data-wts-hud className="pointer-events-auto flex items-center gap-2 bg-slate-900/90 backdrop-blur-md border border-slate-700/80 rounded-2xl px-3 py-1.5 shadow-xl">
          <div>
            <div className="text-[10px] font-black tracking-widest text-sky-400 uppercase leading-none">
              Proyecto WTS · 433 MHz
            </div>
            <div className="text-xs sm:text-sm font-black text-white leading-tight">
              Emergencia Sísmica
            </div>
          </div>

          <div className="h-7 w-px bg-slate-700 mx-1" />

          <div
            className={`flex items-center gap-1 font-mono font-black text-xs sm:text-sm px-2 py-1 rounded-xl ${
              snap.remainingSec < 60
                ? 'bg-red-500/25 text-red-300 border border-red-500/50 animate-pulse'
                : 'bg-slate-800 text-slate-100'
            }`}
            title="Tiempo restante para completar los rescates"
          >
            <Clock size={14} />
            <span>{formatTimer(snap.remainingSec)}</span>
          </div>

          <div
            className="px-2.5 py-1 rounded-xl bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 font-black text-xs"
            title="Supervivientes rescatados"
          >
            Rescates: {snap.rescuedCount}/{snap.totalBeacons}
          </div>
        </div>

        {/* Center: Mode Switcher Tabs (Chaleco / Rescatista / Inspector 3D) */}
        <div data-wts-hud className="pointer-events-auto flex items-center gap-1 bg-slate-900/90 backdrop-blur-md border border-slate-700/80 rounded-2xl p-1 shadow-xl">
          <button
            type="button"
            onClick={() => handleModeChange('chaleco')}
            className={`px-2.5 sm:px-3 py-1.5 rounded-xl text-xs font-extrabold flex items-center gap-1.5 transition ${
              snap.mode === 'chaleco'
                ? 'bg-amber-400 text-slate-950 shadow'
                : 'text-slate-300 hover:bg-slate-800'
            }`}
          >
            <Shield size={14} />
            <span>Chaleco</span>
          </button>

          <button
            type="button"
            onClick={() => handleModeChange('rescatista')}
            className={`px-2.5 sm:px-3 py-1.5 rounded-xl text-xs font-extrabold flex items-center gap-1.5 transition ${
              snap.mode === 'rescatista'
                ? 'bg-sky-400 text-slate-950 shadow'
                : 'text-slate-300 hover:bg-slate-800'
            }`}
          >
            <Radio size={14} />
            <span>Rescatista</span>
          </button>

          <button
            type="button"
            onClick={() => handleModeChange('inspector')}
            className={`px-2.5 sm:px-3 py-1.5 rounded-xl text-xs font-extrabold flex items-center gap-1.5 transition ${
              snap.mode === 'inspector'
                ? 'bg-emerald-400 text-slate-950 shadow'
                : 'text-slate-300 hover:bg-slate-800'
            }`}
          >
            <Layers size={14} />
            <span>Inspector 3D</span>
          </button>
        </div>

        {/* Right: Graphics Quality, Immersive HUD, XR, Mute, Tutorial, Reset */}
        <div className="pointer-events-auto flex items-center gap-1.5 bg-slate-900/90 backdrop-blur-md border border-slate-700/80 rounded-2xl p-1.5 shadow-xl">
          <span className="wts-quality-chip hidden sm:inline-flex" title="Motor gráfico cinematográfico activo">
            {graphics === 'alta' ? 'ULTRA' : graphics === 'media' ? 'ALTA' : 'ECO'}
          </span>
          <button
            type="button"
            onClick={cycleGraphics}
            title="Cambiar calidad gráfica (Ultra / Alta / Eco)"
            className="px-2 py-1.5 rounded-xl bg-cyan-950/80 hover:bg-cyan-900 text-cyan-200 border border-cyan-500/50 text-[11px] font-extrabold flex items-center gap-1"
          >
            <Sparkles size={14} />
            <span className="hidden lg:inline">
              {graphics === 'alta' ? 'Ultra' : graphics === 'media' ? 'Alta' : 'Eco'}
            </span>
          </button>
          <button
            type="button"
            onClick={() => setHudVisible((v) => !v)}
            title={hudVisible ? 'Ocultar interfaz (modo cine)' : 'Mostrar interfaz'}
            className="p-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700"
          >
            {hudVisible ? <Eye size={15} /> : <EyeOff size={15} />}
          </button>
          <button
            type="button"
            onClick={handleVrButton}
            title="Jugar en VR con joysticks · ver mapa de controles"
            className={`px-2.5 py-1.5 rounded-xl text-xs font-extrabold flex items-center gap-1 border transition ${
              xrCaps.active === 'vr'
                ? 'bg-emerald-400 text-slate-950 border-emerald-200'
                : xrCaps.vr
                ? 'bg-emerald-950/80 text-emerald-300 border-emerald-500/60 hover:bg-emerald-900'
                : 'bg-slate-800 text-slate-200 border-slate-600 hover:bg-slate-700'
            }`}
          >
            <Gamepad2 size={14} />
            <span className="hidden sm:inline">
              {xrCaps.active === 'vr' ? 'Salir VR' : 'Jugar en VR'}
            </span>
          </button>

          <button
            type="button"
            onClick={handleMixedRealityButton}
            title="Colocar escena en superficie real (WebXR AR) o alternar Vista Maqueta 3D"
            className={`px-2.5 py-1.5 rounded-xl text-xs font-extrabold flex items-center gap-1 border transition ${
              snap.xrActive
                ? 'bg-sky-500 text-slate-950 border-sky-200'
                : xrCaps.ar
                ? 'bg-sky-950/90 text-sky-300 border-sky-500/60 hover:bg-sky-900'
                : 'bg-slate-800 text-slate-200 border-slate-600 hover:bg-slate-700'
            }`}
          >
            <Glasses size={14} />
            <span className="hidden sm:inline">
              {snap.xrActive
                ? 'Salir XR'
                : xrCaps.ar
                ? 'Realidad Mixta (AR)'
                : 'Modo XR / Maqueta'}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setSchematicOpen(true)}
            title="Ver esquemático original de referencia"
            className="p-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700"
          >
            <ImageIcon size={15} />
          </button>

          <button
            type="button"
            onClick={handleToggleMute}
            title={muted ? 'Activar sonido' : 'Silenciar sonido'}
            className="p-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700"
          >
            {muted ? <VolumeX size={15} /> : <Volume2 size={15} />}
          </button>

          <button
            type="button"
            onClick={() => setTutorialOpen(true)}
            title="Abrir tutorial breve"
            className="p-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-sky-300 border border-slate-700"
          >
            <HelpCircle size={15} />
          </button>

          <button
            type="button"
            onClick={handleRestart}
            title="Reiniciar emergencia y misión"
            className="px-2.5 py-1.5 rounded-xl bg-rose-600/90 hover:bg-rose-500 text-white text-xs font-extrabold flex items-center gap-1 shadow"
          >
            <RotateCcw size={13} />
            <span className="hidden sm:inline">Reiniciar</span>
          </button>
        </div>
      </header>

      {/* GUIDED MISSION CYCLE STEPPER STRIP */}
      <div data-wts-hud className="relative z-10 px-3 pt-1.5 hidden md:flex justify-center pointer-events-none">
        <div className="bg-slate-900/80 backdrop-blur-md border border-slate-700/70 rounded-full px-4 py-1 flex items-center gap-3 text-[11px] font-bold text-slate-300 shadow">
          <span
            className={
              snap.missionPhase === 'emitir_sos'
                ? 'text-amber-300 font-black'
                : 'text-emerald-400'
            }
          >
            1. Emitir Baliza y Golpes SOS (Chaleco WTS 014)
          </span>
          <span className="text-slate-600">→</span>
          <span
            className={
              snap.missionPhase === 'buscar_rssi'
                ? 'text-sky-300 font-black'
                : snap.rescuedCount > 0
                ? 'text-emerald-400'
                : 'text-slate-400'
            }
          >
            2. Rastrear Barras y Sonido RSSI 433 MHz
          </span>
          <span className="text-slate-600">→</span>
          <span
            className={
              snap.missionPhase === 'rescate_completado'
                ? 'text-emerald-300 font-black'
                : 'text-slate-400'
            }
          >
            3. Localizar y Rescatar ({snap.rescuedCount}/{snap.totalBeacons})
          </span>
        </div>
      </div>

      {/* DESKTOP SIDE PANELS (md and up) */}
      <main className="hidden md:flex absolute inset-x-4 top-24 bottom-4 z-10 justify-between items-start pointer-events-none">
        {/* Left Column: Active Mode Panel + Scenario Lab Panel */}
        <div className="pointer-events-auto flex flex-col gap-2.5 max-h-full overflow-y-auto pr-1">
          {snap.mode === 'chaleco' && vest014 && (
            <VestTelemetryPanel
              beacon={vest014}
              elapsedSec={snap.elapsedSec}
              onTapSos={() => engineRef.current?.registerVestTap()}
              onMoveNudge={() => engineRef.current?.moveVestWearer(0.8, 0.5, 0.16)}
              onSwitchToRescuer={() => handleModeChange('rescatista')}
            />
          )}

          {snap.mode === 'inspector' && (
            <DeviceInspectorOverlay
              selectedPartId={selectedHotspotId}
              preset={inspectorPreset}
              onSelectPreset={(p) => {
                setInspectorPreset(p);
                sceneRef.current?.setInspectorPreset(p);
              }}
              onSelectPart={(id) => {
                setSelectedHotspotId(id);
                sceneRef.current?.highlightInspectorPart(id);
              }}
              onOpenSchematic={() => setSchematicOpen(true)}
            />
          )}

          <ScenarioLabPanel
            mode={snap.mode}
            overrides={snap.overrides}
            activeBeacon={
              snap.mode === 'rescatista' ? activeBeacon : vest014
            }
            showRfRays={snap.rescuer.showEducationalRfRays}
            tabletopMode={snap.rescuer.tabletopCameraMode}
            logs={snap.logs}
            onToggleOverride={(key) =>
              engineRef.current?.toggleScenarioOverride(key)
            }
            onTriggerSosSequence={() =>
              engineRef.current?.triggerSimulatedSosSequence()
            }
            onToggleRfRays={() =>
              engineRef.current?.toggleEducationalRfRays()
            }
            onToggleTabletop={() =>
              engineRef.current?.toggleTabletopCamera()
            }
          />
        </div>

        {/* Right Column: Tactile Handheld Receiver Widget + Controls Legend */}
        <div className="pointer-events-auto flex flex-col items-end gap-2.5 max-h-full overflow-y-auto pl-1">
          <ReceiverWidget
            beacons={snap.beacons}
            selectedIndex={snap.rescuer.selectedBeaconIndex}
            links={snap.links}
            receiverBatteryPct={snap.rescuer.receiverBatteryPct}
            audioEnabled={snap.rescuer.audioGuideEnabled}
            canRescueNearbyId={snap.canRescueNearbyId}
            onPrevBeacon={() => {
              sceneRef.current?.pulseReceiverButton3D('prev');
              engineRef.current?.selectBeaconByDelta(-1);
            }}
            onNextBeacon={() => {
              sceneRef.current?.pulseReceiverButton3D('next');
              engineRef.current?.selectBeaconByDelta(1);
            }}
            onSelectBeaconIndex={(idx) =>
              engineRef.current?.selectBeaconByIndex(idx)
            }
            onToggleAudio={() => {
              sceneRef.current?.pulseReceiverButton3D('aux');
              engineRef.current?.toggleAudioGuide();
            }}
            onActionOk={() => {
              sceneRef.current?.pulseReceiverButton3D('ok');
              engineRef.current?.attemptRescue();
            }}
          />

          {/* Visible Keyboard & Mouse Controls Legend */}
          <div className="rounded-xl bg-slate-900/85 backdrop-blur-md border border-slate-700/80 px-3 py-2 text-[10px] text-slate-300 max-w-[312px] space-y-0.5 shadow-lg">
            <div className="font-extrabold text-sky-300 uppercase tracking-wider">
              Controles Visibles
            </div>
            <div>
              <b>WASD / Flechas:</b> Desplazarse · <b>Arrastrar ratón:</b>{' '}
              Mirar / Orbitar 3D
            </div>
            <div>
              <b>Espacio / Clic chaleco:</b> Golpe SOS · <b>Z / X:</b> Cambiar
              baliza · <b>E / Enter:</b> OK Rescatar
            </div>
          </div>
        </div>
      </main>

      {/* MOBILE / TABLET ADAPTIVE LAYOUT (< md) */}
      <div data-wts-hud className="md:hidden absolute inset-x-2.5 top-[68px] bottom-2.5 z-10 flex flex-col justify-between pointer-events-none">
        {/* Top Mobile Drawer Switcher + Panel */}
        <div className="pointer-events-auto space-y-1.5 max-h-[62vh] overflow-y-auto">
          <div className="flex gap-1 bg-slate-900/90 border border-slate-700 rounded-xl p-1 w-fit">
            <button
              type="button"
              onClick={() => setMobileDrawer('dispositivo')}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold ${
                mobileDrawer === 'dispositivo'
                  ? 'bg-sky-500 text-slate-950'
                  : 'text-slate-300'
              }`}
            >
              {snap.mode === 'chaleco'
                ? 'Chaleco'
                : snap.mode === 'inspector'
                ? 'Inspector'
                : 'Receptor'}
            </button>
            <button
              type="button"
              onClick={() => setMobileDrawer('situaciones')}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold flex items-center gap-1 ${
                mobileDrawer === 'situaciones'
                  ? 'bg-amber-400 text-slate-950'
                  : 'text-slate-300'
              }`}
            >
              <Sliders size={11} />
              <span>Situaciones</span>
            </button>
            <button
              type="button"
              onClick={() => setMobileDrawer('minimizado')}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold ${
                mobileDrawer === 'minimizado'
                  ? 'bg-slate-700 text-white'
                  : 'text-slate-400'
              }`}
            >
              Ver Escena 3D
            </button>
          </div>

          {mobileDrawer === 'dispositivo' && (
            <div className="flex justify-center">
              {snap.mode === 'chaleco' && vest014 ? (
                <VestTelemetryPanel
                  beacon={vest014}
                  elapsedSec={snap.elapsedSec}
                  onTapSos={() => engineRef.current?.registerVestTap()}
                  onMoveNudge={() =>
                    engineRef.current?.moveVestWearer(0.8, 0.5, 0.16)
                  }
                  onSwitchToRescuer={() => handleModeChange('rescatista')}
                />
              ) : snap.mode === 'inspector' ? (
                <DeviceInspectorOverlay
                  selectedPartId={selectedHotspotId}
                  preset={inspectorPreset}
                  onSelectPreset={(p) => {
                    setInspectorPreset(p);
                    sceneRef.current?.setInspectorPreset(p);
                  }}
                  onSelectPart={(id) => {
                    setSelectedHotspotId(id);
                    sceneRef.current?.highlightInspectorPart(id);
                  }}
                  onOpenSchematic={() => setSchematicOpen(true)}
                />
              ) : (
                <ReceiverWidget
                  beacons={snap.beacons}
                  selectedIndex={snap.rescuer.selectedBeaconIndex}
                  links={snap.links}
                  receiverBatteryPct={snap.rescuer.receiverBatteryPct}
                  audioEnabled={snap.rescuer.audioGuideEnabled}
                  canRescueNearbyId={snap.canRescueNearbyId}
                  compactMobile
                  onPrevBeacon={() => engineRef.current?.selectBeaconByDelta(-1)}
                  onNextBeacon={() => engineRef.current?.selectBeaconByDelta(1)}
                  onSelectBeaconIndex={(idx) =>
                    engineRef.current?.selectBeaconByIndex(idx)
                  }
                  onToggleAudio={() => engineRef.current?.toggleAudioGuide()}
                  onActionOk={() => engineRef.current?.attemptRescue()}
                />
              )}
            </div>
          )}

          {mobileDrawer === 'situaciones' && (
            <ScenarioLabPanel
              mode={snap.mode}
              overrides={snap.overrides}
              activeBeacon={
                snap.mode === 'rescatista' ? activeBeacon : vest014
              }
              showRfRays={snap.rescuer.showEducationalRfRays}
              tabletopMode={snap.rescuer.tabletopCameraMode}
              logs={snap.logs}
              onToggleOverride={(key) =>
                engineRef.current?.toggleScenarioOverride(key)
              }
              onTriggerSosSequence={() =>
                engineRef.current?.triggerSimulatedSosSequence()
              }
              onToggleRfRays={() =>
                engineRef.current?.toggleEducationalRfRays()
              }
              onToggleTabletop={() =>
                engineRef.current?.toggleTabletopCamera()
              }
            />
          )}
        </div>

        {/* Bottom On-Screen Touch D-Pad + Action Buttons */}
        <MobileTouchControls
          mode={snap.mode}
          canRescueNearby={Boolean(snap.canRescueNearbyId)}
          onSetMove={(f, s, t) => sceneRef.current?.setTouchMove(f, s, t)}
          onTapSos={() => engineRef.current?.registerVestTap()}
          onRescueOk={() => engineRef.current?.attemptRescue()}
        />
      </div>

      {/* Desktop Bottom-Center Rescue Proximity Prompt / Touch Pad option */}
      {snap.mode === 'rescatista' && snap.canRescueNearbyId && (
        <div data-wts-hud className="hidden md:flex absolute bottom-6 left-1/2 -translate-x-1/2 z-20 pointer-events-auto">
          <button
            type="button"
            onClick={() => engineRef.current?.attemptRescue()}
            className="px-6 py-3 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-sm border-2 border-emerald-200 shadow-2xl animate-bounce"
          >
            ¡Superviviente {snap.canRescueNearbyId} localizado! Pulsa OK o aquí
            para rescatar
          </button>
        </div>
      )}

      {/* Modals & Overlays */}
      <TutorialModal
        open={tutorialOpen}
        onClose={() => setTutorialOpen(false)}
      />

      <SchematicReferenceModal
        open={schematicOpen}
        onClose={() => setSchematicOpen(false)}
      />

      <VrControlsModal
        open={vrOpen}
        onClose={() => setVrOpen(false)}
        onStartVr={handleStartVr}
        onStopVr={handleStopVr}
        caps={xrCaps}
        turnMode={vrTurnMode}
        onTurnModeChange={setVrTurnMode}
      />

      <MissionOutcomeOverlay
        phase={snap.missionPhase}
        beacons={snap.beacons}
        elapsedSec={snap.elapsedSec}
        dismissed={outcomeDismissed}
        onDismiss={() => setOutcomeDismissed(true)}
        onRestart={handleRestart}
      />
    </div>
  );
};

export default App;
