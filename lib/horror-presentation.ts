import * as THREE from "three";
import type { AudioFX } from "./audio";
import type { Dimension } from "./blocks";
import type { HorrorEvent } from "./horror-director";
import type { HuntWire } from "./horror-hunt";
import { HorrorScreamBuffer, horrorScreamTiming } from "./horror-scream";

export type HorrorPresentationContext = {
  enabled: boolean;
  active: boolean;
  dimension: Dimension;
  player?: THREE.Vector3;
  yaw?: number;
  pitch?: number;
  /** The same world clock used by the director when it supplied event.at. */
  time?: number;
  /** Current authoritative hunter snapshot; independent of incidental director apparitions. */
  threat?: HuntWire | null;
  /** Separate HorrorHunt elapsed clock, not the director's event clock. */
  huntTime?: number;
  viewerId?: string;
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
/** Camera-relative framing; movement is in the apparition, never in the player's camera. */
export function horrorCloseupPose(age: number, aspect = 16 / 9, fov = 72, reducedMotion = false) {
  const t = Math.max(0, Number.isFinite(age) ? age : 0);
  const strike = smooth((t - 0.13) / 0.085);
  // Mechanical recoil belongs to the creature, never the camera. No flashing.
  const shudder = smooth((t - 0.21) / 0.035) * (1 - smooth((t - 0.63) / 0.22)) * Math.sin(t * 94);
  const angle = (clamp(fov, 50, 100) * Math.PI) / 360;
  const ratio = clamp(aspect, 0.35, 3);
  const finalDepth = reducedMotion ? 0.85 : 0.67;
  const depth = reducedMotion
    ? finalDepth + (1 - strike) * 0.02
    : 2.65 + (finalDepth - 2.65) * strike + shudder * 0.016;
  const scale =
    0.84 *
    (Math.tan(angle) / Math.tan((72 * Math.PI) / 360)) *
    (finalDepth / 0.67) *
    Math.min(1, ratio / 0.72);
  const motion = reducedMotion ? 0.18 : 1;
  return {
    depth,
    scale,
    strike,
    jaw: 0.1 + smooth((t - 0.16) / 0.13) * 1.1 + shudder * (reducedMotion ? 0.012 : 0.1),
    roll:
      (-0.28 + smooth((t - 0.24) / 0.2) * 0.47 - smooth((t - 0.83) / 0.2) * 0.19) * motion +
      shudder * (reducedMotion ? 0.008 : 0.065),
    yaw: (0.2 - smooth((t - 0.2) / 0.2) * 0.32) * motion,
    pitch: (-0.13 + strike * 0.16) * motion,
    handSpan: (finalDepth * Math.tan(angle) * ratio) / scale,
    handScale: Math.min(1.35, ratio / 0.9),
    sway: shudder * (reducedMotion ? 0 : 0.012),
    fingerJolt: shudder * (reducedMotion ? 0.01 : 0.11),
  };
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

/** A tiny, softly edged distance impostor: one draw call, no screen blur or external asset. */
function distantTexture() {
  const width = 64,
    height = 128,
    pixels = new Uint8Array(width * height * 4);
  const ellipse = (x: number, y: number, cx: number, cy: number, rx: number, ry: number) =>
    1 - smooth((Math.hypot((x - cx) / rx, (y - cy) / ry) - 0.75) / 0.45);
  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      const x = ((col + 0.5) / width - 0.5) * 1.8;
      const y = ((row + 0.5) / height) * 4.3;
      const head = ellipse(x, y, -0.04, 3.55, 0.2, 0.43);
      const body = Math.max(
        ellipse(x, y, 0, 2, 0.4, 1.12),
        ellipse(x, y, 0, 2.76, 0.51, 0.19),
        ellipse(x, y, 0, 3.04, 0.09, 0.46),
        ellipse(x, y, -0.52, 1.91, 0.095, 0.91),
        ellipse(x, y, 0.54, 1.87, 0.095, 0.99),
        ellipse(x, y, -0.17, 0.46, 0.09, 0.49),
        ellipse(x, y, 0.17, 0.46, 0.08, 0.48),
      );
      const alpha = Math.max(head, body) * (0.86 + Math.sin(y * 13 + x * 7) * 0.05);
      const pale = head * (1 - body * 0.4),
        i = (row * width + col) * 4;
      pixels[i] = Math.round(13 + pale * 91);
      pixels[i + 1] = Math.round(19 + pale * 87);
      pixels[i + 2] = Math.round(20 + pale * 75);
      pixels[i + 3] = Math.round(alpha * 255);
    }
  }
  const texture = new THREE.DataTexture(pixels, width, height, THREE.RGBAFormat);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = texture.minFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}
