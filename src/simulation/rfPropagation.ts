import { ObstacleMaterial, ObstacleZone } from '../types/wts';

export interface RfPropagationResult {
  rssiDbm: number;
  signalBars: number;
  obstacleLossDb: number;
  blockingMaterials: ObstacleMaterial[];
  canDecodePacket: boolean;
}

const RECEIVER_SENSITIVITY_DBM = -106;

/**
 * Tests if segment P0(x0,z0) -> P1(x1,z1) intersects an oriented 2D rectangle
 * centered at (cx,cz) with half-extents (hx,hz) and rotationY.
 */
export function segmentIntersectsObstacle(
  x0: number,
  z0: number,
  x1: number,
  z1: number,
  obs: ObstacleZone
): boolean {
  const angle = -(obs.rotationY ?? 0);
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);

  // Transform segment endpoints into obstacle-local coordinates
  const dx0 = x0 - obs.x;
  const dz0 = z0 - obs.z;
  const lx0 = dx0 * cos - dz0 * sin;
  const lz0 = dx0 * sin + dz0 * cos;

  const dx1 = x1 - obs.x;
  const dz1 = z1 - obs.z;
  const lx1 = dx1 * cos - dz1 * sin;
  const lz1 = dx1 * sin + dz1 * cos;

  // Slab intersection test (Liang-Barsky / Kay-Kajiya)
  let tMin = 0;
  let tMax = 1;
  const dirX = lx1 - lx0;
  const dirZ = lz1 - lz0;

  if (Math.abs(dirX) < 1e-6) {
    if (lx0 < -obs.hx || lx0 > obs.hx) return false;
  } else {
    const invX = 1 / dirX;
    let t1 = (-obs.hx - lx0) * invX;
    let t2 = (obs.hx - lx0) * invX;
    if (t1 > t2) [t1, t2] = [t2, t1];
    tMin = Math.max(tMin, t1);
    tMax = Math.min(tMax, t2);
    if (tMin > tMax) return false;
  }

  if (Math.abs(dirZ) < 1e-6) {
    if (lz0 < -obs.hz || lz0 > obs.hz) return false;
  } else {
    const invZ = 1 / dirZ;
    let t1 = (-obs.hz - lz0) * invZ;
    let t2 = (obs.hz - lz0) * invZ;
    if (t1 > t2) [t1, t2] = [t2, t1];
    tMin = Math.max(tMin, t1);
    tMax = Math.min(tMax, t2);
    if (tMin > tMax) return false;
  }

  return tMax >= tMin;
}

/**
 * Simulates 433 MHz Sub-GHz radio propagation without LoRa.
 * Accounts for distance path loss, obstacle material attenuation (wood, brick,
 * reinforced concrete, steel), multipath standing-wave variations,antenna orientation,
 * and battery power state. Signal does NOT penetrate arbitrarily dense rubble!
 */
export function computeRf433Link(params: {
  beaconX: number;
  beaconZ: number;
  rescuerX: number;
  rescuerZ: number;
  rescuerHeadingRad: number;
  beaconBatteryPct: number;
  obstacles: ObstacleZone[];
  weakSignalOverride: boolean;
  deterministicMode?: boolean;
}): RfPropagationResult {
  const {
    beaconX,
    beaconZ,
    rescuerX,
    rescuerZ,
    rescuerHeadingRad,
    beaconBatteryPct,
    obstacles,
    weakSignalOverride,
    deterministicMode = false,
  } = params;

  if (beaconBatteryPct <= 0) {
    return {
      rssiDbm: -120,
      signalBars: 0,
      obstacleLossDb: 0,
      blockingMaterials: [],
      canDecodePacket: false,
    };
  }

  const dx = beaconX - rescuerX;
  const dz = beaconZ - rescuerZ;
  const distMeters = Math.max(0.8, Math.hypot(dx, dz));

  // TX power: ~ +10 dBm nominal at 433 MHz, reduced by 5 dB in critical battery saving
  const txPowerDbm = beaconBatteryPct < 15 ? 5 : 10;

  // Sub-GHz urban/rubble log-distance path loss
  const pathLossDb = 31.5 + 24.5 * Math.log10(Math.max(1.0, distMeters));

  // Raycast obstacles along direct path
  let obstacleLossDb = 0;
  const blockingMaterials: ObstacleMaterial[] = [];

  for (const obs of obstacles) {
    if (segmentIntersectsObstacle(rescuerX, rescuerZ, beaconX, beaconZ, obs)) {
      obstacleLossDb += obs.attenuationDb;
      blockingMaterials.push(obs.material);
    }
  }

  if (weakSignalOverride) {
    obstacleLossDb += 22;
    if (!blockingMaterials.includes('steel')) {
      blockingMaterials.push('steel');
    }
  }

  // Realistic non-GPS multipath fading & rescuer antenna orientation effect
  const angleToBeacon = Math.atan2(dx, -dz);
  const angleDiff = Math.abs(
    Math.atan2(
      Math.sin(angleToBeacon - rescuerHeadingRad),
      Math.cos(angleToBeacon - rescuerHeadingRad)
    )
  );
  // Rescuer's own body slightly shadows 433 MHz (~3.5 dB) when facing directly away
  const bodyShadowDb = (angleDiff / Math.PI) * 3.5;

  // Spatial standing-wave multipath (+/- 3 dB) so moving slightly shifts bars naturally
  const multipathDb = deterministicMode
    ? 0
    : Math.sin(rescuerX * 1.4 + beaconX * 0.7) *
      Math.cos(rescuerZ * 1.35 + beaconZ * 0.6) *
      3.1;

  const rawRssi =
    txPowerDbm - pathLossDb - obstacleLossDb - bodyShadowDb + multipathDb;
  const rssiDbm = Math.max(-120, Math.min(-38, Math.round(rawRssi)));

  const signalBars = rssiToBars(rssiDbm);

  // Packet decoding threshold around -106 dBm with realistic marginal zone (-99 to -106 dBm)
  let canDecodePacket = false;
  if (rssiDbm >= -98) {
    canDecodePacket = true;
  } else if (rssiDbm >= RECEIVER_SENSITIVITY_DBM) {
    if (deterministicMode) {
      canDecodePacket = rssiDbm >= -103;
    } else {
      const successProb =
        (rssiDbm - RECEIVER_SENSITIVITY_DBM) / (-98 - RECEIVER_SENSITIVITY_DBM);
      canDecodePacket = Math.random() < Math.max(0.15, successProb);
    }
  }

  return {
    rssiDbm,
    signalBars,
    obstacleLossDb,
    blockingMaterials,
    canDecodePacket,
  };
}

export function rssiToBars(rssiDbm: number): number {
  if (rssiDbm < RECEIVER_SENSITIVITY_DBM) return 0;
  if (rssiDbm < -96) return 1;
  if (rssiDbm < -86) return 2;
  if (rssiDbm < -75) return 3;
  if (rssiDbm < -64) return 4;
  return 5;
}
