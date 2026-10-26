import {
  GameMode,
  MissionPhase,
  ObstacleZone,
  ReceiverLinkState,
  ScenarioOverrides,
  SimulationSnapshot,
  SurvivorBeacon,
  TelemetryPacket,
  WTSExplanationLog,
} from '../types/wts';
import {
  createInitialBeacons,
  INITIAL_OBSTACLES,
  MISSION_DURATION_SEC,
  RESCUE_DISTANCE_METERS,
} from './scenarioData';
import { evaluateSosTaps } from './sosDetector';
import { runTinyMLInference } from './tinymlProcessor';
import { computeRf433Link } from './rfPropagation';

export type SoundEventHook = (
  event:
    | { type: 'tap'; confidence: number }
    | { type: 'sos_confirmed' }
    | { type: 'rf_tx'; beaconId: string }
    | {
        type: 'rssi_ping';
        rssiDbm: number;
        bars: number;
        isLost: boolean;
      }
    | { type: 'button' }
    | { type: 'pwm_on' }
    | { type: 'alert'; tone: 'warn' | 'alert' | 'info' }
    | { type: 'rescue_complete'; allDone: boolean }
) => void;

export class WTSSimulationEngine {
  private elapsedSec = 0;
  private remainingSec = MISSION_DURATION_SEC;
  private missionPhase: MissionPhase = 'emitir_sos';
  private mode: GameMode = 'chaleco';

  private beacons: SurvivorBeacon[] = [];
  private obstacles: ObstacleZone[] = [];
  private links: Record<string, ReceiverLinkState> = {};

  private rescuer = {
    x: 0,
    z: 21,
    headingRad: 0,
    speed: 0,
    receiverBatteryPct: 98,
    selectedBeaconIndex: 0,
    audioGuideEnabled: true,
    showEducationalRfRays: false,
    tabletopCameraMode: false,
  };

  private overrides: ScenarioOverrides = {
    coldEnvironment: false,
    forcedImmobility: false,
    weakSignalShield: false,
    lowBatteryTest: false,
  };

  private logs: WTSExplanationLog[] = [];
  private logCounter = 1;
  private historySampleAccum = 0;
  private rssiPingAccum = 0;

  private xrSupported = false;
  private xrActive = false;
  private xrSurfacePlaced = false;

  private onSound?: SoundEventHook;

  constructor(onSound?: SoundEventHook) {
    this.onSound = onSound;
    this.reset();
  }

  public setSoundHook(hook: SoundEventHook): void {
    this.onSound = hook;
  }

  public setXrStatus(status: {
    supported?: boolean;
    active?: boolean;
    surfacePlaced?: boolean;
  }): void {
    if (status.supported !== undefined) this.xrSupported = status.supported;
    if (status.active !== undefined) this.xrActive = status.active;
    if (status.surfacePlaced !== undefined)
      this.xrSurfacePlaced = status.surfacePlaced;
  }

  public reset(): void {
    this.elapsedSec = 0;
    this.remainingSec = MISSION_DURATION_SEC;
    this.missionPhase = 'emitir_sos';
    this.mode = 'chaleco';

    this.beacons = createInitialBeacons();
    this.obstacles = INITIAL_OBSTACLES.map((o) => ({ ...o }));

    this.rescuer = {
      x: 0,
      z: 21,
      headingRad: 0,
      speed: 0,
      receiverBatteryPct: 98,
      selectedBeaconIndex: 0,
      audioGuideEnabled: true,
      showEducationalRfRays: false,
      tabletopCameraMode: false,
    };

    this.overrides = {
      coldEnvironment: false,
      forcedImmobility: false,
      weakSignalShield: false,
      lowBatteryTest: false,
    };

    this.links = {};
    for (const b of this.beacons) {
      this.links[b.id] = {
        beaconId: b.id,
        lastPacket: null,
        rssiDbm: -115,
        signalBars: 0,
        packetAgeSec: 0,
        isStale: false,
        isLost: true,
        obstacleLossDb: 0,
        blockingMaterials: [],
        packetsReceived: 0,
        packetsDropped: 0,
        rssiHistory: Array(28).fill(-110),
      };
    }

    this.logs = [];
    this.logCounter = 1;
    this.historySampleAccum = 0;
    this.rssiPingAccum = 0;

    this.pushLog(
      'Misión',
      'Sismo M7.1 · Emergencia iniciada',
      'Cuatro arneses WTS operan de forma autónoma sin internet ni red eléctrica. Empieza probando el chaleco WTS 014 (golpes SOS) y luego cambia al Rescatista para localizar a los supervivientes.',
      'info'
    );

    // Perform an initial RF pass so nearby beacons decode initial frame if reachable
    this.step(0.1);
  }

