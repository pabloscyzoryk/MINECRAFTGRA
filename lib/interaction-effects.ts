import * as THREE from "three";
import { item, type Dimension } from "./blocks";
import { hash } from "./world";
import { cubeGeo, mat } from "./entities";
import type { Game } from "./engine";
export const SWING_DURATION = 0.23;
export type HandSwingPose = { x: number; y: number; z: number; rx: number; rz: number };
export function handSwing(progress: number) {
  progress = Math.max(0, Math.min(1, Number.isFinite(progress) ? progress : 1));
  const ease = (n: number) => n * n * (3 - 2 * n);
  let y = 0,
    z = 0,
    x = 0,
    rx = 0;
  if (progress < 0.2) {
    const t = ease(progress / 0.2);
    y = 0.16 * t;
    z = -0.04 * t;
    x = 0.03 * t;
    rx = 0.16 * t;
  } else if (progress < 0.65) {
    const t = ease((progress - 0.2) / 0.45);
    y = 0.16 - 0.37 * t;
    z = -0.04 - 0.38 * t;
    x = 0.03 - 0.14 * t;
    rx = 0.16 - 0.61 * t;
  } else {
    const t = 1 - ease((progress - 0.65) / 0.35);
    y = -0.21 * t;
    z = -0.42 * t;
    x = -0.11 * t;
    rx = -0.45 * t;
  }
  return { x, y, z, rx, rz: -x * 0.7 };
}
export class BlockCracks {
  textures: THREE.CanvasTexture[] = [];
  mesh: THREE.Mesh;
  stage = -1;
  constructor(scene: THREE.Scene) {
    for (let stage = 0; stage < 10; stage++) {
      const c = document.createElement("canvas");
      c.width = c.height = 64;
      const ctx = c.getContext("2d")!;
      ctx.strokeStyle = "#171e25";
      ctx.lineWidth = stage > 6 ? 2 : 1.3;
      ctx.lineCap = "square";
      for (let branch = 0; branch < 10; branch++) {
        let x = 31,
          y = 31;
        const a = (branch * Math.PI) / 5;
        ctx.beginPath();
        ctx.moveTo(x, y);
        for (let step = 0; step <= stage; step++) {
          const wiggle = (hash(branch, step, 85) - 0.5) * 1.1;
          x += Math.cos(a + wiggle) * 4.8;
          y += Math.sin(a + wiggle) * 4.8;
          ctx.lineTo(Math.round(x), Math.round(y));
          if (step > 2 && step % 3 === 0) {
            ctx.moveTo(x, y);
            ctx.lineTo(
              Math.round(x + Math.cos(a + 1.2) * 7),
              Math.round(y + Math.sin(a + 1.2) * 7),
            );
            ctx.moveTo(x, y);
          }
        }
        ctx.stroke();
      }
      const texture = new THREE.CanvasTexture(c);
      texture.magFilter = THREE.NearestFilter;
      texture.minFilter = THREE.NearestFilter;
      texture.colorSpace = THREE.SRGBColorSpace;
      this.textures.push(texture);
    }
    this.mesh = new THREE.Mesh(
      new THREE.BoxGeometry(1.008, 1.008, 1.008),
      new THREE.MeshBasicMaterial({
        map: this.textures[0],
        transparent: true,
        opacity: 0.85,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -2,
      }),
    );
    this.mesh.visible = false;
    this.mesh.renderOrder = 3;
    scene.add(this.mesh);
  }
  update(target: { x: number; y: number; z: number } | null, progress: number) {
    this.mesh.visible = !!target && progress > 0;
    if (!target || progress <= 0) return;
    this.mesh.position.set(target.x + 0.5, target.y + 0.5, target.z + 0.5);
    const stage = Math.min(9, Math.floor(progress * 10));
    if (stage !== this.stage) {
      this.stage = stage;
      (this.mesh.material as THREE.MeshBasicMaterial).map = this.textures[stage];
    }
  }
  dispose() {
    this.mesh.removeFromParent();
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
    this.textures.forEach((t) => t.dispose());
  }
}
export type DropData = {
  id: number;
  n: number;
  dimension: Dimension;
  position: number[];
  velocity: number[];
  life: number;
  grace: number;
};
type Drop = DropData & { mesh: THREE.Mesh };
export class DroppedItems {
  items: Drop[] = [];
  constructor(public game: Game) {}
  spawn(id: number, n: number, position: THREE.Vector3, velocity = new THREE.Vector3(), grace = 1) {
    if (id < 1 || n < 1) return;
    if (this.game.net) {
      this.game.net.request({ type: "drop", item: id, n, v: velocity.toArray() });
      return;
    }
    const mesh = new THREE.Mesh(cubeGeo, mat(item(id).color));
    mesh.scale.setScalar(0.22);
    mesh.position.copy(position);
    mesh.castShadow = true;
    this.game.scene.add(mesh);
    this.items.push({
      id,
      n,
      dimension: this.game.world.dimension,
      position: position.toArray(),
      velocity: velocity.toArray(),
      life: 300,
      grace,
      mesh,
    });
  }
  tick(dt: number) {
    const g = this.game;
    for (let i = this.items.length - 1; i >= 0; i--) {
      const d = this.items[i];
      d.mesh.visible = d.dimension === g.world.dimension;
      if (!d.mesh.visible) continue;
      d.life -= dt;
      d.grace -= dt;
      const p = d.mesh.position,
        v = d.velocity;
      v[1] -= 14 * dt;
      for (let axis = 0; axis < 3; axis++) {
        const component = (["x", "y", "z"] as const)[axis],
          old = p[component];
        p[component] += v[axis] * dt;
        if (g.world.solid(p.x, p.y - 0.13, p.z) || g.world.solid(p.x, p.y + 0.1, p.z)) {
          p[component] = old;
          v[axis] = axis === 1 && Math.abs(v[axis]) > 1 ? -v[axis] * 0.16 : 0;
        }
      }
      v[0] *= Math.exp(-dt * 2);
      v[2] *= Math.exp(-dt * 2);
      d.mesh.rotation.y += dt * 1.7;
      d.mesh.rotation.z = Math.sin(d.life * 2) * 0.1;
      d.position = p.toArray();
      if (
        d.grace <= 0 &&
        p.distanceTo(g.position.clone().add(new THREE.Vector3(0, 0.7, 0))) < 1.65
      ) {
        const take = Math.min(d.n, g.pack.capacity(d.id));
        if (take > 0) {
          g.add(d.id, take);
          d.n -= take;
          g.audio.play("place");
        }
      }
      if (d.n <= 0 || d.life <= 0 || p.y < -30) {
        d.mesh.removeFromParent();
        this.items.splice(i, 1);
      }
    }
  }
  save() {
    return this.items.map(({ mesh: _mesh, ...d }) => d);
  }
  restore(data: DropData[] | undefined) {
    this.clear();
    if (!Array.isArray(data)) return;
    for (const d of data.slice(0, 1000)) {
      if (
        !Number.isInteger(d.id) ||
        d.id < 1 ||
        !Number.isFinite(d.n) ||
        d.n < 1 ||
        !Array.isArray(d.position) ||
        d.position.length !== 3 ||
        !d.position.every(Number.isFinite) ||
        !["overworld", "nether", "end"].includes(d.dimension)
      )
        continue;
      this.spawn(d.id, Math.floor(d.n), new THREE.Vector3().fromArray(d.position));
      const last = this.items.at(-1)!;
      last.dimension = d.dimension;
      last.life = Math.min(300, Number(d.life) || 300);
    }
  }
  clear() {
    for (const d of this.items) d.mesh.removeFromParent();
    this.items = [];
  }
}
