export interface SosEvaluationResult {
  recentTaps: number[];
  confidence: number;
  triggeredNow: boolean;
  cadenceHz: number | null;
  patternLabel: string;
}

const TAP_WINDOW_SEC = 6.5;
const MIN_INTERVAL_SEC = 0.13;
const MAX_INTERVAL_SEC = 1.45;

/**
 * Evaluates rhythmic tap timestamps captured by the dorsal IMU to detect
 * intentional "Posible SOS" knocking sequences vs isolated bumps.
 */
export function evaluateSosTaps(
  previousTaps: number[],
  newTapTimeSec: number | null,
  currentTimeSec: number,
  wasAlreadyActive: boolean
): SosEvaluationResult {
  const taps = [...previousTaps];
  if (newTapTimeSec !== null) {
    const last = taps[taps.length - 1];
    // Debounce accidental double-bounce < 90ms
    if (last === undefined || newTapTimeSec - last >= 0.09) {
      taps.push(newTapTimeSec);
    }
  }

  const recentTaps = taps.filter((t) => currentTimeSec - t <= TAP_WINDOW_SEC);

  if (recentTaps.length === 0) {
    return {
      recentTaps,
      confidence: 0,
      triggeredNow: false,
      cadenceHz: null,
      patternLabel: 'Sin impactos rítmicos recientes',
    };
  }

  if (recentTaps.length === 1) {
    return {
      recentTaps,
      confidence: 26,
      triggeredNow: false,
      cadenceHz: null,
      patternLabel: '1 golpe detectado en IMU · esperando secuencia rítmica',
    };
  }

  const intervals: number[] = [];
  for (let i = 1; i < recentTaps.length; i++) {
    intervals.push(recentTaps[i] - recentTaps[i - 1]);
  }

  const validIntervals = intervals.filter(
    (dt) => dt >= MIN_INTERVAL_SEC && dt <= MAX_INTERVAL_SEC
  );

  if (validIntervals.length === 0) {
    return {
      recentTaps,
      confidence: 20,
      triggeredNow: false,
      cadenceHz: null,
      patternLabel: 'Impactos irregulares (fuera de cadencia SOS)',
    };
  }

  const meanInterval =
    validIntervals.reduce((acc, v) => acc + v, 0) / validIntervals.length;
  const cadenceHz = Number((1 / meanInterval).toFixed(2));

  // Measure rhythmic regularity (allow steady knocks OR Morse short/long ratios)
  const deviations = validIntervals.map((dt) => Math.abs(dt - meanInterval) / meanInterval);
  const avgRelDev =
    deviations.reduce((acc, d) => acc + d, 0) / deviations.length;

  // Regularity bonus: even Morse ··· --- ··· has avgRelDev <= 0.55
  const regularityFactor = Math.max(0.45, 1 - Math.max(0, avgRelDev - 0.35) * 0.7);

  if (validIntervals.length === 1) {
    const conf = Math.round(62 * regularityFactor);
    return {
      recentTaps,
      confidence: Math.max(48, Math.min(72, conf)),
      triggeredNow: false,
      cadenceHz,
      patternLabel: `2 golpes rítmicos (${cadenceHz} Hz) · 1 golpe más confirma SOS`,
    };
  }

  // 2 or more valid intervals => 3+ rhythmic taps!
  const baseConf = 86 + Math.min(14, (validIntervals.length - 2) * 5);
  const confidence = Math.min(100, Math.round(baseConf * Math.min(1.08, regularityFactor + 0.25)));
  const isConfirmed = confidence >= 80;

  return {
    recentTaps,
    confidence,
    triggeredNow: isConfirmed && !wasAlreadyActive,
    cadenceHz,
    patternLabel: isConfirmed
      ? `Patrón rítmico confirmado (${recentTaps.length} golpes · ${cadenceHz} Hz) → POSIBLE SOS`
      : `Analizando cadencia en IMU (${recentTaps.length} golpes)`,
  };
}