  public getObstacles(): ObstacleZone[] {
    return this.obstacles;
  }

  public setMode(newMode: GameMode): void {
    if (this.mode === newMode) return;
    this.mode = newMode;
    this.onSound?.({ type: 'button' });

    if (newMode === 'chaleco') {
      this.pushLog(
        'IMU',
        'Modo Persona con el Chaleco (WTS 014)',
        'Controlas a la persona que porta el arnés WTS 014. Muévete, permanece inmóvil o da 3+ golpes rítmicos para activar la alerta "Posible SOS".',
        'info'
      );
    } else if (newMode === 'rescatista') {
      if (this.missionPhase === 'emitir_sos') {
        this.missionPhase = 'buscar_rssi';
      }
      this.pushLog(
        'Receptor',
        'Modo Rescatista activado · Receptor 433 MHz en mano',
        'Desplázate entre los edificios dañados. Usa las barras RSSI y el pulso sonoro (no es GPS) evitando muros densos de hormigón y acero.',
        'info'
      );
    } else {
      this.pushLog(
        'TinyML',
        'Inspector 3D de Dispositivos WTS',
        'Gira 360° el arnés pectoral y el receptor. Haz clic sobre cada módulo para inspeccionar sensores, capa térmica PWM, IMU y radio 433 MHz.',
        'info'
      );
    }
  }

  public selectBeaconByDelta(delta: number): void {
    const len = this.beacons.length;
    this.rescuer.selectedBeaconIndex =
      (this.rescuer.selectedBeaconIndex + delta + len) % len;
    const selected = this.beacons[this.rescuer.selectedBeaconIndex];
    this.onSound?.({ type: 'button' });
    this.pushLog(
      'Receptor',
      `Canal sintonizado: ${selected.id}`,
      `Receptor escuchando tramas 433 MHz de ${selected.id}. Revisa antigüedad del paquete y barras RSSI antes de avanzar.`,
      'info'
    );
  }

  public selectBeaconByIndex(index: number): void {
    if (index < 0 || index >= this.beacons.length) return;
    this.rescuer.selectedBeaconIndex = index;
    const selected = this.beacons[index];
    this.onSound?.({ type: 'button' });
    this.pushLog(
      'Receptor',
      `Baliza seleccionada: ${selected.id}`,
      `Monitoreando ${selected.id}. Si el enlace se bloquea tras escombros, la pantalla indicará dato desactualizado.`,
      'info'
    );
  }

  public toggleAudioGuide(): void {
    this.rescuer.audioGuideEnabled = !this.rescuer.audioGuideEnabled;
    this.onSound?.({ type: 'button' });
    this.pushLog(
      'Receptor',
      this.rescuer.audioGuideEnabled
        ? 'Guía acústica RSSI activada'
        : 'Guía acústica RSSI silenciada',
      this.rescuer.audioGuideEnabled
        ? 'El tono y la frecuencia de pulsos aumentan conforme crece la potencia recibida en 433 MHz.'
        : 'Búsqueda guiada únicamente por barras visuales en pantalla.',
      'info'
    );
  }

  public toggleEducationalRfRays(): void {
    this.rescuer.showEducationalRfRays = !this.rescuer.showEducationalRfRays;
    this.onSound?.({ type: 'button' });
    this.pushLog(
      'RF 433 MHz',
      this.rescuer.showEducationalRfRays
        ? 'Visualización educativa de rayos RF activada'
        : 'Visualización educativa de rayos RF oculta',
      this.rescuer.showEducationalRfRays
        ? 'Se muestran en 3D las líneas de propagación 433 MHz y cómo se atenúan al cruzar madera, ladrillo, hormigón o acero.'
        : 'Modo realista de búsqueda a ciegas mediante RSSI.',
      'info'
    );
  }

  public toggleTabletopCamera(): void {
    this.rescuer.tabletopCameraMode = !this.rescuer.tabletopCameraMode;
    this.onSound?.({ type: 'button' });
  }

