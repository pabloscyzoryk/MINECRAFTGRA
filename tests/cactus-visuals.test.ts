import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { CACTUS_SPINES, appendCactusSpines } from "../lib/cactus-mesh";
import {
  SHAPES,
  boxList,
  shapeFaces,
  exposedFace,
  placementFor,
  mergeAdjacentSlab,
  canonicalBlock,
  stepUpHeight,
  rayIntersectBlock,
} from "../lib/block-shapes";
import { BLOCKS } from "../lib/blocks";
import { minedResource, miningDuration, harvestAllowed } from "../lib/mining";
import { World, HEIGHT } from "../lib/world";
import { WorldRenderer, createAtlas } from "../lib/renderer";
import { HeldItemModel } from "../lib/held-item";

test("Cactus retains its ID, resource and ordinary placement while its body and raycast leave a one-sixteenth edge gap", () => {
  assert.equal(SHAPES[41].kind, "cactus");
  assert.equal(BLOCKS[41].name, "Kaktus");
  assert.deepEqual(boxList(41), [[0.0625, 0, 0.0625, 0.9375, 1, 0.9375]]);
  assert.equal(canonicalBlock(41), 41);
  assert.deepEqual(minedResource(41), { id: 41, n: 1 });
  assert(harvestAllowed(41, 0));
  assert(Number.isFinite(miningDuration(41, 0)));
  const world = new World();
  world.get = (x, y, z) =>
    Math.floor(x) === 0 && Math.floor(y) === 10 && Math.floor(z) === 0 ? 41 : 0;
  assert(!world.solid(0.04, 10.5, 0.5));
  assert(world.solid(0.063, 10.5, 0.5));
  assert(!world.solid(0.96, 10.5, 0.5));
  assert.equal(rayIntersectBlock(41, [-1, 0.5, 0.5], [1, 0, 0])?.distance, 1.0625);
  assert.equal(rayIntersectBlock(41, [-1, 0.5, 0.03], [1, 0, 0]), null);
  for (const yaw of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
    const placement = placementFor({
      held: 41,
      targetId: 3,
      target: [0, 10, 0],
      normal: [0, 1, 0],
      point: [0.5, 11, 0.5],
      yaw,
    });
    assert.deepEqual(placement, { id: 41, x: 0, y: 11, z: 0, merge: false });
    assert.equal(mergeAdjacentSlab(placement!, 41), null);
  }
  const ground = (x: number, y: number) =>
    y === 9 ? 3 : y === 10 ? (x === 0 ? 170 : x === 1 ? 41 : 0) : 0;
  assert.equal(
    stepUpHeight(
      { x: 0.7, y: 10.5, z: 0.5 },
      { x: 0.8, y: 10.5, z: 0.5 },
      1.75,
      ground,
      (id) => !!BLOCKS[id]?.solid,
    ),
    null,
    "A cactus is not an automatic stair, even when approached from a slab",
  );
});

test("Every cached cactus thorn is a bounded, outward-facing pyramid with unit normals matching winding", () => {
  assert.equal(CACTUS_SPINES.length, 24 * 4);
  for (let spine = 0; spine < CACTUS_SPINES.length; spine += 4) {
    const triangles = CACTUS_SPINES.slice(spine, spine + 4);
    const vertices = [
      ...new Map(triangles.flatMap((t) => t.points).map((p) => [p.join(","), p])).values(),
    ];
    assert.equal(vertices.length, 5);
    const center = new THREE.Vector3();
    vertices.forEach((p) => center.add(new THREE.Vector3(...p)));
    center.divideScalar(vertices.length);
    assert.equal(
      vertices.filter((p) => p[0] === 0 || p[0] === 1 || p[2] === 0 || p[2] === 1).length,
      1,
    );
    for (const triangle of triangles) {
      const [a, b, c] = triangle.points.map((p) => new THREE.Vector3(...p));
      const normal = new THREE.Vector3(...triangle.normal);
      assert(Math.abs(normal.length() - 1) < 1e-12);
      assert(b.clone().sub(a).cross(c.clone().sub(a)).normalize().dot(normal) > 0.999999);
      assert(a.clone().add(b).add(c).divideScalar(3).sub(center).dot(normal) > 0);
      assert(triangle.points.flat().every((v) => Number.isFinite(v) && v >= 0 && v <= 1));
    }
  }
  const bucket = { p: [1, 2, 3], n: [0, 1, 0], uv: [0, 0], col: [1, 1, 1], idx: [] as number[] };
  appendCactusSpines(bucket, 7, 12, -4);
  assert.equal(bucket.p.length / 3, 289);
  assert.equal(bucket.idx.length, 288);
  assert.equal(Math.min(...bucket.idx), 1);
  assert.equal(Math.max(...bucket.idx), 288);
  for (let i = 3; i < bucket.p.length; i += 3) {
    assert(bucket.p[i] >= 7 && bucket.p[i] <= 8);
    assert(bucket.p[i + 1] >= 12 && bucket.p[i + 1] <= 13);
    assert(bucket.p[i + 2] >= -4 && bucket.p[i + 2] <= -3);
  }
});

