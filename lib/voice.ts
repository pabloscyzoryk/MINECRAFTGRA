export type VoiceMode = "always" | "toggle" | "hold";
export type VoiceDevice = { deviceId: string; label: string };
export type VoiceOptions = {
  mode: VoiceMode;
  key: string;
  volume: number;
  deviceId: string;
  inputGain: number;
  threshold: number;
  hangoverMs: number;
  echoCancellation: boolean;
  noiseSuppression: boolean;
  autoGainControl: boolean;
};
const clamp = (value: unknown, min: number, max: number, fallback: number) =>
  typeof value === "number" && Number.isFinite(value)
    ? Math.max(min, Math.min(max, value))
    : fallback;

/** Release delay keeps syllables intact when the threshold filters background noise. */
export class VoiceActivityGate {
  private until = -Infinity;
  update(level: number, threshold: number, now: number, hangoverMs: number) {
    if (threshold <= 0 || level >= threshold) this.until = now + hangoverMs;
    return threshold <= 0 || now <= this.until;
  }
  reset() {
    this.until = -Infinity;
  }
}
export class VoiceChat implements VoiceOptions {
  enabled = false;
  requesting = false;
  testing = false;
  mode: VoiceMode = "always";
  key = "KeyV";
  pressed = false;
  latched = false;
  level = 0;
  volume = 0.85;
  deviceId = "";
  inputGain = 1;
  threshold = 0;
  hangoverMs = 250;
  echoCancellation = true;
  noiseSuppression = true;
  autoGainControl = true;
  monitor = false;
  error = "";
  devices: VoiceDevice[] = [];
  stream: MediaStream | null = null;
  context: AudioContext | null = null;
  source: MediaStreamAudioSourceNode | null = null;
  processor: ScriptProcessorNode | null = null;
  silent: GainNode | null = null;
  input: GainNode | null = null;
  monitorGain: GainNode | null = null;
  samples: number[] = [];
  remote = new Map<string, { until: number; next: number }>();
  speakers = new Map<string, GainNode>();
  private receivers = new Set<AudioBufferSourceNode>();
  private listeners = new Set<() => void>();
  private wanted = false;
  private closed = false;
  private generation = 0;
  private deviceGeneration = 0;
  private pending: Promise<boolean> | null = null;
  private gate = new VoiceActivityGate();
  private gateOpen = true;
  private lastMeter = -Infinity;
  private trackEnded: (() => void) | null = null;
  constructor(
    public send: (audio: string) => void,
    public connected: () => boolean,
    public changed: () => void,
  ) {
    try {
      const saved = JSON.parse(localStorage.getItem("blockland.voice") ?? "null");
      if (saved && typeof saved === "object") {
        this.assign(saved);
        // The old implicit hold default is migrated once; v2 preserves an explicit preference.
        if (Number(saved.version) < 2 || !saved.version) this.mode = "always";
      }
    } catch {}
    this.save();
    window.addEventListener("keydown", this.down);
    window.addEventListener("keyup", this.up);
    window.addEventListener("blur", this.blur);
    document.addEventListener("visibilitychange", this.visibility);
    navigator.mediaDevices?.addEventListener?.("devicechange", this.deviceChange);
  }
  subscribe(listener: () => void) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
  private notify() {
    this.changed();
    for (const listener of this.listeners) listener();
  }
  private assign(options: Partial<VoiceOptions>) {
    if (options.mode && ["always", "toggle", "hold"].includes(options.mode))
      this.mode = options.mode;
    if (typeof options.key === "string" && /^[A-Za-z][A-Za-z0-9]{0,31}$/.test(options.key))
      this.key = options.key;
    if (typeof options.deviceId === "string" && options.deviceId.length <= 512)
      this.deviceId = options.deviceId;
    this.volume = clamp(options.volume, 0, 1, this.volume);
    this.inputGain = clamp(options.inputGain, 0, 3, this.inputGain);
    this.threshold = clamp(options.threshold, 0, 1, this.threshold);
    this.hangoverMs = clamp(options.hangoverMs, 0, 1500, this.hangoverMs);
    for (const key of ["echoCancellation", "noiseSuppression", "autoGainControl"] as const)
      if (typeof options[key] === "boolean") this[key] = options[key];
  }
  private save() {
    try {
      localStorage.setItem(
        "blockland.voice",
        JSON.stringify({
          version: 2,
          mode: this.mode,
          key: this.key,
          volume: this.volume,
          deviceId: this.deviceId,
          inputGain: this.inputGain,
          threshold: this.threshold,
          hangoverMs: this.hangoverMs,
          echoCancellation: this.echoCancellation,
          noiseSuppression: this.noiseSuppression,
          autoGainControl: this.autoGainControl,
        }),
      );
    } catch {}
  }
  get capturing() {
    return !!this.stream;
  }
  get transmitting() {
    return (
      this.enabled &&
      this.context?.state === "running" &&
      this.connected() &&
      !document.hidden &&
      (this.threshold <= 0 || this.gateOpen) &&
      (this.mode === "always" ||
        (this.mode === "hold" && this.pressed) ||
        (this.mode === "toggle" && this.latched))
    );
  }
  set(options: Partial<VoiceOptions>) {
    if (this.closed) return;
    const before = [
      this.deviceId,
      this.echoCancellation,
      this.noiseSuppression,
      this.autoGainControl,
    ];
    this.assign(options);
    if (options.mode !== undefined || options.key !== undefined) {
      this.pressed = false;
      this.latched = false;
    }
    if (options.threshold !== undefined) {
      this.gate.reset();
      this.gateOpen = this.threshold <= 0;
      this.samples = [];
    }
    if (this.input) this.input.gain.value = this.inputGain;
    for (const gain of this.speakers.values()) gain.gain.value = this.volume;
    this.save();
    if (
      before.some(
        (value, i) =>
          value !==
          [this.deviceId, this.echoCancellation, this.noiseSuppression, this.autoGainControl][i],
      ) &&
      (this.wanted || this.testing)
    ) {
      this.releaseCapture();
      void this.ensureCapture();
    }
    this.notify();
  }
  async playback() {
    if (this.closed) return;
    this.context ??= new AudioContext();
    if (this.context.state === "suspended") await this.context.resume();
  }
  /** Idempotent entry request: a second call never toggles a live microphone off. */
  start(): Promise<boolean> {
    if (this.closed) return Promise.resolve(false);
    this.wanted = true;
    return this.ensureCapture();
  }
  requestEnable() {
    return this.start();
  }
  async enable() {
    if (this.wanted || this.enabled) {
      this.disable();
      return;
    }
    await this.start();
  }
  startTest(): Promise<boolean> {
    if (this.closed) return Promise.resolve(false);
    this.testing = true;
    return this.ensureCapture();
  }
  stopTest() {
    this.testing = false;
    this.setMonitor(false);
    if (!this.wanted) this.releaseCapture();
    this.notify();
  }
  setMonitor(enabled: boolean) {
    this.monitor = !!enabled && !!this.stream && !this.closed;
    this.syncMonitor();
    this.notify();
  }
  private syncMonitor() {
    if (this.monitorGain) this.monitorGain.gain.value = this.monitor && !document.hidden ? 0.35 : 0;
  }
  async refreshDevices() {
    const generation = ++this.deviceGeneration;
    if (this.closed || !navigator.mediaDevices?.enumerateDevices) return;
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      if (this.closed || generation !== this.deviceGeneration) return;
      this.devices = devices
        .filter((device) => device.kind === "audioinput")
        .map((device, index) => ({
          deviceId: device.deviceId,
          label: device.label || `Mikrofon ${index + 1}`,
        }));
      this.notify();
    } catch {}
  }
  private deviceChange = () => {
    void this.refreshDevices();
  };
  private ensureCapture(): Promise<boolean> {
    if (this.closed) return Promise.resolve(false);
    if (this.stream) {
      this.enabled = this.wanted;
      void this.playback().catch(() => {});
      this.notify();
      return Promise.resolve(true);
    }
    if (this.pending) return this.pending;
    if (!navigator.mediaDevices?.getUserMedia) {
      this.error = "Mikrofon wymaga HTTPS lub localhost oraz przeglądarki z obsługą nagrywania.";
      this.wanted = this.testing = false;
      this.notify();
      return Promise.resolve(false);
    }
    this.error = "";
    this.requesting = true;
    const generation = ++this.generation;
    // Request permission immediately, without awaiting a potentially suspended AudioContext.
    const constraints: MediaStreamConstraints = {
      video: false,
      audio: {
        ...(this.deviceId ? { deviceId: { exact: this.deviceId } } : {}),
        echoCancellation: this.echoCancellation,
        noiseSuppression: this.noiseSuppression,
        autoGainControl: this.autoGainControl,
        channelCount: 1,
      },
    };
    let request: Promise<MediaStream>;
    try {
      request = navigator.mediaDevices.getUserMedia(constraints);
    } catch (error) {
      request = Promise.reject(error);
    }
    const job = (async () => {
      let stream: MediaStream | null = null;
      try {
        stream = await request;
        if (this.closed || generation !== this.generation || (!this.wanted && !this.testing)) {
          stream.getTracks().forEach((track) => track.stop());
          return false;
        }
        this.context ??= new AudioContext();
        void this.playback().catch(() => {});
        this.stream = stream;
        this.source = this.context.createMediaStreamSource(stream);
        this.input = this.context.createGain();
        this.input.gain.value = this.inputGain;
        this.processor = this.context.createScriptProcessor(2048, 1, 1);
        this.silent = this.context.createGain();
        this.silent.gain.value = 0;
        this.monitorGain = this.context.createGain();
        this.monitorGain.gain.value = 0;
        this.source.connect(this.input);
        this.input.connect(this.processor);
        this.processor.connect(this.silent);
        this.silent.connect(this.context.destination);
        this.input.connect(this.monitorGain);
        this.monitorGain.connect(this.context.destination);
        this.processor.onaudioprocess = (event) => {
          if (generation !== this.generation || !this.stream) return;
          const raw = event.inputBuffer.getChannelData(0),
            now = performance.now();
          let squared = 0;
          for (const sample of raw) squared += sample * sample;
          this.level = Math.min(1, Math.sqrt(squared / Math.max(1, raw.length)));
          this.gateOpen = this.gate.update(this.level, this.threshold, now, this.hangoverMs);
          if (now - this.lastMeter >= 80) {
            this.lastMeter = now;
            this.notify();
          }
          if (!this.transmitting) {
            this.samples = [];
            return;
          }
          const ratio = this.context!.sampleRate / 16000;
          for (let at = 0; at < raw.length; at += ratio) {
            const index = Math.floor(at),
              fraction = at - index;
            this.samples.push(
              raw[index] * (1 - fraction) +
                (raw[Math.min(index + 1, raw.length - 1)] ?? 0) * fraction,
            );
          }
          while (this.samples.length >= 1600) {
            const pcm = new Int16Array(1600);
            for (let i = 0; i < 1600; i++)
              pcm[i] = Math.round(Math.max(-1, Math.min(1, this.samples[i])) * 32767);
            this.samples.splice(0, 1600);
            let text = "";
            for (const byte of new Uint8Array(pcm.buffer)) text += String.fromCharCode(byte);
            this.send(btoa(text));
          }
        };
        this.trackEnded = () => {
          if (generation !== this.generation) return;
          this.disable();
          this.error =
            "Mikrofon został odłączony lub przeglądarka zakończyła nagrywanie. Wybierz urządzenie i włącz mikrofon ponownie.";
          this.notify();
        };
        for (const track of stream.getTracks()) track.addEventListener?.("ended", this.trackEnded);
        this.enabled = this.wanted;
        this.gate.reset();
        this.gateOpen = this.threshold <= 0;
        this.syncMonitor();
        void this.refreshDevices();
        return true;
      } catch (error) {
        if (this.closed || generation !== this.generation) {
          stream?.getTracks().forEach((track) => track.stop());
          return false;
        }
        const name = (error as Error)?.name,
          attached = this.stream === stream;
        this.wanted = this.testing = false;
        this.monitor = false;
        this.releaseCapture();
        if (stream && !attached) stream.getTracks().forEach((track) => track.stop());
        this.error =
          name === "NotAllowedError" || name === "SecurityError"
            ? "Nie udzielono dostępu do mikrofonu. Zmień uprawnienie mikrofonu dla tej strony w przeglądarce, a potem kliknij „Włącz mikrofon”."
            : name === "NotFoundError" || name === "OverconstrainedError"
              ? "Wybrany mikrofon jest niedostępny. Wybierz inne urządzenie lub „Domyślny mikrofon”."
              : name === "NotReadableError"
                ? "Nie można odczytać mikrofonu. Sprawdź, czy urządzenie działa i nie jest zablokowane przez inną aplikację."
                : "Nie udało się uruchomić mikrofonu. Sprawdź urządzenie i uprawnienia przeglądarki.";
        return false;
      } finally {
        if (generation === this.generation) {
          this.pending = null;
          this.requesting = false;
        }
        if (!this.closed) this.notify();
      }
    })();
    this.pending = job;
    this.notify();
    return job;
  }
  private releaseCapture() {
    this.generation++;
    this.pending = null;
    this.requesting = false;
    this.enabled = false;
    this.samples = [];
    this.level = 0;
    this.gate.reset();
    this.gateOpen = this.threshold <= 0;
    if (this.processor) this.processor.onaudioprocess = null;
    this.processor?.disconnect();
    this.source?.disconnect();
    this.silent?.disconnect();
    this.input?.disconnect();
    this.monitorGain?.disconnect();
    this.processor = null;
    this.source = null;
    this.silent = null;
    this.input = null;
    this.monitorGain = null;
    for (const track of this.stream?.getTracks() ?? []) {
      if (this.trackEnded) track.removeEventListener?.("ended", this.trackEnded);
      track.stop();
    }
    this.trackEnded = null;
    this.stream = null;
  }
  disable() {
    this.wanted = false;
    this.testing = false;
    this.monitor = false;
    this.pressed = false;
    this.latched = false;
    this.releaseCapture();
    this.notify();
  }
  receive(id: string, audio: string) {
    if (this.closed || !this.context || this.context.state !== "running") return;
    try {
      const decoded = atob(audio);
      if (!decoded.length || decoded.length % 2 || decoded.length > 6400) return;
      const pcm = new Int16Array(Uint8Array.from(decoded, (char) => char.charCodeAt(0)).buffer);
      const buffer = this.context.createBuffer(1, pcm.length, 16000),
        out = buffer.getChannelData(0);
      for (let i = 0; i < pcm.length; i++) out[i] = pcm[i] / 32768;
      const speaker = this.remote.get(id) ?? { until: 0, next: 0 },
        now = this.context.currentTime;
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
      this.receivers.add(source);
      source.start(start);
      source.onended = () => {
        source.disconnect();
        this.receivers.delete(source);
      };
    } catch {}
  }
  down = (event: KeyboardEvent) => {
    if ((event.target as HTMLElement)?.closest('input,textarea,[contenteditable="true"]')) return;
    if (event.code !== this.key || event.repeat || !this.enabled || this.mode === "always") return;
    event.preventDefault();
    if (this.mode === "hold") this.pressed = true;
    if (this.mode === "toggle") this.latched = !this.latched;
    this.notify();
  };
  up = (event: KeyboardEvent) => {
    if (event.code === this.key) {
      this.pressed = false;
      this.samples = [];
      this.notify();
    }
  };
  blur = () => {
    this.pressed = false;
    this.latched = false;
    this.samples = [];
    this.gate.reset();
    this.gateOpen = this.threshold <= 0;
    this.notify();
  };
  visibility = () => {
    if (document.hidden) this.blur();
    this.syncMonitor();
  };
  clearRemote() {
    for (const source of this.receivers) {
      try {
        source.stop();
      } catch {}
      source.disconnect();
    }
    this.receivers.clear();
    for (const gain of this.speakers.values()) gain.disconnect();
    this.speakers.clear();
    this.remote.clear();
  }
  close() {
    if (this.closed) return;
    this.closed = true;
    this.deviceGeneration++;
    this.disable();
    window.removeEventListener("keydown", this.down);
    window.removeEventListener("keyup", this.up);
    window.removeEventListener("blur", this.blur);
    document.removeEventListener("visibilitychange", this.visibility);
    navigator.mediaDevices?.removeEventListener?.("devicechange", this.deviceChange);
    this.clearRemote();
    this.listeners.clear();
    void this.context?.close().catch(() => {});
    this.context = null;
  }
}
