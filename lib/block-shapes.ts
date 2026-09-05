/** Shape state stays in the existing one-byte block ID, including in old saves and packets. */
export type V3 = readonly [number, number, number];
export type BlockBox = readonly [number, number, number, number, number, number];
export type Shape = {
  kind: "slab" | "stairs" | "bed" | "double-slab" | "cactus";
  base: number;
  item: number;
  upper: boolean;
  facing: number;
  head?: boolean;
};
export const SHAPE_IDS = {
  oakSlab: 170,
  oakStairs: 172,
  stoneSlab: 180,
  stoneStairs: 182,
  bedFoot: 190,
  bedHead: 194,
} as const;
export const CARDINAL: readonly V3[] = [
  [0, 0, -1],
  [1, 0, 0],
  [0, 0, 1],
  [-1, 0, 0],
];
export const SHAPES: Readonly<Record<number, Shape>> = (() => {
  const out: Record<number, Shape> = {};
  out[41] = { kind: "cactus", base: 41, item: 41, upper: false, facing: 0 };
  for (const [start, base] of [
    [170, 8],
    [180, 3],
  ]) {
    for (let i = 0; i < 2; i++)
      out[start + i] = { kind: "slab", base, item: start, upper: !!i, facing: 0 };
    for (let i = 0; i < 8; i++)
      out[start + 2 + i] = { kind: "stairs", base, item: start + 2, upper: i >= 4, facing: i % 4 };
  }
  out[198] = { kind: "double-slab", base: 8, item: 170, upper: false, facing: 0 };
  out[199] = { kind: "double-slab", base: 3, item: 180, upper: false, facing: 0 };
  out[62] = { kind: "bed", base: 62, item: 62, upper: false, facing: 0 };
  for (let i = 0; i < 8; i++)
    out[190 + i] = { kind: "bed", base: 62, item: 62, upper: false, facing: i % 4, head: i >= 4 };
  return out;
})();
const FULL: readonly BlockBox[] = [[0, 0, 0, 1, 1, 1]],
  EMPTY: readonly BlockBox[] = [];