const area = (f: ReturnType<typeof shapeFaces>[number]) => {
  const [a, b, c] = f.vertices.map((p) => new THREE.Vector3(...p));
  return b.sub(a).cross(c.sub(a)).length();
};
test("Cactus stacks hide their internal caps but never hide neighbouring faces through the side gap", () => {
  const cactus = shapeFaces(41),
    full = shapeFaces(3);
  assert.equal(cactus.length, 6);
  for (const f of cactus) {
    if (f.face === 2 || f.face === 3) assert.equal(exposedFace(f, 41).length, 0);
    else assert.deepEqual(exposedFace(f, 3), [f]);
  }
  for (const f of full.filter((f) => f.face !== 2 && f.face !== 3))
    assert.deepEqual(exposedFace(f, 41), [f]);
  const rim = exposedFace(
    full.find((f) => f.face === 2)!,
    41,
  );
  assert(Math.abs(rim.reduce((sum, face) => sum + area(face), 0) - (1 - 0.875 ** 2)) < 1e-12);
});

test("Real cactus chunk geometry is one opaque draw call, has correct winding and frees all geometry on rebuild", () => {
  const world = new World(),
    data = new Uint8Array(16 * 16 * HEIGHT);
  for (const y of [10, 11]) data[5 + 5 * 16 + y * 256] = 41;
  world.get = () => 0;
  const renderer = Object.create(WorldRenderer.prototype) as WorldRenderer;
  const material = new THREE.MeshBasicMaterial();
  Object.assign(renderer, {
    world,
    scene: new THREE.Scene(),
    meshes: new Map(),
    materials: [material],
  });
  const chunk = { cx: 0, cz: 0, data, dirty: true };
  renderer.rebuild(chunk);
  const group = renderer.meshes.get("0,0")!;
  assert.equal(group.children.length, 1);
  const mesh = group.children[0] as THREE.Mesh;
  const p = mesh.geometry.getAttribute("position"),
    n = mesh.geometry.getAttribute("normal"),
    index = mesh.geometry.index!;
  assert.equal(index.count / 3, 212, "192 thorn triangles plus 20 exposed body triangles");
  for (let i = 0; i < index.count; i += 3) {
    const ids = [index.getX(i), index.getX(i + 1), index.getX(i + 2)];
    const [a, b, c] = ids.map((id) => new THREE.Vector3().fromBufferAttribute(p, id));
    const normal = new THREE.Vector3().fromBufferAttribute(n, ids[0]);
    assert(b.sub(a).cross(c.sub(a)).normalize().dot(normal) > 0.99999);
  }
  let disposed = 0;
  mesh.geometry.addEventListener("dispose", () => disposed++);
  renderer.rebuild(chunk);
  assert.equal(disposed, 1);
  assert.equal(renderer.scene.children.length, 1);
  renderer.disposeGroup(renderer.meshes.get("0,0")!);
  material.dispose();
});

test("Held cacti share the cached thorn mesh and free it only after its final owner leaves", () => {
  const a = new HeldItemModel(),
    b = new HeldItemModel();
  a.set(41);
  b.set(41);
  const mesh = (model: HeldItemModel) => model.group.getObjectByName("cactus-spines") as THREE.Mesh;
  assert.equal(mesh(a).geometry, mesh(b).geometry);
  const geometry = mesh(a).geometry;
  assert.equal(geometry.getAttribute("position").count, 288);
  geometry.computeBoundingBox();
  assert(Math.abs(geometry.boundingBox!.min.x + 0.15) < 1e-7);
  assert(Math.abs(geometry.boundingBox!.max.z - 0.15) < 1e-7);
  let disposed = 0;
  geometry.addEventListener("dispose", () => disposed++);
  a.set(0);
  assert.equal(disposed, 0);
  b.set(41);
  assert.equal(mesh(b).geometry, geometry);
  a.dispose();
  b.dispose();
  b.dispose();
  assert.equal(disposed, 1);
  const c = new HeldItemModel();
  c.set(41);
  assert.notEqual(mesh(c).geometry, geometry);
  c.dispose();
});

test("The real atlas keeps cactus ribs vertical from top to bottom and includes pale areoles", () => {
  const pixels = Array<string>(32 * 32).fill("");
  const ox = (41 % 16) * 32,
    oy = Math.floor(41 / 16) * 32;
  const context = new Proxy(
    {
      fillStyle: "",
      fillRect(x: number, y: number, w: number, h: number) {
        for (let px = Math.max(ox, Math.floor(x)); px < Math.min(ox + 32, x + w); px++)
          for (let py = Math.max(oy, Math.floor(y)); py < Math.min(oy + 32, y + h); py++)
            pixels[px - ox + (py - oy) * 32] = this.fillStyle;
      },
    },
    { get: (target, key) => Reflect.get(target, key) ?? (() => {}) },
  );
  const previous = Object.getOwnPropertyDescriptor(globalThis, "document");
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: { createElement: () => ({ getContext: () => context }) },
  });
  let texture: THREE.Texture | undefined;
  try {
    texture = createAtlas().texture;
    for (let y = 0; y < 32; y++) {
      assert.equal(pixels[2 + y * 32], "#375834");
      assert.equal(pixels[4 + y * 32], "#8fac61");
    }
    assert.equal(pixels[8 + 5 * 32], "#d9d4a0");
  } finally {
    texture?.dispose();
    if (previous) Object.defineProperty(globalThis, "document", previous);
    else Reflect.deleteProperty(globalThis, "document");
  }
});
