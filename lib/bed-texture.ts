import { SHAPES, shapeFaces, type V3 } from "./block-shapes";

/** Reserved atlas cells; never place these values in a world or inventory. */
export const BED_TILES = {
  "foot-top": 240,
  "head-top": 241,
  "foot-side": 242,
  "head-side": 243,
  "foot-end": 244,
  "head-end": 245,
  underside: 246,
} as const;
export type BedFace = keyof typeof BED_TILES;
export const BED_PALETTE = {
  blanket: "#b73e49",
  blanketLight: "#ce5660",
  blanketShade: "#92333e",
  stitch: "#df7a7b",
  pillow: "#ece9df",
  pillowLight: "#faf8ec",
  pillowShade: "#c9ccca",
  sheet: "#d9d9d0",
  wood: "#997143",
  woodLight: "#ba9058",
  woodShade: "#705333",
  grain: "#82603b",
} as const;
const HEAD_FACE = [5, 0, 4, 1] as const;
/** Texture directions follow +X, −X, +Y, −Y, +Z, −Z; north is the pillow end. */
export function bedFaceTile(block: number, face: number): number {
  const s = SHAPES[block];
  const head = block === 62 || !!s?.head,
    facing = s?.facing ?? 0;
  if (face === 2) return BED_TILES[head ? "head-top" : "foot-top"];
  if (face === 3) return BED_TILES.underside;
  const headFace = HEAD_FACE[facing],
    footFace = headFace ^ 1;
  if (face === headFace || face === footFace)
    return BED_TILES[head && face === headFace ? "head-end" : "foot-end"];
  return BED_TILES[head ? "head-side" : "foot-side"];
}
function local(block: number, p: V3): readonly [number, number] {
  const facing = SHAPES[block]?.facing ?? 0;
  return facing === 1
    ? [p[2], 1 - p[0]]
    : facing === 2
      ? [1 - p[0], 1 - p[2]]
      : facing === 3
        ? [1 - p[2], p[0]]
        : [p[0], p[2]];
}
/** The 32px side drawing covers the full 9/16-block height, including frame and legs. */
export function bedFaceUV(block: number, face: number, p: V3): readonly [number, number] {
  const [x, z] = local(block, p),
    facing = SHAPES[block]?.facing ?? 0;
  if (face === 2 || face === 3) return [x, 1 - z];
  const longitudinal = face === HEAD_FACE[facing] || face === (HEAD_FACE[facing] ^ 1);
  return [longitudinal ? x : z, p[1] / 0.5625];
}

/** Original 32px bedding: one white pillow at the head, continuous red quilt, timber below. */
export function drawBedFace(c: CanvasRenderingContext2D, face: BedFace, ox = 0, oy = 0) {
  const p = BED_PALETTE;
  const rect = (x: number, y: number, w: number, h: number, color: string) => {
    c.fillStyle = color;
    c.fillRect(ox + x, oy + y, w, h);
  };
  if (face.endsWith("top")) {
    rect(0, 0, 32, 32, p.blanket);
    rect(0, 0, 2, 32, p.blanketShade);
    rect(30, 0, 2, 32, p.blanketShade);
    rect(2, 0, 1, 32, p.blanketLight);
    rect(27, 0, 2, 32, p.blanketLight);
    for (let y = 2; y < 32; y += 5) {
      rect(4, y, 1, 2, p.stitch);
      rect(26, y, 1, 2, p.stitch);
    }
    for (let y = 3; y < 32; y += 8) rect(10 + (y % 3), y, 8, 1, p.blanketLight);
    if (face === "head-top") {
      rect(0, 0, 32, 15, p.sheet);
      rect(2, 2, 28, 10, p.pillowShade);
      rect(3, 2, 26, 9, p.pillow);
      rect(4, 3, 24, 2, p.pillowLight);
      rect(3, 4, 2, 5, p.pillowLight);
      rect(4, 11, 24, 1, p.pillowShade);
      rect(0, 15, 32, 2, p.blanketLight);
      rect(0, 17, 32, 1, p.blanketShade);
    }
    return;
  }
  rect(0, 0, 32, 32, p.wood);
  for (let board = 0; board < 4; board++) {
    rect(board * 8, 0, 1, 32, p.woodShade);
    rect(board * 8 + 2, 3 + board * 3, 1, 10, p.grain);
    rect(board * 8 + 5, 19 - board * 2, 2, 1, p.woodLight);
  }
  if (face === "underside") {
    rect(0, 3, 32, 3, p.woodShade);
    rect(0, 25, 32, 3, p.woodShade);
    rect(1, 3, 30, 1, p.woodLight);
    rect(1, 25, 30, 1, p.woodLight);
    return;
  }
  // y=.3125 is canvas row 14.22; y=.1875 is row 21.33. Geometry supplies the leg gaps.
  rect(0, 0, 32, 12, p.blanket);
  rect(0, 0, 32, 2, p.blanketLight);
  rect(0, 10, 32, 2, p.blanketShade);
  rect(0, 12, 32, 2, p.sheet);
  if (face === "head-side") {
    rect(0, 0, 15, 12, p.sheet);
    rect(2, 0, 10, 4, p.pillow);
    rect(2, 0, 10, 1, p.pillowLight);
    rect(15, 0, 2, 10, p.blanketLight);
  } else if (face === "head-end") {
    rect(0, 0, 32, 12, p.sheet);
    rect(2, 0, 28, 3, p.pillow);
    rect(3, 0, 26, 1, p.pillowLight);
  }
  rect(0, 14, 32, 2, p.woodLight);
  rect(0, 20, 32, 2, p.woodShade);
  for (let x = 4; x < 32; x += 8) rect(x, 16, 4, 1, p.grain);
}
export function paintBedTiles(context: CanvasRenderingContext2D) {
  for (const [face, tile] of Object.entries(BED_TILES))
    drawBedFace(context, face as BedFace, (tile % 16) * 32, Math.floor(tile / 16) * 32);
}

