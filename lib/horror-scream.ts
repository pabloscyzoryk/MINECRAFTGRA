/** Original source/filter vocal effect. No recording, speech model or external asset. */
export const HORROR_SCREAM_START = 0.23;
export const HORROR_SCREAM_DURATION = 0.9;
const TAU = Math.PI * 2;
const clamp = (n: number, low = 0, high = 1) => Math.max(low, Math.min(high, n));
const smooth = (n: number) => {
  const t = clamp(n);
  return t * t * (3 - 2 * t);
};

/** Scheduling uses the authoritative cue age, so a delayed packet cannot restart the scream. */
export function horrorScreamTiming(age: number, eventDuration: number) {
  if (!Number.isFinite(age) || !Number.isFinite(eventDuration) || age < 0) return null;
  const end = Math.min(eventDuration, 1.3, HORROR_SCREAM_START + HORROR_SCREAM_DURATION);
  const offset = Math.max(0, age - HORROR_SCREAM_START);
  const length = end - Math.max(HORROR_SCREAM_START, age);
  if (length <= 0.006) return null;
  return { delay: Math.max(0, HORROR_SCREAM_START - age), offset, length };
}

/** Pitch bends like a strained vocal fold, with a brief crack and a falling exhausted tail. */
export function horrorScreamPitch(time: number) {
  const t = Number.isFinite(time) ? clamp(time, 0, HORROR_SCREAM_DURATION) : 0;
  const rise = smooth(t / 0.19),
    fall = smooth((t - 0.43) / 0.42),
    crack = Math.exp(-(((t - 0.34) / 0.021) ** 2));
  return (
    (310 + rise * 405 - fall * 270 - crack * 140) *
    (1 + Math.sin(t * TAU * 7.2) * 0.025 + Math.sin(t * TAU * 39) * 0.007)
  );
}

/** A stable bandpass resonator. Coefficients move at control rate, not for every sample. */
class Formant {
  b0 = 0;
  a1 = 0;
  a2 = 0;
  x1 = 0;
  x2 = 0;
  y1 = 0;
  y2 = 0;
  tune(frequency: number, bandwidth: number, rate: number) {
    const w = (TAU * Math.min(frequency, rate * 0.42)) / rate;
    const alpha = Math.sin(w) / ((2 * frequency) / bandwidth);
    this.b0 = alpha / (1 + alpha);
    this.a1 = (-2 * Math.cos(w)) / (1 + alpha);
    this.a2 = (1 - alpha) / (1 + alpha);
  }
  sample(input: number) {
    const output = this.b0 * (input - this.x2) - this.a1 * this.y1 - this.a2 * this.y2;
    this.x2 = this.x1;
    this.x1 = input;
    this.y2 = this.y1;
    this.y1 = output;
    return output;
  }
}

/** Pure PCM builder, generated once and reused. The envelope has zero-valued endpoints. */
export function synthesizeHorrorScream(sampleRate = 22050, seed = 93617) {
  const rate = Number.isFinite(sampleRate) ? clamp(Math.round(sampleRate), 8000, 96000) : 22050;
  const samples = new Float32Array(Math.ceil(rate * HORROR_SCREAM_DURATION));
  const formants = [new Formant(), new Formant(), new Formant()];
  let rng = seed | 0 || 93617,
    phase = 0,
    subPhase = 0,
    previousFlow = 0,
    previousOutput = 0,
    previousHigh = 0,
    breath = 0,
    peak = 0;
  for (let i = 0; i < samples.length; i++) {
    const t = i / rate;
    rng ^= rng << 13;
    rng ^= rng >>> 17;
    rng ^= rng << 5;
    const noise = (rng >>> 0) / 2147483648 - 1;
    breath += (noise - breath) * (1 - Math.exp((-TAU * 3400) / rate));
    const pitch = horrorScreamPitch(t);
    phase = (phase + pitch / rate) % 1;
    subPhase = (subPhase + pitch / (2 * rate)) % 1;
    // Asymmetric opening and closing of the glottis, then its acoustic derivative.
    const open = 0.58 + Math.sin(t * TAU * 11) * 0.025;
    const flow = phase < open ? Math.sin((Math.PI * phase) / open) ** 1.4 : 0;
    const glottal = ((flow - previousFlow) * rate) / (pitch * 5);
    previousFlow = flow;
    const voicing = smooth((t - 0.012) / 0.025);
    const rasp = 0.08 + smooth((t - 0.62) / 0.2) * 0.2;
    const pulse =
      glottal * voicing * (0.82 + Math.sin(TAU * subPhase) * 0.18) +
      breath * (0.32 * (1 - voicing) + rasp);
    if ((i & 31) === 0) {
      const mouth = smooth(t / 0.2) - smooth((t - 0.58) / 0.3) * 0.3;
      formants[0].tune(790 + mouth * 250, 220, rate);
      formants[1].tune(1240 + mouth * 320, 270, rate);
      formants[2].tune(2850 - mouth * 180, 390, rate);
    }
    const vowel =
      formants[0].sample(pulse) +
      formants[1].sample(pulse) * 0.86 +
      formants[2].sample(pulse) * 0.4;
    const growl = Math.sin(TAU * subPhase) * 0.025 * voicing;
    const output = Math.tanh((vowel + growl) * 3.8);
    // DC blocker before the envelope avoids an offset and clicks at the final breath.
    const high = output - previousOutput + Math.exp((-TAU * 40) / rate) * previousHigh;
    previousOutput = output;
    previousHigh = high;
    const envelope =
      smooth(t / 0.018) *
      smooth((HORROR_SCREAM_DURATION - 1 / rate - t) / 0.18) *
      (0.9 + Math.sin(t * TAU * 9.3) * 0.07);
    samples[i] = high * envelope;
    peak = Math.max(peak, Math.abs(samples[i]));
  }
  const scale = peak > 0 ? 0.88 / peak : 0;
  for (let i = 0; i < samples.length; i++) samples[i] *= scale;
  return { samples, sampleRate: rate };
}

/** One buffer per live presentation/context; replacing or disposing the context releases it. */
export class HorrorScreamBuffer {
  private context: BaseAudioContext | null = null;
  private buffer: AudioBuffer | null = null;
  get(context: BaseAudioContext) {
    if (context === this.context && this.buffer) return this.buffer;
    // 22.05 kHz is sufficient for this formant range and keeps generation/storage small on phones.
    const { samples, sampleRate } = synthesizeHorrorScream();
    const buffer = context.createBuffer(1, samples.length, sampleRate);
    buffer.getChannelData(0).set(samples);
    this.context = context;
    this.buffer = buffer;
    return buffer;
  }
  clear() {
    this.context = this.buffer = null;
  }
}