  /**
   * Player movement as Survivor wearing WTS 014
   */
  public moveVestWearer(dxNorm: number, dzNorm: number, dt: number): void {
    const vest = this.beacons[0]; // WTS 014
    if (!vest || vest.rescued || this.overrides.forcedImmobility) return;

    const mag = Math.hypot(dxNorm, dzNorm);
    if (mag < 0.05) return;

    // Constrained movement inside structural shelter pocket around (-9, -15.5)
    const nx = Math.max(-10.3, Math.min(-7.7, vest.x + (dxNorm / mag) * 1.4 * dt));
    const nz = Math.max(-16.8, Math.min(-14.2, vest.z + (dzNorm / mag) * 1.4 * dt));
    vest.x = nx;
    vest.z = nz;

    const wasStill = vest.stillnessSec >= 12;
    vest.stillnessSec = 0;
    vest.movementMode = 'activo';
    vest.imuG = 1.24 + Math.sin(this.elapsedSec * 9) * 0.16;
    vest.imuAxis = [
      Number((0.22 * dxNorm).toFixed(2)),
      0.95,
      Number((0.22 * dzNorm).toFixed(2)),
    ];

    if (wasStill) {
      this.pushLog(
        'IMU',
        'Movimiento voluntario detectado en WTS 014',
        'El acelerómetro dorsal capta desplazamiento suave; TinyML reinicia el temporizador de inmovilidad.',
        'info'
      );
    }
  }

  /**
   * Player taps rhythmic SOS on the WTS 014 harness
   */
  public registerVestTap(): void {
    const vest = this.beacons[0]; // WTS 014
    if (!vest || vest.rescued) return;

    const prevAlert = vest.sosAlert;
    const evalRes = evaluateSosTaps(
      vest.tapTimestamps,
      this.elapsedSec,
      this.elapsedSec,
      prevAlert
    );

    vest.tapTimestamps = evalRes.recentTaps;
    vest.sosConfidence = evalRes.confidence;
    vest.imuG = 2.65; // sharp accelerometer impact spike
    vest.imuAxis = [0.18, 1.85, -0.92];
    vest.movementMode = 'golpes_sos';

    this.onSound?.({ type: 'tap', confidence: evalRes.confidence });

    if (evalRes.triggeredNow || (evalRes.confidence >= 80 && !vest.sosAlert)) {
      vest.sosAlert = true;
      vest.sosExpiresAt = this.elapsedSec + 45;
      // Trigger immediate priority RF 433 MHz burst!
      vest.nextTxAt = this.elapsedSec;
      if (this.missionPhase === 'emitir_sos') {
        this.missionPhase = 'buscar_rssi';
      }
      this.onSound?.({ type: 'sos_confirmed' });
      this.pushLog(
        'TinyML',
        '¡POSIBLE SOS detectado por golpes rítmicos!',
        `IMU midió ${evalRes.recentTaps.length} impactos con cadencia ${
          evalRes.cadenceHz ?? 2.0
        } Hz. TinyML activa "Posible SOS" y fuerza una ráfaga inmediata por 433 MHz.`,
        'alert'
      );
    } else {
      this.pushLog(
        'IMU',
        `Golpe captado en arnés (${evalRes.recentTaps.length}/3)`,
        `${evalRes.patternLabel}. Da golpes rítmicos seguidos para que TinyML confirme "Posible SOS".`,
        'info'
      );
    }
  }

  /**
   * Automated 3-tap SOS demonstration trigger from the Scenario Panel
   */
  public triggerSimulatedSosSequence(): void {
    const target =
      this.mode === 'rescatista'
        ? this.beacons[this.rescuer.selectedBeaconIndex]
        : this.beacons[0];
    if (!target || target.rescued) return;

    const t = this.elapsedSec;
    target.tapTimestamps = [t - 0.9, t - 0.45, t];
    target.sosConfidence = 96;
    target.sosAlert = true;
    target.sosExpiresAt = t + 50;
    target.imuG = 2.55;
    target.movementMode = 'golpes_sos';
    target.nextTxAt = t; // transmit right away

    if (this.missionPhase === 'emitir_sos') {
      this.missionPhase = 'buscar_rssi';
    }

    this.onSound?.({ type: 'sos_confirmed' });
    this.pushLog(
      'TinyML',
      `Secuencia SOS activada en ${target.id}`,
      `El IMU dorsal registró 3 golpes rítmicos (~2.2 Hz). El MCU etiqueta la trama como "Posible SOS" y acorta el intervalo RF 433 MHz.`,
      'alert'
    );
  }

