import * as THREE from "three";
import type { AudioFX } from "./audio";
import type { Dimension } from "./blocks";
import type { HorrorEvent } from "./horror-director";

export type HorrorPresentationContext = {
  enabled: boolean;
  active: boolean;
  dimension: Dimension;
  player?: THREE.Vector3;
  yaw?: number;
  pitch?: number;
  /** The same world clock used by the director when it supplied event.at. */
  time?: number;
  volume: number;
  jumpscares: boolean;
  reducedMotion?: boolean;
};

const clamp = (n: number, lo = 0, hi = 1) =>
  Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : lo;
const smooth = (n: number) => {
  const x = clamp(n);
  return x * x * (3 - 2 * x);
};
export function horrorGain(volume: number, horrorVolume: number) {
  // This bus has its own conservative ceiling, in addition to a compressor.
  return clamp(volume) * clamp(horrorVolume) * 0.28;
}
export function horrorEnvelope(age: number, duration: number, close = false) {
  if (!Number.isFinite(age) || age < 0 || age >= duration) return 0;
  const fadeIn = close ? 0.09 : 0.65;
  const fadeOut = close ? 0.25 : Math.min(1.4, duration * 0.3);
  return smooth(age / fadeIn) * smooth((duration - age) / fadeOut);
}
function random(seed: number) {
  let s = seed | 0 || 173;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
}
type Material = THREE.MeshStandardMaterial | THREE.MeshBasicMaterial;
type Cue = { event: HorrorEvent; age: number };
type Voice = { nodes: AudioNode[]; sources: AudioScheduledSourceNode[]; end: number };

/** A scripted apparition, never a pursuing or damaging mob. All assets are procedural. */
export class HorrorPresentation {
  readonly group = new THREE.Group();
  readonly head = new THREE.Group();
  readonly jaw = new THREE.Group();
  readonly hands = [new THREE.Group(), new THREE.Group()];
  readonly fingers: THREE.Group[] = [];
  readonly closeup = new THREE.Group();
  overlay = 0;
  private closeHead: THREE.Object3D;
  private closeJaw: THREE.Object3D;
  private geometries = new Set<THREE.BufferGeometry>();
  private materials = new Set<Material>();
  private closeMaterials = new Set<Material>();
  private current: Cue | null = null;
  private cues: Cue[] = [];
  private seen = new Set<string>();
  private nextBreath = 0;
  private disposed = false;
  private bus: GainNode | null = null;
  private limiter: DynamicsCompressorNode | null = null;
  private saturator: WaveShaperNode | null = null;
  private soundContext: AudioContext | null = null;
  private voices: Voice[] = [];
  private noise: AudioBuffer | null = null;
  private facing = new THREE.Vector3();
  private up = new THREE.Vector3();
  private cameraPosition = new THREE.Vector3();
  private cameraRotation = new THREE.Quaternion();

