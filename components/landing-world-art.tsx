import { useId, type ReactNode } from "react";

type World = "overworld" | "nether" | "end";
type Material = [top: string, left: string, right: string, fleck: string];
type Voxel = { x: number; z: number; y: number; material: string; size?: number };
const PALETTES: Record<World, Record<string, Material>> = {
  overworld: {
    grass: ["#9daf69", "#667c48", "#496447", "#d1dba0"],
    grass2: ["#b0ba78", "#70834e", "#506847", "#e0dfaa"],
    dirt: ["#987950", "#796044", "#604d3d", "#bea17b"],
    rock: ["#7e8980", "#626e66", "#49584f", "#bac0a6"],
    deep: ["#657468", "#4b5e53", "#354b40", "#839588"],
    water: ["#80bdb6", "#4c969b", "#366f81", "#c8e3cf"],
    leaf: ["#73975d", "#446e4e", "#2e5544", "#acc685"],
    leaf2: ["#96ad68", "#648854", "#436c4b", "#cbd49a"],
    wood: ["#b09a6d", "#897045", "#65593d", "#d1bd8d"],
    plank: ["#c9b489", "#ab8b60", "#806b4c", "#e5d1a2"],
    roof: ["#758277", "#54675e", "#3b5349", "#a4b29c"],
    cloud: ["#f1f0d9", "#d4dfce", "#bdcebd", "#fffdec"],
  },
  nether: {
    grass: ["#ab6c58", "#895042", "#673f39", "#d39470"],
    grass2: ["#bd7959", "#965542", "#704236", "#e4ae79"],
    dirt: ["#915444", "#723e37", "#542e2e", "#c17957"],
    rock: ["#6c5754", "#514445", "#3c353b", "#9b7566"],
    deep: ["#53464b", "#3c343d", "#2c2934", "#87636b"],
    water: ["#f4bc69", "#e38648", "#b85a37", "#ffe3a4"],
    leaf: ["#b96164", "#923e4e", "#682d41", "#e39486"],
    leaf2: ["#d98270", "#b15558", "#803548", "#fac6a1"],
    wood: ["#b18873", "#925f55", "#6d4849", "#dfb59a"],
    plank: ["#d4a56e", "#b07d4c", "#835b3b", "#ffe0a0"],
    roof: ["#635761", "#473e50", "#322d40", "#928093"],
    cloud: ["#aa7770", "#80595b", "#694b54", "#b8927a"],
  },
  end: {
    grass: ["#c8c5aa", "#a29f90", "#807f83", "#eeebcc"],
    grass2: ["#ded5b5", "#b8ae99", "#918b89", "#f6ebca"],
    dirt: ["#aaa399", "#827f85", "#656675", "#d2c8b0"],
    rock: ["#868394", "#65637d", "#4b4e6b", "#b9afc7"],
    deep: ["#65657d", "#464963", "#343b56", "#8d85a6"],
    water: ["#b4a2d7", "#806dab", "#5b528f", "#e3c5ed"],
    leaf: ["#766e9c", "#554e7c", "#3b3d66", "#bba1d1"],
    leaf2: ["#a994bc", "#7c6799", "#55507f", "#e0c0de"],
    wood: ["#8a809a", "#655d7c", "#484462", "#b7a5c2"],
    plank: ["#cbb1d7", "#aa87c0", "#786398", "#f0d2eb"],
    roof: ["#48435e", "#302e49", "#22263d", "#807496"],
    cloud: ["#aaa1c1", "#85849f", "#656b8a", "#d7c7df"],
  },
};
const W = 50,
  D = 26,
  H = 32;
const point = (x: number, z: number, y: number) => [550 + (x - z) * W, 337 + (x + z) * D - y * H];
const points = (vertices: number[][]) => vertices.map((p) => p.join(",")).join(" ");
const random = (x: number, z: number, salt = 1) => {
  const n = Math.sin(x * 127.1 + z * 311.7 + salt * 73.3) * 43758.5453;
  return n - Math.floor(n);
};
const stream = new Set([
  "-3,-4",
  "-3,-3",
  "-2,-3",
  "-2,-2",
  "-1,-2",
  "-1,-1",
  "0,-1",
  "0,0",
  "0,1",
  "1,1",
  "1,2",
  "1,3",
]);

