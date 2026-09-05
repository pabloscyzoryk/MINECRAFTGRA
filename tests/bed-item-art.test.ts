import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { createHash } from "node:crypto";
import {
  BED_TILES,
  BED_PALETTE,
  bedFaceTile,
  bedFaceUV,
  drawBedFace,
  drawBedIcon,
  paintBedTiles,
  type BedFace,
} from "../lib/bed-texture";
import { BLOCKS, ITEMS } from "../lib/blocks";
import { shapeFaces } from "../lib/block-shapes";
import { itemArt } from "../lib/item-art";
import { HeldItemModel } from "../lib/held-item";
import { WorldRenderer } from "../lib/renderer";
import { World, HEIGHT } from "../lib/world";

function pixels(face: BedFace) {
  const result = Array<string>(32 * 32).fill("");
  const ctx = {
    fillStyle: "",
    fillRect(x: number, y: number, w: number, h: number) {
      assert(x >= 0 && y >= 0 && x + w <= 32 && y + h <= 32);
      for (let a = x; a < x + w; a++)
        for (let b = y; b < y + h; b++) result[a + b * 32] = this.fillStyle;
    },
  };
  drawBedFace(ctx as unknown as CanvasRenderingContext2D, face);
  return result;
}
test("Bed atlas contains one pillow at the head, a continuous red quilt and timber frame/legs", () => {
  const foot = pixels("foot-top"),
    head = pixels("head-top"),
    p = BED_PALETTE;
  const white: string[] = [p.pillow, p.pillowLight, p.pillowShade, p.sheet];
  assert(head.filter((color) => white.includes(color)).length > 300);
  assert(
    foot.every((color) => color && !white.includes(color)),
    "No second pillow at the foot",
  );
  assert.equal(head[16 + 24 * 32], p.blanket);
  assert.equal(foot[16 + 24 * 32], p.blanket);
  for (const side of ["foot-side", "head-side", "foot-end", "head-end"] as const) {
    const data = pixels(side);
    assert.equal(data[16 + 15 * 32], p.woodLight);
    assert(
      [p.wood, p.woodLight, p.woodShade, p.grain].includes(data[16 + 26 * 32] as typeof p.wood),
    );
    assert(data.every(Boolean));
  }
  assert(white.includes(pixels("head-side")[5 + 3 * 32]));
  assert(!white.includes(pixels("foot-side")[5 + 3 * 32]));
});
test("Bed UVs rotate the pillow with its head in every cardinal direction and remain inside the reserved cells", () => {
  const rotate = (p: [number, number, number]) =>
    [1 - p[2], p[1], p[0]] as [number, number, number];
  let headCenter: [number, number, number] = [0.5, 0.5625, 0];
  for (let facing = 0; facing < 4; facing++) {
    const head = 194 + facing,
      foot = 190 + facing;
    assert.equal(bedFaceTile(head, 2), BED_TILES["head-top"]);
    assert.equal(bedFaceTile(foot, 2), BED_TILES["foot-top"]);
    assert.deepEqual(bedFaceUV(head, 2, headCenter), [0.5, 1]);
    const headingFace = [5, 0, 4, 1][facing];
    assert.equal(bedFaceTile(head, headingFace), BED_TILES["head-end"]);
    assert.equal(bedFaceTile(foot, headingFace ^ 1), BED_TILES["foot-end"]);
    for (const id of [head, foot])
      for (const face of shapeFaces(id))
        for (const vertex of face.vertices)
          assert(
            bedFaceUV(id, face.face, vertex).every((value) => value >= -1e-9 && value <= 1 + 1e-9),
          );
    headCenter = rotate(headCenter);
  }
  assert.equal(
    bedFaceTile(62, 2),
    BED_TILES["head-top"],
    "Legacy single-block beds stay recognizable",
  );
  const cells = new Set<number>();
  const ctx = {
    fillStyle: "",
    fillRect(x: number, y: number, w: number, h: number) {
      const first = Math.floor(x / 32) + Math.floor(y / 32) * 16,
        last = Math.floor((x + w - 1) / 32) + Math.floor((y + h - 1) / 32) * 16;
      assert.equal(first, last);
      cells.add(first);
    },
  };
  paintBedTiles(ctx as unknown as CanvasRenderingContext2D);
  assert.deepEqual(
    [...cells].sort((a, b) => a - b),
    [240, 241, 242, 243, 244, 245, 246],
  );
  assert(
    [...cells].every((id) => !BLOCKS[id] && id < 250),
    "Chest/grass/log atlas cells and real blocks remain untouched",
  );
});
test("Actual terrain bed meshes put top/side pillow pixels at the outer head end, with a real gap below the frame", () => {
  for (let facing = 0; facing < 4; facing++) {
    const direction = [
      [0, 0, -1],
      [1, 0, 0],
      [0, 0, 1],
      [-1, 0, 0],
    ][facing];
    const world = new World(),
      data = new Uint8Array(16 * 16 * HEIGHT),
      material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
    const foot = [5, 5, 5],
      head = foot.map((n, i) => n + direction[i]);
    data[foot[0] + foot[2] * 16 + foot[1] * 256] = 190 + facing;
    data[head[0] + head[2] * 16 + head[1] * 256] = 194 + facing;
    world.get = () => 0;
    const renderer = Object.create(WorldRenderer.prototype) as WorldRenderer;
    Object.assign(renderer, {
      world,
      scene: new THREE.Scene(),
      meshes: new Map(),
      materials: [material],
    });
    renderer.rebuild({ cx: 0, cz: 0, data, dirty: true });
    const group = renderer.meshes.get("0,0")!;
    try {
      assert.equal(group.children.length, 1, "Beds remain in the opaque terrain batch");
      const mesh = group.children[0] as THREE.Mesh,
        position = mesh.geometry.getAttribute("position"),
        normal = mesh.geometry.getAttribute("normal"),
        uv = mesh.geometry.getAttribute("uv");
      let headTop = 0,
        headSides = 0;
      for (let start = 0; start < position.count; start += 4) {
        const tile = Math.floor(uv.getX(start) * 16) + Math.floor((1 - uv.getY(start)) * 16) * 16;
        const vertices = Array.from({ length: 4 }, (_, i) =>
          new THREE.Vector3().fromBufferAttribute(position, start + i),
        );
        if (tile === BED_TILES["head-top"] && normal.getY(start) === 1) {
          headTop++;
          assert(vertices.every((v) => v.y === 5.5625));
          for (let i = 0; i < 4; i++) {
            const v =
              (uv.getY(start + i) - (1 - Math.floor(tile / 16) / 16 - 0.0625 + 0.001)) / 0.0605;
            if (v > 0.999)
              assert(
                Math.abs(
                  vertices[i].dot(new THREE.Vector3(...direction)) -
                    (new THREE.Vector3(head[0] + 0.5, 0, head[2] + 0.5).dot(
                      new THREE.Vector3(...direction),
                    ) +
                      0.5),
                ) < 1e-6,
                "White pillow must touch the head-facing edge",
              );
          }
        }
        if (tile === BED_TILES["head-side"] && Math.max(...vertices.map((v) => v.y)) === 5.5625) {
          headSides++;
          for (let i = 0; i < 4; i++) {
            const u = (uv.getX(start + i) - (tile % 16) / 16 - 0.001) / 0.0605;
            if (u < 0.001)
              assert(
                Math.abs(
                  vertices[i].dot(new THREE.Vector3(...direction)) -
                    (new THREE.Vector3(head[0] + 0.5, 0, head[2] + 0.5).dot(
                      new THREE.Vector3(...direction),
                    ) +
                      0.5),
                ) < 1e-6,
                "Side pillow must align with the top on both long edges",
              );
          }
        }
      }
      assert.equal(headTop, 1);
      assert.equal(headSides, 2);
      group.updateMatrixWorld(true);
      const ray = new THREE.Raycaster(
        new THREE.Vector3(5.5 - direction[0] * 2, 5.1, 5.5 - direction[2] * 2),
        new THREE.Vector3(...direction),
        0,
        5,
      );
      assert.equal(
        ray.intersectObject(group, true).length,
        0,
        "A center ray passes between the four legs below the frame",
      );
    } finally {
      renderer.disposeGroup(group);
      material.dispose();
    }
  }
});
class RecordingCanvas {
  width = 0;
  height = 0;
  calls: unknown[] = [];
  paths: number[][][] = [];
  ctx: CanvasRenderingContext2D;
  constructor() {
    let path: number[][] = [];
    const c: Record<string, unknown> = {
      fillStyle: "",
      strokeStyle: "",
      lineWidth: 1,
      imageSmoothingEnabled: true,
    };
    for (const method of [
      "save",
      "restore",
      "transform",
      "rotate",
      "translate",
      "clearRect",
      "arc",
      "quadraticCurveTo",
      "stroke",
    ])
      c[method] = (...args: unknown[]) => this.calls.push([method, ...args]);
    c.beginPath = () => {
      path = [];
    };
    c.closePath = () => {};
    c.moveTo = c.lineTo = (x: number, y: number) => {
      path.push([x, y]);
    };
    c.fill = () => {
      this.calls.push(["path", c.fillStyle, path.map((p) => p.slice())]);
    };
    c.clip = () => {
      this.paths.push(path.map((p) => p.slice()));
    };
    c.fillRect = (...args: number[]) => {
      this.calls.push(["rect", c.fillStyle, ...args]);
    };
    this.ctx = c as unknown as CanvasRenderingContext2D;
  }
  getContext() {
    return this.ctx;
  }
  toDataURL() {
    return (
      "data:image/png;base64," +
      createHash("sha256").update(JSON.stringify(this.calls)).digest("base64")
    );
  }
}
test("Bed inventory drawing has a full two-block footprint, a white head and visible clipped leg surfaces", () => {
  const canvas = new RecordingCanvas();
  drawBedIcon(canvas.ctx);
  const all = canvas.paths.flat();
  assert(all.length > 50);
  assert(
    all.every(([x, y]) => x >= 2 && x <= 46 && y >= 2 && y <= 45),
    "The full bed fits its 48px item cell",
  );
  assert(Math.max(...all.map((p) => p[0])) - Math.min(...all.map((p) => p[0])) >= 41);
  const calls = canvas.calls as unknown[][];
  assert(calls.some((c) => c[0] === "rect" && c[1] === BED_PALETTE.pillow));
  assert(calls.some((c) => c[0] === "rect" && c[1] === BED_PALETTE.blanket));
  assert(
    canvas.paths.some(
      (path) => Math.max(...path.map((p) => p[1])) - Math.min(...path.map((p) => p[1])) < 8,
    ),
    "Narrow frame/leg faces do not turn into a full cube",
  );
});
test("Sparse shape block IDs never route tools, resources or armor through the block icon branch", () => {
  assert(BLOCKS.length >= 198);
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "document");
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: { createElement: () => new RecordingCanvas() },
  });
  try {
    for (const entry of ITEMS) assert.doesNotThrow(() => itemArt(entry.id), entry.name);
    const icons = [62, 170, 172, 180, 182].map(itemArt);
    assert.equal(
      new Set(icons).size,
      icons.length,
      "Bed, wood/stone slab and wood/stone stairs are distinct drawings",
    );
    assert.equal(itemArt(197), icons[0]);
    assert.equal(itemArt(171), icons[1]);
    assert.equal(itemArt(179), icons[2]);
    assert.notEqual(itemArt(103), itemArt(3));
    assert.notEqual(itemArt(121), itemArt(21));
  } finally {
    if (descriptor) Object.defineProperty(globalThis, "document", descriptor);
    else Reflect.deleteProperty(globalThis, "document");
  }
});
test("Held bed has four actual legs and a two-block length; slabs and stairs retain their real geometry", () => {
  const held = new HeldItemModel(() => new THREE.Texture());
  held.set(62);
  const bed = held.group.getObjectByName("held-bed") as THREE.Group;
  assert(bed);
  assert.equal(bed.children.filter((o) => o.name.includes("-leg-")).length, 4);
  assert.equal(bed.children.filter((o) => o.name.includes("mattress")).length, 2);
  assert(bed.getObjectByName("bed-pillow")!.position.z < -0.15);
  bed.rotation.set(0, 0, 0);
  bed.position.set(0, 0, 0);
  const size = new THREE.Box3().setFromObject(bed).getSize(new THREE.Vector3());
  assert(Math.abs(size.z / size.x - 2) < 0.001);
  assert(size.y < 0.18);
  const resources = new Set<THREE.BufferGeometry>();
  bed.traverse((o) => {
    if (o instanceof THREE.Mesh) resources.add(o.geometry);
  });
  let disposals = 0;
  resources.forEach((r) => r.addEventListener("dispose", () => disposals++));
  held.set(170);
  assert.equal(disposals, resources.size);
  let mesh = held.group.getObjectByName("shape-box-0") as THREE.Mesh<THREE.BoxGeometry>;
  assert.equal(mesh.geometry.parameters.height, 0.15);
  assert.equal(held.group.getObjectByName("held-slab")!.children.length, 1);
  held.set(172);
  assert.equal(held.group.getObjectByName("held-stairs")!.children.length, 2);
  held.set(103);
  assert(
    held.group.children.length > 3,
    "Sparse BLOCKS length does not turn a pickaxe into a cube",
  );
  held.set(111);
  assert.equal((held.group.children[0] as THREE.Mesh).geometry.type, "PlaneGeometry");
  held.dispose();
  held.dispose();
  assert.equal(disposals, resources.size);
});