  /**
   * Scenario Panel Toggles: Cold/Hypothermia, Immobility, Weak Signal, Low Battery, Sensor Contact
   */
  public toggleScenarioOverride(
    key:
      | keyof ScenarioOverrides
      | 'sensorContactLoss'
  ): void {
    const target =
      this.mode === 'rescatista'
        ? this.beacons[this.rescuer.selectedBeaconIndex]
        : this.beacons[0];

    if (key === 'sensorContactLoss') {
      if (!target) return;
      target.sensorContactOk = !target.sensorContactOk;
      this.onSound?.({
        type: 'alert',
        tone: target.sensorContactOk ? 'info' : 'warn',
      });
      this.pushLog(
        'TinyML',
        target.sensorContactOk
          ? `Contacto de sensores restablecido en ${target.id}`
          : `Pérdida de contacto óptico simulada en ${target.id} (Prioridad NEGRO educativa)`,
        target.sensorContactOk
          ? 'Los sensores PPG y térmico vuelven a entregar lecturas válidas al modelo TinyML.'
          : 'Muestra el indicador NEGRO como lectura crítica no concluyente que exige verificación humana directa, sin deducir nunca fallecimiento.',
        target.sensorContactOk ? 'info' : 'warn'
      );
      return;
    }

    this.overrides[key] = !this.overrides[key];
    const active = this.overrides[key];

    if (key === 'coldEnvironment') {
      for (const b of this.beacons) {
        if (b.rescued) continue;
        b.hypothermiaEvent = active;
        if (active) {
          b.ambientTempC = 5.5;
          b.tempC = Math.min(b.tempC, 35.25);
        } else {
          b.ambientTempC = 16.5;
        }
      }
      this.onSound?.({ type: active ? 'pwm_on' : 'button' });
      this.pushLog(
        'Capa Térmica PWM',
        active
          ? 'Evento de frío / hipotermia simulada activado'
          : 'Ambiente frío desactivado',
        active
          ? 'La temperatura desciende a ~35.2 °C. El MCU enciende por pulsos (PWM) la capa térmica serpentina del pecho: calienta gradualmente pero incrementa el consumo de batería.'
          : 'La temperatura ambiente se estabiliza y el control PWM reduce su ciclo de trabajo para ahorrar energía.',
        active ? 'warn' : 'info'
      );
    } else if (key === 'forcedImmobility') {
      if (target && !target.rescued) {
        if (active) {
          target.stillnessSec = Math.max(target.stillnessSec, 22);
          target.movementMode = 'inmovil';
          target.imuG = 1.0;
        } else {
          target.stillnessSec = 0;
          target.movementMode = 'leve';
        }
      }
      this.onSound?.({ type: 'alert', tone: active ? 'warn' : 'info' });
      this.pushLog(
        'IMU',
        active
          ? 'Situación de inmovilidad prolongada activada'
          : 'Inmovilidad forzada desactivada',
        active
          ? 'El IMU detecta ausencia total de movimiento (>20 s). TinyML eleva la prioridad a AMARILLO para alertar al equipo de rescate.'
          : 'El portador recupera micro-movimientos posturales normales.',
        active ? 'warn' : 'info'
      );
    } else if (key === 'weakSignalShield') {
      this.onSound?.({ type: 'alert', tone: active ? 'warn' : 'info' });
      this.pushLog(
        'RF 433 MHz',
        active
          ? 'Apantallamiento severo de escombros (+22 dB)'
          : 'Apantallamiento adicional retirado',
        active
          ? 'Simula colapso denso con malla metálica: el RSSI cae, aumentan los paquetes perdidos y el receptor advertirá datos desactualizados.'
          : 'Propagación RF 433 MHz restaurada a las condiciones normales de los edificios del mapa.',
        active ? 'warn' : 'info'
      );
    } else if (key === 'lowBatteryTest') {
      for (const b of this.beacons) {
        if (b.rescued) continue;
        b.batteryPct = active ? 14 : Math.max(b.batteryPct, 72);
      }
      this.onSound?.({ type: 'alert', tone: active ? 'alert' : 'info' });
      this.pushLog(
        'Batería',
        active
          ? 'Batería baja simulada (14%)'
          : 'Nivel de batería restaurado (>72%)',
        active
          ? 'Con batería <20%, el MCU recorta el PWM térmico al 35% (modo ahorro) y espacia las ráfagas RF 433 MHz para prolongar la localización.'
          : 'Baterías recargadas; potencia nominal RF y control térmico completo disponibles.',
        active ? 'alert' : 'info'
      );
    }
  }

