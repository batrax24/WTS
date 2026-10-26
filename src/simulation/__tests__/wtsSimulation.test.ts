import { describe, expect, it } from 'vitest';
import { evaluateSosTaps } from '../sosDetector';
import { runTinyMLInference } from '../tinymlProcessor';
import { computeRf433Link } from '../rfPropagation';
import { WTSSimulationEngine } from '../wtsEngine';
import { INITIAL_OBSTACLES } from '../scenarioData';

describe('WTS Simulation Engine & Subsystems', () => {
  it('detects rhythmic 3-tap SOS sequences while ignoring single bumps', () => {
    const t1 = evaluateSosTaps([], 1.0, 1.0, false);
    expect(t1.triggeredNow).toBe(false);
    expect(t1.confidence).toBeLessThan(40);

    const t2 = evaluateSosTaps(t1.recentTaps, 1.45, 1.45, false);
    expect(t2.triggeredNow).toBe(false);

    const t3 = evaluateSosTaps(t2.recentTaps, 1.9, 1.9, false);
    expect(t3.triggeredNow).toBe(true);
    expect(t3.confidence).toBeGreaterThanOrEqual(80);
    expect(t3.patternLabel).toContain('POSIBLE SOS');
  });

  it('computes educational START-inspired TinyML priorities without deducing death', () => {
    const green = runTinyMLInference({
      hr: 86,
      spo2: 98,
      tempC: 36.4,
      stillnessSec: 3,
      sosAlert: false,
      sensorContactOk: true,
      hypothermiaEvent: false,
      pwmCurrentlyActive: false,
      batteryPct: 85,
      elapsedSec: 10,
    });
    expect(green.priority).toBe('VERDE');

    const yellow = runTinyMLInference({
      hr: 90,
      spo2: 96,
      tempC: 36.2,
      stillnessSec: 22,
      sosAlert: false,
      sensorContactOk: true,
      hypothermiaEvent: false,
      pwmCurrentlyActive: false,
      batteryPct: 80,
      elapsedSec: 25,
    });
    expect(yellow.priority).toBe('AMARILLO');

    const red = runTinyMLInference({
      hr: 132,
      spo2: 88,
      tempC: 36.0,
      stillnessSec: 30,
      sosAlert: true,
      sensorContactOk: true,
      hypothermiaEvent: false,
      pwmCurrentlyActive: false,
      batteryPct: 75,
      elapsedSec: 30,
    });
    expect(red.priority).toBe('ROJO');

    const black = runTinyMLInference({
      hr: 0,
      spo2: 0,
      tempC: 35.0,
      stillnessSec: 40,
      sosAlert: false,
      sensorContactOk: false,
      hypothermiaEvent: false,
      pwmCurrentlyActive: false,
      batteryPct: 60,
      elapsedSec: 40,
    });
    expect(black.priority).toBe('NEGRO');
    expect(black.priorityReason.toLowerCase()).toContain(
      'nunca deduce fallecimiento'
    );
  });

  it('models 433 MHz obstacle attenuation and blocks packets behind dense concrete + steel', () => {
    // Open short line of sight
    const clearLink = computeRf433Link({
      beaconX: 0,
      beaconZ: 15,
      rescuerX: 0,
      rescuerZ: 21,
      rescuerHeadingRad: 0,
      beaconBatteryPct: 90,
      obstacles: INITIAL_OBSTACLES,
      weakSignalOverride: false,
      deterministicMode: true,
    });
    expect(clearLink.canDecodePacket).toBe(true);
    expect(clearLink.signalBars).toBeGreaterThanOrEqual(4);

    // Blocked path through central concrete + steel girders toward WTS 014 (-9, -15.5) from (-8.5, 18)
    const blockedLink = computeRf433Link({
      beaconX: -9,
      beaconZ: -15.5,
      rescuerX: -8.5,
      rescuerZ: 18,
      rescuerHeadingRad: Math.PI, // facing away adds body shadow too
      beaconBatteryPct: 80,
      obstacles: INITIAL_OBSTACLES,
      weakSignalOverride: false,
      deterministicMode: true,
    });
    expect(blockedLink.obstacleLossDb).toBeGreaterThanOrEqual(35);
    expect(blockedLink.canDecodePacket).toBe(false);
    expect(blockedLink.signalBars).toBe(0);
  });

  it('activates pulsed PWM thermal layer on hypothermia, warms gradually, drains battery, and throttles on low battery', () => {
    const engine = new WTSSimulationEngine();
    engine.toggleScenarioOverride('coldEnvironment');
    engine.step(0.5, true);

    let snap = engine.getSnapshot();
    const vest014 = snap.beacons[0];
    expect(vest014.pwmActive).toBe(true);
    expect(vest014.pwmDuty).toBeGreaterThanOrEqual(50);
    expect(vest014.powerConsumptionMw).toBeGreaterThan(800);

    const startTemp = vest014.tempC;
    const startBat = vest014.batteryPct;

    // Advance 12 seconds: PWM warming outpaces ambient cooling and consumes battery
    for (let i = 0; i < 60; i++) {
      engine.step(0.2, true);
    }
    snap = engine.getSnapshot();
    expect(snap.beacons[0].tempC).toBeGreaterThan(startTemp);
    expect(snap.beacons[0].batteryPct).toBeLessThan(startBat - 0.5);

    // Trigger low battery -> eco PWM duty cycle throttling (35%)
    engine.toggleScenarioOverride('lowBatteryTest');
    engine.step(0.2, true);
    snap = engine.getSnapshot();
    expect(snap.beacons[0].pwmDuty).toBe(35);
  });

  it('marks receiver telemetry as stale and lost when RF communication drops', () => {
    const engine = new WTSSimulationEngine();
    // Place rescuer close to WTS 014 to receive a fresh packet
    engine.setRescuerPoseFromXR(-9, -13, 0);
    engine.step(0.8, true);
    engine.step(0.8, true);

    let snap = engine.getSnapshot();
    expect(snap.links['WTS 014'].lastPacket).not.toBeNull();
    expect(snap.links['WTS 014'].isStale).toBe(false);

    // Move rescuer behind heavy shielding + enable weakSignalShield
    engine.setRescuerPoseFromXR(-8.5, 22, Math.PI);
    engine.toggleScenarioOverride('weakSignalShield');
    for (let i = 0; i < 30; i++) {
      engine.step(0.2, true); // +6 seconds without packets
    }
    snap = engine.getSnapshot();
    expect(snap.links['WTS 014'].isStale).toBe(true);

    for (let i = 0; i < 30; i++) {
      engine.step(0.2, true); // +12 seconds total without packets
    }
    snap = engine.getSnapshot();
    expect(snap.links['WTS 014'].isLost).toBe(true);
  });

  it('completes the full mission cycle: emit SOS -> search -> locate and rescue all 4 survivors', () => {
    const engine = new WTSSimulationEngine();
    expect(engine.getSnapshot().missionPhase).toBe('emitir_sos');

    // Step 1: 3 rhythmic taps on WTS 014 trigger Posible SOS and advance phase
    engine.registerVestTap();
    engine.step(0.42, true);
    engine.registerVestTap();
    engine.step(0.42, true);
    engine.registerVestTap();

    let snap = engine.getSnapshot();
    expect(snap.beacons[0].sosAlert).toBe(true);
    expect(snap.missionPhase).toBe('buscar_rssi');

    // Step 2: Switch to Rescuer mode and rescue all 4 beacons at their positions
    engine.setMode('rescatista');
    for (const b of snap.beacons) {
      engine.setRescuerPoseFromXR(b.x + 1.0, b.z + 1.0, 0);
      engine.step(0.2, true);
      const rescued = engine.attemptRescue();
      expect(rescued).toBe(true);
    }

    snap = engine.getSnapshot();
    expect(snap.rescuedCount).toBe(4);
    expect(snap.missionPhase).toBe('rescate_completado');
  });
});
