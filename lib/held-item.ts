import * as THREE from "three";
import { BLOCKS, ITEMS, item } from "./blocks";
import { itemArt } from "./item-art";

export type HeldTextureFactory = (id: number) => THREE.Texture;

/** Geometry is centered on its grip, so every view can attach the same object to a wrist. */
export class HeldItemModel {
  group = new THREE.Group();
  id = 0;
  private disposed = false;
  constructor(
    private textureFactory: HeldTextureFactory = (id) =>
      new THREE.TextureLoader().load(itemArt(id)),
  ) {
    this.group.name = "held-item";
    this.group.visible = false;
  }
  set(id: number) {
    id = Number.isInteger(id) && (BLOCKS[id] || ITEMS.some((entry) => entry.id === id)) ? id : 0;
    if (this.disposed || this.id === id) return;
    this.clear();
    this.id = id;
    this.group.visible = id > 0;
    if (!id) return;
    const color = item(id).color;
    const materials = new Map<string, THREE.MeshStandardMaterial>();
    const material = (tint: string) => {
      let result = materials.get(tint);
      if (!result) {
        result = new THREE.MeshStandardMaterial({
          color: tint,
          roughness: 0.72,
          emissive: tint,
          emissiveIntensity: 0.045,
        });
        materials.set(tint, result);
      }
      return result;
    };
    const box = (
      x: number,
      y: number,
      z: number,
      w: number,
      h: number,
      d: number,
      tint: string,
      rotation = 0,
    ) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material(tint));
      mesh.position.set(x, y, z);
      mesh.rotation.z = rotation;
      mesh.castShadow = true;
      this.group.add(mesh);
      return mesh;
    };
    if (id < BLOCKS.length) {
      const body = material(color);
      const top = material(BLOCKS[id].top ?? color);
      const block = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.3), [
        body,
        body,
        top,
        body,
        body,
        body,
      ]);
      block.position.set(0, 0.05, 0.06);
      block.rotation.y = Math.PI / 8;
      block.castShadow = true;
      this.group.add(block);
    } else if ([104, 108].includes(id)) {
      box(0, 0, 0, 0.07, 0.24, 0.07, "#775334");
      box(0, -0.13, 0, 0.1, 0.06, 0.09, "#516a69");
      box(0, 0.14, 0, 0.28, 0.07, 0.09, "#648f87");
      box(0, 0.43, 0, 0.1, 0.53, 0.045, color);
      box(0.015, 0.43, 0.027, 0.025, 0.5, 0.012, "#e5f4ec");
      box(0, 0.715, 0, 0.055, 0.055, 0.045, color);
    } else if ([101, 102, 103, 118, 127, 128, 130].includes(id)) {
      box(0, 0.17, 0, 0.065, 0.61, 0.065, "#9e7546");
      box(0.02, 0.16, 0.015, 0.017, 0.58, 0.036, "#c19a65");
      if ([101, 102, 103].includes(id)) {
        box(0, 0.45, 0, 0.38, 0.085, 0.075, color);
        box(-0.21, 0.398, 0, 0.08, 0.16, 0.075, color, -0.45);
        box(0.21, 0.398, 0, 0.08, 0.16, 0.075, color, 0.45);
      } else if ([127, 128].includes(id)) {
        box(-0.1, 0.4, 0, 0.27, 0.23, 0.07, color);
        box(-0.255, 0.395, 0, 0.04, 0.26, 0.045, id === 127 ? "#e1edeb" : "#dbb579");
      } else if (id === 130) {
        box(0, 0.48, 0, 0.19, 0.23, 0.06, color);
        box(0, 0.62, 0, 0.12, 0.05, 0.055, color);
      } else {
        box(-0.085, 0.44, 0, 0.27, 0.075, 0.075, color);
        box(-0.19, 0.385, 0, 0.055, 0.16, 0.07, color);
      }
    } else if (id === 129) {
      box(0, 0.27, 0, 0.055, 0.98, 0.055, "#9e7546");
      const tip = new THREE.Mesh(new THREE.ConeGeometry(0.095, 0.24, 4), material(color));
      tip.position.y = 0.88;
      tip.rotation.y = Math.PI / 4;
      tip.castShadow = true;
      this.group.add(tip);
    } else if (id === 105) {
      for (let i = 0; i < 8; i++) {
        const a = -Math.PI / 2 + (i / 8) * Math.PI;
        const b = -Math.PI / 2 + ((i + 1) / 8) * Math.PI;
        const from = new THREE.Vector3(0.18 * Math.cos(a) - 0.17, 0.35 * Math.sin(a), 0);
        const to = new THREE.Vector3(0.18 * Math.cos(b) - 0.17, 0.35 * Math.sin(b), 0);
        const middle = from.clone().add(to).multiplyScalar(0.5);
        const limb = box(
          middle.x,
          middle.y,
          0,
          0.05,
          from.distanceTo(to) + 0.018,
          0.055,
          "#b78b54",
        );
        limb.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), to.sub(from).normalize());
      }
      box(-0.17, 0, 0, 0.01, 0.69, 0.012, "#e2d8b8");
      box(0, 0, 0, 0.06, 0.14, 0.075, "#6f5135");
    } else if (id === 126) {
      box(0, 0.12, 0.05, 0.4, 0.53, 0.07, "#7e613f");
      box(0, 0.12, 0.095, 0.34, 0.45, 0.022, "#bc9a61");
      box(0, 0.12, 0.115, 0.065, 0.5, 0.015, color);
      box(0, 0.12, 0.12, 0.36, 0.055, 0.015, color);
    } else {
      const texture = this.textureFactory(id);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.magFilter = THREE.NearestFilter;
      texture.minFilter = THREE.NearestFilter;
      const sprite = new THREE.Mesh(
        new THREE.PlaneGeometry(0.34, 0.34),
        new THREE.MeshStandardMaterial({
          map: texture,
          transparent: true,
          alphaTest: 0.1,
          side: THREE.DoubleSide,
          roughness: 0.8,
        }),
      );
      sprite.position.set(0, 0.1, 0.07);
      this.group.add(sprite);
    }
  }
  private clear() {
    const geometries = new Set<THREE.BufferGeometry>();
    const materials = new Set<THREE.Material>();
    const textures = new Set<THREE.Texture>();
    this.group.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      geometries.add(object.geometry);
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
        materials.add(material);
        const texture = (material as THREE.MeshStandardMaterial).map;
        if (texture) textures.add(texture);
      }
    });
    geometries.forEach((geometry) => geometry.dispose());
    materials.forEach((material) => material.dispose());
    textures.forEach((texture) => texture.dispose());
    this.group.clear();
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.clear();
    this.group.removeFromParent();
  }
}
