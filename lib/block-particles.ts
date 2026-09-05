import * as THREE from "three";
import { BLOCKS } from "./blocks";
import { MINING_RULES } from "./mining";
import type { World } from "./world";

type Point = Pick<THREE.Vector3, "x" | "y" | "z">;
type ParticleOptions = { enabled?: boolean; maxParticles?: number };
type Fragment = {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  rx: number;
  ry: number;
  rz: number;
  spin: number;
  sx: number;
  sy: number;
  sz: number;
  life: number;
  duration: number;
  kind: number;
  color: THREE.Color;
};
const validPoint = (p: Point) =>
  Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z);
const fragment = (): Fragment => ({
  x: 0,
  y: 0,
  z: 0,
  vx: 0,
  vy: 0,
  vz: 0,
  rx: 0,
  ry: 0,
  rz: 0,
  spin: 0,
  sx: 0,
  sy: 0,
  sz: 0,
  life: 0,
  duration: 0,
  kind: 0,
  color: new THREE.Color(),
});

/** Three permanent draw calls and a fixed CPU pool, shared by all block types. */
export class BlockParticles {
  readonly capacity: number;
  readonly geometry = new THREE.BoxGeometry(1, 1, 1);
  readonly texture: THREE.DataTexture;
  readonly materials: THREE.Material[];
  readonly meshes: THREE.InstancedMesh[];
  private pool: Fragment[];
  private transform = new THREE.Object3D();
  private batchCounts = [0, 0, 0];
  private active = 0;
  private limit: number;
  private enabled = true;
  private disposed = false;
  private elapsed = 0;
  private lastChipAt = -Infinity;
  private lastChipKey = "";

  constructor(
    scene: THREE.Object3D,
    capacity = 192,
    private random: () => number = Math.random,
  ) {
    this.capacity = Math.max(
      1,
      Math.min(512, Math.floor(Number.isFinite(capacity) ? capacity : 192)),
    );
    this.limit = this.capacity;
    this.pool = Array.from({ length: this.capacity }, fragment);
    const pixels = new Uint8Array(8 * 8 * 4);
    for (let i = 0; i < 64; i++) {
      const shade = 205 + ((Math.imul(i + 17, 1103515245) >>> 16) % 51);
      pixels.set([shade, shade, shade, 255], i * 4);
    }
    this.texture = new THREE.DataTexture(pixels, 8, 8);
    this.texture.magFilter = this.texture.minFilter = THREE.NearestFilter;
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.needsUpdate = true;
    this.materials = [
      new THREE.MeshLambertMaterial({ color: "#ffffff", map: this.texture }),
      new THREE.MeshLambertMaterial({
        color: "#ffffff",
        map: this.texture,
        transparent: true,
        opacity: 0.68,
        depthWrite: false,
      }),
      new THREE.MeshBasicMaterial({ color: "#ffffff", map: this.texture, toneMapped: false }),
    ];
    this.meshes = this.materials.map((material, index) => {
      const mesh = new THREE.InstancedMesh(this.geometry, material, this.capacity);
      mesh.name = ["Block fragments", "Glass shards", "Glowing fragments"][index];
      mesh.count = 0;
      mesh.visible = false;
      mesh.frustumCulled = false;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.setColorAt(0, new THREE.Color());
      mesh.instanceColor!.setUsage(THREE.DynamicDrawUsage);
      scene.add(mesh);
      return mesh;
    });
  }
  get count() {
    return this.active;
  }

