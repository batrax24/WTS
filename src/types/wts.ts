export type PriorityColor = 'VERDE' | 'AMARILLO' | 'ROJO' | 'NEGRO';

export type GameMode = 'chaleco' | 'rescatista' | 'inspector';

export type MissionPhase =
  | 'emergencia_iniciada'
  | 'emitir_sos'
  | 'buscar_rssi'
  | 'rescate_completado'
  | 'tiempo_agotado';

export type ObstacleMaterial = 'wood' | 'brick' | 'concrete' | 'steel';

export interface ObstacleZone {
  id: string;
  label: string;
  material: ObstacleMaterial;
  /** Center X, Z in meters and half-extents HX, HZ, plus height Y */
  x: number;
  z: number;
  hx: number;
  hz: number;
  height: number;
  rotationY?: number;
  /** Attenuation in dB at 433 MHz when traversed */
  attenuationDb: number;
  isTemporaryShield?: boolean;
}

export interface TelemetryPacket {
  beaconId: string;
  seq: number;
  timestamp: number;
  hr: number;
  spo2: number;
  tempC: number;
  imuG: number;
  stillnessSec: number;
  sosAlert: boolean;
  priority: PriorityColor;
  priorityReason: string;
  batteryPct: number;
  pwmActive: boolean;
  pwmDuty: number;
  sensorContactOk: boolean;
}

export interface ReceiverLinkState {
  beaconId: string;
  /** Last successfully decoded packet at the receiver (can be stale!) */
  lastPacket: TelemetryPacket | null;
  /** Live instantaneous RSSI in dBm if signal reaches above noise floor, else -120 */
  rssiDbm: number;
  /** 0 to 5 signal bars */
  signalBars: number;
  /** Seconds since last received packet */
  packetAgeSec: number;
  /** True when packetAgeSec > 4.5s */
  isStale: boolean;
  /** True when packetAgeSec > 10s or no packet received yet and below sensitivity */
  isLost: boolean;
  /** Total attenuation from obstacles on current ray */
  obstacleLossDb: number;
  /** Materials currently obstructing direct line between beacon and rescuer */
  blockingMaterials: ObstacleMaterial[];
  packetsReceived: number;
  packetsDropped: number;
  rssiHistory: number[];
}

export interface SurvivorBeacon {
  id: string;
  sectorName: string;
  shelterDescription: string;
  /** Position in 3D disaster map (meters) */
  x: number;
  z: number;
  isPlayerControlledVest: boolean;
  rescued: boolean;
  rescuedAtSec?: number;

  // True physical/simulated internal state of the vest
  hr: number;
  spo2: number;
  tempC: number;
  ambientTempC: number;
  imuG: number;
  imuAxis: [number, number, number];
  stillnessSec: number;
  movementMode: 'activo' | 'leve' | 'inmovil' | 'golpes_sos';
  sensorContactOk: boolean;

  // SOS detector
  tapTimestamps: number[];
  sosConfidence: number; // 0..100
  sosAlert: boolean;
  sosExpiresAt: number;

  // TinyML local processor
  tinymlStateLabel: string;
  priority: PriorityColor;
  priorityReason: string;

  // Thermal layer PWM
  hypothermiaEvent: boolean;
  pwmActive: boolean;
  pwmDuty: number; // 0..100
  pwmPulseWave: number; // 0..1 instantaneous animated glow
  powerConsumptionMw: number;

  // Battery & RF TX
  batteryPct: number;
  txIntervalSec: number;
  nextTxAt: number;
  lastTxFlashAt: number;
  seqCounter: number;

  // History buffers for waveforms on Receiver / Vest HUD
  hrWaveHistory: number[];
  spo2WaveHistory: number[];
  tempHistory: number[];
  imuHistory: number[];
}

export interface ScenarioOverrides {
  coldEnvironment: boolean;
  forcedImmobility: boolean;
  weakSignalShield: boolean;
  lowBatteryTest: boolean;
}

export interface WTSExplanationLog {
  id: string;
  timeLabel: string;
  module:
    | 'IMU'
    | 'TinyML'
    | 'RF 433 MHz'
    | 'Capa Térmica PWM'
    | 'Receptor'
    | 'Batería'
    | 'Misión';
  title: string;
  detail: string;
  tone: 'info' | 'warn' | 'alert' | 'success';
}

export interface RescuerState {
  x: number;
  z: number;
  headingRad: number; // 0 = -Z north
  speed: number;
  receiverBatteryPct: number;
  selectedBeaconIndex: number;
  audioGuideEnabled: boolean;
  showEducationalRfRays: boolean;
  tabletopCameraMode: boolean;
}

export interface SimulationSnapshot {
  elapsedSec: number;
  remainingSec: number;
  missionPhase: MissionPhase;
  mode: GameMode;
  beacons: SurvivorBeacon[];
  links: Record<string, ReceiverLinkState>;
  rescuer: RescuerState;
  overrides: ScenarioOverrides;
  logs: WTSExplanationLog[];
  rescuedCount: number;
  totalBeacons: number;
  canRescueNearbyId: string | null;
  xrSupported: boolean;
  xrActive: boolean;
  xrSurfacePlaced: boolean;
}

export interface DeviceHotspot {
  id: string;
  device: 'chaleco' | 'receptor';
  viewSide: 'frente' | 'espalda' | 'receptor';
  title: string;
  subtitle: string;
  description: string;
  wtsRole: string;
  position3D: [number, number, number];
}