/** The inventory image uses the actual head/foot visual surfaces and the exact atlas painter. */
export function drawBedIcon(c: CanvasRenderingContext2D) {
  const project = (p: V3) => [
    24 + (p[0] - 0.5 - p[2]) * 14,
    28 + (p[0] - 0.5 + p[2]) * 7 - p[1] * 24,
  ];
  const visible = [190, 194].flatMap((block) =>
    shapeFaces(block)
      .filter((f) => [0, 2, 4].includes(f.face))
      .map((f) => ({ block, f, z: block === 194 ? -1 : 0 })),
  );
  visible.sort((a, b) => {
    const depth = (v: typeof a) =>
      v.f.vertices.reduce((sum, p) => sum + p[0] + p[2] + v.z + p[1] * 2, 0) / 4;
    return depth(a) - depth(b);
  });
  for (const { block, f, z } of visible) {
    const screen = f.vertices.map((p) => project([p[0], p[1], p[2] + z]));
    const uv = f.vertices.map((p) => {
      const [u, v] = bedFaceUV(block, f.face, p);
      return [u * 32, (1 - v) * 32];
    });
    const a = uv[1][0] - uv[0][0],
      b = uv[1][1] - uv[0][1],
      cc = uv[3][0] - uv[0][0],
      d = uv[3][1] - uv[0][1],
      determinant = a * d - b * cc;
    if (Math.abs(determinant) < 1e-8) continue;
    const sx = screen[1][0] - screen[0][0],
      sy = screen[1][1] - screen[0][1],
      tx = screen[3][0] - screen[0][0],
      ty = screen[3][1] - screen[0][1];
    const A = (sx * d - tx * b) / determinant,
      B = (sy * d - ty * b) / determinant,
      C = (tx * a - sx * cc) / determinant,
      D = (ty * a - sy * cc) / determinant;
    c.save();
    c.beginPath();
    screen.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
    c.closePath();
    c.clip();
    c.transform(
      A,
      B,
      C,
      D,
      screen[0][0] - A * uv[0][0] - C * uv[0][1],
      screen[0][1] - B * uv[0][0] - D * uv[0][1],
    );
    const face = (Object.keys(BED_TILES) as BedFace[]).find(
      (name) => BED_TILES[name] === bedFaceTile(block, f.face),
    )!;
    drawBedFace(c, face);
    if (f.face !== 2) {
      c.fillStyle = f.face === 0 ? "#00000030" : "#00000014";
      c.fillRect(0, 0, 32, 32);
    }
    c.restore();
  }
}