  /**
   * Rescuer navigation in 3D space (with obstacle collision sliding)
   */
  public moveRescuer(
    forwardInput: number,
    strafeInput: number,
    turnInput: number,
    dt: number
  ): void {
    if (Math.abs(turnInput) > 0.001) {
      this.rescuer.headingRad += turnInput * dt;
    }

    const inputMag = Math.hypot(forwardInput, strafeInput);
    if (inputMag < 0.02) {
      this.rescuer.speed = 0;
      return;
    }

    const normF = forwardInput / Math.max(1, inputMag);
    const normS = strafeInput / Math.max(1, inputMag);
    const walkSpeed = 6.2; // meters/sec brisk rescue pace

    // Heading 0 looks toward -Z; right is +X
    const forwardX = Math.sin(this.rescuer.headingRad);
    const forwardZ = -Math.cos(this.rescuer.headingRad);
    const rightX = Math.cos(this.rescuer.headingRad);
    const rightZ = Math.sin(this.rescuer.headingRad);

    const vx = (forwardX * normF + rightX * normS) * walkSpeed;
    const vz = (forwardZ * normF + rightZ * normS) * walkSpeed;

    const targetX = Math.max(-29, Math.min(29, this.rescuer.x + vx * dt));
    const targetZ = Math.max(-28, Math.min(28, this.rescuer.z + vz * dt));

    // Slide along obstacles separately on X and Z
    if (!this.collidesWithObstacles(targetX, this.rescuer.z, 0.75)) {
      this.rescuer.x = targetX;
    }
    if (!this.collidesWithObstacles(this.rescuer.x, targetZ, 0.75)) {
      this.rescuer.z = targetZ;
    }

    this.rescuer.speed = walkSpeed * Math.min(1, inputMag);
  }

  /**
   * Updates rescuer position directly from WebXR real-world camera pose
   */
  public setRescuerPoseFromXR(
    worldX: number,
    worldZ: number,
    headingRad: number
  ): void {
    this.rescuer.x = Math.max(-30, Math.min(30, worldX));
    this.rescuer.z = Math.max(-30, Math.min(30, worldZ));
    this.rescuer.headingRad = headingRad;
  }

  public setRescuerHeading(headingRad: number): void {
    this.rescuer.headingRad = headingRad;
  }

  private collidesWithObstacles(x: number, z: number, radius: number): boolean {
    for (const obs of this.obstacles) {
      const angle = -(obs.rotationY ?? 0);
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      const dx = x - obs.x;
      const dz = z - obs.z;
      const lx = dx * cos - dz * sin;
      const lz = dx * sin + dz * cos;
      if (
        Math.abs(lx) < obs.hx + radius &&
        Math.abs(lz) < obs.hz + radius
      ) {
        return true;
      }
    }
    return false;
  }

  /**
   * Attempts to rescue a survivor when the rescuer presses OK near a shelter
   */
  public attemptRescue(): boolean {
    const nearby = this.findNearbyRescuableBeacon();
    this.onSound?.({ type: 'button' });

    if (!nearby) {
      const selected = this.beacons[this.rescuer.selectedBeaconIndex];
      const link = selected ? this.links[selected.id] : null;
      this.pushLog(
        'Receptor',
        'Aún fuera del punto de extracción',
        link && link.signalBars >= 4
          ? `Señal fuerte de ${selected.id}: busca el hueco estructural alrededor del edificio colapsado y acércate unos pasos más.`
          : `Sigue explorando con las barras RSSI y el sonido en 433 MHz hasta dar con el punto de abrigo.`,
        'warn'
      );
      return false;
    }

    nearby.rescued = true;
    nearby.rescuedAtSec = Math.round(this.elapsedSec);
    nearby.pwmActive = false;
    nearby.pwmDuty = 0;
    nearby.pwmPulseWave = 0;

    const remainingBeacons = this.beacons.filter((b) => !b.rescued);
    const allDone = remainingBeacons.length === 0;

    this.onSound?.({ type: 'rescue_complete', allDone });

    this.pushLog(
      'Misión',
      `¡Superviviente ${nearby.id} localizado y rescatado!`,
      allDone
        ? '¡Misión completada! Todos los portadores del chaleco WTS han sido puestos a salvo a tiempo.'
        : `Extracción exitosa con hebilla rápida en ${nearby.sectorName}. Quedan ${remainingBeacons.length} baliza(s) activa(s).`,
      'success'
    );

    if (allDone) {
      this.missionPhase = 'rescate_completado';
    } else {
      // Auto-select next unrescued beacon for convenience
      const nextIdx = this.beacons.findIndex((b) => !b.rescued);
      if (nextIdx >= 0) {
        this.rescuer.selectedBeaconIndex = nextIdx;
      }
    }

    return true;
  }

  private findNearbyRescuableBeacon(): SurvivorBeacon | null {
    let closest: SurvivorBeacon | null = null;
    let bestDist = Infinity;
    for (const b of this.beacons) {
      if (b.rescued) continue;
      const d = Math.hypot(b.x - this.rescuer.x, b.z - this.rescuer.z);
      if (d <= RESCUE_DISTANCE_METERS && d < bestDist) {
        bestDist = d;
        closest = b;
      }
    }
    return closest;
  }