type Material = THREE.MeshStandardMaterial | THREE.MeshBasicMaterial;
type Cue = { event: HorrorEvent; age: number };
type Voice = {
  nodes: AudioNode[];
  sources: AudioScheduledSourceNode[];
  end: number;
  close?: boolean;
};

/** Procedural presentation only: authoritative hunt logic owns movement, damage and death. */
export class HorrorPresentation {
  readonly group = new THREE.Group();
  readonly head = new THREE.Group();
  readonly jaw = new THREE.Group();
  readonly hands = [new THREE.Group(), new THREE.Group()];
  readonly arms = [new THREE.Group(), new THREE.Group()];
  readonly forearms = [new THREE.Group(), new THREE.Group()];
  readonly fingers: THREE.Group[] = [];
  readonly closeup = new THREE.Group();
  readonly distant: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  readonly closeHands: THREE.Object3D[] = [];
  overlay = 0;
  private closeHead: THREE.Object3D;
  private closeJaw: THREE.Object3D;
  private mouth: THREE.Object3D;
  private closeMouth: THREE.Object3D;
  private lastThreatCue = "";
  private distantMap: THREE.DataTexture;
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
  private scream = new HorrorScreamBuffer();
  private outputVolume = 0;
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
    this.distantMap = distantTexture();
    const distantMaterial = new THREE.MeshBasicMaterial({
      map: this.distantMap,
      transparent: true,
      depthTest: true,
      depthWrite: false,
      fog: true,
    });
    const distantGeometry = new THREE.PlaneGeometry(1.8, 4.3);
    this.geometries.add(distantGeometry);
    this.materials.add(distantMaterial);
    this.distant = new THREE.Mesh(distantGeometry, distantMaterial);
    this.distant.name = "horror-guest-distant";
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
      grime = material("#45473a"),
      hair = material("#080a09", 0.96);
    mask.vertexColors = true;
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
      const geometry = new THREE.SphereGeometry(1, m === mask ? 40 : detail, m === mask ? 32 : 10);
      if (m === mask) {
        const positions = geometry.attributes.position,
          colors: number[] = [];
        for (let i = 0; i < positions.count; i++) {
          const px = positions.getX(i),
            py = positions.getY(i),
            pz = positions.getZ(i);
          const pores = Math.sin(px * 41 + py * 23) * Math.sin(py * 37 - pz * 17) * 0.095;
          const blotch = Math.sin(px * 8 - py * 5 + pz * 3) * Math.cos(py * 9 + pz * 7) * 0.17;
          const stain = Math.exp(-((px + 0.43) ** 2 * 5 + (py + 0.2) ** 2 * 4)) * 0.3;
          const crease = Math.exp(-Math.abs(px - Math.sin(py * 9) * 0.08 - 0.045) * 95) * 0.34;
          const tone = clamp(0.92 + pores + blotch - stain - crease, 0.2, 1);
          colors.push(tone, tone * 0.98, tone * 0.88);
        }
        geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
      }
      const mesh = this.mesh(geometry, m, parent);
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
    this.arms.forEach((arm, i) => {
      const side = i ? 1 : -1;
      arm.name = "guest-shoulder-" + i;
      arm.position.set(side * 0.48, 2.21, -0.05);
      this.group.add(arm);
      rod(v(0, 0, 0), v(side * 0.15, -0.88, 0.04), 0.065, 0.092, i ? coat : cloth, arm);
      const elbow = this.forearms[i];
      elbow.position.set(side * 0.15, -0.88, 0.04);
      arm.add(elbow);
      rod(v(0, 0, 0), v(side * 0.035, -0.47, 0.09), 0.04, 0.065, coat, elbow);
      rod(v(side * 0.16, 0.65, -0.035), v(side * 0.18, 0.13, 0.02), 0.035, 0.05, skin, this.group);
      sphere(side * 0.18, 0.09, 0.09, 0.065, 0.075, 0.2, black, this.group);
    });
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
    const leftEye = sphere(-0.107, 0.195, 0.148, 0.078, 0.099, 0.031, black, this.head);
    const rightEye = sphere(0.097, 0.232, 0.145, 0.06, 0.123, 0.035, black, this.head);
    leftEye.name = "guest-eye-left";
    rightEye.name = "guest-eye-right";
    leftEye.rotation.z = -0.22;
    rightEye.rotation.z = 0.18;
    for (const side of [-1, 1]) {
      const rim = this.mesh(new THREE.TorusGeometry(0.088, 0.009, 5, 16), bone, this.head);
      rim.position.set(side * 0.104, side < 0 ? 0.2 : 0.232, 0.15);
      rim.scale.set(side < 0 ? 0.9 : 0.72, side < 0 ? 1.08 : 1.37, 0.55);
      rim.rotation.z = side * 0.19;
      // The uneven cheek ridges surround black cavities instead of a flat painted eye texture.
      rod(v(side * 0.175, 0.09, 0.11), v(side * 0.12, -0.135, 0.16), 0.014, 0.025, bone, this.head);
    }
    // No pupils or glows: the eyes remain deep, motionless black holes.
    const nose = sphere(-0.016, 0.015, 0.166, 0.024, 0.137, 0.032, bone, this.head);
    nose.rotation.z = -0.14;
    for (let i = 0; i < 6; i++) {
      const points: THREE.Vector3[] = [];
      for (let step = 0; step < 7; step++) {
        const x = (i < 3 ? -1 : 1) * (0.034 + (i % 3) * 0.036) + Math.sin(step * 1.7 + i) * 0.008;
        const y = 0.45 - step * 0.035 - (i % 2) * 0.045;
        const surface = Math.sqrt(Math.max(0, 1 - (x / 0.205) ** 2 - ((y - 0.095) / 0.4) ** 2));
        points.push(v(x, y, 0.025 + surface * 0.145));
      }
      this.mesh(
        new THREE.TubeGeometry(
          new THREE.CatmullRomCurve3(points),
          12,
          0.0019 + (i % 2) * 0.0008,
          3,
          false,
        ),
        grime,
        this.head,
      );
    }
    this.mouth = sphere(0.008, -0.22, 0.142, 0.132, 0.15, 0.056, black, this.head);
    this.mouth.name = "guest-mouth-cavity";
    this.jaw.position.set(0, -0.175, -0.001);
    this.jaw.name = "guest-jaw";
    this.head.add(this.jaw);
    sphere(0, -0.13, 0.075, 0.123, 0.12, 0.095, mask, this.jaw);
    sphere(0, -0.064, 0.158, 0.094, 0.018, 0.025, black, this.jaw);
    for (let i = 0; i < 9; i++) {
      const x = (i - 4) * 0.025,
        height = 0.023 + (i % 3) * 0.009;
      const upper = this.mesh(new THREE.ConeGeometry(0.009, height, 4), bone, this.head);
      upper.position.set(x, -0.118, 0.197 - Math.abs(x) * 0.18);
      upper.rotation.z = Math.PI + (i % 2 ? 0.1 : -0.14);
      const lower = this.mesh(new THREE.ConeGeometry(0.008, height * 0.9, 4), bone, this.jaw);
      lower.position.set(x, -0.025, 0.153 - Math.abs(x) * 0.15);
      lower.rotation.z = i % 2 ? -0.17 : 0.09;
    }
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
      hand.position.set(side * 0.035, -0.47, 0.09);
      this.forearms[sideIndex].add(hand);
      sphere(0, -0.08, 0, 0.068, 0.12, 0.04, skin, hand);
      for (let i = 0; i < 5; i++) {
        const finger = new THREE.Group();
        finger.name = "guest-finger-" + sideIndex + "-" + i;
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
    this.closeHead.scale.x = 1.2;
    this.closeup.add(this.closeHead);
    this.closeJaw = this.closeHead.getObjectByName("guest-jaw")!;
    this.closeMouth = this.closeHead.getObjectByName("guest-mouth-cavity")!;
    for (const hand of this.hands) {
      const closeHand = hand.clone(true);
      closeHand.position.set(0, 0, 0);
      this.closeHands.push(closeHand);
      this.closeup.add(closeHand);
    }
    const closeMap = new Map<Material, Material>();
    this.closeup.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return;
      const old = o.material as Material;
      let m = closeMap.get(old);
      if (!m) {
        m = new THREE.MeshBasicMaterial({
          color: old.color.clone().multiplyScalar(0.82),
          vertexColors: old.vertexColors,
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
    // Articulated groups move, but teeth, hair strands and bones have fixed local transforms.
    // Avoid recomposing hundreds of static mesh matrices every frame, including while hidden.
    for (const root of [this.group, this.closeup])
      root.traverse((object) => {
        if (!(object instanceof THREE.Mesh) || object === this.mouth || object === this.closeMouth)
          return;
        object.updateMatrix();
        object.matrixAutoUpdate = false;
      });
    this.group.visible = this.closeup.visible = this.distant.visible = false;
    this.scene.add(this.group, this.closeup, this.distant);
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
        this.group.visible = this.closeup.visible = this.distant.visible = false;
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
      this.group.visible = this.closeup.visible = this.distant.visible = false;
      this.overlay = 0;
      this.cues = [];
      this.stopAudio();
      return;
    }
    this.prepareAudio(context.volume);
    if (!context.jumpscares) {
      this.voices = this.voices.filter((voice) => {
        if (!voice.close) return true;
        this.stopVoice(voice);
        return false;
      });
    }
    this.group.scale.set(1, 1, 1);
    this.group.rotation.x = this.group.rotation.z = 0;
    for (const arm of this.arms) arm.rotation.set(0, 0, 0);
    for (const elbow of this.forearms) elbow.rotation.set(0, 0, 0);
    this.jaw.position.y = -0.175;
    this.mouth.scale.y = 0.15;
    const cue = this.current;
    // Advance one time per cue, even when the same object is also in the sound queue.
    for (const pending of this.cues) if (pending !== cue) this.age(pending, dt, context.time);
    const age = cue ? this.age(cue, dt, context.time) : 0;
    const visible =
      cue &&
      cue.event.dimension === context.dimension &&
      age < cue.event.duration &&
      (!context.viewerId || cue.event.viewerIds.includes(context.viewerId)) &&
      !(
        cue.event.kind === "jumpscare" &&
        context.threat?.phase === "caught" &&
        context.viewerId &&
        context.threat.targetId !== context.viewerId
      );
    this.group.visible = this.closeup.visible = this.distant.visible = false;
    let targetOverlay = 0;
    if (visible && cue) {
      const e = cue.event,
        intensity = e.intensity,
        close = e.kind === "jumpscare";
      const length = close ? Math.min(e.duration, 1.3) : e.duration;
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
      this.camera.getWorldPosition(this.cameraPosition);
      const passive = e.reason === "passive-watch";
      if (e.kind === "watcher" && this.cameraPosition.distanceTo(this.group.position) >= 18) {
        this.group.visible = false;
        this.distant.visible = envelope > 0;
        this.distant.position.set(e.p[0], e.p[1] + 2.15, e.p[2]);
        this.distant.rotation.set(
          0,
          Math.atan2(this.cameraPosition.x - e.p[0], this.cameraPosition.z - e.p[2]),
          0,
        );
        this.distant.material.opacity = envelope * (passive ? 0.48 + intensity * 0.15 : 0.74);
      }
      if (close && context.jumpscares && envelope > 0) {
        this.camera.getWorldPosition(this.cameraPosition);
        this.camera.getWorldQuaternion(this.cameraRotation);
        const perspective = this.camera as THREE.PerspectiveCamera;
        const pose = horrorCloseupPose(
          age,
          perspective.aspect ?? 1,
          perspective.fov ?? 72,
          context.reducedMotion,
        );
        this.closeup.position
          .set(pose.sway, 0.015, -pose.depth)
          .applyQuaternion(this.cameraRotation)
          .add(this.cameraPosition);
        this.closeup.quaternion.copy(this.cameraRotation);
        this.closeup.scale.setScalar(pose.scale);
        this.closeHead.rotation.set(pose.pitch, pose.yaw, pose.roll);
        this.closeJaw.rotation.x = pose.jaw;
        this.closeJaw.position.y = -0.175 - (pose.jaw / 1.2) * 0.17;
        this.closeMouth.scale.y = 0.15 + (pose.jaw / 1.2) * 0.22;
        this.closeHands.forEach((hand, i) => {
          const side = i ? 1 : -1;
          hand.position.set(
            side * pose.handSpan * (1.7 - pose.strike * 0.63),
            0.13 - pose.strike * 0.19 + i * 0.07,
            0.18,
          );
          hand.scale.set(pose.handScale, pose.handScale * 1.65, pose.handScale);
          hand.rotation.set(-0.25, side * 0.13, -side * (Math.PI / 2 + 0.13));
          hand.children.forEach((finger, fingerIndex) => {
            if (!finger.name.startsWith("guest-finger")) return;
            finger.rotation.x =
              (0.25 +
                pose.strike * 0.8 +
                Math.sin(age * 4 + fingerIndex) * 0.08 +
                pose.fingerJolt) *
              motion;
          });
        });
        for (const material of this.closeMaterials) material.opacity = envelope;
        this.closeup.visible = true;
      }
      targetOverlay = close
        ? context.jumpscares
          ? Math.max(envelope * 0.65, smooth((age - 1.08) / 0.2) * 0.9)
          : 0
        : passive
          ? 0
          : envelope * (0.14 + intensity * 0.24);
      if (!close && !passive && age >= this.nextBreath) {
        this.nextBreath = age + 3.8 + (e.seed % 13) * 0.11;
        this.playNoise(e.p, 1.8, 0.025 + intensity * 0.02, 360, 0.6, 0.2);
      }
    } else if (cue && age >= cue.event.duration) this.current = null;
    const threatOverlay = this.renderThreat(context);
    targetOverlay = Math.max(targetOverlay, threatOverlay);
    this.overlay += (targetOverlay - this.overlay) * (1 - Math.exp(-Math.min(dt, 0.1) * 5));
    if (this.overlay < 0.001) this.overlay = 0;
    for (const pending of this.cues) {
      if (pending.event.dimension !== context.dimension || pending.age > 0.65) continue;
      if (context.viewerId && !pending.event.viewerIds.includes(context.viewerId)) continue;
      if (pending.event.kind === "jumpscare" && !context.jumpscares) continue;
      if (
        pending.event.kind === "jumpscare" &&
        context.threat?.phase === "caught" &&
        context.viewerId &&
        context.threat.targetId !== context.viewerId
      )
        continue;
      this.sound(pending.event, pending.age);
    }
    this.cues = [];
    this.pruneAudio();
  }

  private renderThreat(context: HorrorPresentationContext) {
    const threat = context.threat;
    if (!threat) {
      this.lastThreatCue = "";
      return 0;
    }
    if (
      threat.dimension !== context.dimension ||
      (context.viewerId && !threat.viewerIds.includes(context.viewerId)) ||
      !Array.isArray(threat.p) ||
      !threat.p.every(Number.isFinite)
    )
      return 0;
    const elapsed = Math.max(
      0,
      (Number.isFinite(context.huntTime) ? context.huntTime! : threat.at) - threat.phaseAt,
    );
    const phase = clamp(elapsed / Math.max(0.01, threat.phaseDuration));
    const motion = context.reducedMotion ? 0.2 : 1;
    const terminal = threat.phase === "escaped" || threat.phase === "banished";
    const envelope = terminal
      ? 1 - smooth(phase)
      : threat.phase === "telegraph"
        ? Math.min(1, 0.3 + smooth(elapsed / 0.65))
        : 1;
    const caughtLocally =
      threat.phase === "caught" && (!context.viewerId || threat.targetId === context.viewerId);
    this.distant.visible = false;
    this.group.visible = !caughtLocally && envelope > 0;
    this.group.position.fromArray(threat.p);
    this.group.rotation.set(0, Number.isFinite(threat.yaw) ? threat.yaw : 0, 0);
    this.group.scale.set(1, 1, 1);
    const walk = (Number.isFinite(context.huntTime) ? context.huntTime! : threat.at) * 5;
    const hurt = clamp(threat.hurt ?? 0);
    let headTilt = 0.16,
      jaw = 0.13;
    this.hands.forEach((hand) => hand.rotation.set(0, 0, 0));
    this.fingers.forEach((finger, i) => {
      finger.rotation.x = 0.2 + Math.sin(walk * 0.55 + i * 0.6) * 0.07 * motion;
    });
    if (threat.phase === "stalk") {
      this.group.position.y += Math.sin(walk) * 0.032 * motion;
      this.arms.forEach((arm, i) => {
        arm.rotation.x = Math.sin(walk + i * Math.PI) * 0.2 * motion;
      });
      headTilt = 0.22 + Math.sin(walk * 0.28) * 0.06 * motion;
    } else if (threat.phase === "lungeTell") {
      const coil = smooth(phase);
      this.group.scale.y = 1 - coil * 0.1;
      this.group.rotation.x = -coil * 0.12 * motion;
      this.arms.forEach((arm, i) => {
        arm.rotation.x = -0.3 - coil * 1.15;
        arm.rotation.z = (i ? 1 : -1) * coil * 0.28;
      });
      this.forearms.forEach((elbow) => {
        elbow.rotation.x = -coil * 0.55;
      });
      jaw = 0.2 + coil * 0.4;
      headTilt = -0.3 * motion;
    } else if (threat.phase === "lunge" || threat.phase === "caught") {
      this.group.rotation.x = 0.22 * motion;
      this.arms.forEach((arm, i) => {
        arm.rotation.x = -1.6;
        arm.rotation.z = (i ? 1 : -1) * 0.18;
      });
      this.forearms.forEach((elbow) => {
        elbow.rotation.x = -0.2;
      });
      this.fingers.forEach((finger) => {
        finger.rotation.x = 0.8;
      });
      jaw = 0.95;
      headTilt = 0.04;
    } else if (threat.phase === "vulnerable") {
      const stagger = (1 - smooth(phase)) * 0.24 + hurt * 0.14;
      this.group.rotation.z = -stagger * motion;
      this.group.scale.y = 0.91 + smooth(phase) * 0.09;
      this.arms.forEach((arm, i) => {
        arm.rotation.x = -0.25;
        arm.rotation.z = (i ? 1 : -1) * 0.4;
      });
      this.forearms.forEach((elbow) => {
        elbow.rotation.x = -0.55;
      });
      jaw = 0.4;
      headTilt = -0.35 * motion;
    } else if (terminal) {
      this.group.scale.y = 1 - smooth(phase) * (threat.phase === "banished" ? 0.65 : 0.12);
      this.group.rotation.z = smooth(phase) * 0.2 * motion;
      headTilt = -0.18 * motion;
    }
    this.head.rotation.set(-hurt * 0.15 * motion, Math.sin(walk * 0.21) * 0.025 * motion, headTilt);
    this.jaw.rotation.x = jaw;
    this.jaw.position.y = -0.175 - jaw * 0.09;
    this.mouth.scale.y = 0.15 + jaw * 0.12;
    for (const material of this.materials) material.opacity = envelope;
    const cueKey = threat.id + ":" + threat.phase + ":" + threat.phaseAt;
    if (cueKey !== this.lastThreatCue) {
      this.lastThreatCue = cueKey;
      if (elapsed < 0.65 && threat.phase !== "caught") {
        if (threat.phase === "lungeTell") {
          this.playNoise(threat.p, 0.7, 0.11, 1550, 1.6, 0.22);
          this.playTone(threat.p, 72, 0.95, 0.09, "sine", 105);
        } else if (threat.phase === "vulnerable") {
          this.playNoise(threat.p, 0.45, 0.09, 470, 1.2);
        } else if (threat.phase === "telegraph" || threat.phase === "stalk") {
          this.playNoise(threat.p, 1.3, 0.055, 840, 1.8, 0.3);
        } else if (threat.phase === "banished")
          this.playTone(threat.p, 110, 1.9, 0.08, "triangle", 25);
      }
    }
    return this.group.visible
      ? (threat.phase === "lungeTell" ? 0.23 : threat.phase === "lunge" ? 0.32 : 0.13) * envelope
      : 0;
  }

  private prepareAudio(volume: number) {
    const ctx = this.audio.ctx;
    this.outputVolume = horrorGain(this.audio.volume, volume);
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
      this.scream.clear();
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
    if (this.outputVolume <= 0) this.stopAudio();
    else this.bus!.gain.setTargetAtTime(this.outputVolume, ctx.currentTime, 0.04);
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
      this.outputVolume <= 0 ||
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
    delay = 0,
  ) {
    const setup = this.voice(position, length + delay);
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
      t = ctx.currentTime + delay;
    source.buffer = this.noise;
    source.loop = true;
    filter.type = "bandpass";
    filter.frequency.setValueAtTime(frequency, t);
    filter.frequency.exponentialRampToValueAtTime(Math.max(60, frequency * 0.58), t + length);
    filter.Q.value = q;
    source.connect(filter);
    filter.connect(gain);
    gain.gain.setValueAtTime(0, ctx.currentTime);
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

  private playScream(position: readonly number[], level: number, age: number, duration: number) {
    const timing = horrorScreamTiming(age, duration);
    if (!timing) return;
    const setup = this.voice(position, timing.delay + timing.length);
    if (!setup) return;
    const { ctx, voice, gain } = setup;
    const source = ctx.createBufferSource(),
      start = ctx.currentTime + timing.delay,
      end = start + timing.length;
    source.buffer = this.scream.get(ctx);
    source.connect(gain);
    gain.gain.setValueAtTime(0, ctx.currentTime);
    gain.gain.setValueAtTime(0, start);
    // The buffer already has its own envelope; this short fade protects late packet offsets.
    gain.gain.linearRampToValueAtTime(
      Math.min(1, level),
      start + Math.min(0.006, timing.length / 3),
    );
    gain.gain.setValueAtTime(Math.min(1, level), Math.max(start + 0.006, end - 0.015));
    gain.gain.linearRampToValueAtTime(0, end);
    voice.nodes.push(source);
    voice.sources.push(source);
    source.start(start, timing.offset, timing.length);
    source.stop(end + 0.005);
  }

  private sound(e: HorrorEvent, age = 0) {
    if (e.reason === "passive-watch") return;
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
      // A whispered intake, a deliberate gap, then an original voiced shriek and low impact.
      // The original bus/compressor/soft limiter ceiling stays unchanged.
      for (const voice of this.voices) this.stopVoice(voice);
      this.voices = [];
      this.camera.getWorldPosition(this.cameraPosition);
      const close = [this.cameraPosition.x, this.cameraPosition.y - 2.8, this.cameraPosition.z];
      if (age < 0.04) {
        this.playNoise(close, 0.15, 0.11 * amount, 1850, 2.4, 0.1);
        this.playNoise(close, 0.14, 0.05 * amount, 340, 0.9, 0.1);
      }
      const end = Math.min(1.3, e.duration);
      const noise = (
        at: number,
        length: number,
        level: number,
        frequency: number,
        q: number,
        attack: number,
      ) => {
        const remaining = Math.min(at + length, end) - Math.max(at, age);
        if (remaining > 0.025)
          this.playNoise(
            close,
            remaining,
            level * amount,
            frequency,
            q,
            attack,
            Math.max(0, at - age),
          );
      };
      const tone = (
        at: number,
        length: number,
        level: number,
        frequency: number,
        type: OscillatorType,
        to: number,
      ) => {
        const remaining = Math.min(at + length, end) - Math.max(at, age);
        if (remaining > 0.025)
          this.playTone(
            close,
            frequency,
            remaining,
            level * amount,
            type,
            to,
            Math.max(0, at - age),
          );
      };
      noise(0.23, 0.91, 0.12, 1700, 0.95, 0.028);
      noise(0.25, 0.83, 0.075, 690, 1.7, 0.04);
      tone(0.22, 0.98, 0.17, 171, "triangle", 64);
      this.playScream(close, 0.92 * amount, age, e.duration);
      tone(0.21, 1, 0.24, 58, "sine", 32);
      if (age < 0.28) tone(0.215, 0.15, 0.025, 2410, "square", 730);
      noise(0.36, 0.22, 0.045, 2900, 3.3, 0.015);
      for (const voice of this.voices) voice.close = true;
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
    this.lastThreatCue = "";
    this.group.visible = this.closeup.visible = this.distant.visible = false;
    this.overlay = 0;
    this.stopAudio();
  }
  dispose() {
    if (this.disposed) return;
    this.clear();
    this.disposed = true;
    this.scene.remove(this.group, this.closeup, this.distant);
    this.distantMap.dispose();
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
    this.scream.clear();
    this.soundContext = null;
    this.seen.clear();
  }
}
