import { PriorityColor } from '../types/wts';

export interface TinyMLInput {
  hr: number;
  spo2: number;
  tempC: number;
  stillnessSec: number;
  sosAlert: boolean;
  sensorContactOk: boolean;
  hypothermiaEvent: boolean;
  pwmCurrentlyActive: boolean;
  batteryPct: number;
  elapsedSec: number;
}

export interface TinyMLOutput {
  priority: PriorityColor;
  priorityReason: string;
  tinymlStateLabel: string;
  pwmActive: boolean;
  pwmDuty: number;
  pwmPulseWave: number;
  powerConsumptionMw: number;
}

/**
 * Simulates local MCU + TinyML inference on the WTS chest harness.
 *
 * Educational note enforced by design:
 * Priorities (VERDE, AMARILLO, ROJO, NEGRO) are an educational simulation inspired
 * by START triage to help prioritize search efforts. They are NOT a real medical
 * evaluation and NEVER deduce death from signal absence or sensor state.
 */
export function runTinyMLInference(input: TinyMLInput): TinyMLOutput {
  const {
    hr,
    spo2,
    tempC,
    stillnessSec,
    sosAlert,
    sensorContactOk,
    hypothermiaEvent,
    pwmCurrentlyActive,
    batteryPct,
    elapsedSec,
  } = input;

  // 1. Thermal PWM control with hysteresis & battery protection
  const needsHeating =
    hypothermiaEvent ||
    tempC < 35.75 ||
    (pwmCurrentlyActive && tempC < 36.35);

  let pwmActive = false;
  let pwmDuty = 0;

  if (needsHeating && batteryPct > 8) {
    pwmActive = true;
    if (batteryPct <= 22) {
      // Eco PWM mode to preserve 433 MHz emergency beacon battery
      pwmDuty = 35;
    } else {
      const deficit = Math.max(0.2, 36.4 - tempC);
      pwmDuty = Math.min(88, Math.max(50, Math.round(45 + deficit * 28)));
    }
  }

  // Visible ~0.95 Hz PWM thermal pulse modulation for educational animation
  let pwmPulseWave = 0;
  if (pwmActive && pwmDuty > 0) {
    const cyclePeriodSec = 1.1;
    const phase = (elapsedSec % cyclePeriodSec) / cyclePeriodSec;
    const dutyThreshold = pwmDuty / 100;
    if (phase <= dutyThreshold) {
      // Smooth warm rise inside active duty window
      pwmPulseWave = 0.35 + 0.65 * Math.sin((phase / dutyThreshold) * Math.PI);
    } else {
      // Residual thermal glow decay during off-time of pulse
      const offPhase = (phase - dutyThreshold) / Math.max(0.01, 1 - dutyThreshold);
      pwmPulseWave = Math.max(0.08, 0.32 * (1 - offPhase));
    }
  }

  // Power draw budget (mW): MCU+Sensors (~28 mW) + RF burst avg (~35 mW) + PWM heater (up to 1800 mW scaled by duty)
  const basePowerMw = sosAlert ? 85 : 58;
  const heaterPowerMw = pwmActive ? Math.round(1850 * (pwmDuty / 100)) : 0;
  const powerConsumptionMw = batteryPct > 0 ? basePowerMw + heaterPowerMw : 0;

  // 2. Local TinyML Priority Classification (Educational START-inspired model)
  let priority: PriorityColor = 'VERDE';
  let priorityReason =
    'Signos simulados dentro de rango estable y actividad motora detectada.';
  let tinymlStateLabel = 'Inferencia TinyML: Estable · Monitoreo continuo';

  if (!sensorContactOk) {
    priority = 'NEGRO';
    priorityReason =
      'Lectura óptica/térmica sin contacto válido tras inmovilidad prolongada. Requiere revisión presencial inmediata (simulación educativa: nunca deduce fallecimiento).';
    tinymlStateLabel = 'TinyML: Lectura indeterminada · Verificar en sitio';
  } else if (
    spo2 < 91 ||
    hr >= 126 ||
    hr <= 48 ||
    tempC < 34.9 ||
    (sosAlert && (spo2 < 94 || tempC < 35.4 || stillnessSec > 28))
  ) {
    priority = 'ROJO';
    const causes: string[] = [];
    if (spo2 < 91) causes.push(`SpO₂ baja (${Math.round(spo2)}%)`);
    if (hr >= 126 || hr <= 48) causes.push(`pulso alterado (${Math.round(hr)} lpm)`);
    if (tempC < 34.9) causes.push(`riesgo térmico (${tempC.toFixed(1)} °C)`);
    if (sosAlert) causes.push('alerta Posible SOS activa');
    priorityReason = `Prioridad inmediata sugerida por ${causes.join(', ')}.`;
    tinymlStateLabel = sosAlert
      ? 'TinyML: Alerta crítica + Posible SOS'
      : 'TinyML: Anomalía fisiológica prioritaria';
  } else if (
    sosAlert ||
    stillnessSec >= 16 ||
    tempC < 35.75 ||
    spo2 < 95 ||
    hr >= 106
  ) {
    priority = 'AMARILLO';
    const causes: string[] = [];
    if (sosAlert) causes.push('patrón rítmico Posible SOS');
    if (stillnessSec >= 16) causes.push(`inmovilidad (${Math.round(stillnessSec)}s)`);
    if (tempC < 35.75) causes.push(`descenso térmico (${tempC.toFixed(1)} °C)`);
    if (spo2 < 95) causes.push(`SpO₂ moderada (${Math.round(spo2)}%)`);
    if (hr >= 106) causes.push(`taquicardia moderada (${Math.round(hr)} lpm)`);
    priorityReason = `Observación prioritaria: ${causes.join(' · ')}.`;
    tinymlStateLabel = sosAlert
      ? 'TinyML: Golpes rítmicos → Posible SOS'
      : pwmActive
      ? `TinyML: Hipotermia mitigada con PWM (${pwmDuty}%)`
      : 'TinyML: Inmovilidad / alerta moderada';
  } else if (pwmActive) {
    tinymlStateLabel = `TinyML: Estable · Capa térmica PWM (${pwmDuty}%)`;
  }

  return {
    priority,
    priorityReason,
    tinymlStateLabel,
    pwmActive,
    pwmDuty,
    pwmPulseWave,
    powerConsumptionMw,
  };
}