  /** The center is the block center; normal points out of the struck voxel face. */
  chip(id: number, center: Point, normal: Point) {
    if (!this.canEmit(id, center) || !validPoint(normal)) return;
    const key = `${id}:${Math.floor(center.x)}:${Math.floor(center.y)}:${Math.floor(center.z)}`;
    if (key === this.lastChipKey && this.elapsed - this.lastChipAt < 0.08) return;
    const magnitude = Math.max(Math.abs(normal.x), Math.abs(normal.y), Math.abs(normal.z));
    if (magnitude < 0.01) return;
    const axis = Math.abs(normal.y) === magnitude ? 1 : Math.abs(normal.x) === magnitude ? 0 : 2;
    const direction = Math.sign(axis === 0 ? normal.x : axis === 1 ? normal.y : normal.z);
    this.lastChipKey = key;
    this.lastChipAt = this.elapsed;
    for (let i = 0; i < 3 && this.active < this.limit; i++) {
      const p = this.spawn(id, center, true, axis === 1 && direction > 0);
      if (axis === 0) {
        p.x = center.x + direction * 0.56;
        p.vx = direction * (1.1 + this.random() * 1.4);
      } else if (axis === 1) {
        p.y = center.y + direction * 0.56;
        p.vy = direction * (1.1 + this.random() * 1.4);
      } else {
        p.z = center.z + direction * 0.56;
        p.vz = direction * (1.1 + this.random() * 1.4);
      }
    }
  }
  /** Call only after successful block removal, including the authoritative multiplayer ACK. */
  break(id: number, center: Point) {
    if (!this.canEmit(id, center)) return;
    const count = BLOCKS[id].plant ? 14 : BLOCKS[id].transparent ? 22 : 28;
    for (let i = 0; i < count && this.active < this.limit; i++)
      this.spawn(id, center, false, this.random() < 0.3);
  }
  private canEmit(id: number, center: Point) {
    return (
      !this.disposed &&
      this.enabled &&
      this.active < this.limit &&
      validPoint(center) &&
      id > 0 &&
      !!BLOCKS[id] &&
      ![7, 13, 15, 18].includes(id)
    );
  }
  /** Food crumbs reuse the same bounded pool and opaque draw call as block fragments. */
  crumbs(id: number, mouth: Point) {
    if (![106, 107].includes(id) || !this.enabled || this.disposed || !validPoint(mouth)) return;
    for (let i = 0; i < 4 && this.active < this.limit; i++) {
      const p = this.spawn(2, mouth, true, false),
        rnd = this.random;
      p.x = mouth.x + (rnd() - 0.5) * 0.14;
      p.y = mouth.y + (rnd() - 0.5) * 0.1;
      p.z = mouth.z + (rnd() - 0.5) * 0.14;
      p.vx = (rnd() - 0.5) * 0.8;
      p.vy = 0.3 + rnd() * 0.55;
      p.vz = (rnd() - 0.5) * 0.8;
      p.sx = p.sy = p.sz = 0.018 + rnd() * 0.018;
      p.duration = p.life = 0.3 + rnd() * 0.17;
      p.kind = 0;
      p.color.set(id === 106 ? (i % 2 ? "#f2d39b" : "#bd4b3c") : i % 2 ? "#eacb86" : "#a76836");
    }
  }
  private spawn(id: number, center: Point, chip: boolean, top: boolean) {
    const block = BLOCKS[id],
      p = this.pool[this.active++],
      rnd = this.random;
    p.kind = block.glow ? 2 : block.transparent ? 1 : 0;
    p.x = center.x + (rnd() - 0.5) * 0.8;
    p.y = center.y + (rnd() - 0.5) * 0.8;
    p.z = center.z + (rnd() - 0.5) * 0.8;
    const force = chip ? 1.1 : 3.8;
    p.vx = (rnd() - 0.5) * force * 2;
    p.vz = (rnd() - 0.5) * force * 2;
    p.vy = (chip ? 0.5 : 1.6) + rnd() * (chip ? 1.5 : 3.6);
    p.rx = rnd() * Math.PI;
    p.ry = rnd() * Math.PI;
    p.rz = rnd() * Math.PI;
    p.spin = (rnd() - 0.5) * 12;
    const size = (chip ? 0.035 : 0.055) + rnd() * (chip ? 0.045 : 0.085);
    p.sx = size * (0.7 + rnd() * 0.7);
    p.sy = size;
    p.sz = size * (0.6 + rnd() * 0.8);
    if (block.transparent) {
      p.sx *= 1.3;
      p.sy *= 1.6;
      p.sz *= 0.2;
    } else if (MINING_RULES[id]?.leaves || block.plant) {
      p.sx *= 1.3;
      p.sz *= 0.18;
    } else if (MINING_RULES[id]?.tool === "axe") {
      p.sy *= 1.65;
      p.sx *= 0.55;
    }
    p.duration = (chip ? 0.35 : 0.7) + rnd() * (chip ? 0.35 : 0.6);
    p.life = p.duration;
    p.color.set(top && block.top ? block.top : block.color).multiplyScalar(0.8 + rnd() * 0.3);
    return p;
  }
  update(dt: number, world?: Pick<World, "solid">, options: ParticleOptions = {}) {
    if (this.disposed) return;
    this.enabled = options.enabled !== false;
    this.limit = Number.isFinite(options.maxParticles)
      ? Math.max(0, Math.min(this.capacity, Math.floor(options.maxParticles!)))
      : this.capacity;
    if (!this.enabled || !this.limit) {
      this.clear();
      return;
    }
    if (!Number.isFinite(dt) || dt < 0) return;
    this.elapsed += dt;
    this.active = Math.min(this.active, this.limit);
    const step = Math.min(dt, 0.1),
      age = Math.min(dt, 0.3),
      drag = Math.exp(-step * 1.7);
    this.batchCounts.fill(0);
    for (let i = 0; i < this.active;) {
      const p = this.pool[i];
      p.life -= age;
      if (p.life <= 0) {
        this.pool[i] = this.pool[--this.active];
        this.pool[this.active] = p;
        continue;
      }
      p.vy -= 15 * step;
      p.vx *= drag;
      p.vz *= drag;
      const radius = Math.min(0.085, Math.max(p.sx, p.sy, p.sz) * 0.4);
      const nx = p.x + p.vx * step;
      if (world?.solid(nx + Math.sign(p.vx) * radius, p.y, p.z)) p.vx *= -0.18;
      else p.x = nx;
      const nz = p.z + p.vz * step;
      if (world?.solid(p.x, p.y, nz + Math.sign(p.vz) * radius)) p.vz *= -0.18;
      else p.z = nz;
      const ny = p.y + p.vy * step,
        contact = ny + Math.sign(p.vy) * radius;
      if (world?.solid(p.x, contact, p.z)) {
        p.y =
          p.vy < 0
            ? Math.floor(contact) + 1 + radius + 0.002
            : Math.floor(contact) - radius - 0.002;
        p.vy = p.vy < -1 ? -p.vy * 0.2 : 0;
        p.vx *= 0.65;
        p.vz *= 0.65;
        p.spin *= 0.45;
      } else p.y = ny;
      p.rx += p.spin * step;
      p.ry += p.spin * step * 0.7;
      p.rz += p.spin * step * 0.35;
      const fade = Math.min(1, p.life / Math.min(0.22, p.duration * 0.3));
      this.transform.position.set(p.x, p.y, p.z);
      this.transform.rotation.set(p.rx, p.ry, p.rz);
      this.transform.scale.set(p.sx * fade, p.sy * fade, p.sz * fade);
      this.transform.updateMatrix();
      const mesh = this.meshes[p.kind],
        index = this.batchCounts[p.kind]++;
      mesh.setMatrixAt(index, this.transform.matrix);
      mesh.setColorAt(index, p.color);
      i++;
    }
    for (let i = 0; i < this.meshes.length; i++) {
      const mesh = this.meshes[i];
      mesh.count = this.batchCounts[i];
      mesh.visible = mesh.count > 0;
      if (mesh.count) {
        mesh.instanceMatrix.needsUpdate = true;
        mesh.instanceColor!.needsUpdate = true;
      }
    }
  }
  clear() {
    this.active = 0;
    this.lastChipKey = "";
    this.lastChipAt = -Infinity;
    for (const mesh of this.meshes) {
      mesh.count = 0;
      mesh.visible = false;
    }
  }
  dispose() {
    if (this.disposed) return;
    this.clear();
    this.disposed = true;
    for (const mesh of this.meshes) {
      mesh.removeFromParent();
      mesh.dispose();
    }
    this.geometry.dispose();
    this.texture.dispose();
    for (const material of this.materials) material.dispose();
  }
}
