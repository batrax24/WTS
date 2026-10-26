import { SoundEventHook } from '../simulation/wtsEngine';

export class WTSSoundEngine {
  private ctx: AudioContext | null = null;
  private muted = false;

  private ensureContext(): AudioContext | null {
    if (this.muted || typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  public setMuted(muted: boolean): void {
    this.muted = muted;
  }

  public isMuted(): boolean {
    return this.muted;
  }

  public unlock(): void {
    this.ensureContext();
  }

  public handleEvent: SoundEventHook = (event) => {
    const ctx = this.ensureContext();
    if (!ctx) return;

    const now = ctx.currentTime;

    switch (event.type) {
      case 'button': {
        this.tone(ctx, 780, 520, now, 0.045, 'triangle', 0.08);
        break;
      }
      case 'tap': {
        // Resonant low chest/structure knock + crisp IMU ping
        this.tone(ctx, 155, 68, now, 0.09, 'sine', 0.22);
        const pitch = 520 + event.confidence * 3.5;
        this.tone(ctx, pitch, pitch * 1.05, now + 0.02, 0.06, 'triangle', 0.09);
        break;
      }
      case 'sos_confirmed': {
        // 3-note rising TinyML SOS confirmation + 433MHz chirp
        this.tone(ctx, 587.3, 587.3, now, 0.09, 'sine', 0.14);
        this.tone(ctx, 784.0, 784.0, now + 0.1, 0.09, 'sine', 0.15);
        this.tone(ctx, 1046.5, 1174.6, now + 0.2, 0.18, 'triangle', 0.16);
        break;
      }
      case 'rf_tx': {
        // Subtle 433 MHz telemetry burst blip
        this.tone(ctx, 980, 1180, now, 0.04, 'sine', 0.04);
        break;
      }
      case 'rssi_ping': {
        if (event.isLost || event.bars === 0) {
          // Very soft low search static tick when signal is blocked
          this.tone(ctx, 240, 190, now, 0.05, 'sawtooth', 0.03);
        } else {
          // Pitch and clarity rise with RSSI bars (1..5)
          const baseFreq = 420 + event.bars * 135;
          const dur = Math.max(0.045, 0.09 - event.bars * 0.007);
          const gain = 0.045 + event.bars * 0.018;
          this.tone(ctx, baseFreq, baseFreq * 1.04, now, dur, 'sine', gain);
        }
        break;
      }
      case 'pwm_on': {
        // Warm rising thermal pulse chime
        this.tone(ctx, 310, 465, now, 0.18, 'sine', 0.11);
        break;
      }
      case 'alert': {
        if (event.tone === 'alert') {
          this.tone(ctx, 660, 440, now, 0.14, 'sawtooth', 0.09);
        } else if (event.tone === 'warn') {
          this.tone(ctx, 520, 480, now, 0.11, 'triangle', 0.09);
        } else {
          this.tone(ctx, 640, 720, now, 0.08, 'sine', 0.07);
        }
        break;
      }
      case 'rescue_complete': {
        // Uplifting rescue success arpeggio
        const notes = event.allDone
          ? [523.25, 659.25, 783.99, 1046.5, 1318.5]
          : [523.25, 659.25, 783.99, 1046.5];
        notes.forEach((n, idx) => {
          this.tone(ctx, n, n, now + idx * 0.085, 0.18, 'triangle', 0.14);
        });
        break;
      }
    }
  };

  private tone(
    ctx: AudioContext,
    startFreq: number,
    endFreq: number,
    startTime: number,
    duration: number,
    type: OscillatorType,
    peakGain: number
  ): void {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(startFreq, startTime);
    osc.frequency.exponentialRampToValueAtTime(
      Math.max(30, endFreq),
      startTime + duration
    );

    gain.gain.setValueAtTime(0.0001, startTime);
    gain.gain.linearRampToValueAtTime(peakGain, startTime + duration * 0.18);
    gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(startTime);
    osc.stop(startTime + duration + 0.01);
  }
}
