/** Texture-only variants. These are reserved atlas cells, never world block IDs. */
export const CHEST_TILES = { front: 61, side: 250, lid: 251, bottom: 252, back: 253 } as const;
export type ChestFace = keyof typeof CHEST_TILES;
/** Renderer face order: +X, -X, +Y, -Y, +Z, -Z. The fixed front faces north (-Z). */
export const CHEST_FACE_TILES = [250, 250, 251, 252, 253, 61] as const;

export const CHEST_PALETTE = {
  outline: "#402b1c",
  frame: "#6e4729",
  frameLight: "#a06d3c",
  wood: "#b78043",
  woodLight: "#cc9856",
  woodShade: "#9f6b36",
  grain: "#8d5b2e",
  metal: "#b6bfc0",
  metalLight: "#e3e7df",
  metalShade: "#697677",
} as const;

/** Native 32px pixel art shared by terrain and inventory, with one front-only iron latch. */
export function drawChestFace(context: CanvasRenderingContext2D, face: ChestFace, ox = 0, oy = 0) {
  const p = CHEST_PALETTE;
  const rect = (x: number, y: number, w: number, h: number, color: string) => {
    context.fillStyle = color;
    context.fillRect(ox + x, oy + y, w, h);
  };
  rect(0, 0, 32, 32, p.outline);
  rect(1, 1, 30, 30, p.frame);
  rect(2, 2, 28, 28, p.wood);
  // Four slightly different planks with fine grain, kept coarse enough for distant mipmaps.
  for (let board = 0; board < 4; board++) {
    const x = 3 + board * 7;
    rect(x, 3, 6, 26, board % 2 ? p.wood : p.woodLight);
    rect(x, 3, 1, 26, p.woodShade);
    rect(x + 2, 5 + (board % 2) * 3, 1, 5 + board, p.grain);
    rect(x + 4, 17 - (board % 2) * 3, 1, 6, p.woodShade);
    rect(x + 1, 24 - board, 2, 1, p.grain);
  }
  // A timber rim surrounds every face and makes the corners join across the voxel edges.
  rect(1, 1, 30, 3, p.frame);
  rect(1, 28, 30, 3, p.frame);
  rect(1, 1, 3, 30, p.frame);
  rect(28, 1, 3, 30, p.frame);
  rect(2, 2, 28, 1, p.frameLight);
  rect(2, 3, 1, 26, p.frameLight);
  rect(4, 28, 24, 1, p.outline);
  rect(28, 4, 1, 24, p.outline);
  if (face === "lid" || face === "bottom") {
    // Cross rails reinforce the lid/base; neither face carries a lock or a vertical lid seam.
    for (const y of face === "bottom" ? [11, 20] : [7, 23]) {
      rect(3, y, 26, 3, p.frame);
      rect(4, y, 24, 1, p.frameLight);
      rect(5, y + 1, 1, 1, p.outline);
      rect(26, y + 1, 1, 1, p.outline);
    }
    return;
  }
  // The horizontal seam follows the same height around the entire chest.
  rect(0, 9, 32, 1, p.frameLight);
  rect(0, 10, 32, 3, p.outline);
  rect(2, 13, 28, 1, p.frameLight);
  for (const x of [2, 29]) {
    rect(x, 6, 1, 1, p.outline);
    rect(x, 25, 1, 1, p.outline);
  }
  if (face === "back") {
    for (const x of [6, 23]) {
      rect(x, 8, 3, 7, p.outline);
      rect(x, 9, 3, 5, p.metalShade);
      rect(x, 10, 3, 2, p.metal);
    }
  }
  if (face === "front") {
    rect(13, 8, 6, 13, p.outline);
    rect(14, 9, 4, 11, p.metalShade);
    rect(14, 9, 3, 10, p.metal);
    rect(14, 9, 3, 1, p.metalLight);
    rect(14, 10, 1, 8, p.metalLight);
    rect(15, 13, 2, 2, p.outline);
    rect(15, 15, 1, 2, p.outline);
  }
}

/** Project the very same face drawings into the 48px inventory cube. */
export function drawChestIcon(context: CanvasRenderingContext2D) {
  const face = (
    kind: ChestFace,
    a: number,
    b: number,
    c: number,
    d: number,
    x: number,
    y: number,
  ) => {
    context.save();
    context.transform(a, b, c, d, x, y);
    drawChestFace(context, kind);
    context.restore();
  };
  face("lid", 20 / 32, 11 / 32, -20 / 32, 11 / 32, 24, 3);
  face("front", 20 / 32, 11 / 32, 0, 21 / 32, 4, 14);
  face("side", 20 / 32, -11 / 32, 0, 21 / 32, 24, 25);
  context.save();
  context.transform(20 / 32, -11 / 32, 0, 21 / 32, 24, 25);
  context.fillStyle = "#00000026";
  context.fillRect(0, 0, 32, 32);
  context.restore();
}