/** An original, static voxel diorama. Every SVG instance owns its symbol/filter IDs. */
export default function LandingWorldArt({
  world,
  className,
}: {
  world: World;
  className?: string;
}) {
  const prefix = `world-art-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const palette = PALETTES[world];
  const id = (name: string) => `${prefix}-${name}`;
  const url = (name: string) => `url(#${id(name)})`;
  const cube = ({ x, z, y, material, size = 1 }: Voxel, key: string | number) => {
    const [px, py] = point(x, z, y);
    return (
      <use
        key={key}
        href={`#${id(material)}`}
        transform={`translate(${px} ${py}) scale(${size})`}
      />
    );
  };
  const voxels = (blocks: Voxel[], name: string) => (
    <g className={`landing-art-${name}`}>
      {blocks.sort((a, b) => a.x + a.z - (b.x + b.z) || a.y - b.y).map((b, i) => cube(b, i))}
    </g>
  );
  const prism = (
    x: number,
    z: number,
    y: number,
    w: number,
    d: number,
    h: number,
    material: string,
    key: string,
  ) => {
    const c = palette[material],
      a = point(x, z, y),
      b = point(x + w, z, y),
      cc = point(x + w, z + d, y),
      dd = point(x, z + d, y);
    return (
      <g key={key} stroke="#142226" strokeOpacity=".09" strokeWidth=".75" strokeLinejoin="round">
        <polygon
          points={points([dd, cc, point(x + w, z + d, y - h), point(x, z + d, y - h)])}
          fill={c[1]}
        />
        <polygon
          points={points([b, cc, point(x + w, z + d, y - h), point(x + w, z, y - h)])}
          fill={c[2]}
        />
        <polygon points={points([a, b, cc, dd])} fill={c[0]} />
        <path
          d={`M${dd.join(" ")}L${cc.join(" ")}L${b.join(" ")}`}
          fill="none"
          stroke={c[3]}
          strokeOpacity=".24"
        />
      </g>
    );
  };
  const face = (
    x: number,
    z: number,
    y: number,
    w: number,
    h: number,
    fill: string,
    key: string,
    side: "x" | "z" = "z",
  ) => (
    <polygon
      key={key}
      points={points([
        point(x, z, y),
        point(x + (side === "z" ? w : 0), z + (side === "x" ? w : 0), y),
        point(x + (side === "z" ? w : 0), z + (side === "x" ? w : 0), y - h),
        point(x, z, y - h),
      ])}
      fill={fill}
    />
  );
  const ground: Voxel[] = [];
  const tiles: { x: number; z: number; water: boolean }[] = [];
  for (let layer = 4; layer >= 0; layer--) {
    for (let x = -4; x <= 3; x++)
      for (let z = -4; z <= 3; z++) {
        const radius = Math.abs(x + 0.5) + Math.abs(z + 0.5);
        if (radius > [6, 5.7, 4.5, 3.2, 1.8][layer]) continue;
        const water = world !== "end" && stream.has(`${x},${z}`);
        const material =
          layer > 2
            ? "deep"
            : layer === 2
              ? "rock"
              : layer === 1
                ? "dirt"
                : water
                  ? "water"
                  : random(x, z) > 0.7
                    ? "grass2"
                    : "grass";
        ground.push({ x, z, y: -layer, material });
        if (!layer) tiles.push({ x, z, water });
      }
  }
  const tree = (x: number, z: number, variant: number, scale = 1) => {
    const blocks: Voxel[] = [];
    for (let i = 0; i < 6; i++) blocks.push({ x, z, y: i * 0.48, size: 0.48, material: "wood" });
    for (let a = -1; a <= 1; a++)
      for (let b = -1; b <= 1; b++) {
        if (Math.abs(a) + Math.abs(b) === 2 && variant % 2) continue;
        blocks.push({
          x: x + a * 0.66 - 0.1,
          z: z + b * 0.66 - 0.1,
          y: 2.4 + (Math.abs(a) + Math.abs(b) ? 0 : 0.18),
          size: 0.75,
          material: (a + b + variant) % 3 ? "leaf" : "leaf2",
        });
      }
    for (const [a, b] of [
      [0, 0],
      [1, 0],
      [0, 1],
      [-1, 0],
      [0, -1],
    ])
      blocks.push({ x: x + a * 0.56, z: z + b * 0.56, y: 3.1, size: 0.64, material: "leaf2" });
    const p = point(x, z, 0);
    return (
      <g
        key={`tree-${x}-${z}`}
        transform={`translate(${p[0] * (1 - scale)} ${p[1] * (1 - scale)}) scale(${scale})`}
      >
        <ellipse cx={p[0] + 8} cy={p[1] + 13} rx="42" ry="17" fill="#183b2b" opacity=".19" />
        {voxels(blocks, "tree")}
      </g>
    );
  };
  const crystal = (x: number, z: number, y: number, size = 1) => {
    const [px, py] = point(x, z, y);
    return (
      <g
        key={`crystal-${x}-${z}`}
        className="landing-art-crystal"
        transform={`translate(${px} ${py}) scale(${size})`}
      >
        <ellipse cy="4" rx="26" ry="22" fill={url("crystal-halo")} />
        <path d="M0-22 15-3 0 21-15-3Z" fill="#cfa1e3" stroke="#efcff2" strokeWidth="1.2" />
        <path d="M0-22 0 21-15-3Z" fill="#9476ba" />
        <path d="M0-22 15-3 0-1Z" fill="#f3d7f0" />
        <path
          d="M-22-8 0-19 22-8 22 13 0 24-22 13Z M-22-8 0 3 22-8 M0 3V24"
          fill="none"
          stroke="#c5b8d9"
          strokeOpacity=".72"
          strokeWidth="1.1"
        />
      </g>
    );
  };
  const cabin = () => {
    const x = 0.6,
      z = -3.3,
      w = 2.15,
      d = 1.9,
      h = 1.9;
    return (
      <g className="landing-art-cabin">
        {prism(x - 0.16, z - 0.12, 0.2, w + 0.32, d + 0.24, 0.35, "rock", "foundation")}
        {prism(x, z, h, w, d, h, "plank", "walls")}
        {[0.35, 0.75, 1.15, 1.55].map((y) => (
          <path
            key={y}
            d={`M${point(x, z + d, y).join(" ")}L${point(x + w, z + d, y).join(" ")}L${point(x + w, z, y).join(" ")}`}
            stroke="#66583f"
            strokeWidth="1.5"
            opacity=".38"
            fill="none"
          />
        ))}
        {face(x + 0.22, z + d + 0.01, 1.45, 0.52, 1.4, "#4f5541", "door")}
        {face(x + 0.31, z + d + 0.02, 1.25, 0.34, 0.52, "#d4bc78", "door-light")}
        {face(x + 1.12, z + d + 0.01, 1.5, 0.67, 0.75, "#4f5d4b", "window-frame")}
        {face(x + 1.19, z + d + 0.02, 1.42, 0.52, 0.59, "#ead49a", "window")}
        {face(x + 1.43, z + d + 0.03, 1.42, 0.055, 0.59, "#786f4f", "window-mullion")}
        {face(x + w + 0.01, z + 0.56, 1.5, 0.6, 0.75, "#485b49", "side-window-frame", "x")}
        {face(x + w + 0.02, z + 0.63, 1.42, 0.46, 0.59, "#d6c687", "side-window", "x")}
        {[0, 1, 2].map((row) =>
          prism(
            x - 0.25,
            z - 0.28 + row * 0.38,
            h + 0.26 + row * 0.34,
            w + 0.5,
            d + 0.56 - row * 0.76,
            0.36,
            "roof",
            `roof-${row}`,
          ),
        )}
        {[0, 1].map((n) =>
          prism(x + 1.53, z + 0.48, 3.05 + n * 0.4, 0.38, 0.38, 0.43, "rock", `chimney-${n}`),
        )}
        {[0, 1, 2].map((n) => (
          <g key={n} opacity={0.26 - n * 0.06}>
            {cube(
              {
                x: x + 1.62 - n * 0.13,
                z: z + 0.55,
                y: 3.6 + n * 0.58,
                size: 0.45 + n * 0.07,
                material: "cloud",
              },
              n,
            )}
          </g>
        ))}
      </g>
    );
  };
  const portal = () => {
    const x = -0.3,
      z = -1.05;
    const blocks: Voxel[] = [];
    for (let a = 0; a < 4; a++)
      blocks.push({ x: x + a * 0.6, z, y: 0.45, size: 0.6, material: "roof" });
    for (let h = 1; h <= 5; h++)
      for (const a of [0, 3])
        blocks.push({ x: x + a * 0.6, z, y: 0.45 + h * 0.6, size: 0.6, material: "roof" });
    for (let a = 0; a < 4; a++)
      blocks.push({ x: x + a * 0.6, z, y: 4.05, size: 0.6, material: "roof" });
    return (
      <g className="landing-art-portal">
        <ellipse
          cx={point(0.8, -0.5, 0)[0]}
          cy={point(0.8, -0.5, 0)[1]}
          rx="95"
          ry="30"
          fill="#ec9e65"
          opacity=".1"
        />
        {face(x + 0.58, z + 0.57, 3.42, 1.26, 2.96, url("portal"), "portal-surface")}
        {[0.7, 1.15, 1.8, 2.5, 2.93].map((y, i) =>
          face(
            x + 0.73 + (i % 2) * 0.4,
            z + 0.59,
            y,
            0.22 + (i % 3) * 0.1,
            0.09,
            "#ddb7ed99",
            `portal-fleck-${i}`,
          ),
        )}
        {voxels(blocks, "portal-frame")}
        {prism(x - 0.35, z + 0.5, 0.25, 2.8, 1.2, 0.3, "rock", "portal-plinth")}
        {cube({ x: x - 1.1, z: z + 0.55, y: 0.05, size: 0.63, material: "roof" }, "ruin-a")}
        {cube({ x: x + 2.5, z: z + 0.95, y: 0.08, size: 0.45, material: "roof" }, "ruin-b")}
      </g>
    );
  };
  const mushroom = (x: number, z: number, h: number) => (
    <g key={`mushroom-${x}-${z}`}>
      {prism(x, z, h, 0.34, 0.34, h, "wood", "stem")}
      {prism(x - 0.62, z - 0.62, h + 0.32, 1.58, 1.58, 0.42, "leaf", "cap")}
      {prism(x - 0.3, z - 0.3, h + 0.64, 0.94, 0.94, 0.33, "leaf2", "cap-top")}
      {[
        [0, 0.17],
        [0.6, -0.24],
        [-0.35, -0.2],
      ].map(([a, b], i) => prism(x + a, z + b, h + 0.66, 0.16, 0.17, 0.035, "plank", `spot-${i}`))}
    </g>
  );
  const pillars = (front: boolean) => (
    <g className="landing-art-pillars">
      {(
        [
          [-2.7, -2.8, 3.6],
          [1.9, -2.7, 4.4],
          [-3, 0.25, 2.9],
          [2.65, 0.4, 3.6],
          [0.2, 2.5, 2.1],
        ] as number[][]
      )
        .filter(([x, z]) => x + z > 1 === front)
        .map(([x, z, h]) => (
          <g key={`${x}-${z}`}>
            {prism(x - 0.17, z - 0.17, 0.15, 1.03, 1.03, 0.25, "deep", "foot")}
            {Array.from({ length: Math.ceil(h) }, (_, n) =>
              prism(x, z, Math.min(h, n + 1), 0.7, 0.7, Math.min(1, h - n), "roof", `shaft-${n}`),
            )}
            {prism(x - 0.09, z - 0.09, h + 0.13, 0.88, 0.88, 0.18, "rock", "rim")}
            {crystal(x + 0.35, z + 0.35, h + 0.95, 0.78)}
          </g>
        ))}
    </g>
  );
  const dragon = () => (
    <g className="landing-art-dragon" transform="translate(566 156) rotate(-7) scale(.92)">
      <path
        d="M35-4 109-73 187-105 257-91 207-66 169-49 126-28 93 3 61 20Z"
        fill="#3d3b58"
        stroke="#817696"
        strokeWidth="1.5"
      />
      <path d="M66-2 133-61 196-88 187-62 169-49 126-28 93 3Z" fill="#615372" />
      <path
        d="M84 4 174-67M62-2 133-61 196-88M102-16 187-62"
        fill="none"
        stroke="#a798ba"
        strokeWidth="3"
      />
      <path
        d="M56 29 126 28 173 45 202 64 230 62 255 78 224 80 199 76 167 59 118 52 60 54Z"
        fill="#33334d"
      />
      <path d="M87 33 123 36 167 52 200 72 224 74" fill="none" stroke="#69617c" strokeWidth="7" />
      <path
        d="M-36 5-96-40-163-71-226-68-260-40-213-46-172-34-129-8-91 25-62 41Z"
        fill="#46405f"
        stroke="#8d7b9d"
        strokeWidth="1.5"
      />
      <path d="M-49 6-101-28-173-55-215-56-179-29-147-16-116 4-87 31Z" fill="#726080" />
      <path
        d="M-57 19-128-27-215-56M-87 31-173-55M-37 7-163-71"
        fill="none"
        stroke="#b19ab8"
        strokeWidth="3.2"
      />
      <path d="M-31-5 38-22 97 7 23 28Z" fill="#65566f" />
      <path d="M-31-5 23 28 23 65-31 35Z" fill="#34334f" />
      <path d="M23 28 97 7 97 41 23 65Z" fill="#272c46" />
      <path d="M-38 9-70 10-95 31-77 48-40 32Z" fill="#514862" />
      <path d="M-95 31-77 48-77 70-97 56Z" fill="#292e47" />
      <path d="M-95 31-122 29-146 43-117 59-91 52Z" fill="#77637e" />
      <path d="M-146 43-117 59-117 77-146 61Z" fill="#36364f" />
      <path d="M-117 59-91 52-91 69-117 77Z" fill="#252d44" />
      <path d="M-145 65-119 81-96 74-96 80-119 88-145 72Z" fill="#8a748e" />
      <path d="M-137 49-125 55-125 60-137 54Z" fill="#ebbcf3" />
      <path d="M-109 47-98 44-98 50-109 53Z" fill="#d5a2e9" />
      <path d="M-132 30-129 11-121 9-120 36M-104 29-100 8-93 6-94 31" fill="#a99bac" />
      <path
        d="M-15 38-22 70-4 80 2 69-3 56M55 52 58 76 78 83 84 74 72 68 72 47"
        fill="none"
        stroke="#403950"
        strokeWidth="10"
        strokeLinejoin="miter"
      />
      <path
        d="M-7-12-7-29 4-30 10-15M22-20 27-36 36-36 40-21M53-12 62-24 69-22 71-4M123 29 132 19 138 23 139 35M161 44 172 38 177 42 176 51"
        fill="#c0a7c2"
      />
    </g>
  );
  const ambient: ReactNode[] = [];
  if (world !== "end")
    for (const [i, x, y, scale] of [
      [0, 185, 120, 1],
      [1, 808, 92, 0.72],
      [2, 904, 250, 0.5],
    ])
      ambient.push(
        <g
          key={i}
          className="landing-art-cloud"
          opacity={world === "nether" ? 0.23 : 0.64}
          transform={`translate(${x} ${y}) scale(${scale})`}
        >
          <path
            d="M0 17 36-1 97-1 121 12 144 12 167 25 128 45 78 45 54 57 5 29Z"
            fill={palette.cloud[0]}
          />
          <path
            d="M5 29 54 57 78 45 128 45 167 25 167 37 128 58 78 58 54 69 5 42Z"
            fill={palette.cloud[1]}
          />
          <path d="M37 0 64-14 102-14 121-3 121 12 97 24 37 24Z" fill={palette.cloud[0]} />
        </g>,
      );
  if (world === "end")
    for (let i = 0; i < 34; i++) {
      const x = 90 + random(i, 2) * 920,
        y = 30 + random(i, 8) * 470;
      ambient.push(
        <path
          key={i}
          d={`M${x - 2} ${y}h4m-2-2v4`}
          stroke="#b8a3cf"
          opacity={0.3 + random(i, 9) * 0.4}
          strokeWidth={i % 5 ? 1 : 2}
        />,
      );
    }
  const decorations = tiles
    .filter(({ x, z, water }) => !water && !(x >= 0 && z < -1) && random(x, z, 8) > 0.47)
    .map(({ x, z }, i) => {
      const [px, py] = point(x + 0.4 + random(x, z, 4) * 0.2, z + 0.42, 0.02);
      return (
        <use
          key={i}
          href={`#${id(world === "overworld" && i % 5 === 0 ? "flower" : "sprig")}`}
          transform={`translate(${px} ${py}) scale(${0.75 + random(x, z, 3) * 0.4})`}
          opacity=".9"
        />
      );
    });

  return (
    <svg
      className={className}
      viewBox="0 0 1100 680"
      width="1100"
      height="680"
      aria-hidden="true"
      focusable="false"
      xmlns="http://www.w3.org/2000/svg"
      data-world-art={world}
    >
      <defs>
        {Object.entries(palette).map(([name, c]) => (
          <g key={name} id={id(name)} strokeLinejoin="round">
            <path d={`M-${W} ${D} 0 ${D * 2}v${H}l-${W}-${D}Z`} fill={c[1]} />
            <path d={`M${W} ${D} 0 ${D * 2}v${H}l${W}-${D}Z`} fill={c[2]} />
            <path
              d={`M0 0 ${W} ${D} 0 ${D * 2}-${W} ${D}Z`}
              fill={c[0]}
              stroke={c[3]}
              strokeWidth=".6"
              strokeOpacity=".22"
            />
            <path
              d="M-20 15 0 5 13 12-7 22ZM12 28 28 20 37 25 21 33ZM-22 31-12 26-4 30-14 35Z"
              fill={c[3]}
              opacity={name === "water" ? 0.45 : 0.16}
            />
            <path
              d="M-43 35-31 41v5l-12-6ZM-26 47-15 53v4l-11-6ZM13 50l15-8v4l-15 8ZM32 54l10-5v4l-10 5Z"
              fill={c[3]}
              opacity=".15"
            />
            <path
              d={`M-${W} ${D} 0 ${D * 2} ${W} ${D}M0 ${D * 2}v${H}`}
              fill="none"
              stroke="#0e1525"
              strokeOpacity=".12"
              strokeWidth=".8"
            />
          </g>
        ))}
        <radialGradient id={id("ambient")}>
          <stop
            stopColor={world === "nether" ? "#e49b60" : world === "end" ? "#bfa9db" : "#c2d8a0"}
            stopOpacity=".25"
          />
          <stop offset="1" stopColor="#d8ddb3" stopOpacity="0" />
        </radialGradient>
        <radialGradient id={id("crystal-halo")}>
          <stop stopColor="#d7aff2" stopOpacity=".62" />
          <stop offset="1" stopColor="#bba0e4" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={id("portal")} x1="0" y1="1" x2=".7" y2="0">
          <stop stopColor="#72518b" />
          <stop offset=".48" stopColor="#c68bc9" />
          <stop offset="1" stopColor="#593d73" />
        </linearGradient>
        <linearGradient id={id("fall")} x1="0" y1="0" x2="0" y2="1">
          <stop stopColor={palette.water[0]} stopOpacity=".95" />
          <stop offset="1" stopColor={palette.water[1]} stopOpacity=".15" />
        </linearGradient>
        <filter id={id("shadow")} x="-.5" y="-.8" width="2" height="2.6">
          <feGaussianBlur stdDeviation="16" />
        </filter>
        <g
          id={id("sprig")}
          fill={world === "nether" ? "#d89a68" : world === "end" ? "#8a77a6" : "#658747"}
        >
          <path d="M-2 2-7-8-7-17-3-13 0-3 3-18 7-22 7-12 3 2Z" />
          <path d="M-1 1-13-4-16-12-9-9 0-3 9-9 13-7 5 1Z" opacity=".65" />
        </g>
        <g id={id("flower")}>
          <path d="M0 2V-15M0-5-6-9" stroke="#56764c" strokeWidth="2" />
          <path d="M-5-20h5v-5h5v5h5v5H5v5H0v-5h-5Z" fill="#dbad9e" />
          <path d="M0-20h5v5H0Z" fill="#f0d298" />
        </g>
      </defs>
      <ellipse cx="559" cy="345" rx="420" ry="290" fill={url("ambient")} />
      {ambient}
      <ellipse
        cx="558"
        cy="593"
        rx="250"
        ry="33"
        fill={world === "end" ? "#171e3b" : "#172d27"}
        opacity=".2"
        filter={url("shadow")}
      />
      <g className="landing-art-island">
        {voxels(ground, "terrain")}
        {world !== "end" && (
          <g className="landing-art-waterfall">
            <path
              d={`M${point(1, 4, 0.01).join(" ")}L${point(2, 4, 0.01).join(" ")}L${point(2, 4, -3.1).join(" ")}L${point(1, 4, -3.35).join(" ")}Z`}
              fill={url("fall")}
            />
            {[0.18, 0.5, 0.78].map((n) => (
              <path
                key={n}
                d={`M${point(1 + n, 4.02, -0.15).join(" ")}L${point(1 + n, 4.02, -2.8 + n * 0.6).join(" ")}`}
                stroke={palette.water[3]}
                strokeWidth="2"
                opacity=".6"
              />
            ))}
            <ellipse
              cx={point(1.5, 4, -3.15)[0]}
              cy={point(1.5, 4, -3.15)[1]}
              rx="33"
              ry="8"
              fill={palette.water[0]}
              opacity=".14"
            />
          </g>
        )}
        <g className="landing-art-plants">{decorations}</g>
        {world === "overworld" && (
          <>
            {tree(-3.1, -1.25, 0, 0.95)}
            {cabin()}
            {tree(-2.75, 1.2, 1, 1.08)}
            {tree(2.5, 0.1, 2, 0.8)}
            <g className="landing-art-bridge">
              {[0, 1, 2, 3, 4].map((n) =>
                prism(-0.45 + n * 0.26, 0.3, 0.23, 0.22, 0.95, 0.16, "plank", `bridge-${n}`),
              )}
            </g>
            {prism(1.9, 2.4, 0.36, 0.55, 0.55, 0.4, "wood", "crate")}
            {face(1.95, 2.96, 0.31, 0.44, 0.055, "#dcc393", "crate-band")}
          </>
        )}
        {world === "nether" && (
          <>
            {voxels(
              [
                [-3, -2.6, 2.2],
                [2.4, -3, 3],
                [3, -1.6, 1.6],
              ].flatMap(([x, z, h]) =>
                Array.from({ length: Math.ceil(h) }, (_, i) => ({
                  x,
                  z,
                  y: i * 0.7 + 0.6,
                  size: 0.7,
                  material: "rock",
                })),
              ),
              "basalt",
            )}
            {mushroom(-3, -0.2, 1.7)}
            {portal()}
            {mushroom(-1.95, 2.25, 1.3)}
            {mushroom(2.2, 1, 1.15)}
            {[
              [2.8, 2.1],
              [-3, 2.4],
            ].map(([x, z]) => (
              <g key={`${x}-${z}`}>
                {prism(x, z, 0.55, 0.48, 0.48, 0.6, "plank", "glow-ore")}
                <path
                  d={`M${point(x + 0.24, z + 0.24, 1.1).join(" ")}l-6 13 5 4 8-7-2-16Z`}
                  fill="#f4c47d"
                  opacity=".9"
                />
              </g>
            ))}
          </>
        )}
        {world === "end" && (
          <>
            {pillars(false)}
            {prism(-0.8, -0.3, 0.22, 1.9, 1.9, 0.3, "roof", "exit-base")}
            {prism(-0.52, -0.02, 0.25, 1.34, 1.34, 0.1, "water", "exit-pool")}
            {dragon()}
            {pillars(true)}
          </>
        )}
      </g>
      <g className="landing-art-fragments">
        {(
          [
            [200, 504, 0.43],
            [837, 524, 0.6],
            [924, 429, 0.34],
            [320, 583, 0.3],
            [684, 622, 0.34],
            [152, 334, 0.3],
          ] as number[][]
        ).map(([x, y, size], i) => (
          <g
            key={i}
            transform={`translate(${x} ${y}) scale(${size})`}
            opacity={0.6 + (i % 3) * 0.13}
          >
            <use href={`#${id(i % 2 ? "rock" : "grass")}`} />
            <use href={`#${id("deep")}`} transform="translate(0 32)" />
          </g>
        ))}
      </g>
    </svg>
  );
}
