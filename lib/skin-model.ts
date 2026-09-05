import * as THREE from "three";
import { HeldItemModel, type HeldTextureFactory } from "./held-item";
import type { HandSwingPose } from "./interaction-effects";
import { validFaceFrame } from "./net-protocol";
import { ARMOR_COLORS, ARMOR_SLOTS, armorInfo, normalizeEquipment, type Equipment } from "./armor";
import { bedRestPose, type BedRest } from "./bed-rest";
import { eatingMotion } from "./eating";
const STILL_HAND: HandSwingPose = { x: 0, y: 0, z: 0, rx: 0, rz: 0 };
export type Face = "front" | "back" | "left" | "right" | "top" | "bottom";
export type Part = "head" | "body" | "armR" | "armL" | "legR" | "legL" | "cape";
export const PART_NAMES: Record<Part, string> = {
  head: "Głowa",
  body: "Tułów",
  armR: "Prawa ręka",
  armL: "Lewa ręka",
  legR: "Prawa noga",
  legL: "Lewa noga",
  cape: "Peleryna",
};
export const FACE_NAMES: Record<Face, string> = {
  front: "Przód",
  back: "Tył",
  left: "Lewy bok",
  right: "Prawy bok",
  top: "Góra",
  bottom: "Dół",
};
type Definition = {
  w: number;
  h: number;
  d: number;
  base: [number, number];
  outer: [number, number];
  pos: [number, number, number];
};
export const PARTS: Record<Exclude<Part, "cape">, Definition> = {
  head: { w: 8, h: 8, d: 8, base: [0, 0], outer: [32, 0], pos: [0, 28, 0] },
  body: { w: 8, h: 12, d: 4, base: [16, 16], outer: [16, 32], pos: [0, 18, 0] },
  armR: {
    w: 4,
    h: 12,
    d: 4,
    base: [40, 16],
    outer: [40, 32],
    pos: [-6, 18, 0],
  },
  armL: { w: 4, h: 12, d: 4, base: [32, 48], outer: [48, 48], pos: [6, 18, 0] },
  legR: { w: 4, h: 12, d: 4, base: [0, 16], outer: [0, 32], pos: [-2, 6, 0] },
  legL: { w: 4, h: 12, d: 4, base: [16, 48], outer: [0, 48], pos: [2, 6, 0] },
};
export function faceRect(part: Part, face: Face, layer: number): [number, number, number, number] {
  const def = part === "cape" ? { w: 10, h: 16, d: 1, base: [0, 0], outer: [0, 0] } : PARTS[part];
  const [u, v] = layer === 0 ? def.base : def.outer,
    { w, h, d } = def;
  const f: Record<Face, [number, number, number, number]> = {
    right: [u, v + d, d, h],
    front: [u + d, v + d, w, h],
    left: [u + d + w, v + d, d, h],
    back: [u + 2 * d + w, v + d, w, h],
    top: [u + d, v, w, d],
    bottom: [u + d + w, v, w, d],
  };
  return f[face];
}
export type SkinData = {
  skin: HTMLCanvasElement;
  cape: HTMLCanvasElement;
  capeEnabled: boolean;
};
function canvas(w: number, h: number) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}
function createDefaultSkin(legacy = false): SkinData {
  const skin = canvas(64, 64),
    cape = canvas(64, 32),
    ctx = skin.getContext("2d")!;
  for (const part of Object.keys(PARTS)) {
    const color = part === "head" ? "#b88663" : part.startsWith("leg") ? "#314955" : "#588b82";
    for (const face of Object.keys(FACE_NAMES) as Face[]) {
      const [x, y, w, h] = faceRect(part as Part, face, 0);
      ctx.fillStyle = color;
      ctx.fillRect(x, y, w, h);
      for (let i = 0; i < w * h; i++) {
        if (i % 7 === 0) {
          ctx.fillStyle = "#ffffff0b";
          ctx.fillRect(x + (i % w), y + Math.floor(i / w), 1, 1);
        }
      }
      if (part.startsWith("arm") && (legacy || face !== "top")) {
        ctx.fillStyle = "#bd8c66";
        ctx.fillRect(x, y + h - 4, w, 4);
      }
      if (part.startsWith("leg") && (legacy || face !== "top")) {
        ctx.fillStyle = "#253137";
        if (!legacy && face === "bottom") ctx.fillRect(x, y, w, h);
        else ctx.fillRect(x, y + h - 2, w, 2);
      }
      if (!legacy && part === "body" && face === "top") {
        ctx.fillStyle = "#b88663";
        ctx.fillRect(x + 2, y, w - 4, h);
      }
      if (part === "head") {
        if (face === "top" || face === "back") {
          ctx.fillStyle = "#4b3930";
          ctx.fillRect(x, y, w, h);
        } else if (["front", "right", "left"].includes(face)) {
          ctx.fillStyle = "#4b3930";
          ctx.fillRect(x, y, w, 2);
          if (face === "front") {
            ctx.fillRect(x, y + 2, 2, 1);
            ctx.fillStyle = "#efece0";
            ctx.fillRect(x + 1, y + 4, 2, 1);
            ctx.fillRect(x + 5, y + 4, 2, 1);
            ctx.fillStyle = "#354c48";
            ctx.fillRect(x + 2, y + 4, 1, 1);
            ctx.fillRect(x + 5, y + 4, 1, 1);
            ctx.fillStyle = "#825a49";
            ctx.fillRect(x + 3, y + 6, 2, 1);
          }
        }
      }
    }
  }
  const c = cape.getContext("2d")!;
  c.fillStyle = "#264f49";
  c.fillRect(0, 0, 64, 32);
  for (const f of ["front", "back"] as Face[]) {
    const [x, y, w, h] = faceRect("cape", f, 0);
    c.fillStyle = "#c5d6a2";
    c.fillRect(x, y + h - 2, w, 1);
    c.fillRect(x + 2, y + 5, 6, 5);
    c.fillStyle = "#51786b";
    c.fillRect(x + 3, y + 6, 4, 3);
    c.fillStyle = "#c5d6a2";
    c.fillRect(x + 4, y + 4, 2, 7);
  }
  return { skin, cape, capeEnabled: true };
}
export function defaultSkin(): SkinData {
  return createDefaultSkin();
}
/** Upgrade only an exact, generated legacy skin; any painted pixel preserves the user's work. */
export function migrateLegacyDefaultSkin(data: SkinData) {
  const ctx = data.skin.getContext("2d")!;
  const actual = ctx.getImageData(0, 0, 64, 64).data;
  const legacy = createDefaultSkin(true).skin.getContext("2d")!.getImageData(0, 0, 64, 64).data;
  if (actual.length !== legacy.length || actual.some((value, index) => value !== legacy[index]))
    return false;
  ctx.clearRect(0, 0, 64, 64);
  ctx.drawImage(defaultSkin().skin, 0, 0);
  return true;
}
let cachedSkin: { skin: string; cape: string; capeEnabled: boolean } | null = null;
export async function readSkin() {
  const data = defaultSkin();
  try {
    let s = cachedSkin;
    if (!s)
      try {
        s = JSON.parse(localStorage.getItem("blockland.skin") ?? "null");
      } catch {}
    if (s) {
      await Promise.all(
        [
          ["skin", 64, 64],
          ["cape", 64, 32],
        ].map(async ([key, w, h]) => {
          const url = s![key as "skin" | "cape"];
          if (typeof url !== "string" || !url.startsWith("data:image/png;")) return;
          await new Promise<void>((resolve) => {
            const img = new Image();
            img.onload = () => {
              if (img.width === w && img.height === h) {
                const ctx = data[key as "skin" | "cape"].getContext("2d")!;
                ctx.clearRect(0, 0, Number(w), Number(h));
                ctx.drawImage(img, 0, 0);
              }
              resolve();
            };
            img.onerror = () => resolve();
            img.src = url;
          });
        }),
      );
      data.capeEnabled = !!s.capeEnabled;
      if (migrateLegacyDefaultSkin(data)) {
        cachedSkin = {
          skin: data.skin.toDataURL("image/png"),
          cape: data.cape.toDataURL("image/png"),
          capeEnabled: data.capeEnabled,
        };
        try {
          localStorage.setItem("blockland.skin", JSON.stringify(cachedSkin));
        } catch {}
      }
    }
  } catch {}
  return data;
}
export function saveSkin(data: SkinData) {
  cachedSkin = {
    skin: data.skin.toDataURL("image/png"),
    cape: data.cape.toDataURL("image/png"),
    capeEnabled: data.capeEnabled,
  };
  let persistent = true;
  try {
    localStorage.setItem("blockland.skin", JSON.stringify(cachedSkin));
  } catch {
    persistent = false;
  }
  window.dispatchEvent(new Event("blockland-skin"));
  return persistent;
}
function boxGeometry(part: Part, layer: number) {
  const def = part === "cape" ? { w: 10, h: 16, d: 1 } : PARTS[part];
  const inflate = layer === 1 ? 0.5 : 0;
  const geo = new THREE.BoxGeometry(
    (def.w + inflate) / 16,
    (def.h + inflate) / 16,
    (def.d + inflate) / 16,
  );
  const uv = geo.attributes.uv as THREE.BufferAttribute;
  const height = part === "cape" ? 32 : 64;
  (["right", "left", "top", "bottom", "front", "back"] as Face[]).forEach((face, i) => {
    const [x, y, w, h] = faceRect(part, face, layer),
      eps = 0.004;
    uv.setXY(i * 4, (x + eps) / 64, 1 - (y + eps) / height);
    uv.setXY(i * 4 + 1, (x + w - eps) / 64, 1 - (y + eps) / height);
    uv.setXY(i * 4 + 2, (x + eps) / 64, 1 - (y + h - eps) / height);
    uv.setXY(i * 4 + 3, (x + w - eps) / 64, 1 - (y + h - eps) / height);
  });
  return geo;
}
export class SkinModel {
  group = new THREE.Group();
  texture: THREE.CanvasTexture;
  capeTexture: THREE.CanvasTexture;
  material: THREE.MeshStandardMaterial;
  capeMaterial: THREE.MeshStandardMaterial;
  parts = new Map<string, THREE.Mesh>();
  head = new THREE.Group();
  capePivot = new THREE.Group();
  joints: Record<string, THREE.Group> = {};
  grip = new THREE.Group();
  heldItem = new HeldItemModel();
  private resting = false;
  private eatingDirection = new THREE.Vector3();
  private eatingRotation = new THREE.Quaternion();
  private eatingGripRotation = new THREE.Quaternion();
  private eatingDown = new THREE.Vector3(0, -1, 0);
  private armorKey = "";
  private armorMeshes: THREE.Mesh[] = [];
  private armorMaterials: THREE.MeshStandardMaterial[] = [];
  faceMaterial = new THREE.MeshStandardMaterial({
    roughness: 1,
    transparent: true,
    alphaTest: 0.01,
  });
  faceOverlay = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.5), this.faceMaterial);
  private faceOwnedTexture: THREE.Texture | null = null;
  private faceImage: HTMLImageElement | null = null;
  private faceGeneration = 0;
  private disposed = false;
  constructor(public data: SkinData) {
    this.texture = new THREE.CanvasTexture(data.skin);
    this.texture.magFilter = THREE.NearestFilter;
    this.texture.minFilter = THREE.NearestFilter;
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.capeTexture = new THREE.CanvasTexture(data.cape);
    this.capeTexture.magFilter = THREE.NearestFilter;
    this.capeTexture.minFilter = THREE.NearestFilter;
    this.capeTexture.colorSpace = THREE.SRGBColorSpace;
    this.material = new THREE.MeshStandardMaterial({
      map: this.texture,
      roughness: 1,
      transparent: true,
      alphaTest: 0.05,
    });
    this.capeMaterial = new THREE.MeshStandardMaterial({
      map: this.capeTexture,
      roughness: 1,
      transparent: true,
      alphaTest: 0.05,
    });
    for (const [part, def] of Object.entries(PARTS)) {
      const joint = new THREE.Group();
      this.joints[part] = joint;
      if (part === "head") {
        this.head = joint;
        joint.position.set(0, 24 / 16, 0);
      } else if (part.startsWith("arm")) joint.position.set(def.pos[0] / 16, 23 / 16, 0);
      else if (part.startsWith("leg")) joint.position.set(def.pos[0] / 16, 12 / 16, 0);
      else joint.position.set(...(def.pos.map((n) => n / 16) as [number, number, number]));
      this.group.add(joint);
      for (let layer = 0; layer < 2; layer++) {
        const mesh = new THREE.Mesh(boxGeometry(part as Part, layer), this.material);
        mesh.position.y =
          part === "head"
            ? 4 / 16
            : part.startsWith("arm")
              ? -5 / 16
              : part.startsWith("leg")
                ? -6 / 16
                : 0;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.userData = { part, layer };
        joint.add(mesh);
        this.parts.set(part + layer, mesh);
      }
    }
    this.faceOverlay.name = "live-camera-face";
    this.faceOverlay.position.set(0, 4 / 16, 8.5 / 32 + 0.002);
    this.faceOverlay.visible = false;
    this.head.add(this.faceOverlay);
    this.capePivot.position.set(0, 23 / 16, -0.17);
    const cape = new THREE.Mesh(boxGeometry("cape", 0), this.capeMaterial);
    cape.position.set(0, -0.5, -0.015);
    cape.userData = { part: "cape", layer: 0 };
    cape.castShadow = true;
    this.capePivot.add(cape);
    this.group.add(this.capePivot);
    this.parts.set("cape0", cape);
    this.capePivot.visible = data.capeEnabled;
    this.capePivot.rotation.x = 0.16;
    this.grip.name = "right-wrist-grip";
    this.grip.position.set(0, -10 / 16, 0.11);
    this.grip.rotation.x = 0.5;
    this.grip.add(this.heldItem.group);
    this.joints.armR.add(this.grip);
  }
  refresh() {
    this.texture.needsUpdate = true;
    this.capeTexture.needsUpdate = true;
    this.capePivot.visible = this.data.capeEnabled;
  }
  pose(time: number, walking = false, crouching = false, attackProgress = -1, eatProgress = -1) {
    const eating = eatingMotion(eatProgress);
    const angle = walking ? Math.sin(time * 10) * 0.6 : 0;
    this.joints.legR.rotation.x = angle;
    this.joints.legL.rotation.x = -angle;
    this.joints.armR.rotation.x = -angle * 0.7;
    this.joints.armL.rotation.x = angle * 0.7;
    this.joints.armR.rotation.y = 0;
    this.joints.armR.rotation.z = 0;
    this.joints.body.rotation.y = 0;
    if (eatProgress < 0 && attackProgress >= 0 && attackProgress <= 1) {
      const smooth = (n: number) => n * n * (3 - 2 * n);
      const t = attackProgress;
      // Lift from the shoulder, strike forward and down, then recover.
      this.joints.armR.rotation.x =
        t < 0.22
          ? -2.25 * smooth(t / 0.22)
          : t < 0.7
            ? -2.25 + 2.5 * smooth((t - 0.22) / 0.48)
            : 0.25 * (1 - smooth((t - 0.7) / 0.3));
      this.joints.armR.rotation.z = -Math.sin(Math.PI * t) * 0.32;
      this.joints.armR.rotation.y = Math.sin(Math.PI * t) * 0.22;
      this.joints.body.rotation.y = -Math.sin(Math.PI * t) * 0.13;
    }
    this.joints.body.rotation.x = crouching ? 0.3 : 0;
    this.grip.position.set(0, -10 / 16, 0.11 * (1 - eating.blend));
    this.grip.rotation.set(0.5, 0, 0);
    if (eating.blend > 0) {
      this.eatingDirection
        .set(0.395, 0.08 + eating.bite * 0.035, 0.46 - eating.bite * 0.07)
        .normalize();
      this.eatingRotation.setFromUnitVectors(this.eatingDown, this.eatingDirection);
      this.joints.armR.quaternion.slerp(this.eatingRotation, eating.blend);
      this.eatingGripRotation.setFromEuler(
        new THREE.Euler(0.1 + eating.bite * 0.15, -0.2, -0.28 + eating.bite * 0.06),
      );
      this.eatingRotation
        .copy(this.joints.armR.quaternion)
        .invert()
        .multiply(this.eatingGripRotation);
      this.grip.quaternion.slerp(this.eatingRotation, eating.blend);
    }
    this.capePivot.rotation.x = 0.16 + Math.sin(time * 2) * 0.04 + (walking ? 0.32 : 0);
    this.group.scale.y = crouching ? 0.85 : 1;
  }
  armMesh() {
    const mesh = new THREE.Mesh(boxGeometry("armR", 0), this.material);
    // The wrist is the bottom of the skin UV. Flip the arm so it points out from the shoulder.
    mesh.rotation.set(-0.18, 0, Math.PI - 0.17);
    return mesh;
  }
  setHeldItem(id: number) {
    this.heldItem.set(id);
  }
  /** Apply after the ordinary pose/world transform; the inventory preview stays upright. */
  setBedRest(rest: BedRest | null | undefined) {
    if (!rest) {
      if (!this.resting) return;
      this.resting = false;
      this.group.rotation.x = this.group.rotation.z = 0;
      this.group.rotation.order = "XYZ";
      this.group.scale.y = 1;
      this.head.position.z = 0;
      this.grip.visible = true;
      this.capePivot.visible = this.data.capeEnabled;
      return;
    }
    this.resting = true;
    const pose = bedRestPose(rest);
    this.group.position.fromArray(pose.p);
    this.group.rotation.set(-Math.PI / 2, pose.yaw, 0, "YXZ");
    this.group.scale.y = rest.legacy ? 0.48 : 1;
    for (const joint of Object.values(this.joints)) joint.rotation.set(0, 0, 0);
    // The head is twice as deep as the torso: lift it onto the pillow instead of through it.
    this.head.position.z = 0.15;
    this.grip.visible = false;
    this.capePivot.visible = false;
  }
  /** Armor attaches to animated joints; an open-face helmet keeps skins and live faces visible. */
  setEquipment(value?: Equipment | null) {
    if (this.disposed) return;
    const equipment = normalizeEquipment(value),
      key = ARMOR_SLOTS.map((slot) => equipment[slot]).join(":");
    if (this.armorKey === key) return;
    this.clearEquipment();
    this.armorKey = key;
    for (const slot of ARMOR_SLOTS) {
      const info = armorInfo(equipment[slot]);
      if (!info) continue;
      const material = new THREE.MeshStandardMaterial({
        color: ARMOR_COLORS[info.material],
        roughness: info.material === "leather" ? 0.9 : 0.42,
        metalness: info.material === "leather" ? 0 : 0.38,
      });
      this.armorMaterials.push(material);
      const plate = (
        joint: THREE.Group,
        x: number,
        y: number,
        z: number,
        w: number,
        h: number,
        d: number,
      ) => {
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
        mesh.name = "armor-" + slot;
        mesh.position.set(x, y, z);
        mesh.castShadow = mesh.receiveShadow = true;
        joint.add(mesh);
        this.armorMeshes.push(mesh);
      };
      if (slot === "head") {
        plate(this.head, 0, 0.53, 0, 0.59, 0.075, 0.59);
        plate(this.head, 0, 0.27, -0.278, 0.59, 0.46, 0.045);
        for (const side of [-1, 1]) plate(this.head, side * 0.279, 0.27, 0, 0.045, 0.46, 0.56);
        plate(this.head, 0, 0.473, 0.281, 0.59, 0.075, 0.045);
      } else if (slot === "chest") {
        plate(this.joints.body, 0, 0, 0, 0.56, 0.78, 0.32);
        for (const arm of [this.joints.armR, this.joints.armL])
          plate(arm, 0, -0.06, 0, 0.3, 0.26, 0.31);
      } else if (slot === "legs") {
        plate(this.joints.body, 0, -0.34, 0, 0.555, 0.13, 0.315);
        for (const leg of [this.joints.legR, this.joints.legL])
          plate(leg, 0, -0.255, 0, 0.284, 0.54, 0.284);
      } else {
        for (const leg of [this.joints.legR, this.joints.legL])
          plate(leg, 0, -0.645, 0.025, 0.31, 0.24, 0.34);
      }
    }
  }
  private clearEquipment() {
    for (const mesh of this.armorMeshes) {
      mesh.removeFromParent();
      mesh.geometry.dispose();
    }
    for (const material of this.armorMaterials) material.dispose();
    this.armorMeshes = [];
    this.armorMaterials = [];
  }
  /** The caller owns local camera textures; model disposal must not stop another preview's texture. */
  setFaceTexture(texture: THREE.Texture | null) {
    if (
      this.disposed ||
      (this.faceMaterial.map === texture && !this.faceOwnedTexture && !this.faceImage)
    )
      return;
    this.faceGeneration++;
    if (this.faceImage) {
      this.faceImage.src = "";
      this.faceImage = null;
    }
    this.faceOwnedTexture?.dispose();
    this.faceOwnedTexture = null;
    this.faceMaterial.map = texture;
    this.faceMaterial.needsUpdate = true;
    this.faceOverlay.visible = !!texture;
  }
  setFaceFrame(frame: string | null) {
    if (this.disposed) return;
    if (!frame || !validFaceFrame(frame) || typeof Image === "undefined") {
      this.setFaceTexture(null);
      return;
    }
    const generation = ++this.faceGeneration;
    if (this.faceImage) this.faceImage.src = "";
    const image = new Image();
    this.faceImage = image;
    image.onload = () => {
      if (this.disposed || generation !== this.faceGeneration) return;
      this.faceImage = null;
      if (image.width > 1024 || image.height > 1024 || image.width < 16 || image.height < 16) {
        this.setFaceTexture(null);
        return;
      }
      const texture = new THREE.Texture(image);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.minFilter = texture.magFilter = THREE.LinearFilter;
      texture.generateMipmaps = false;
      texture.needsUpdate = true;
      this.faceOwnedTexture?.dispose();
      this.faceOwnedTexture = texture;
      this.faceMaterial.map = texture;
      this.faceMaterial.needsUpdate = true;
      this.faceOverlay.visible = true;
    };
    image.onerror = () => {
      if (generation === this.faceGeneration) this.setFaceTexture(null);
    };
    image.src = frame;
  }
  createFirstPersonArm(textureFactory?: HeldTextureFactory) {
    return new FirstPersonArm(this.material, textureFactory);
  }
  dispose() {
    if (this.disposed) return;
    this.setFaceTexture(null);
    this.disposed = true;
    this.faceOverlay.geometry.dispose();
    this.faceMaterial.dispose();
    this.heldItem.dispose();
    this.clearEquipment();
    this.parts.forEach((m) => m.geometry.dispose());
    this.material.dispose();
    this.capeMaterial.dispose();
    this.texture.dispose();
    this.capeTexture.dispose();
  }
}

