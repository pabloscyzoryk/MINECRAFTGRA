type Point = readonly [number, number, number];
type Bucket = { p: number[]; n: number[]; uv: number[]; col: number[]; idx: number[] };
/** Cached tapered thorns, appended to the terrain batch rather than separate meshes. */
export const CACTUS_SPINES = (() => {
  const triangles: { points: readonly Point[]; normal: Point }[] = [];
  for (let face = 0; face < 4; face++) {
    const turn = ([x, y, z]: Point): Point =>
      face === 0
        ? [x, y, z]
        : face === 1
          ? [1 - z, y, x]
          : face === 2
            ? [1 - x, y, 1 - z]
            : [z, y, 1 - x];
    for (let row = 0; row < 3; row++)
      for (let col = 0; col < 2; col++) {
        const y = 0.19 + row * 0.3,
          z = 0.27 + col * 0.44;
        const base: Point[] = [
          [0.075, y - 0.038, z - 0.022],
          [0.075, y + 0.038, z - 0.022],
          [0.075, y + 0.038, z + 0.022],
          [0.075, y - 0.038, z + 0.022],
        ];
        const tip = turn([0, y + 0.025, z]),
          center = turn([0.06, y, z]);
        for (let edge = 0; edge < 4; edge++) {
          const points = [turn(base[edge]), turn(base[(edge + 1) % 4]), tip];
          const a = points[1].map((v, i) => v - points[0][i]),
            b = points[2].map((v, i) => v - points[0][i]);
          let n = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
          const mid = points[0].map(
            (_, i) => points.reduce((sum, p) => sum + p[i], 0) / 3 - center[i],
          );
          if (n.reduce((sum, v, i) => sum + v * mid[i], 0) < 0) {
            [points[0], points[1]] = [points[1], points[0]];
            n = n.map((v) => -v);
          }
          const length = Math.hypot(...n);
          triangles.push({ points, normal: n.map((v) => v / length) as unknown as Point });
        }
      }
  }
  return triangles;
})();
export function appendCactusSpines(bucket: Bucket, x: number, y: number, z: number) {
  // Warm quartz texel: thorns remain crisp at a distance without extra materials/draw calls.
  const u = ((98 % 16) + 0.5) / 16,
    v = 1 - (Math.floor(98 / 16) + 0.5) / 16;
  for (const triangle of CACTUS_SPINES) {
    const start = bucket.p.length / 3;
    for (const point of triangle.points) {
      bucket.p.push(x + point[0], y + point[1], z + point[2]);
      bucket.n.push(...triangle.normal);
      bucket.uv.push(u, v);
      bucket.col.push(0.92, 0.88, 0.7);
    }
    bucket.idx.push(start, start + 1, start + 2);
  }
}
