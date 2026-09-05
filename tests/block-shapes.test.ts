import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import {
  SHAPES,
  boxList,
  pointInside,
  intersectsBlock,
  rayIntersectBlock,
  raycastBlocks,
  placementFor,
  mergeAdjacentSlab,
  canonicalBlock,
  blockTexture,
  shapeFaces,
  exposedFace,
  stepUpHeight,
  worldBoxCollision,
  playerBox,
  visualBoxList,
  type V3,
} from "../lib/block-shapes";
import { BLOCKS, ITEMS, item } from "../lib/blocks";
import { miningDuration, minedResource, harvestAllowed } from "../lib/mining";
import { Game } from "../lib/engine";
import { WorldRenderer } from "../lib/renderer";
import { HEIGHT } from "../lib/world";
import { InventoryPack } from "../lib/inventory";
import { DEFAULT_SETTINGS } from "../lib/settings";
import { blockShapeGeometry } from "../lib/block-shape-geometry";

const solid = (id: number) => !!BLOCKS[id]?.solid;
function field(entries: [number, number, number, number][] = [], floor = true) {
  const map = new Map(entries.map(([x, y, z, id]) => [`${x},${y},${z}`, id]));
  return (x: number, y: number, z: number) =>
    map.get(`${Math.floor(x)},${Math.floor(y)},${Math.floor(z)}`) ?? (floor && y < 0 ? 3 : 0);
}
test("Stair states preserve three quarters volume, four ascending directions and upper inversion", () => {
  for (const start of [172, 182])
    for (let facing = 0; facing < 4; facing++) {
      const id = start + facing;
      const volume = boxList(id).reduce(
        (n, b) => n + (b[3] - b[0]) * (b[4] - b[1]) * (b[5] - b[2]),
        0,
      );
      assert.equal(volume, 0.75);
      const high: V3 = (
        [
          [0.5, 0.75, 0.25],
          [0.75, 0.75, 0.5],
          [0.5, 0.75, 0.75],
          [0.25, 0.75, 0.5],
        ] as V3[]
      )[facing];
      assert(pointInside(id, ...high));
      assert(!pointInside(id, 1 - high[0], high[1], 1 - high[2]));
      assert(pointInside(id + 4, 0.25, 0.75, 0.25));
      assert(pointInside(id + 4, high[0], 0.25, high[2]));
      assert(!pointInside(id + 4, 1 - high[0], 0.25, 1 - high[2]));
      assert.equal(canonicalBlock(id + 4), start);
    }
  assert(!pointInside(170, 0.5, 0.75, 0.5));
  assert(pointInside(171, 0.5, 0.75, 0.5));
  assert(!pointInside(171, 0.5, 0.25, 0.5));
});
test("Partial blocks collide only with occupied volumes and rays pass through open halves", () => {
  assert(!intersectsBlock(170, 0, 0, 0, [0.2, 0.51, 0.2, 0.8, 0.9, 0.8]));
  assert(intersectsBlock(171, 0, 0, 0, [0.2, 0.51, 0.2, 0.8, 0.9, 0.8]));
  assert.equal(rayIntersectBlock(170, [-1, 0.75, 0.5], [1, 0, 0], 5), null);
  assert.equal(rayIntersectBlock(172, [-1, 0.75, 0.75], [1, 0, 0], 5), null);
  assert.equal(rayIntersectBlock(172, [-1, 0.75, 0.25], [1, 0, 0], 5)?.distance, 1);
  const get = field(
    [
      [0, 0, 0, 170],
      [2, 0, 0, 3],
    ],
    false,
  );
  assert.equal(raycastBlocks(get, solid, [-1, 0.75, 0.5], [1, 0, 0])?.x, 2);
  const hit = raycastBlocks(get, solid, [-1, 0.25, 0.5], [1, 0, 0])!;
  assert.equal(hit.x, 0);
  assert.deepEqual(hit.normal, [-1, 0, 0]);
  assert.deepEqual(hit.point, [0, 0.25, 0.5]);
  const down = raycastBlocks(get, solid, [0.5, 2, 0.5], [0, -1, 0])!;
  assert.equal(down.distance, 1.5);
  assert.deepEqual(down.point, [0.5, 0.5, 0.5]);
  // Parallel rays on an internal half boundary must agree with server pointInside validation.
  for (const id of [172, 173, 174, 175, 176, 177, 178, 179]) {
    const hit = rayIntersectBlock(id, [0.5, 2, 0.5], [0, -1, 0])!;
    const p = hit.point,
      n = hit.normal;
    assert(pointInside(id, p[0] - n[0] * 0.0001, p[1] - n[1] * 0.0001, p[2] - n[2] * 0.0001));
    assert(!pointInside(id, p[0] + n[0] * 0.0001, p[1] + n[1] * 0.0001, p[2] + n[2] * 0.0001));
  }
});
test("Placement records orientation and half, and only complementary matching slabs merge", () => {
  const target = {
    targetId: 3,
    target: [0, 1, 0] as V3,
    point: [0.5, 1.8, 1] as V3,
    normal: [0, 0, 1] as V3,
  };
  for (const [yaw, facing] of [
    [0, 0],
    [-Math.PI / 2, 1],
    [Math.PI, 2],
    [Math.PI / 2, 3],
  ]) {
    assert.equal(placementFor({ ...target, held: 172, yaw })?.id, 176 + facing);
    assert.equal(placementFor({ ...target, held: 172, yaw, normal: [0, 1, 0] })?.id, 172 + facing);
  }
  assert.equal(placementFor({ ...target, held: 170, yaw: 0 })?.id, 171);
  assert.equal(placementFor({ ...target, held: 170, yaw: 0, point: [0.5, 1.2, 1] })?.id, 170);
  const merged = placementFor({ ...target, held: 170, targetId: 170, yaw: 0, normal: [0, 1, 0] })!;
  assert.deepEqual(merged, { id: 198, x: 0, y: 1, z: 0, merge: true });
  assert.equal(
    placementFor({ ...target, held: 180, targetId: 181, yaw: 0, normal: [0, -1, 0] })?.id,
    199,
  );
  const upper = { id: 171, x: 1, y: 2, z: 3, merge: false };
  assert.equal(mergeAdjacentSlab(upper, 170)?.id, 198);
  for (const id of [171, 180, 3, 61]) assert.equal(mergeAdjacentSlab(upper, id), null);
  assert.equal(mergeAdjacentSlab(upper, 0), upper);
});
test("Internal orientations never replace tools and always mine to their canonical inventory item", () => {
  for (const tool of ITEMS) {
    assert.equal(BLOCKS[tool.id], undefined);
    assert.equal(item(tool.id).name, tool.name);
  }
  for (const [key, s] of Object.entries(SHAPES)) {
    const id = Number(key);
    assert.equal(BLOCKS[id].id, id);
    assert.equal(miningDuration(id, 131), miningDuration(s.base, 131));
    assert.equal(minedResource(id).id, s.item);
    assert.equal(minedResource(id).n, s.kind === "double-slab" ? 2 : 1);
    assert.equal(blockTexture(id), s.base);
    if (s.base === 3) assert(!harvestAllowed(id, 0));
  }
});
test("Stair and slab crafting consumes actual shaped grid ingredients", () => {
  for (const [base, slab, stairs] of [
    [8, 170, 172],
    [3, 180, 182],
  ]) {
    const pack = new InventoryPack();
    pack.size = 3;
    pack.grid = [base, base, base, 0, 0, 0, 0, 0, 0].map((id) => (id ? { id, n: 1 } : null));
    assert.equal(pack.recipe()?.out, slab);
    assert.equal(pack.recipe()?.n, 6);
    pack.grid = [base, 0, 0, base, base, 0, base, base, base].map((id) =>
      id ? { id, n: 1 } : null,
    );
    assert.equal(pack.recipe()?.out, stairs);
    assert.equal(pack.recipe()?.n, 4);
  }
});
test("Step up resolves both half steps, requires support, rejects full cubes and low ceilings", () => {
  const get = field([[0, 0, 0, 182]]),
    from = { x: 0.5, y: 0, z: 1.4 },
    first = { x: 0.5, y: 0, z: 1.2 };
  assert.equal(stepUpHeight(from, first, 1.75, get, solid), 0.5);
  assert.equal(
    stepUpHeight({ x: 0.5, y: 0.5, z: 0.8 }, { x: 0.5, y: 0.5, z: 0.7 }, 1.75, get, solid),
    1,
  );
  assert.equal(stepUpHeight(from, first, 1.75, field([[0, 0, 0, 3]]), solid), null);
  assert.equal(stepUpHeight(from, first, 1.75, field([[0, 0, 0, 182]], false), solid), null);
  assert.equal(
    stepUpHeight(
      from,
      first,
      1.75,
      field([
        [0, 0, 0, 182],
        [0, 2, 1, 3],
      ]),
      solid,
    ),
    null,
  );
  assert.equal(
    stepUpHeight(from, { ...first, z: 0.3 }, 1.75, get, solid),
    null,
    "A whole-height riser cannot be climbed by skipping the first tread",
  );
  const slab = field([[0, 0, 0, 170]]);
  assert.equal(stepUpHeight(from, first, 1.75, slab, solid), 0.5);
  assert(!worldBoxCollision(playerBox({ ...first, y: 0.5 }), slab, solid));
});
test("Actual Game raycast and collision use player eye in every F5 view and respect half blocks", () => {
  const game = Object.create(Game.prototype) as Game;
  Object.assign(game, {
    position: new THREE.Vector3(0.5, 0, 2),
    eyeHeight: 0.75,
    yaw: 0,
    pitch: 0,
    hotbar: [0],
    selected: 0,
    crouching: false,
    world: {
      get: field(
        [
          [0, 0, 0, 170],
          [0, 0, -2, 3],
        ],
        false,
      ),
    },
  });
  for (const perspective of [0, 1, 2]) {
    game.perspective = perspective;
    assert.equal(game.raycast()?.z, -2);
  }
  assert(!game.collision(new THREE.Vector3(0.5, 0.5, 0.5)));
  assert(game.collision(new THREE.Vector3(0.5, 0.49, 0.5)));
});
const area = (f: { vertices: readonly V3[] }) =>
  new THREE.Vector3(...f.vertices[1]).sub(new THREE.Vector3(...f.vertices[0])).length() *
  new THREE.Vector3(...f.vertices[3]).sub(new THREE.Vector3(...f.vertices[0])).length();
