export type VoiceMode = "always" | "toggle" | "hold";
export class VoiceChat {
  enabled = false;
  mode: VoiceMode = "hold";
  key = "KeyV";
  pressed = false;
  latched = false;
  level = 0;
  volume = 0.85;
  error = "";
  stream: MediaStream | null = null;
  context: AudioContext | null = null;
  source: MediaStreamAudioSourceNode | null = null;
  processor: ScriptProcessorNode | null = null;
  silent: GainNode | null = null;
  samples: number[] = [];
  remote = new Map<string, { until: number; next: number }>();
  speakers = new Map<string, GainNode>();
  constructor(
    public send: (audio: string) => void,
    public connected: () => boolean,
    public changed: () => void,
  ) {
    try {
      const v = JSON.parse(localStorage.getItem("blockland.voice") ?? "null");
      if (v && ["always", "toggle", "hold"].includes(v.mode)) {
        this.mode = v.mode;
        this.key = String(v.key ?? "KeyV");
        this.volume = Math.max(
          0,
          Math.min(1, Number.isFinite(Number(v.volume)) ? Number(v.volume) : 0.85),
        );
      }
    } catch {}
    window.addEventListener("keydown", this.down);
    window.addEventListener("keyup", this.up);
    window.addEventListener("blur", this.blur);
    document.addEventListener("visibilitychange", this.visibility);
  }
  get transmitting() {
    return (
      this.enabled &&
      this.connected() &&
      !document.hidden &&
      (this.mode === "always" ||
        (this.mode === "hold" && this.pressed) ||
        (this.mode === "toggle" && this.latched))
    );
  }
  set(options: Partial<Pick<VoiceChat, "mode" | "key" | "volume">>) {
    Object.assign(this, options);
    this.pressed = false;
    this.latched = false;
    for (const gain of this.speakers.values()) gain.gain.value = this.volume;
    try {
      localStorage.setItem(
        "blockland.voice",
        JSON.stringify({ mode: this.mode, key: this.key, volume: this.volume }),
      );
    } catch {}
    this.changed();
  }
  async playback() {
    this.context ??= new AudioContext();
    if (this.context.state === "suspended") await this.context.resume();
  }
  async enable() {
    if (this.enabled) {
      this.disable();
      return;
    }
    this.error = "";
    if (!navigator.mediaDevices?.getUserMedia) {
      this.error = "Mikrofon wymaga HTTPS lub localhost.";
      this.changed();
      return;
    }
    try {
      await this.playback();
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        video: false,
      });
      this.stream = stream;
      this.source = this.context!.createMediaStreamSource(stream);
      this.processor = this.context!.createScriptProcessor(2048, 1, 1);
      this.silent = this.context!.createGain();
      this.silent.gain.value = 0;
      this.processor.onaudioprocess = (e) => {
        const raw = e.inputBuffer.getChannelData(0);
        let peak = 0;
        for (let i = 0; i < raw.length; i++) peak = Math.max(peak, Math.abs(raw[i]));
        this.level = peak;
        if (!this.transmitting) {
          this.samples = [];
          return;
        }
        const ratio = this.context!.sampleRate / 16000;
        for (let at = 0; at < raw.length; at += ratio) {
          const a = Math.floor(at),
            f = at - a;
          this.samples.push(raw[a] * (1 - f) + (raw[Math.min(a + 1, raw.length - 1)] ?? 0) * f);
        }
        while (this.samples.length >= 1600) {
          const pcm = new Int16Array(1600);
          for (let i = 0; i < 1600; i++)
            pcm[i] = Math.round(Math.max(-1, Math.min(1, this.samples[i])) * 32767);
          this.samples.splice(0, 1600);
          const bytes = new Uint8Array(pcm.buffer);
          let str = "";
          for (const byte of bytes) str += String.fromCharCode(byte);
          this.send(btoa(str));
        }
      };
      this.source.connect(this.processor);
      this.processor.connect(this.silent);
      this.silent.connect(this.context!.destination);
      this.enabled = true;
    } catch (e) {
      this.disable();
      this.error =
        (e as Error).name === "NotAllowedError"
          ? "Nie udzielono dostępu do mikrofonu. Zmień uprawnienia witryny w przeglądarce."
          : "Nie udało się włączyć mikrofonu. Sprawdź wybrane urządzenie.";
    }
    this.changed();
  }
  disable() {
    this.enabled = false;
    this.pressed = false;
    this.latched = false;
    this.samples = [];
    this.processor?.disconnect();
    this.source?.disconnect();
    this.silent?.disconnect();
    this.processor = null;
    this.source = null;
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.level = 0;
    this.changed();
  }
  receive(id: string, audio: string) {
    if (!this.context || this.context.state !== "running") return;
    try {
      const decoded = atob(audio);
      if (decoded.length % 2 || decoded.length > 6400) return;
      const bytes = Uint8Array.from(decoded, (c) => c.charCodeAt(0));
      const pcm = new Int16Array(bytes.buffer);
      const buffer = this.context.createBuffer(1, pcm.length, 16000),
        out = buffer.getChannelData(0);
      for (let i = 0; i < pcm.length; i++) out[i] = pcm[i] / 32768;
      const speaker = this.remote.get(id) ?? { until: 0, next: 0 };
      const now = this.context.currentTime;
      const start = Math.max(now + 0.035, Math.min(speaker.next, now + 0.25));
      speaker.next = start + buffer.duration;
      speaker.until = performance.now() + 220;
      this.remote.set(id, speaker);
      let gain = this.speakers.get(id);
      if (!gain) {
        gain = this.context.createGain();
        gain.gain.value = this.volume;
        gain.connect(this.context.destination);
        this.speakers.set(id, gain);
      }
      const source = this.context.createBufferSource();
      source.buffer = buffer;
      source.connect(gain);
      source.start(start);
      source.onended = () => source.disconnect();
    } catch {}
  }
  down = (e: KeyboardEvent) => {
    if ((e.target as HTMLElement)?.closest('input,textarea,[contenteditable="true"]')) return;
    if (e.code !== this.key || e.repeat || !this.enabled) return;
    e.preventDefault();
    if (this.mode === "hold") this.pressed = true;
    if (this.mode === "toggle") this.latched = !this.latched;
    this.changed();
  };
  up = (e: KeyboardEvent) => {
    if (e.code === this.key) {
      this.pressed = false;
      this.changed();
    }
  };
  blur = () => {
    this.pressed = false;
    this.latched = false;
    this.samples = [];
    this.changed();
  };
  visibility = () => {
    if (document.hidden) this.blur();
  };
  close() {
    this.disable();
    window.removeEventListener("keydown", this.down);
    window.removeEventListener("keyup", this.up);
    window.removeEventListener("blur", this.blur);
    document.removeEventListener("visibilitychange", this.visibility);
    for (const g of this.speakers.values()) g.disconnect();
    this.speakers.clear();
    void this.context?.close();
  }
}