/** The shoulder stays below the frame; only this joint rotates, so the arm never floats away. */
export class FirstPersonArm {
  group = new THREE.Group();
  shoulder = new THREE.Group();
  wrist = new THREE.Group();
  heldItem: HeldItemModel;
  meshes: THREE.Mesh[] = [];
  readonly length = Math.hypot(0.14, 0.73, 0.55);
  private direction = new THREE.Vector3();
  private down = new THREE.Vector3(0, -1, 0);
  private itemRotation = new THREE.Quaternion();
  private disposed = false;
  constructor(material: THREE.MeshStandardMaterial, textureFactory?: HeldTextureFactory) {
    this.group.name = "first-person-arm";
    this.shoulder.name = "anchored-shoulder";
    this.shoulder.position.set(0.52, -0.93, -0.15);
    this.group.add(this.shoulder);
    for (let layer = 0; layer < 2; layer++) {
      const mesh = new THREE.Mesh(boxGeometry("armR", layer), material);
      mesh.position.y = -this.length / 2;
      mesh.scale.set(0.82, this.length / 0.75, 0.82);
      mesh.frustumCulled = false;
      this.shoulder.add(mesh);
      this.meshes.push(mesh);
    }
    this.wrist.name = "first-person-wrist";
    this.wrist.position.set(0, -this.length, 0);
    this.shoulder.add(this.wrist);
    this.heldItem = new HeldItemModel(textureFactory);
    this.heldItem.group.scale.setScalar(0.62);
    this.wrist.add(this.heldItem.group);
    this.pose({ x: 0, y: 0, z: 0, rx: 0, rz: 0 });
  }
  setHeldItem(id: number) {
    this.heldItem.set(id);
  }
  pose(swing: HandSwingPose, bob = 0, fov = 72, aspect = 16 / 9, eatProgress = -1) {
    const eating = eatingMotion(eatProgress);
    if (eatProgress >= 0) swing = STILL_HAND;
    const projection =
      Math.tan(THREE.MathUtils.degToRad(Math.max(50, Math.min(100, fov))) / 2) /
      Math.tan(THREE.MathUtils.degToRad(72) / 2);
    this.group.scale.set(projection * Math.min(1, Math.max(0.35, aspect) / (4 / 3)), projection, 1);
    const idleX = 0.38 + swing.x * 0.7,
      idleY = -0.2 + swing.y * 0.7 + bob,
      idleZ = -0.7 + swing.z * 0.55;
    this.direction
      .set(
        THREE.MathUtils.lerp(idleX, 0.12 - eating.bite * 0.018, eating.blend),
        THREE.MathUtils.lerp(idleY, -0.16 + eating.bite * 0.05, eating.blend),
        THREE.MathUtils.lerp(idleZ, -0.45 + eating.bite * 0.055, eating.blend),
      )
      .sub(this.shoulder.position)
      .normalize();
    this.shoulder.quaternion.setFromUnitVectors(this.down, this.direction);
    // Keep the held item's grip at the wrist while its blade remains readable to the camera.
    this.itemRotation.setFromEuler(
      new THREE.Euler(
        THREE.MathUtils.lerp(-0.15 + swing.rx * 0.35, -0.1 + eating.bite * 0.13, eating.blend),
        THREE.MathUtils.lerp(-0.3, 0.12, eating.blend),
        THREE.MathUtils.lerp(-0.12 + swing.rz * 0.4, -0.3 + eating.bite * 0.06, eating.blend),
      ),
    );
    this.wrist.quaternion.copy(this.shoulder.quaternion).invert().multiply(this.itemRotation);
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.heldItem.dispose();
    this.meshes.forEach((mesh) => mesh.geometry.dispose());
    this.group.removeFromParent();
    this.group.clear();
  }
}