const boxes = new Map<number, readonly BlockBox[]>();
export const canonicalBlock = (id: number) => SHAPES[id]?.item ?? id;
export const blockTexture = (id: number) => SHAPES[id]?.base ?? id;
export function boxList(id: number): readonly BlockBox[] {
  if (!id) return EMPTY;
  const s = SHAPES[id];
  if (!s || s.kind === "double-slab") return FULL;
  const cached = boxes.get(id);
  if (cached) return cached;
  let result: BlockBox[];
  if (s.kind === "cactus") result = [[0.0625, 0, 0.0625, 0.9375, 1, 0.9375]];
  else if (s.kind === "bed") result = [[0, 0, 0, 1, 0.5625, 1]];
  else if (s.kind === "slab") result = [[0, s.upper ? 0.5 : 0, 0, 1, s.upper ? 1 : 0.5, 1]];
  else {
    const half: BlockBox =
      s.facing === 0
        ? [0, 0, 0, 1, 1, 0.5]
        : s.facing === 1
          ? [0.5, 0, 0, 1, 1, 1]
          : s.facing === 2
            ? [0, 0, 0.5, 1, 1, 1]
            : [0, 0, 0, 0.5, 1, 1];
    result = [
      [0, s.upper ? 0.5 : 0, 0, 1, s.upper ? 1 : 0.5, 1],
      [half[0], s.upper ? 0 : 0.5, half[2], half[3], s.upper ? 0.5 : 1, half[5]],
    ];
  }
  boxes.set(id, result);
  return result;
}
const visualBoxes = new Map<number, readonly BlockBox[]>();
export function visualBoxList(id: number): readonly BlockBox[] {
  const s = SHAPES[id];
  if (s?.kind !== "bed") return boxList(id);
  const cached = visualBoxes.get(id);
  if (cached) return cached;
  const result: BlockBox[] = [
    [0, 0.1875, 0, 1, 0.3125, 1],
    [0, 0.3125, 0, 1, 0.5625, 1],
  ];
  for (const x of [0.09, 0.77]) {
    const z = s.head ? 0.08 : 0.78;
    let b: BlockBox = [x, 0, z, x + 0.14, 0.1875, z + 0.14];
    for (let turn = 0; turn < s.facing; turn++) b = [1 - b[5], b[1], b[0], 1 - b[2], b[4], b[3]];
    result.push(b);
  }
  visualBoxes.set(id, result);
  return result;
}
export function pointInside(id: number, x: number, y: number, z: number) {
  return boxList(id).some(
    (b) => x >= b[0] && x < b[3] && y >= b[1] && y < b[4] && z >= b[2] && z < b[5],
  );
}
export function intersectsBlock(id: number, x: number, y: number, z: number, a: BlockBox) {
  const e = 1e-7;
  return boxList(id).some(
    (b) =>
      a[3] > x + b[0] + e &&
      a[0] < x + b[3] - e &&
      a[4] > y + b[1] + e &&
      a[1] < y + b[4] - e &&
      a[5] > z + b[2] + e &&
      a[2] < z + b[5] - e,
  );
}
export type BlockGetter = (x: number, y: number, z: number) => number;
export function worldBoxCollision(a: BlockBox, get: BlockGetter, solid: (id: number) => boolean) {
  for (let x = Math.floor(a[0] + 1e-7); x <= Math.floor(a[3] - 1e-7); x++)
    for (let y = Math.floor(a[1] + 1e-7); y <= Math.floor(a[4] - 1e-7); y++)
      for (let z = Math.floor(a[2] + 1e-7); z <= Math.floor(a[5] - 1e-7); z++) {
        const id = get(x, y, z);
        if (solid(id) && intersectsBlock(id, x, y, z, a)) return true;
      }
  return false;
}
export const playerBox = (p: { x: number; y: number; z: number }, height = 1.75): BlockBox => [
  p.x - 0.29,
  p.y,
  p.z - 0.29,
  p.x + 0.29,
  p.y + height,
  p.z + 0.29,
];
/** Returns a safe raised foot height only when the existing feet are supported and the obstacle is shaped. */
export function stepUpHeight(
  from: { x: number; y: number; z: number },
  to: { x: number; y: number; z: number },
  height: number,
  get: BlockGetter,
  solid: (id: number) => boolean,
): number | null {
  const support = playerBox({ ...from, y: from.y - 0.002 }, height);
  if (!worldBoxCollision(support, get, solid)) return null;
  const candidates = new Set<number>();
  for (let x = Math.floor(to.x - 0.29); x <= Math.floor(to.x + 0.29); x++)
    for (let z = Math.floor(to.z - 0.29); z <= Math.floor(to.z + 0.29); z++)
      for (let y = Math.floor(from.y); y <= Math.floor(from.y + 0.6); y++) {
        const id = get(x, y, z);
        if (
          !SHAPES[id] ||
          SHAPES[id].kind === "double-slab" ||
          SHAPES[id].kind === "cactus" ||
          !solid(id)
        )
          continue;
        for (const b of boxList(id)) {
          const top = y + b[4];
          if (
            top > from.y + 1e-6 &&
            top <= from.y + 0.600001 &&
            to.x + 0.29 > x + b[0] &&
            to.x - 0.29 < x + b[3] &&
            to.z + 0.29 > z + b[2] &&
            to.z - 0.29 < z + b[5]
          )
            candidates.add(top);
        }
      }
  for (const y of [...candidates].sort((a, b) => a - b)) {
    // The entire raised sweep must fit under the ceiling, including the starting position.
    if (worldBoxCollision(playerBox(from, height + y - from.y), get, solid)) continue;
    const distance = Math.hypot(to.x - from.x, to.z - from.z),
      steps = Math.max(1, Math.ceil(distance / 0.1));
    let safe = true;
    for (let i = 1; i <= steps; i++)
      if (
        worldBoxCollision(
          playerBox(
            {
              x: from.x + ((to.x - from.x) * i) / steps,
              y,
              z: from.z + ((to.z - from.z) * i) / steps,
            },
            height,
          ),
          get,
          solid,
        )
      ) {
        safe = false;
        break;
      }
    if (safe && worldBoxCollision(playerBox({ ...to, y: y - 0.002 }, height), get, solid)) return y;
  }
  return null;
}
export type ShapeHit = { distance: number; point: V3; normal: V3 };
/** Exact slab test, including empty stair quadrants. Origin is relative to the block. */
export function rayIntersectBlock(
  id: number,
  origin: V3,
  direction: V3,
  max = Infinity,
): ShapeHit | null {
  let hit: ShapeHit | null = null;
  for (const b of boxList(id)) {
    let near = -Infinity,
      far = Infinity,
      axis = 0,
      sign = 0;
    for (let i = 0; i < 3; i++) {
      if (Math.abs(direction[i]) < 1e-12) {
        if (origin[i] < b[i] || origin[i] >= b[i + 3]) {
          far = -Infinity;
          break;
        }
        continue;
      }
      let a = (b[i] - origin[i]) / direction[i],
        z = (b[i + 3] - origin[i]) / direction[i],
        n = -1;
      if (a > z) {
        [a, z] = [z, a];
        n = 1;
      }
      if (a > near) {
        near = a;
        axis = i;
        sign = n;
      }
      far = Math.min(far, z);
    }
    if (far < Math.max(0, near) || near > max) continue;
    const distance = Math.max(0, near);
    if (hit && hit.distance <= distance) continue;
    const normal: [number, number, number] = [0, 0, 0];
    normal[axis] = sign;
    hit = {
      distance,
      normal,
      point: [
        origin[0] + direction[0] * distance,
        origin[1] + direction[1] * distance,
        origin[2] + direction[2] * distance,
      ],
    };
  }
  return hit;
}
export type BlockRayHit = ShapeHit & {
  id: number;
  x: number;
  y: number;
  z: number;
  px: number;
  py: number;
  pz: number;
};
/** Voxel DDA plus exact box hits: open stair space and the empty half of slabs are transparent to selection. */
export function raycastBlocks(
  get: BlockGetter,
  selectable: (id: number) => boolean,
  origin: V3,
  direction: V3,
  max = 6,
): BlockRayHit | null {
  if (![...origin, ...direction, max].every(Number.isFinite) || max < 0 || max > 512) return null;
  const cell = origin.map(Math.floor),
    step = direction.map(Math.sign),
    delta = direction.map((d) => (d ? Math.abs(1 / d) : Infinity));
  const next = direction.map((d, i) =>
    d ? (cell[i] + (d > 0 ? 1 : 0) - origin[i]) / d : Infinity,
  );
  let entry = 0;
  for (let count = 0; count < 2048 && entry <= max; count++) {
    const [x, y, z] = cell,
      id = get(x, y, z),
      exit = Math.min(...next, max);
    if (id && selectable(id)) {
      const hit = rayIntersectBlock(
        id,
        [origin[0] - x, origin[1] - y, origin[2] - z],
        direction,
        max,
      );
      if (hit && hit.distance >= entry - 1e-7 && hit.distance <= exit + 1e-7) {
        const point: V3 = [hit.point[0] + x, hit.point[1] + y, hit.point[2] + z];
        return {
          ...hit,
          point,
          id,
          x,
          y,
          z,
          px: x + hit.normal[0],
          py: y + hit.normal[1],
          pz: z + hit.normal[2],
        };
      }
    }
    const axis = next[0] <= next[1] && next[0] <= next[2] ? 0 : next[1] <= next[2] ? 1 : 2;
    entry = next[axis];
    if (!Number.isFinite(entry)) break;
    cell[axis] += step[axis];
    next[axis] += delta[axis];
  }
  return null;
}
export const facingFromYaw = (yaw: number) => ((Math.round(-yaw / (Math.PI / 2)) % 4) + 4) % 4;
export type PlacementInput = {
  held: number;
  targetId: number;
  target: V3;
  normal: V3;
  point: V3;
  yaw: number;
};
export type BlockPlacement = { id: number; x: number; y: number; z: number; merge: boolean };
export function placementFor(a: PlacementInput): BlockPlacement | null {
  if (!Number.isFinite(a.yaw) || ![...a.target, ...a.normal, ...a.point].every(Number.isFinite))
    return null;
  const held = canonicalBlock(a.held),
    s = SHAPES[held],
    target = SHAPES[a.targetId];
  const [x, y, z] = a.target;
  if (
    s?.kind === "slab" &&
    target?.kind === "slab" &&
    s.base === target.base &&
    ((!target.upper && a.normal[1] === 1) || (target.upper && a.normal[1] === -1))
  )
    return { id: s.base === 8 ? 198 : 199, x, y, z, merge: true };
  const upper = a.normal[1] === -1 || (a.normal[1] === 0 && a.point[1] - y > 0.5);
  const id =
    s?.kind === "slab"
      ? held + Number(upper)
      : s?.kind === "stairs"
        ? held + facingFromYaw(a.yaw) + (upper ? 4 : 0)
        : held;
  return { id, x: x + a.normal[0], y: y + a.normal[1], z: z + a.normal[2], merge: false };
}
/** A second slab may fill an adjacent complementary half, but never overwrite another block. */
export function mergeAdjacentSlab(
  placement: BlockPlacement,
  existing: number,
): BlockPlacement | null {
  if (!existing) return placement;
  const a = SHAPES[placement.id],
    b = SHAPES[existing];
  return a?.kind === "slab" && b?.kind === "slab" && a.base === b.base && a.upper !== b.upper
    ? { ...placement, id: a.base === 8 ? 198 : 199, merge: true }
    : null;
}
export type ShapeFace = { face: number; vertices: readonly V3[] };
type Rect = readonly [number, number, number, number];
const subtract = (r: Rect, c: Rect): Rect[] => {
  const x = Math.max(r[0], c[0]),
    y = Math.max(r[1], c[1]),
    X = Math.min(r[2], c[2]),
    Y = Math.min(r[3], c[3]);
  if (x >= X || y >= Y) return [r];
  const out: Rect[] = [
    [r[0], r[1], x, r[3]],
    [X, r[1], r[2], r[3]],
    [x, r[1], X, y],
    [x, Y, X, r[3]],
  ];
  return out.filter((q) => q[0] < q[2] && q[1] < q[3]);
};
const axes = (f: number) => (f < 2 ? [2, 1] : f < 4 ? [0, 2] : [0, 1]);
const plane = (b: BlockBox, f: number) => b[Math.floor(f / 2) + (f % 2 === 0 ? 3 : 0)];
const rect = (b: BlockBox, f: number): Rect => {
  const [u, v] = axes(f);
  return [b[u], b[v], b[u + 3], b[v + 3]];
};
const faceFromRect = (f: number, p: number, r: Rect): ShapeFace => {
  const [u, v] = axes(f),
    axis = Math.floor(f / 2);
  // Winding follows the existing atlas +X,-X,+Y,-Y,+Z,-Z convention.
  const orders =
    f === 0 || f === 5
      ? [
          [0, 0],
          [0, 1],
          [1, 1],
          [1, 0],
        ]
      : f === 1 || f === 4
        ? [
            [1, 0],
            [1, 1],
            [0, 1],
            [0, 0],
          ]
        : f === 2
          ? [
              [0, 1],
              [1, 1],
              [1, 0],
              [0, 0],
            ]
          : [
              [0, 0],
              [1, 0],
              [1, 1],
              [0, 1],
            ];
  return {
    face: f,
    vertices: orders.map(([a, b]) => {
      const q: [number, number, number] = [0, 0, 0];
      q[axis] = p;
      q[u] = r[a ? 2 : 0];
      q[v] = r[b ? 3 : 1];
      return q;
    }),
  };
};
const facesCache = new Map<number, readonly ShapeFace[]>();
/** Removes internal seams between a stair's two boxes, without creating per-block meshes. */
export function shapeFaces(id: number): readonly ShapeFace[] {
  if (id && !SHAPES[id]) id = 1;
  const cached = facesCache.get(id);
  if (cached) return cached;
  const list = visualBoxList(id),
    out: ShapeFace[] = [];
  for (const b of list)
    for (let f = 0; f < 6; f++) {
      const p = plane(b, f);
      let pieces: Rect[] = [rect(b, f)];
      for (const other of list)
        if (other !== b && plane(other, f ^ 1) === p)
          pieces = pieces.flatMap((r) => subtract(r, rect(other, f)));
      for (const r of pieces) out.push(faceFromRect(f, p, r));
    }
  // Merge adjoining coplanar rectangles once, so a full stair back is a single quad.
  let merged = true;
  while (merged) {
    merged = false;
    outer: for (let i = 0; i < out.length; i++)
      for (let j = i + 1; j < out.length; j++) {
        const a = out[i],
          b = out[j],
          axis = Math.floor(a.face / 2);
        if (a.face !== b.face || a.vertices[0][axis] !== b.vertices[0][axis]) continue;
        const [u, v] = axes(a.face),
          bounds = (f: ShapeFace): Rect => [
            Math.min(...f.vertices.map((q) => q[u])),
            Math.min(...f.vertices.map((q) => q[v])),
            Math.max(...f.vertices.map((q) => q[u])),
            Math.max(...f.vertices.map((q) => q[v])),
          ];
        const r = bounds(a),
          t = bounds(b);
        if (
          (r[0] === t[0] && r[2] === t[2] && (r[1] === t[3] || r[3] === t[1])) ||
          (r[1] === t[1] && r[3] === t[3] && (r[0] === t[2] || r[2] === t[0]))
        ) {
          out[i] = faceFromRect(a.face, a.vertices[0][axis], [
            Math.min(r[0], t[0]),
            Math.min(r[1], t[1]),
            Math.max(r[2], t[2]),
            Math.max(r[3], t[3]),
          ]);
          out.splice(j, 1);
          merged = true;
          break outer;
        }
      }
  }
  facesCache.set(id, out);
  return out;
}
const visibleCache = new WeakMap<ShapeFace, Map<number, readonly ShapeFace[]>>();
const NO_FACES: readonly ShapeFace[] = [];
/** Clips just the covered rectangle of a boundary face; a slab never hides a whole neighbour. */
export function exposedFace(face: ShapeFace, neighbor: number): readonly ShapeFace[] {
  if (neighbor && !SHAPES[neighbor]) neighbor = 1;
  let cache = visibleCache.get(face);
  if (!cache) {
    cache = new Map();
    visibleCache.set(face, cache);
  }
  const cached = cache.get(neighbor);
  if (cached) return cached;
  const f = face.face,
    axis = Math.floor(f / 2),
    p = face.vertices[0][axis];
  if (!neighbor || p !== (f % 2 === 0 ? 1 : 0)) {
    const faces = [face];
    cache.set(neighbor, faces);
    return faces;
  }
  if (neighbor === 1) {
    cache.set(neighbor, NO_FACES);
    return NO_FACES;
  }
  const [u, v] = axes(f);
  let pieces: Rect[] = [
    [
      Math.min(...face.vertices.map((q) => q[u])),
      Math.min(...face.vertices.map((q) => q[v])),
      Math.max(...face.vertices.map((q) => q[u])),
      Math.max(...face.vertices.map((q) => q[v])),
    ],
  ];
  for (const b of visualBoxList(neighbor))
    if (plane(b, f ^ 1) === (f % 2 === 0 ? 0 : 1))
      pieces = pieces.flatMap((r) => subtract(r, rect(b, f)));
  const result = pieces.map((r) => faceFromRect(f, p, r));
  cache.set(neighbor, result);
  return result;
}
/** Local texture coordinates keep the grain at block scale instead of stretching half blocks. */
export function faceUV(f: number, q: V3): readonly [number, number] {
  return f === 0
    ? [q[2], q[1]]
    : f === 1
      ? [1 - q[2], q[1]]
      : f === 2
        ? [1 - q[2], q[0]]
        : f === 3
          ? [q[2], q[0]]
          : f === 4
            ? [1 - q[0], q[1]]
            : [q[0], q[1]];
}