  /**
   * Main simulation tick (dt in seconds)
   */
  public step(dt: number, deterministicMode = false): void {
    const clampedDt = Math.min(0.25, Math.max(0.001, dt));
    this.elapsedSec += clampedDt;

    if (
      this.missionPhase !== 'rescate_completado' &&
      this.missionPhase !== 'tiempo_agotado'
    ) {
      this.remainingSec = Math.max(0, this.remainingSec - clampedDt);
      if (this.remainingSec <= 0) {
        this.missionPhase = 'tiempo_agotado';
        this.pushLog(
          'Misión',
          'Tiempo de ventana operativa agotado',
          'Puedes pulsar Reiniciar para intentar mejorar la priorización y ruta de búsqueda.',
          'alert'
        );
      }
    }

    // Drain receiver battery very gently
    this.rescuer.receiverBatteryPct = Math.max(
      5,
      this.rescuer.receiverBatteryPct - clampedDt * 0.015
    );

    const sampleHistoryNow = this.historySampleAccum + clampedDt >= 0.45;
    if (sampleHistoryNow) {
      this.historySampleAccum = 0;
    } else {
      this.historySampleAccum += clampedDt;
    }

    // Update each WTS chest harness
    for (const b of this.beacons) {
      if (b.rescued) continue;

      // 1. Update SOS window & decay
      if (b.sosAlert && this.elapsedSec > b.sosExpiresAt) {
        b.sosAlert = false;
      }
      const sosEval = evaluateSosTaps(
        b.tapTimestamps,
        null,
        this.elapsedSec,
        b.sosAlert
      );
      b.tapTimestamps = sosEval.recentTaps;
      if (!b.sosAlert) {
        b.sosConfidence = sosEval.confidence;
      }

      // 2. Movement & IMU evolution
      if (this.overrides.forcedImmobility && b.isPlayerControlledVest) {
        b.stillnessSec += clampedDt;
        b.movementMode = 'inmovil';
        b.imuG = 1.0;
        b.imuAxis = [0.01, 0.99, 0.01];
      } else if (b.isPlayerControlledVest) {
        b.stillnessSec += clampedDt;
        // Decay impact spike back toward resting gravity 1.0g
        b.imuG = 1.0 + (b.imuG - 1.0) * Math.exp(-clampedDt * 5.5);
        if (b.stillnessSec > 1.5 && b.imuG < 1.06) {
          b.movementMode = b.stillnessSec >= 16 ? 'inmovil' : 'leve';
        }
      } else {
        // NPC survivors subtle motion or stillness
        if (b.id === 'WTS 032') {
          b.stillnessSec = Math.max(0, (b.stillnessSec + clampedDt) % 9);
          b.imuG = 1.06 + Math.sin(this.elapsedSec * 2.2) * 0.05;
        } else {
          b.stillnessSec += clampedDt;
          b.imuG = 1.0 + Math.sin(this.elapsedSec * 1.1) * 0.01;
        }
      }

      // 3. Temperature physics: ambient cooling vs flexible thermal PWM heating!
      const isCold = b.hypothermiaEvent || this.overrides.coldEnvironment;
      const coolingRatePerSec = isCold ? 0.026 : 0.004;
      const pwmWarmingPerSec = b.pwmActive
        ? (b.pwmDuty / 100) * 0.048
        : 0.003; // basal metabolism

      b.tempC = Math.max(
        34.2,
        Math.min(
          36.9,
          b.tempC + (pwmWarmingPerSec - coolingRatePerSec) * clampedDt
        )
      );

      // 4. Pulse & SpO2 realistic micro-fluctuations
      const wobble = deterministicMode
        ? 0
        : Math.sin(this.elapsedSec * 1.7 + b.seqCounter) * 0.35;
      if (b.id === 'WTS 007') {
        // Gradually stressed survivor to highlight RED priority urgency
        b.spo2 = Math.max(87, Math.min(91, b.spo2 + wobble * 0.04));
        b.hr = Math.max(124, Math.min(136, b.hr - wobble * 0.15));
      } else {
        const coldHrBoost = b.tempC < 35.4 ? 8 : 0;
        const sosHrBoost = b.sosAlert ? 10 : 0;
        const targetHr = 88 + coldHrBoost + sosHrBoost;
        b.hr += (targetHr - b.hr) * clampedDt * 0.4 + wobble * 0.12;
        b.spo2 = Math.max(93, Math.min(99, b.spo2 + wobble * 0.03));
      }

      // 5. Local MCU + TinyML Inference & PWM Controller
      const prevPwmActive = b.pwmActive;
      const ml = runTinyMLInference({
        hr: b.hr,
        spo2: b.spo2,
        tempC: b.tempC,
        stillnessSec: b.stillnessSec,
        sosAlert: b.sosAlert,
        sensorContactOk: b.sensorContactOk,
        hypothermiaEvent: isCold,
        pwmCurrentlyActive: b.pwmActive,
        batteryPct: b.batteryPct,
        elapsedSec: this.elapsedSec,
      });

      b.priority = ml.priority;
      b.priorityReason = ml.priorityReason;
      b.tinymlStateLabel = ml.tinymlStateLabel;
      b.pwmActive = ml.pwmActive;
      b.pwmDuty = ml.pwmDuty;
      b.pwmPulseWave = ml.pwmPulseWave;
      b.powerConsumptionMw = ml.powerConsumptionMw;

      if (!prevPwmActive && b.pwmActive && b.isPlayerControlledVest) {
        this.onSound?.({ type: 'pwm_on' });
        this.pushLog(
          'Capa Térmica PWM',
          `Capa térmica encendida por pulsos en ${b.id} (${b.pwmDuty}%)`,
          `Descenso térmico detectado (${b.tempC.toFixed(
            1
          )} °C). El MCU modula pulsos PWM para recuperar temperatura gradualmente controlando el gasto energético.`,
          'warn'
        );
      }

      // 6. Battery consumption (PWM draws noticeably more battery than idle sensing!)
      // Scaled for gameplay visibility so player sees real battery management over a 6-min mission
      const drainPctPerSec =
        0.012 + (b.pwmActive ? (b.pwmDuty / 100) * 0.14 : 0);
      b.batteryPct = Math.max(0, b.batteryPct - drainPctPerSec * clampedDt);

      // Adjust RF TX interval according to state & battery
      if (b.batteryPct < 18) {
        b.txIntervalSec = 3.1; // eco beacon spacing
      } else if (b.sosAlert || b.priority === 'ROJO') {
        b.txIntervalSec = 0.95; // rapid emergency cadence
      } else {
        b.txIntervalSec = 1.55;
      }

      // 7. Sample waveform buffers for the LCD sparklines
      if (sampleHistoryNow) {
        const ecgSpike =
          Math.sin(this.elapsedSec * (b.hr / 9.5)) > 0.75 ? 9 : 0;
        b.hrWaveHistory.push(Number((b.hr + ecgSpike).toFixed(1)));
        if (b.hrWaveHistory.length > 32) b.hrWaveHistory.shift();

        const plethWave = Math.sin(this.elapsedSec * (b.hr / 12)) * 1.4;
        b.spo2WaveHistory.push(Number((b.spo2 + plethWave).toFixed(1)));
        if (b.spo2WaveHistory.length > 32) b.spo2WaveHistory.shift();

        b.tempHistory.push(Number(b.tempC.toFixed(2)));
        if (b.tempHistory.length > 32) b.tempHistory.shift();

        b.imuHistory.push(Number(b.imuG.toFixed(2)));
        if (b.imuHistory.length > 32) b.imuHistory.shift();
      }

      // 8. RF 433 MHz link calculation & periodic packet transmission
      const link = this.links[b.id];
      const rf = computeRf433Link({
        beaconX: b.x,
        beaconZ: b.z,
        rescuerX: this.rescuer.x,
        rescuerZ: this.rescuer.z,
        rescuerHeadingRad: this.rescuer.headingRad,
        beaconBatteryPct: b.batteryPct,
        obstacles: this.obstacles,
        weakSignalOverride: this.overrides.weakSignalShield,
        deterministicMode,
      });

      link.obstacleLossDb = rf.obstacleLossDb;
      link.blockingMaterials = rf.blockingMaterials;

      if (this.elapsedSec >= b.nextTxAt && b.batteryPct > 0) {
        b.seqCounter += 1;
        b.lastTxFlashAt = this.elapsedSec;
        b.nextTxAt = this.elapsedSec + b.txIntervalSec;

        if (b.isPlayerControlledVest && this.mode === 'chaleco') {
          this.onSound?.({ type: 'rf_tx', beaconId: b.id });
        }

        if (rf.canDecodePacket) {
          const pkt: TelemetryPacket = {
            beaconId: b.id,
            seq: b.seqCounter,
            timestamp: this.elapsedSec,
            hr: Math.round(b.hr),
            spo2: Math.round(b.spo2),
            tempC: Number(b.tempC.toFixed(1)),
            imuG: Number(b.imuG.toFixed(2)),
            stillnessSec: Math.round(b.stillnessSec),
            sosAlert: b.sosAlert,
            priority: b.priority,
            priorityReason: b.priorityReason,
            batteryPct: Math.round(b.batteryPct),
            pwmActive: b.pwmActive,
            pwmDuty: b.pwmDuty,
            sensorContactOk: b.sensorContactOk,
          };
          link.lastPacket = pkt;
          link.packetsReceived += 1;
        } else {
          link.packetsDropped += 1;
        }
      }

      // Update live RSSI & packet staleness on receiver
      link.rssiDbm = rf.canDecodePacket || rf.signalBars > 0 ? rf.rssiDbm : -118;
      link.signalBars = rf.signalBars;

      if (link.lastPacket) {
        link.packetAgeSec = Math.max(
          0,
          this.elapsedSec - link.lastPacket.timestamp
        );
        link.isStale = link.packetAgeSec > 4.5;
        link.isLost = link.packetAgeSec > 10.0 || rf.signalBars === 0;
      } else {
        link.packetAgeSec = this.elapsedSec;
        link.isStale = true;
        link.isLost = true;
      }

      if (sampleHistoryNow) {
        link.rssiHistory.push(link.rssiDbm);
        if (link.rssiHistory.length > 28) link.rssiHistory.shift();
      }
    }

    // 9. Acoustic RSSI guide ping when in Rescuer mode
    if (this.mode === 'rescatista' && this.rescuer.audioGuideEnabled) {
      const activeBeacon = this.beacons[this.rescuer.selectedBeaconIndex];
      if (activeBeacon && !activeBeacon.rescued) {
        const activeLink = this.links[activeBeacon.id];
        // Faster beep cadence when RSSI bars are higher (geiger-like RF search guide!)
        const pingPeriod =
          activeLink.signalBars >= 5
            ? 0.28
            : activeLink.signalBars === 4
            ? 0.44
            : activeLink.signalBars === 3
            ? 0.68
            : activeLink.signalBars === 2
            ? 0.98
            : activeLink.signalBars === 1
            ? 1.4
            : 2.2;

        this.rssiPingAccum += clampedDt;
        if (this.rssiPingAccum >= pingPeriod) {
          this.rssiPingAccum = 0;
          this.onSound?.({
            type: 'rssi_ping',
            rssiDbm: activeLink.rssiDbm,
            bars: activeLink.signalBars,
            isLost: activeLink.isLost,
          });
        }
      }
    }
  }