  constructor(
    private scene: THREE.Scene,
    private camera: THREE.Camera,
    private audio: Pick<AudioFX, "ctx" | "volume" | "enabled">,
  ) {
    this.group.name = "horror-guest-world";
    this.closeup.name = "horror-guest-closeup";
    const material = (color: string, roughness = 1) => {
      const m = new THREE.MeshStandardMaterial({
        color,
        roughness,
        transparent: true,
        emissive: color,
        emissiveIntensity: color === "#c7c4ac" ? 0.07 : 0,
      });
      this.materials.add(m);
      return m;
    };
    const coat = material("#0b1012"),
      cloth = material("#151b1c"),
      skin = material("#585b50"),
      mask = material("#c7c4ac", 0.92),
      bone = material("#8e9380"),
      black = material("#020303"),
      hair = material("#080a09", 0.96);
    const sphere = (
      x: number,
      y: number,
      z: number,
      sx: number,
      sy: number,
      sz: number,
      m: Material,
      parent: THREE.Object3D,
      detail = 12,
    ) => {
      const mesh = this.mesh(new THREE.SphereGeometry(1, detail, 10), m, parent);
      mesh.position.set(x, y, z);
      mesh.scale.set(sx, sy, sz);
      return mesh;
    };
    const rod = (
      a: THREE.Vector3,
      b: THREE.Vector3,
      top: number,
      bottom: number,
      m: Material,
      parent: THREE.Object3D,
    ) => {
      const length = a.distanceTo(b);
      const mesh = this.mesh(new THREE.CylinderGeometry(top, bottom, length, 7), m, parent);
      mesh.position.copy(a).add(b).multiplyScalar(0.5);
      mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
      return mesh;
    };
    const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
    // A broken, narrow silhouette: sloped shoulders, a long exposed neck, a coat in strips.
    sphere(0, 1.5, -0.1, 0.33, 0.89, 0.19, coat, this.group);
    sphere(0, 2.27, -0.08, 0.54, 0.19, 0.22, coat, this.group);
    rod(v(-0.48, 2.21, -0.05), v(-0.62, 1.3, 0.03), 0.06, 0.09, cloth, this.group);
    rod(v(0.48, 2.21, -0.05), v(0.66, 1.37, -0.03), 0.06, 0.09, coat, this.group);
    rod(v(-0.62, 1.3, 0.03), v(-0.57, 0.86, 0.13), 0.04, 0.057, coat, this.group);
    rod(v(0.66, 1.37, -0.03), v(0.72, 0.92, 0.18), 0.04, 0.06, coat, this.group);
    rod(v(0, 2.23, 0), v(0, 3.02, 0.02), 0.1, 0.085, skin, this.group);
    for (let i = 0; i < 6; i++) {
      const seam = this.mesh(new THREE.TorusGeometry(0.092, 0.007, 4, 12), bone, this.group);
      seam.rotation.x = Math.PI / 2;
      seam.scale.y = 0.83;
      seam.position.set(0, 2.42 + i * 0.072, 0.006);
    }
    const rng = random(9237);
    for (let i = 0; i < 9; i++) {
      const strip = this.mesh(
        new THREE.ConeGeometry(0.09 + rng() * 0.035, 1 + rng() * 0.38, 4),
        i % 2 ? cloth : coat,
        this.group,
      );
      strip.position.set((i / 8 - 0.5) * 0.46, 0.58 + rng() * 0.1, -0.13 + rng() * 0.24);
      strip.rotation.z = (rng() - 0.5) * 0.08;
    }
    this.head.position.set(0, 3.1, 0.045);
    this.group.add(this.head);
    sphere(0, 0.09, -0.07, 0.25, 0.49, 0.22, hair, this.head);
    sphere(0, 0.095, 0.022, 0.205, 0.4, 0.145, mask, this.head);
    sphere(-0.1, 0.2, 0.145, 0.067, 0.083, 0.032, black, this.head);
    sphere(0.1, 0.2, 0.145, 0.067, 0.083, 0.032, black, this.head);
    // No pupils or glows: the eyes remain deep, motionless black holes.
    sphere(0, 0.025, 0.166, 0.026, 0.132, 0.03, bone, this.head);
    sphere(0, -0.235, 0.13, 0.104, 0.132, 0.045, black, this.head);
    this.jaw.position.set(0, -0.175, -0.001);
    this.jaw.name = "guest-jaw";
    this.head.add(this.jaw);
    sphere(0, -0.13, 0.075, 0.123, 0.12, 0.095, mask, this.jaw);
    sphere(0, -0.064, 0.158, 0.094, 0.018, 0.025, black, this.jaw);
    for (let i = 0; i < 21; i++) {
      const side = i % 2 ? 1 : -1;
      const x = side * (0.19 + rng() * 0.12);
      const y = 0.4 - rng() * 0.16;
      const z = -0.02 - rng() * 0.16;
      const points = [
        v(x * 0.35, y + 0.11, z),
        v(x, y, z - 0.055),
        v(x + side * 0.03, -0.08, z),
        v(x + side * 0.01, -0.55 - rng() * 0.3, z + 0.025),
      ];
      this.mesh(
        new THREE.TubeGeometry(
          new THREE.CatmullRomCurve3(points),
          10,
          0.018 + rng() * 0.014,
          4,
          false,
        ),
        hair,
        this.head,
      );
    }
    this.hands.forEach((hand, sideIndex) => {
      const side = sideIndex ? 1 : -1;
      hand.position.set(side * (sideIndex ? 0.72 : 0.57), sideIndex ? 0.92 : 0.86, 0.13);
      this.group.add(hand);
      sphere(0, -0.08, 0, 0.068, 0.12, 0.04, skin, hand);
      for (let i = 0; i < 5; i++) {
        const finger = new THREE.Group();
        finger.position.set((i - 2) * 0.033, -0.15 + (i === 0 ? 0.1 : 0), 0.012);
        finger.rotation.z = (i - 2) * 0.11;
        const length = i === 0 ? 0.24 : 0.34 + Math.sin(i) * 0.06;
        rod(v(0, 0, 0), v(0, -length * 0.58, 0.025), 0.014, 0.02, skin, finger);
        rod(
          v(0, -length * 0.58, 0.025),
          v(side * 0.012, -length, 0.065),
          0.004,
          0.014,
          bone,
          finger,
        );
        hand.add(finger);
        this.fingers.push(finger);
      }
    });
    this.closeHead = this.head.clone(true);
    this.closeHead.position.set(0, 0, 0);
    this.closeup.add(this.closeHead);
    this.closeJaw = this.closeHead.getObjectByName("guest-jaw")!;
    const closeMap = new Map<Material, Material>();
    this.closeHead.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return;
      const old = o.material as Material;
      let m = closeMap.get(old);
      if (!m) {
        m = new THREE.MeshBasicMaterial({
          color: old.color.clone().multiplyScalar(0.82),
          transparent: true,
          depthTest: false,
          depthWrite: false,
        });
        closeMap.set(old, m);
        this.closeMaterials.add(m);
      }
      o.material = m;
      o.renderOrder = 1100;
      o.frustumCulled = false;
    });
    this.group.visible = this.closeup.visible = false;
    this.scene.add(this.group, this.closeup);
  }

  private mesh(geometry: THREE.BufferGeometry, material: Material, parent: THREE.Object3D) {
    this.geometries.add(geometry);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = false;
    parent.add(mesh);
    return mesh;
  }

  event(event: HorrorEvent) {
    if (this.disposed || !event || typeof event.id !== "string" || this.seen.has(event.id)) return;
    if (!Array.isArray(event.p) || event.p.length !== 3 || !event.p.every(Number.isFinite)) return;
    if (!Number.isFinite(event.duration) || event.duration <= 0) return;
    this.seen.add(event.id);
    if (this.seen.size > 128) this.seen.delete(this.seen.values().next().value!);
    const cue: Cue = {
      event: {
        ...event,
        p: [...event.p],
        intensity: clamp(event.intensity),
        duration: Math.min(30, event.duration),
      },
      age: 0,
    };
    if (event.kind === "vanish" || event.kind === "recovery") {
      if (!event.targetId || this.current?.event.id === event.targetId) {
        this.current = null;
        this.group.visible = this.closeup.visible = false;
      }
      return;
    }
    if (["watcher", "silhouette", "approach", "jumpscare"].includes(event.kind)) {
      this.current = cue;
      this.nextBreath = 0;
      this.group.position.fromArray(event.p);
      this.group.rotation.set(0, Number.isFinite(event.yaw) ? event.yaw! : 0, 0);
    }
    if (this.cues.length < 8) this.cues.push(cue);
  }

  private age(cue: Cue, dt: number, time?: number) {
    if (Number.isFinite(time) && Number.isFinite(cue.event.at))
      cue.age = Math.max(cue.age, Math.max(0, time! - cue.event.at!));
    else cue.age += Math.min(0.1, Math.max(0, dt));
    return cue.age;
  }

  update(dt: number, context: HorrorPresentationContext) {
    if (this.disposed) return;
    if (!context.enabled) {
      this.clear();
      return;
    }
    if (!context.active) {
      this.group.visible = this.closeup.visible = false;
      this.overlay = 0;
      this.cues = [];
      this.stopAudio();
      return;
    }
    this.prepareAudio(context.volume);
    const cue = this.current;
    // Advance one time per cue, even when the same object is also in the sound queue.
    for (const pending of this.cues) if (pending !== cue) this.age(pending, dt, context.time);
    const age = cue ? this.age(cue, dt, context.time) : 0;
    const visible = cue && cue.event.dimension === context.dimension && age < cue.event.duration;
    this.group.visible = this.closeup.visible = false;
    let targetOverlay = 0;
    if (visible && cue) {
      const e = cue.event,
        intensity = e.intensity,
        close = e.kind === "jumpscare";
      const length = close ? Math.min(e.duration, 0.9) : e.duration;
      const envelope = horrorEnvelope(age, length, close);
      const phase = age + (e.seed % 1000) * 0.01;
      const motion = context.reducedMotion ? 0.2 : 1;
      this.group.visible = envelope > 0 && !close;
      this.group.position.set(e.p[0], e.p[1] + Math.sin(phase * 0.9) * 0.012 * motion, e.p[2]);
      this.group.rotation.y = Number.isFinite(e.yaw) ? e.yaw! : 0;
      this.head.rotation.set(
        Math.sin(phase * 0.43) * 0.035 * motion,
        Math.sin(phase * 0.35) * 0.06 * motion,
        (0.12 + Math.sin(phase * 0.52) * 0.045) * motion,
      );
      this.jaw.rotation.x = (0.07 + intensity * 0.12 + Math.sin(phase * 0.8) * 0.045) * motion;
      this.hands.forEach((hand, i) => {
        hand.rotation.x = Math.sin(phase * 0.75 + i) * 0.09 * motion;
        hand.rotation.z = Math.sin(phase * 0.43 + i * 2) * 0.045 * motion;
      });
      this.fingers.forEach((finger, i) => {
        finger.rotation.x = (0.1 + Math.sin(phase * 0.6 + i * 0.45) * 0.12) * motion;
      });
      for (const material of this.materials) material.opacity = envelope;
      if (close && context.jumpscares && envelope > 0) {
        this.camera.getWorldPosition(this.cameraPosition);
        this.camera.getWorldQuaternion(this.cameraRotation);
        this.closeup.position
          .set(0.045, -0.065, -0.72)
          .applyQuaternion(this.cameraRotation)
          .add(this.cameraPosition);
        this.closeup.quaternion.copy(this.cameraRotation);
        this.closeup.scale.setScalar(0.94 + smooth(age / 0.24) * 0.1 * motion);
        this.closeHead.rotation.set(-0.04, 0.08, -0.09);
        this.closeJaw.rotation.x = 0.2 + smooth(age / 0.24) * 0.82;
        for (const material of this.closeMaterials) material.opacity = envelope;
        this.closeup.visible = true;
      }
      targetOverlay = envelope * (close && context.jumpscares ? 0.65 : 0.14 + intensity * 0.24);
      if (!close && age >= this.nextBreath) {
        this.nextBreath = age + 3.8 + (e.seed % 13) * 0.11;
        this.playNoise(e.p, 1.8, 0.025 + intensity * 0.02, 360, 0.6, 0.2);
      }
    } else if (cue && age >= cue.event.duration) this.current = null;
    this.overlay += (targetOverlay - this.overlay) * (1 - Math.exp(-Math.min(dt, 0.1) * 5));
    if (this.overlay < 0.001) this.overlay = 0;
    for (const pending of this.cues) {
      if (pending.event.dimension !== context.dimension || pending.age > 0.65) continue;
      if (pending.event.kind === "jumpscare" && !context.jumpscares) continue;
      this.sound(pending.event);
    }
    this.cues = [];
    this.pruneAudio();
  }

  private prepareAudio(volume: number) {
    const ctx = this.audio.ctx;
    if (!ctx || !this.audio.enabled || ctx.state !== "running") {
      this.stopAudio();
      return;
    }
    if (ctx !== this.soundContext) {
      this.stopAudio();
      this.bus?.disconnect();
      this.limiter?.disconnect();
      this.saturator?.disconnect();
      this.soundContext = ctx;
      this.noise = null;
      this.bus = ctx.createGain();
      this.limiter = ctx.createDynamicsCompressor();
      this.limiter.threshold.value = -6;
      this.limiter.knee.value = 3;
      this.limiter.ratio.value = 12;
      this.limiter.attack.value = 0.003;
      this.limiter.release.value = 0.18;
      this.saturator = ctx.createWaveShaper();
      const curve = new Float32Array(2049);
      for (let i = 0; i < curve.length; i++) {
        const x = (i / (curve.length - 1)) * 2 - 1;
        curve[i] = 0.75 * Math.tanh(x / 0.75);
      }
      // Bounds overlapping voices and the compressor's initial attack smoothly.
      // Curve output is at most 0.653; with a 0.28 bus, the peak remains below 0.183.
      this.saturator.curve = curve;
      this.saturator.oversample = "2x";
      this.limiter.connect(this.saturator);
      this.saturator.connect(this.bus);
      this.bus.connect(ctx.destination);
      this.bus.gain.value = 0;
    }
    this.bus!.gain.setTargetAtTime(horrorGain(this.audio.volume, volume), ctx.currentTime, 0.04);
    this.camera.getWorldPosition(this.cameraPosition);
    this.camera.getWorldQuaternion(this.cameraRotation);
    this.facing.set(0, 0, -1).applyQuaternion(this.cameraRotation);
    this.up.set(0, 1, 0).applyQuaternion(this.cameraRotation);
    const listener = ctx.listener;
    if (listener.positionX) {
      [listener.positionX, listener.positionY, listener.positionZ].forEach((param, i) => {
        param.setValueAtTime(this.cameraPosition.getComponent(i), ctx.currentTime);
      });
      [listener.forwardX, listener.forwardY, listener.forwardZ].forEach((param, i) => {
        param.setValueAtTime(this.facing.getComponent(i), ctx.currentTime);
      });
      [listener.upX, listener.upY, listener.upZ].forEach((param, i) => {
        param.setValueAtTime(this.up.getComponent(i), ctx.currentTime);
      });
    } else {
      listener.setPosition(this.cameraPosition.x, this.cameraPosition.y, this.cameraPosition.z);
      listener.setOrientation(
        this.facing.x,
        this.facing.y,
        this.facing.z,
        this.up.x,
        this.up.y,
        this.up.z,
      );
    }
  }

  private voice(position: readonly number[], length: number) {
    const ctx = this.soundContext;
    if (
      !ctx ||
      ctx !== this.audio.ctx ||
      !this.audio.enabled ||
      ctx.state !== "running" ||
      !this.limiter ||
      this.voices.length >= 14
    )
      return null;
    const pan = ctx.createPanner(),
      gain = ctx.createGain();
    pan.panningModel = "HRTF";
    pan.distanceModel = "inverse";
    pan.refDistance = 7;
    pan.maxDistance = 90;
    pan.rolloffFactor = 0.75;
    pan.positionX.value = position[0];
    pan.positionY.value = position[1] + 2.8;
    pan.positionZ.value = position[2];
    gain.connect(pan);
    pan.connect(this.limiter);
    const voice: Voice = { nodes: [gain, pan], sources: [], end: ctx.currentTime + length + 0.15 };
    this.voices.push(voice);
    return { ctx, voice, gain };
  }

  private playNoise(
    position: readonly number[],
    length: number,
    level: number,
    frequency: number,
    q: number,
    attack = 0.025,
  ) {
    const setup = this.voice(position, length);
    if (!setup) return;
    const { ctx, voice, gain } = setup;
    if (!this.noise) {
      this.noise = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * 2), ctx.sampleRate);
      const values = this.noise.getChannelData(0),
        rng = random(73819);
      let soft = 0;
      for (let i = 0; i < values.length; i++) {
        soft = soft * 0.8 + (rng() * 2 - 1) * 0.2;
        values[i] = soft;
      }
    }
    const source = ctx.createBufferSource(),
      filter = ctx.createBiquadFilter(),
      t = ctx.currentTime;
    source.buffer = this.noise;
    source.loop = true;
    filter.type = "bandpass";
    filter.frequency.setValueAtTime(frequency, t);
    filter.frequency.exponentialRampToValueAtTime(Math.max(60, frequency * 0.58), t + length);
    filter.Q.value = q;
    source.connect(filter);
    filter.connect(gain);
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(Math.min(0.28, level), t + Math.min(attack, length * 0.3));
    gain.gain.exponentialRampToValueAtTime(0.0001, t + length);
    voice.nodes.push(source, filter);
    voice.sources.push(source);
    source.start(t);
    source.stop(t + length + 0.05);
  }

  private playTone(
    position: readonly number[],
    frequency: number,
    length: number,
    level: number,
    type: OscillatorType = "sine",
    endFrequency = frequency,
    delay = 0,
  ) {
    const setup = this.voice(position, length + delay);
    if (!setup) return;
    const { ctx, voice, gain } = setup;
    const source = ctx.createOscillator(),
      t = ctx.currentTime + delay;
    source.type = type;
    source.frequency.setValueAtTime(frequency, t);
    source.frequency.exponentialRampToValueAtTime(Math.max(20, endFrequency), t + length);
    source.connect(gain);
    gain.gain.setValueAtTime(0, ctx.currentTime);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(Math.min(0.45, level), t + Math.min(0.08, length * 0.2));
    gain.gain.exponentialRampToValueAtTime(0.0001, t + length);
    voice.nodes.push(source);
    voice.sources.push(source);
    source.start(t);
    source.stop(t + length + 0.04);
  }

  private sound(e: HorrorEvent) {
    const p = e.p,
      amount = 0.5 + clamp(e.intensity) * 0.5;
    if (e.kind === "knock") {
      for (let i = 0; i < 3; i++)
        this.playTone(p, 125 - i * 8, 0.16, 0.11 * amount, "triangle", 48, i * 0.3);
      this.playNoise(p, 0.18, 0.13 * amount, 1250, 0.8);
    } else if (e.kind === "whisper") {
      this.playNoise(p, 2.5, 0.13 * amount, 1650, 2.2, 0.4);
      this.playNoise(p, 1.4, 0.06 * amount, 420, 0.7, 0.25);
    } else if (e.kind === "jumpscare") {
      // Dissonance rather than a loud clipped blast. No flashing image accompanies it.
      // Like the close mask, this perception stays beside the local listener.
      this.camera.getWorldPosition(this.cameraPosition);
      const close = [this.cameraPosition.x, this.cameraPosition.y - 2.8, this.cameraPosition.z];
      this.playNoise(close, 0.66, 0.28 * amount, 1550, 0.8, 0.04);
      this.playTone(close, 190, 0.72, 0.45 * amount, "triangle", 58);
      this.playTone(close, 201, 0.6, 0.28 * amount, "sine", 87);
    } else if (["watcher", "silhouette", "approach"].includes(e.kind)) {
      this.playTone(p, 53, 3.8, 0.05 * amount, "sine", 51);
      this.playTone(p, 56.2, 3.6, 0.028 * amount, "sine", 54.5);
      if (e.kind === "approach") this.playNoise(p, 0.4, 0.055 * amount, 860, 1.4);
    }
  }

  private stopVoice(voice: Voice) {
    for (const source of voice.sources) {
      try {
        source.stop();
      } catch {
        /* It may already have reached its scheduled end. */
      }
    }
    for (const node of voice.nodes) node.disconnect();
  }
  private pruneAudio() {
    const now = this.soundContext?.currentTime ?? 0;
    this.voices = this.voices.filter((voice) => {
      if (voice.end > now) return true;
      this.stopVoice(voice);
      return false;
    });
  }
  private stopAudio() {
    for (const voice of this.voices) this.stopVoice(voice);
    this.voices = [];
    if (this.bus && this.soundContext) {
      this.bus.gain.cancelScheduledValues(this.soundContext.currentTime);
      this.bus.gain.setValueAtTime(0, this.soundContext.currentTime);
    }
  }
  clear() {
    this.current = null;
    this.cues = [];
    this.seen.clear();
    this.group.visible = this.closeup.visible = false;
    this.overlay = 0;
    this.stopAudio();
  }
  dispose() {
    if (this.disposed) return;
    this.clear();
    this.disposed = true;
    this.scene.remove(this.group, this.closeup);
    for (const geometry of this.geometries) geometry.dispose();
    for (const material of this.materials) material.dispose();
    for (const material of this.closeMaterials) material.dispose();
    this.geometries.clear();
    this.materials.clear();
    this.closeMaterials.clear();
    this.bus?.disconnect();
    this.limiter?.disconnect();
    this.saturator?.disconnect();
    this.bus = this.limiter = null;
    this.saturator = null;
    this.noise = null;
    this.soundContext = null;
    this.seen.clear();
  }
}
