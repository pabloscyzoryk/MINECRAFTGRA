import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import {
  CHEST_TILES,
  CHEST_PALETTE,
  drawChestFace,
  drawChestIcon,
  type ChestFace,
} from "../lib/chest-texture";
import { WorldRenderer } from "../lib/renderer";
import { World, HEIGHT } from "../lib/world";
import { BLOCKS } from "../lib/blocks";
import { itemArt } from "../lib/item-art";

test("Real chest chunk geometry uses exactly one upright front latch, separate sides/back/lid/base and one material", () => {
  const world = new World(),
    data = new Uint8Array(16 * 16 * HEIGHT);
  data[5 + 5 * 16 + 5 * 256] = 61;
  world.get = () => 0;
  const renderer = Object.create(WorldRenderer.prototype) as WorldRenderer;
  const material = new THREE.MeshBasicMaterial();
  Object.assign(renderer, {
    world,
    scene: new THREE.Scene(),
    meshes: new Map(),
    materials: [material],
  });
  renderer.rebuild({ cx: 0, cz: 0, data, dirty: true });
  const group = renderer.meshes.get("0,0")!;
  try {
    assert.equal(
      group.children.length,
      1,
      "face variants stay in the existing single terrain draw call",
    );
    const mesh = group.children[0] as THREE.Mesh;
    const position = mesh.geometry.getAttribute("position"),
      normal = mesh.geometry.getAttribute("normal"),
      uv = mesh.geometry.getAttribute("uv");
    assert.equal(position.count, 24);
    const actual: Record<string, number> = {};
    for (let face = 0; face < 6; face++) {
      const start = face * 4;
      const direction = [normal.getX(start), normal.getY(start), normal.getZ(start)].join(",");
      const tiles = Array.from({ length: 4 }, (_, corner) => {
        const index = start + corner;
        return Math.floor(uv.getX(index) * 16) + Math.floor((1 - uv.getY(index)) * 16) * 16;
      });
      assert(
        tiles.every((tile) => tile === tiles[0]),
        "no triangle may cross atlas cell boundaries",
      );
      actual[direction] = tiles[0];
      if (direction === "0,0,-1") {
        assert(position.getY(start + 1) > position.getY(start));
        assert(
          uv.getY(start + 1) > uv.getY(start),
          "the latch texture and lid seam remain upright",
        );
      }
    }
    assert.deepEqual(actual, {
      "1,0,0": 250,
      "-1,0,0": 250,
      "0,1,0": 251,
      "0,-1,0": 252,
      "0,0,1": 253,
      "0,0,-1": 61,
    });
    assert.equal(Object.values(actual).filter((tile) => tile === 61).length, 1);
    assert.equal(BLOCKS[61].name, "Skrzynia");
    assert(
      Object.values(CHEST_TILES)
        .filter((tile) => tile !== 61)
        .every((tile) => tile >= BLOCKS.length && tile < 254),
    );
  } finally {
    renderer.disposeGroup(group);
    material.dispose();
  }
});

function tile(face: ChestFace) {
  const pixels = Array<string>(32 * 32).fill("");
  const context = {
    fillStyle: "",
    fillRect(x: number, y: number, width: number, height: number) {
      assert(x >= 0 && y >= 0 && x + width <= 32 && y + height <= 32);
      for (let py = y; py < y + height; py++)
        for (let px = x; px < x + width; px++) pixels[px + py * 32] = this.fillStyle;
    },
  };
  drawChestFace(context as unknown as CanvasRenderingContext2D, face);
  return pixels;
}
test("Only the front has a central iron latch; sides and lid retain grain/frames without metal", () => {
  const front = tile("front"),
    back = tile("back");
  const metals: string[] = [
    CHEST_PALETTE.metal,
    CHEST_PALETTE.metalLight,
    CHEST_PALETTE.metalShade,
  ];
  assert(front.filter((color) => metals.includes(color)).length >= 25);
  assert.equal(front[14 + 12 * 32], CHEST_PALETTE.metalLight);
  assert.equal(
    front[15 + 14 * 32],
    CHEST_PALETTE.outline,
    "the keyhole remains distinct from its metal latch",
  );
  for (const face of ["side", "lid", "bottom"] as const) {
    const pixels = tile(face);
    assert(
      pixels.every((color) => color && !metals.includes(color)),
      `${face} never receives a lock`,
    );
    assert(new Set(pixels).size >= 6, `${face} contains visible board/frame/grain variation`);
  }
  assert(
    back.some((color) => metals.includes(color)),
    "back has edge hinges",
  );
  assert(!metals.includes(back[15 + 12 * 32]), "back has no central latch");
  assert.equal(front[7 + 11 * 32], tile("side")[7 + 11 * 32], "lid seam wraps at the same height");
});

function iconContext() {
  let matrix = [1, 0, 0, 1, 0, 0];
  const stack: number[][] = [],
    calls: { color: string; corners: number[][] }[] = [];
  const context = {
    fillStyle: "",
    imageSmoothingEnabled: true,
    save() {
      stack.push([...matrix]);
    },
    restore() {
      matrix = stack.pop()!;
    },
    transform(...values: number[]) {
      matrix = values;
    },
    fillRect(x: number, y: number, width: number, height: number) {
      const [a, b, c, d, e, f] = matrix;
      calls.push({
        color: this.fillStyle,
        corners: [
          [x, y],
          [x + width, y],
          [x + width, y + height],
          [x, y + height],
        ].map(([px, py]) => [a * px + c * py + e, b * px + d * py + f]),
      });
    },
  };
  return { context: context as unknown as CanvasRenderingContext2D, calls };
}
test("The actual inventory icon uses those same three face drawings, with its latch inside the front face", () => {
  const expected = iconContext(),
    actual = iconContext();
  drawChestIcon(expected.context);
  const canvas = {
    width: 0,
    height: 0,
    getContext: () => actual.context,
    toDataURL: () => "data:image/png;base64,chest-test",
  };
  const previous = Object.getOwnPropertyDescriptor(globalThis, "document");
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: { createElement: () => canvas },
  });
  try {
    assert.equal(itemArt(61), "data:image/png;base64,chest-test");
    assert.equal(canvas.width, 48);
    assert.equal(canvas.height, 48);
    assert.deepEqual(actual.calls, expected.calls);
    const lock = actual.calls.filter((call) => call.color === CHEST_PALETTE.metalLight);
    assert(lock.length > 0);
    assert(
      lock.every((call) => call.corners.every(([x, y]) => x > 4 && x < 24 && y > 14 && y < 46)),
    );
    assert(
      actual.calls.every((call) =>
        call.corners.every(([x, y]) => x >= 3 && x <= 45 && y >= 2 && y <= 47),
      ),
    );
  } finally {
    if (previous) Object.defineProperty(globalThis, "document", previous);
    else Reflect.deleteProperty(globalThis, "document");
  }
});