  private pushLog(
    module: WTSExplanationLog['module'],
    title: string,
    detail: string,
    tone: WTSExplanationLog['tone']
  ): void {
    const mins = Math.floor(this.elapsedSec / 60)
      .toString()
      .padStart(2, '0');
    const secs = Math.floor(this.elapsedSec % 60)
      .toString()
      .padStart(2, '0');

    const entry: WTSExplanationLog = {
      id: `log-${this.logCounter++}`,
      timeLabel: `${mins}:${secs}`,
      module,
      title,
      detail,
      tone,
    };

    this.logs = [entry, ...this.logs].slice(0, 18);
  }

  public getSnapshot(): SimulationSnapshot {
    const nearby = this.findNearbyRescuableBeacon();
    const rescuedCount = this.beacons.filter((b) => b.rescued).length;

    return {
      elapsedSec: this.elapsedSec,
      remainingSec: this.remainingSec,
      missionPhase: this.missionPhase,
      mode: this.mode,
      beacons: this.beacons.map((b) => ({
        ...b,
        tapTimestamps: [...b.tapTimestamps],
        hrWaveHistory: [...b.hrWaveHistory],
        spo2WaveHistory: [...b.spo2WaveHistory],
        tempHistory: [...b.tempHistory],
        imuHistory: [...b.imuHistory],
      })),
      links: Object.fromEntries(
        Object.entries(this.links).map(([k, v]) => [
          k,
          {
            ...v,
            lastPacket: v.lastPacket ? { ...v.lastPacket } : null,
            blockingMaterials: [...v.blockingMaterials],
            rssiHistory: [...v.rssiHistory],
          },
        ])
      ),
      rescuer: { ...this.rescuer },
      overrides: { ...this.overrides },
      logs: [...this.logs],
      rescuedCount,
      totalBeacons: this.beacons.length,
      canRescueNearbyId: nearby ? nearby.id : null,
      xrSupported: this.xrSupported,
      xrActive: this.xrActive,
      xrSurfacePlaced: this.xrSurfacePlaced,
    };
  }
}
