export class AudioFX {
  ctx: AudioContext | null = null;
  volume = 0.5;
  music = 0.25;
  weatherVolume = 0.3;
  master: GainNode | null = null;
  musicGain: GainNode | null = null;
  rainGain: GainNode | null = null;
  rainSource: AudioBufferSourceNode | null = null;
  nextNote = 0;
  note = 0;
  enabled = false;
  enable() {
    try {
      if (!this.ctx) {
        this.ctx = new AudioContext();
        this.master = this.ctx.createGain();
        this.master.connect(this.ctx.destination);
        this.musicGain = this.ctx.createGain();
        this.musicGain.connect(this.ctx.destination);
        this.rainGain = this.ctx.createGain();
        this.rainGain.gain.value = 0;
        const filter = this.ctx.createBiquadFilter();
        filter.type = "lowpass";
        filter.frequency.value = 2600;
        this.rainGain.connect(filter);
        filter.connect(this.ctx.destination);
        const buffer = this.ctx.createBuffer(1, this.ctx.sampleRate * 3, this.ctx.sampleRate),
          data = buffer.getChannelData(0);
        for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * 0.3;
        this.rainSource = this.ctx.createBufferSource();
        this.rainSource.buffer = buffer;
        this.rainSource.loop = true;
        this.rainSource.connect(this.rainGain);
        this.rainSource.start();
      }
      void this.ctx.resume();
      this.enabled = true;
    } catch {}
  }
  tone(
    freq: number,
    start: number,
    duration: number,
    gain: number,
    type: OscillatorType = "sine",
    out?: AudioNode,
  ) {
    const ctx = this.ctx;
    if (!ctx) return;
    const osc = ctx.createOscillator(),
      amp = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    osc.connect(amp);
    amp.connect(out ?? this.master!);
    amp.gain.setValueAtTime(0.0001, start);
    amp.gain.exponentialRampToValueAtTime(Math.max(0.0001, gain), start + 0.04);
    amp.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    osc.start(start);
    osc.stop(start + duration + 0.03);
  }
  play(kind: string) {
    const ctx = this.ctx;
    if (!ctx) return;
    this.master!.gain.value = this.volume;
    const t = ctx.currentTime;
    const f: Record<string, number> = {
      step: 95,
      break: 145,
      place: 185,
      jump: 310,
      hurt: 75,
      bow: 480,
      hit: 120,
      portal: 190,
      eat: 370,
      craft: 650,
      win: 880,
      splash: 250,
      bucket: 440,
      thunder: 40,
    };
    this.tone(
      f[kind] ?? 240,
      t,
      kind === "portal" ? 1 : kind === "thunder" ? 2.5 : 0.2,
      kind === "step" ? 0.045 : kind === "thunder" ? 0.35 : 0.15,
      ["step", "break", "hurt", "thunder"].includes(kind) ? "triangle" : "sine",
    );
    if (kind === "portal" || kind === "win")
      for (let i = 1; i < 4; i++)
        this.tone((f[kind] ?? 220) * [1, 1.25, 1.5, 2][i], t + i * 0.12, 1, 0.08);
  }
  update(wet: number, active: boolean, dimension: string) {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    this.master!.gain.setTargetAtTime(this.volume, t, 0.1);
    this.musicGain!.gain.setTargetAtTime(active ? this.music : 0, t, 0.4);
    this.rainGain!.gain.setTargetAtTime(active ? wet * this.weatherVolume * 0.7 : 0, t, 0.5);
    if (!active) {
      this.nextNote = t;
      return;
    }
    if (t < this.nextNote) return;
    this.nextNote = t + 1.2;
    const chords = [
        [48, 55, 60, 64],
        [45, 52, 57, 60],
        [41, 48, 53, 57],
        [43, 50, 55, 62],
      ],
      notes = chords[Math.floor(this.note / 8) % 4],
      minor = dimension === "overworld" ? 0 : -1;
    const midi = notes[this.note % 4] + 12 + minor;
    const frequency = 440 * 2 ** ((midi - 69) / 12);
    this.tone(frequency, t, 3, 0.11, "sine", this.musicGain!);
    this.tone(frequency * 2, t + 0.02, 1.7, 0.018, "sine", this.musicGain!);
    if (this.note % 8 === 0)
      for (const n of notes.slice(0, 3))
        this.tone(440 * 2 ** ((n - 69 + minor) / 12), t, 9, 0.035, "sine", this.musicGain!);
    this.note++;
  }
  dispose() {
    this.rainSource?.stop();
    void this.ctx?.close();
  }
}
