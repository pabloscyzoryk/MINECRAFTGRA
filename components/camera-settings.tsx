"use client";
import { useEffect, useState } from "react";
import { RefreshCw, Video, VideoOff } from "lucide-react";
import type { FaceCamera } from "@/lib/face-camera";
import { InventoryAvatar } from "./skin-editor";

export default function CameraSettings({ camera }: { camera: FaceCamera }) {
  const [, refresh] = useState(0);
  useEffect(() => {
    const unsubscribe = camera.subscribe(() => refresh((value) => value + 1));
    void camera.refreshDevices();
    return unsubscribe;
  }, [camera]);
  return (
    <section className="media-card camera-settings" aria-labelledby="camera-heading">
      <header>
        <Video size={22} />
        <div>
          <h3 id="camera-heading">Twoja twarz, kwadratowy świat</h3>
          <p>Wyraźny obraz HD bez pikselowego filtra. Zobacz siebie w 3D i po F5.</p>
        </div>
      </header>
      <div className="camera-layout">
        <div className="camera-avatar-preview">
          <InventoryAvatar faceTexture={camera.texture} />
          <span className={camera.enabled ? "camera-state live" : "camera-state"}>
            {camera.pending
              ? "Oczekiwanie na zgodę…"
              : camera.enabled
                ? "Kamerka włączona"
                : "Skórka gracza"}
          </span>
        </div>
        <div className="camera-controls">
          <button
            className="primary-action"
            onClick={() => (camera.enabled || camera.pending ? camera.stop() : void camera.start())}
          >
            {camera.enabled || camera.pending ? <VideoOff size={18} /> : <Video size={18} />}
            {camera.pending
              ? "Anuluj uruchamianie kamerki"
              : camera.enabled
                ? "Wyłącz kamerkę"
                : "Włącz kamerkę na twarzy"}
          </button>
          <label className="media-field">
            Kamera
            <select
              value={camera.deviceId}
              onChange={(event) => void camera.setDevice(event.target.value)}
            >
              <option value="">Domyślna kamera</option>
              {camera.deviceId &&
                !camera.devices.some((device) => device.deviceId === camera.deviceId) && (
                  <option value={camera.deviceId}>Wybrana kamera</option>
                )}
              {camera.devices
                .filter((device) => device.deviceId)
                .map((device, index) => (
                  <option key={device.deviceId} value={device.deviceId}>
                    {device.label || `Kamera ${index + 1}`}
                  </option>
                ))}
            </select>
          </label>
          <button className="quiet-action" onClick={() => void camera.refreshDevices()}>
            <RefreshCw size={15} />
            Odśwież listę kamer
          </button>
          <label className="media-check">
            <input
              type="checkbox"
              checked={camera.mirror}
              onChange={(event) => camera.setMirror(event.target.checked)}
            />
            Odbicie lustrzane twarzy
          </label>
          <p className="panel-footnote">
            Działa również w grze solo. Online pobliscy gracze widzą Twoją twarz na żywo. Wyłączenie
            kamerki przywraca skórkę. Obraz nie jest zapisywany.
          </p>
          {camera.error && (
            <p role="alert" className="error-note">
              {camera.error}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