test("Meshing hides internal stair seams and only the covered half of adjacent full blocks", () => {
  const faces = shapeFaces(182);
  assert.equal(faces.length, 10);
  assert.equal(
    faces.filter((f) => f.face === 3).reduce((n, f) => n + area(f), 0),
    1,
  );
  const east = shapeFaces(3).find((f) => f.face === 0)!;
  const visible = exposedFace(east, 170);
  assert.equal(
    visible.reduce((n, f) => n + area(f), 0),
    0.5,
  );
  assert(visible.every((f) => f.vertices.every((q) => q[1] >= 0.5)));
  assert.equal(exposedFace(east, 3).length, 0);
  assert.equal(
    exposedFace(east, 170),
    visible,
    "Face clipping is cached, not rebuilt per world block",
  );
  const bed = visualBoxList(190);
  assert(bed.every((b) => b[1] > 0 || b[3] - b[0] < 0.2));
});
test("Actual chunk geometry clips beside slabs, keeps atlas material and disposes shared-bucket geometry", () => {
  const data = new Uint8Array(16 * 16 * HEIGHT);
  data[5 + 5 * 16 + 5 * 256] = 3;
  data[6 + 5 * 16 + 5 * 256] = 180;
  const renderer = Object.create(WorldRenderer.prototype) as WorldRenderer,
    material = new THREE.MeshBasicMaterial();
  Object.assign(renderer, {
    world: { get: () => 0 },
    scene: new THREE.Scene(),
    meshes: new Map(),
    materials: [material],
  });
  renderer.rebuild({ cx: 0, cz: 0, data, dirty: true });
  const group = renderer.meshes.get("0,0")!,
    mesh = group.children[0] as THREE.Mesh;
  assert.equal(group.children.length, 1);
  const p = mesh.geometry.getAttribute("position"),
    n = mesh.geometry.getAttribute("normal"),
    uv = mesh.geometry.getAttribute("uv");
  let boundary = 0;
  for (let i = 0; i < p.count; i++) {
    if (p.getX(i) === 6 && n.getX(i) === 1) {
      boundary++;
      assert(p.getY(i) >= 5.5);
    }
    assert.equal(Math.floor(uv.getX(i) * 16) + Math.floor((1 - uv.getY(i)) * 16) * 16, 3);
  }
  assert.equal(boundary, 4);
  let disposed = 0;
  mesh.geometry.addEventListener("dispose", () => disposed++);
  renderer.disposeGroup(group);
  assert.equal(disposed, 1);
  material.dispose();
});
test("Actual Game.move walks up both stair treads without jumping and full cubes remain impassable", () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { matchMedia: () => ({ matches: false }) },
  });
  try {
    for (const id of [182, 3]) {
      const get = (x: number, y: number, z: number) =>
        y < 5 ? 3 : Math.floor(x) === 0 && Math.floor(y) === 5 && Math.floor(z) === 0 ? id : 0;
      const game = Object.create(Game.prototype) as Game;
      Object.assign(game, {
        position: new THREE.Vector3(0.5, 5, 1.4),
        velocity: new THREE.Vector3(),
        world: {
          get,
          solid: (x: number, y: number, z: number) =>
            solid(get(x, y, z)) &&
            pointInside(get(x, y, z), x - Math.floor(x), y - Math.floor(y), z - Math.floor(z)),
          waterAt: () => false,
        },
        keys: new Set(["KeyW"]),
        grounded: true,
        flying: false,
        crouching: false,
        food: 20,
        health: 20,
        oxygen: 20,
        mode: "survival",
        difficulty: "normal",
        horrorThreat: null,
        yaw: 0,
        pitch: 0,
        eyeHeight: 1.62,
        hungerTimer: 0,
        regenerationTimer: 0,
        damageTimer: 0,
        fallDistance: 0,
        stepTimer: 0,
        clock: 0,
        hotbar: [0],
        selected: 0,
        settings: DEFAULT_SETTINGS,
        perspective: 0,
        camera: new THREE.PerspectiveCamera(),
        sun: new THREE.DirectionalLight(),
        torch: new THREE.PointLight(),
        audio: { play() {} },
        damage(n: number) {
          assert.equal(n, 0, "Safe steps must never cause fall damage");
        },
      });
      for (let i = 0; i < 16; i++) game.move(1 / 60);
      if (id === 182) {
        assert(game.position.z < 0.3);
        assert(Math.abs(game.position.y - 6) < 0.0001);
      } else {
        assert(game.position.z >= 1.29);
        assert.equal(game.position.y, 5);
      }
      assert(!game.keys.has("Space"));
    }
  } finally {
    if (descriptor) Object.defineProperty(globalThis, "window", descriptor);
    else Reflect.deleteProperty(globalThis, "window");
  }
});
test("Actual SP interaction merges once, rejects stale targets and occupied player space without consuming items", () => {
  const blocks = new Map<string, number>([["0,5,0", 170]]);
  const game = Object.create(Game.prototype) as Game;
  Object.assign(game, {
    world: {
      get: (x: number, y: number, z: number) => blocks.get(`${x},${y},${z}`) ?? 0,
      set: (x: number, y: number, z: number, id: number) => blocks.set(`${x},${y},${z}`, id),
      dimension: "overworld",
    },
    mode: "survival",
    position: new THREE.Vector3(3, 6, 3),
    yaw: 0,
    crouching: false,
    hotbar: [170],
    selected: 0,
    inventory: { 170: 4 },
    actionCooldown: 0,
    placed: 0,
    target: {
      x: 0,
      y: 5,
      z: 0,
      px: 0,
      py: 6,
      pz: 0,
      id: 170,
      point: [0.5, 5.5, 0.5],
      normal: [0, 1, 0],
      distance: 2,
    },
    audio: { play() {} },
    emit() {},
    notify() {},
  });
  game.interact();
  assert.equal(blocks.get("0,5,0"), 198);
  assert.equal(game.inventory[170], 3);
  game.actionCooldown = 0;
  game.interact();
  assert.equal(game.inventory[170], 3, "Stale target cannot consume another half block");
  blocks.set("0,5,0", 170);
  game.position.set(0.5, 5.5, 0.5);
  game.actionCooldown = 0;
  game.interact();
  assert.equal(blocks.get("0,5,0"), 170);
  assert.equal(
    game.inventory[170],
    3,
    "Merging below a player cannot put their legs inside a cube",
  );
});
test("Selection and cracks follow exposed stair surfaces, with no phantom full cube above a slab", () => {
  for (const id of [170, 171, 182, 186]) {
    const geometry = blockShapeGeometry(id);
    geometry.computeBoundingBox();
    const box = geometry.boundingBox!;
    assert.equal(box.max.y, id === 170 ? 0 : 0.5);
    assert.equal(box.min.y, id === 171 ? 0 : -0.5);
    const p = geometry.getAttribute("position"),
      n = geometry.getAttribute("normal");
    for (let i = 0; i < p.count; i += 4) {
      const center = [0, 0, 0];
      for (let k = 0; k < 4; k++) {
        center[0] += (p.getX(i + k) + 0.5) / 4;
        center[1] += (p.getY(i + k) + 0.5) / 4;
        center[2] += (p.getZ(i + k) + 0.5) / 4;
      }
      assert(
        pointInside(
          id,
          center[0] - n.getX(i) * 0.0001,
          center[1] - n.getY(i) * 0.0001,
          center[2] - n.getZ(i) * 0.0001,
        ),
      );
      assert(
        !pointInside(
          id,
          center[0] + n.getX(i) * 0.0001,
          center[1] + n.getY(i) * 0.0001,
          center[2] + n.getZ(i) * 0.0001,
        ),
      );
    }
    geometry.dispose();
  }
});
