import * as THREE from "three";
import {
  FACE_FRAME_INTERVAL,
  FACE_FRAME_MAX_LENGTH,
  FACE_TEXTURE_SIZE,
  validFaceFrame,
} from "./net-protocol";

export function faceCrop(width: number, height: number) {
  const size = Math.min(width, height);
  return { x: (width - size) / 2, y: (height - size) / 2, size };
}

/** Explicitly enabled camera. Frames stay ephemeral; no microphone or recorder is created. */
export class FaceCamera {
  enabled = false;
  pending = false;
  suspended = false;
  stream: MediaStream | null = null;
  video: HTMLVideoElement | null = null;
  canvas: HTMLCanvasElement | null = null;
  texture: THREE.CanvasTexture | null = null;
  deviceId = "";
  mirror = true;
  devices: MediaDeviceInfo[] = [];
  error = "";
  latestFrame: string | null = null;
  listeners = new Set<() => void>();
  private generation = 0;
  private elapsed = 0;
  private networkElapsed = 0;
  private disposed = false;
  constructor(public onFrame: (frame: string | null) => void = () => {}) {
    if (typeof document !== "undefined")
      document.addEventListener("visibilitychange", this.visibility);
    if (typeof navigator !== "undefined")
      navigator.mediaDevices?.addEventListener?.("devicechange", this.deviceChange);
  }
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private emit() {
    for (const listener of this.listeners) listener();
  }
  private deviceChange = () => {
    void this.refreshDevices();
  };
  async refreshDevices() {
    try {
      this.devices = ((await navigator.mediaDevices?.enumerateDevices()) ?? []).filter(
        (device) => device.kind === "videoinput",
      );
    } catch {
      this.devices = [];
    }
    if (!this.disposed) this.emit();
  }
  async start(deviceId = this.deviceId) {
    if (this.disposed) return false;
    const generation = ++this.generation;
    this.release();
    this.enabled = false;
    this.pending = true;
    this.error = "";
    this.deviceId = deviceId;
    this.emit();
    try {
      if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia)
        throw new Error("Kamera wymaga HTTPS lub localhost oraz obsługi kamery w przeglądarce.");
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          ...(deviceId ? { deviceId: { exact: deviceId } } : { facingMode: "user" }),
          width: { ideal: 1280 },
          height: { ideal: 720 },
          frameRate: { ideal: 30, max: 30 },
        },
      });
      if (generation !== this.generation || this.disposed) {
        stream.getTracks().forEach((track) => track.stop());
        return false;
      }
      this.stream = stream;
      const video = document.createElement("video");
      this.video = video;
      video.muted = true;
      video.playsInline = true;
      video.autoplay = true;
      video.srcObject = stream;
      await video.play();
      if (generation !== this.generation || this.disposed) return false;
      this.canvas = document.createElement("canvas");
      this.canvas.width = this.canvas.height = FACE_TEXTURE_SIZE;
      this.texture = new THREE.CanvasTexture(this.canvas);
      this.texture.colorSpace = THREE.SRGBColorSpace;
      this.texture.minFilter = this.texture.magFilter = THREE.LinearFilter;
      this.texture.generateMipmaps = false;
      this.deviceId = stream.getVideoTracks()[0]?.getSettings().deviceId ?? deviceId;
      for (const track of stream.getTracks())
        track.addEventListener("ended", () => {
          if (generation !== this.generation) return;
          this.stop();
          this.error = "Kamera została odłączona lub zatrzymana.";
          this.emit();
        });
      this.enabled = true;
      this.pending = false;
      this.suspended = typeof document !== "undefined" && document.hidden;
      this.elapsed = 1 / 30;
      this.networkElapsed = FACE_FRAME_INTERVAL;
      this.emit();
      void this.refreshDevices();
      return true;
    } catch (error) {
      if (generation !== this.generation || this.disposed) return false;
      this.release();
      this.pending = false;
      this.error =
        error instanceof Error && error.name === "NotAllowedError"
          ? "Brak zgody na kamerę. Włącz dostęp do kamery w ustawieniach przeglądarki."
          : error instanceof Error && error.name === "NotFoundError"
            ? "Nie znaleziono kamery. Podłącz urządzenie i spróbuj ponownie."
            : error instanceof Error
              ? error.message
              : "Nie udało się uruchomić kamery.";
      this.emit();
      return false;
    }
  }
  async setDevice(deviceId: string) {
    this.deviceId = deviceId;
    if (this.enabled || this.pending) return this.start(deviceId);
    this.emit();
    return false;
  }
  setMirror(mirror: boolean) {
    this.mirror = mirror;
    this.elapsed = 1 / 30;
    this.networkElapsed = FACE_FRAME_INTERVAL;
    this.emit();
  }
  private release() {
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
    if (this.video) {
      this.video.pause();
      this.video.srcObject = null;
    }
    this.video = null;
    this.canvas?.getContext("2d")?.clearRect(0, 0, FACE_TEXTURE_SIZE, FACE_TEXTURE_SIZE);
    this.texture?.dispose();
    this.texture = null;
    this.canvas = null;
    this.latestFrame = null;
    this.onFrame(null);
  }
  stop() {
    this.generation++;
    this.enabled = false;
    this.pending = false;
    this.suspended = false;
    this.release();
    this.emit();
  }
  private visibility = () => {
    if (!this.enabled) return;
    this.suspended = document.hidden;
    if (this.suspended) {
      this.latestFrame = null;
      this.canvas?.getContext("2d")?.clearRect(0, 0, FACE_TEXTURE_SIZE, FACE_TEXTURE_SIZE);
      if (this.texture) this.texture.needsUpdate = true;
      this.onFrame(null);
    } else {
      this.elapsed = 1 / 30;
      this.networkElapsed = FACE_FRAME_INTERVAL;
    }
    this.emit();
  };
  update(dt: number) {
    if (!this.enabled || !this.video || !this.canvas || !this.texture) return;
    if (document.hidden !== this.suspended) this.visibility();
    if (
      this.suspended ||
      this.video.readyState < 2 ||
      !this.video.videoWidth ||
      !this.video.videoHeight
    )
      return;
    const elapsed = Math.min(1, Math.max(0, Number.isFinite(dt) ? dt : 0));
    this.elapsed += elapsed;
    this.networkElapsed += elapsed;
    if (this.elapsed + 0.000001 < 1 / 30) return;
    this.elapsed %= 1 / 30;
    const context = this.canvas.getContext("2d");
    if (!context) return;
    const crop = faceCrop(this.video.videoWidth, this.video.videoHeight);
    context.save();
    if (this.mirror) {
      context.translate(FACE_TEXTURE_SIZE, 0);
      context.scale(-1, 1);
    }
    context.drawImage(
      this.video,
      crop.x,
      crop.y,
      crop.size,
      crop.size,
      0,
      0,
      FACE_TEXTURE_SIZE,
      FACE_TEXTURE_SIZE,
    );
    context.restore();
    this.texture.needsUpdate = true;
    if (this.networkElapsed + 0.000001 < FACE_FRAME_INTERVAL) return;
    this.networkElapsed %= FACE_FRAME_INTERVAL;
    let frame = "";
    for (const quality of [0.9, 0.85, 0.8, 0.75]) {
      frame = this.canvas.toDataURL("image/jpeg", quality);
      if (frame.length <= FACE_FRAME_MAX_LENGTH) break;
    }
    if (validFaceFrame(frame)) {
      if (this.error) {
        this.error = "";
        this.emit();
      }
      this.latestFrame = frame;
      this.onFrame(frame);
    } else if (!this.error) {
      this.error =
        "Obraz HD jest zbyt duży do wysłania. Lokalny podgląd nadal działa; uprość tło kamery.";
      this.latestFrame = null;
      this.onFrame(null);
      this.emit();
    }
  }
  dispose() {
    if (this.disposed) return;
    this.stop();
    this.disposed = true;
    if (typeof document !== "undefined")
      document.removeEventListener("visibilitychange", this.visibility);
    if (typeof navigator !== "undefined")
      navigator.mediaDevices?.removeEventListener?.("devicechange", this.deviceChange);
    this.listeners.clear();
  }
}
