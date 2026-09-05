import { paintBedTiles, bedFaceTile, bedFaceUV } from "./bed-texture";
import { appendCactusSpines } from "./cactus-mesh";
import { SHAPES, blockTexture, shapeFaces, exposedFace, faceUV } from "./block-shapes";
import * as THREE from "three";
import { BLOCKS } from "./blocks";
import { World, HEIGHT, type Chunk, hash } from "./world";
import { CHEST_TILES, CHEST_FACE_TILES, drawChestFace, type ChestFace } from "./chest-texture";

export const CLOUD_CELL_SIZE = 220;
export const CLOUD_FIELD_SIZE = CLOUD_CELL_SIZE * 3;

export function wrapCloudCoordinate(value: number, center: number) {
  return value + Math.floor((center - value) / CLOUD_FIELD_SIZE + 0.5) * CLOUD_FIELD_SIZE;
}

export function createCloudField() {
  const geometry = new THREE.BoxGeometry(1, 1, 1),
    material = new THREE.MeshLambertMaterial({
      color: "#fff9e9",
      transparent: true,
      opacity: 0.86,
      depthWrite: false,
    }),
    mesh = new THREE.InstancedMesh(geometry, material, 40 * 9),
    seeds: THREE.Vector3[] = [],
    scales: THREE.Vector3[] = [];
  // The outermost instances recycle beyond the maximum supported fog distance.
  // A shared box keeps the entire cloud field in one draw call, also on phones.
  mesh.frustumCulled = false;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  for (let x = -1; x <= 1; x++)
    for (let z = -1; z <= 1; z++)
      for (let i = 0; i < 40; i++) {
        seeds.push(
          new THREE.Vector3(
            (hash(i, 5) - 0.5 + x) * CLOUD_CELL_SIZE,
            51 + hash(i, 6) * 12,
            (hash(i, 7) - 0.5 + z) * CLOUD_CELL_SIZE,
          ),
        );
        scales.push(
          new THREE.Vector3(8 + hash(i, 3) * 12, 1.2 + hash(i, 1) * 2, 4 + hash(i, 2) * 5),
        );
      }
  const field = { mesh, seeds, scales, transform: new THREE.Object3D() };
  updateCloudField(field, 0, 0, 0);
  return field;
}

export function updateCloudField(
  field: ReturnType<typeof createCloudField>,
  x: number,
  z: number,
  time: number,
) {
  const drift = Math.sin(time * 0.01) * 16;
  for (let i = 0; i < field.seeds.length; i++) {
    const seed = field.seeds[i];
    field.transform.position.set(
      wrapCloudCoordinate(seed.x + drift, x),
      seed.y,
      wrapCloudCoordinate(seed.z, z),
    );
    field.transform.scale.copy(field.scales[i]);
    field.transform.updateMatrix();
    field.mesh.setMatrixAt(i, field.transform.matrix);
  }
  field.mesh.instanceMatrix.needsUpdate = true;
}

export function createWaterMaterial(texture: THREE.Texture) {
  return new THREE.MeshStandardMaterial({
    map: texture,
    vertexColors: true,
    transparent: true,
    opacity: 0.7,
    roughness: 0.16,
    metalness: 0.18,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
}

export function createAtlas() {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext("2d")!;
  for (let i = 0; i < 256; i++) {
    const block = BLOCKS[i] ?? BLOCKS[3],
      ox = (i % 16) * 32,
      oy = Math.floor(i / 16) * 32;
    let color = block.color;
    if (i === 254) color = BLOCKS[1].top!;
    if (i === 255) color = "#b99a67";
    ctx.fillStyle = color;
    ctx.fillRect(ox, oy, 32, 32);
    for (let x = 0; x < 32; x += 2)
      for (let y = 0; y < 32; y += 2) {
        const n = hash(x + i * 19, y, 77);
        ctx.fillStyle =
          n > 0.5 ? "rgba(255,255,255," + n * 0.12 + ")" : "rgba(0,0,0," + (1 - n) * 0.16 + ")";
        ctx.fillRect(ox + x, oy + y, 2, 2);
      }
    if (i === 1) {
      ctx.fillStyle = "#73a344";
      ctx.fillRect(ox, oy, 32, 7);
      for (let x = 0; x < 32; x += 2) ctx.fillRect(ox + x, oy + 7, 2, hash(x, 7) * 6);
    }
    if ([5, 25, 43, 47, 49, 52, 76].includes(i)) {
      ctx.fillStyle = i === 43 ? "#4a4840" : "#00000035";
      for (let x = 3; x < 32; x += 7) ctx.fillRect(ox + x, oy + hash(x, i) * 9, 2, 17);
    }
    if (i === 41) {
      for (let x = 2; x < 32; x += 8) {
        ctx.fillStyle = "#375834"; ctx.fillRect(ox + x, oy, 2, 32);
        ctx.fillStyle = "#8fac61"; ctx.fillRect(ox + x + 2, oy, 2, 32);
      }
      ctx.fillStyle = "#d9d4a0";
      for (let y = 5; y < 32; y += 10) for (let x = 8; x < 32; x += 14) ctx.fillRect(ox + x, oy + y, 2, 2);
    }
    if (i === 255) {
      ctx.strokeStyle = "#6e513a";
      for (let j = 3; j < 16; j += 4) ctx.strokeRect(ox + j, oy + j, 32 - j * 2, 32 - j * 2);
    }
    if ([8, 44, 11, 27, 38, 39, 36, 51, 78, 86, 56, 57, 58, 83, 85].includes(i)) {
      ctx.strokeStyle = "#00000038";
      for (let y = 0; y < 32; y += 8) {
        ctx.beginPath();
        ctx.moveTo(ox, oy + y);
        ctx.lineTo(ox + 32, oy + y);
        ctx.moveTo(ox + (y % 16 ? 9 : 23), oy + y);
        ctx.lineTo(ox + (y % 16 ? 9 : 23), oy + y + 8);
        ctx.stroke();
      }
    }
    if ([9, 40].includes(i)) {
      ctx.strokeStyle = "#00000028";
      for (let y = 0; y < 32; y += 8)
        for (let x = 0; x < 32; x += 9) ctx.strokeRect(ox + x + (y % 16 ? 3 : 0), oy + y, 9, 8);
    }
    if ([20, 21, 22, 80, 87, 88, 89, 90, 91, 93].includes(i)) {
      const oreColors: Record<number, string> = {
        20: "#353538",
        21: "#d0af96",
        22: "#79f1e1",
        80: "#da9876",
        87: "#efc747",
        88: "#eb4a48",
        89: "#3e68d2",
        90: "#5ce19e",
        91: "#f0dfd1",
        93: "#e4b747",
      };
      for (let p = 0; p < 8; p++) {
        const px = ox + Math.floor(hash(p, i) * 25) + 2,
          py = oy + Math.floor(hash(p + 19, i) * 25) + 2;
        ctx.fillStyle = "#00000066";
        ctx.fillRect(px - 1, py - 1, 6, 5);
        ctx.fillStyle = oreColors[i];
        ctx.fillRect(px, py, 4, 3);
        ctx.fillStyle = "#ffffff65";
        ctx.fillRect(px, py, 2, 1);
      }
    }
    if (i === 92) {
      ctx.strokeStyle = "#bea18a";
      ctx.lineWidth = 2;
      for (let p = 3; p < 16; p += 5) ctx.strokeRect(ox + p, oy + p, 32 - p * 2, 32 - p * 2);
    }
    if ([33, 34, 37, 81, 94, 95, 96, 97, 98, 99].includes(i)) {
      ctx.strokeStyle = "#00000044";
      ctx.lineWidth = 2;
      ctx.strokeRect(ox + 1, oy + 1, 30, 30);
      ctx.fillStyle = "#ffffff35";
      ctx.fillRect(ox + 3, oy + 3, 26, 2);
      ctx.fillRect(ox + 3, oy + 5, 2, 22);
    }
    if (i === 23) {
      ctx.fillStyle = "#e5d8bd";
      for (let p = 0; p < 4; p++)
        ctx.fillRect(ox + hash(p, i) * 25, oy + hash(p + 5, i) * 25, 5, 4);
    }
    if (i === 10) {
      ctx.fillStyle = "#d2f6ef";
      ctx.fillRect(ox, oy, 32, 2);
      ctx.fillRect(ox, oy, 2, 32);
      ctx.fillRect(ox + 20, oy + 8, 6, 2);
      ctx.fillRect(ox + 17, oy + 11, 5, 2);
    }
    if (i === 30) {
      ctx.fillStyle = "#523b2b";
      ctx.fillRect(ox + 2, oy + 3, 28, 24);
      for (let x = 4; x < 29; x += 4) {
        ctx.fillStyle = ["#776b4f", "#9d594a", "#416c66", "#d2b87f"][x % 3];
        ctx.fillRect(ox + x, oy + 6, 3, 8);
        ctx.fillRect(ox + x, oy + 18, 3, 8);
      }
    }
    if (i === 29) {
      ctx.fillStyle = "#252c2e";
      ctx.fillRect(ox + 6, oy + 5, 20, 6);
      ctx.fillRect(ox + 5, oy + 18, 22, 9);
    }
    if (i === 28) {
      ctx.strokeStyle = "#463025";
      for (let p = 0; p < 32; p += 8) {
        ctx.beginPath();
        ctx.moveTo(ox + p, oy);
        ctx.lineTo(ox + p, oy + 32);
        ctx.moveTo(ox, oy + p);
        ctx.lineTo(ox + 32, oy + p);
        ctx.stroke();
      }
    }
    if (i === 13 || i === 18) {
      for (let p = 0; p < 12; p++) {
        ctx.fillStyle = i === 13 ? "#d783ff55" : "#64dbce55";
        ctx.fillRect(ox + hash(p, i) * 30, oy + hash(p + 1, i) * 30, 3, 6);
      }
    }
  }
  for (const block of BLOCKS.filter(Boolean)) {
    const i = block.id,
      ox = (i % 16) * 32,
      oy = Math.floor(i / 16) * 32;
    if (block.plant) {
      ctx.clearRect(ox, oy, 32, 32);
      if (i === 59) {
        ctx.fillStyle = "#719847";
        ctx.fillRect(ox + 13, oy, 6, 32);
        ctx.fillStyle = "#a9c16c";
        for (let y = 0; y < 32; y += 8) ctx.fillRect(ox + 12, oy + y, 8, 2);
      } else if (i === 72) {
        ctx.fillStyle = "#c1d8c8";
        ctx.fillRect(ox + 14, oy + 15, 4, 17);
        ctx.fillStyle = block.color;
        ctx.fillRect(ox + 5, oy + 9, 22, 8);
        ctx.fillRect(ox + 9, oy + 5, 14, 7);
        ctx.fillStyle = "#e4faff";
        ctx.fillRect(ox + 9, oy + 9, 3, 3);
        ctx.fillRect(ox + 21, oy + 11, 3, 3);
      } else if (i === 74) {
        ctx.fillStyle = block.color;
        ctx.fillRect(ox + 13, oy + 3, 5, 29);
        for (let j = 0; j < 4; j++) {
          ctx.fillRect(ox + 4 + j * 5, oy + 6 + j * 5, 5, 16);
          ctx.fillRect(ox + 4 + j * 5, oy + 6 + j * 5, 11, 4);
        }
      } else {
        for (let j = 0; j < (i >= 64 && i <= 66 ? 5 : 3); j++) {
          const x = 5 + j * (i >= 64 && i <= 66 ? 5 : 9);
          ctx.fillStyle = "#719446";
          ctx.fillRect(ox + x, oy + 13, 2, 19);
          ctx.fillRect(ox + x - 3, oy + 20, 8, 2);
          ctx.fillStyle = block.color;
          ctx.fillRect(ox + x - 3, oy + 8 + (j % 2) * 3, 7, 6);
          if (i === 79) {
            ctx.fillStyle = "#829c50";
            ctx.fillRect(ox + x, oy + 3, 2, 26);
          }
        }
      }
    }
    if (i === 62) {
      ctx.fillStyle = "#e6dfce";
      ctx.fillRect(ox + 2, oy + 1, 28, 11);
      ctx.fillStyle = "#804d42";
      ctx.fillRect(ox, oy + 28, 32, 4);
    }
    if (i === 63) {
      ctx.fillStyle = "#403629";
      for (let x = 1; x < 32; x += 6) ctx.fillRect(ox + x, oy, 2, 32);
    }
    if (i === 80) {
      ctx.fillStyle = "#d8a180";
      for (let j = 0; j < 6; j++)
        ctx.fillRect(ox + hash(j, i) * 26, oy + hash(j + 5, i) * 26, 4, 3);
    }
    if (i === 84) {
      ctx.strokeStyle = "#d9f4db";
      ctx.lineWidth = 2;
      ctx.strokeRect(ox + 8, oy + 7, 16, 18);
      ctx.strokeRect(ox + 13, oy + 12, 6, 8);
    }
  }
  for (const [face, tile] of Object.entries(CHEST_TILES))
    drawChestFace(ctx, face as ChestFace, (tile % 16) * 32, Math.floor(tile / 16) * 32);
  paintBedTiles(ctx);
  const texture = new THREE.CanvasTexture(canvas);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestMipmapLinearFilter;
  texture.colorSpace = THREE.SRGBColorSpace;
  return { texture, canvas };
}
const faces = [
  {
    d: [1, 0, 0],
    v: [
      [1, 0, 0],
      [1, 1, 0],
      [1, 1, 1],
      [1, 0, 1],
    ],
    s: 0.83,
  },
  {
    d: [-1, 0, 0],
    v: [
      [0, 0, 1],
      [0, 1, 1],
      [0, 1, 0],
      [0, 0, 0],
    ],
    s: 0.68,
  },
  {
    d: [0, 1, 0],
    v: [
      [0, 1, 1],
      [1, 1, 1],
      [1, 1, 0],
      [0, 1, 0],
    ],
    s: 1,
  },
  {
    d: [0, -1, 0],
    v: [
      [0, 0, 0],
      [1, 0, 0],
      [1, 0, 1],
      [0, 0, 1],
    ],
    s: 0.5,
  },
  {
    d: [0, 0, 1],
    v: [
      [1, 0, 1],
      [1, 1, 1],
      [0, 1, 1],
      [0, 0, 1],
    ],
    s: 0.89,
  },
  {
    d: [0, 0, -1],
    v: [
      [0, 0, 0],
      [0, 1, 0],
      [1, 1, 0],
      [1, 0, 0],
    ],
    s: 0.73,
  },
];
const fullCubeFaces = shapeFaces(1);
export class WorldRenderer {
  world = new World();
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(72, 1, 0.06, 500);
  renderer: THREE.WebGLRenderer;
  meshes = new Map<string, THREE.Group>();
  atlas: ReturnType<typeof createAtlas>;
  materials: THREE.Material[];
  sun: THREE.DirectionalLight;
  ambient: THREE.HemisphereLight;
  clouds = new THREE.Group();
  cloudField: ReturnType<typeof createCloudField>;
  sky: THREE.Mesh;
  running = true;
  raf = 0;
  time = 0;
  preview = true;
  previewVisible = true;
  radius = 4;
  private offsetRadius = -1;
  private chunkOffsets: [number, number][] = [];
  onFrame?: (dt: number) => void;
  canvas: HTMLCanvasElement;
  renderScene?: () => void;
  waterUniform = { value: 0 };
  constructor(public mount: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: "high-performance",
    });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.6));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.canvas = this.renderer.domElement;
    mount.appendChild(this.canvas);
    this.atlas = createAtlas();
    this.materials = [
      new THREE.MeshStandardMaterial({
        map: this.atlas.texture,
        vertexColors: true,
        roughness: 1,
      }),
      new THREE.MeshStandardMaterial({
        map: this.atlas.texture,
        vertexColors: true,
        transparent: true,
        opacity: 0.68,
        roughness: 0.27,
        metalness: 0.12,
        depthWrite: false,
      }),
      new THREE.MeshBasicMaterial({
        map: this.atlas.texture,
        vertexColors: true,
      }),
      createWaterMaterial(this.atlas.texture),
    ];
    this.materials.push(
      new THREE.MeshStandardMaterial({
        map: this.atlas.texture,
        vertexColors: true,
        alphaTest: 0.3,
        side: THREE.DoubleSide,
        roughness: 1,
      }),
    );
    const water = this.materials[3] as THREE.MeshStandardMaterial;
    water.onBeforeCompile = (shader) => {
      shader.uniforms.waterTime = this.waterUniform;
      shader.vertexShader = "uniform float waterTime;\n" + shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace(
        "#include <begin_vertex>",
        "#include <begin_vertex>\nif(normal.y>0.5){transformed.y+=sin(position.x*1.6+waterTime*1.8)*sin(position.z*1.2+waterTime*.9)*.025;}",
      );
    };
    this.scene.background = new THREE.Color("#a6d0d7");
    this.scene.fog = new THREE.Fog("#b9d9d6", 52, 115);
    this.ambient = new THREE.HemisphereLight("#daf4ff", "#a8ad87", 2.6);
    this.scene.add(this.ambient);
    this.sun = new THREE.DirectionalLight("#ffecce", 3);
    this.sun.position.set(35, 65, 28);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    Object.assign(this.sun.shadow.camera, {
      left: -65,
      right: 65,
      top: 65,
      bottom: -65,
      near: 1,
      far: 180,
    });
    this.sun.shadow.intensity = 0.42;
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.normalBias = 0.035;
    this.scene.add(this.sun, this.sun.target);
    const sg = new THREE.SphereGeometry(240, 24, 16);
    this.sky = new THREE.Mesh(
      sg,
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        uniforms: {
          top: { value: new THREE.Color("#65a9ca") },
          bottom: { value: new THREE.Color("#dbeddf") },
        },
        vertexShader:
          "varying vec3 v; void main(){v=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}",
        fragmentShader:
          "varying vec3 v;uniform vec3 top;uniform vec3 bottom;void main(){float h=clamp(normalize(v).y*1.5,0.,1.);gl_FragColor=vec4(mix(bottom,top,h),1.);}",
      }),
    );
    this.scene.add(this.sky);
    this.cloudField = createCloudField();
    this.clouds.add(this.cloudField.mesh);
    this.scene.add(this.clouds);
    this.camera.position.set(31, 31, 40);
    this.camera.lookAt(0, 17, -3);
    this.resize();
    window.addEventListener("resize", this.resize);
    this.ensure(0, 0, true);
    this.animate();
  }
  resize = () => {
    const w = this.mount.clientWidth,
      h = this.mount.clientHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  };
  ensure(x: number, z: number, initial = false) {
    const cx = Math.floor(x / 16),
      cz = Math.floor(z / 16);
    if (this.offsetRadius !== this.radius) {
      this.offsetRadius = this.radius;
      this.chunkOffsets = [];
      for (let dx = -this.radius; dx <= this.radius; dx++)
        for (let dz = -this.radius; dz <= this.radius; dz++)
          if (dx * dx + dz * dz <= (this.radius + 0.3) ** 2) this.chunkOffsets.push([dx, dz]);
      this.chunkOffsets.sort((a, b) => a[0] * a[0] + a[1] * a[1] - b[0] * b[0] - b[1] * b[1]);
    }
    let n = 0;
    for (const [dx, dz] of this.chunkOffsets) {
      const a = cx + dx,
        b = cz + dz;
      const key = a + "," + b;
      const old = this.world.chunks.has(key);
      const c = this.world.chunk(a, b);
      if (!old)
        for (const [dx, dz] of [
          [-1, 0],
          [1, 0],
          [0, -1],
          [0, 1],
        ]) {
          const neighbor = this.world.chunks.get(a + dx + "," + (b + dz));
          if (neighbor) neighbor.dirty = true;
        }
      if (c.dirty || !this.meshes.has(key)) {
        this.rebuild(c);
        n++;
        if (!initial && n >= 2) break;
      }
    }
    if (this.meshes.size > this.chunkOffsets.length + 12)
      for (const [key, group] of this.meshes) {
        const [a, b] = key.split(",").map(Number);
        if (Math.abs(a - cx) > this.radius + 1 || Math.abs(b - cz) > this.radius + 1) {
          this.disposeGroup(group);
          this.meshes.delete(key);
          this.world.chunks.delete(key);
        }
      }
  }
  rebuild(c: Chunk) {
    const key = c.cx + "," + c.cz,
      prev = this.meshes.get(key);
    if (prev) this.disposeGroup(prev);
    const group = new THREE.Group();
    group.matrixAutoUpdate = false;
    const buckets = Array.from({ length: 5 }, () => ({
      p: [] as number[],
      n: [] as number[],
      uv: [] as number[],
      col: [] as number[],
      idx: [] as number[],
    }));
    const ox = c.cx * 16,
      oz = c.cz * 16;
    for (let y = 0; y < HEIGHT; y++)
      for (let z = 0; z < 16; z++)
        for (let x = 0; x < 16; x++) {
          const id = c.data[x + z * 16 + y * 256];
          if (!id || !BLOCKS[id]) continue;
          const block = BLOCKS[id],
            type = block.plant ? 4 : id === 7 ? 3 : block.glow ? 2 : block.transparent ? 1 : 0,
            b = buckets[type];
          if (block.plant) {
            const u = (id % 16) / 16,
              v = 1 - Math.floor(id / 16) / 16,
              h = id === 64 ? 0.28 : id === 65 ? 0.58 : id === 67 ? 0.16 : 1;
            for (const verts of [
              [
                [0, 0, 0],
                [1, 0, 1],
                [1, 1, 1],
                [0, 1, 0],
              ],
              [
                [1, 0, 0],
                [0, 0, 1],
                [0, 1, 1],
                [1, 1, 0],
              ],
            ]) {
              const base = b.p.length / 3;
              for (let k = 0; k < 4; k++) {
                const q = verts[k];
                b.p.push(ox + x + 0.1 + q[0] * 0.8, y + q[1] * h, oz + z + 0.1 + q[2] * 0.8);
                b.n.push(0, 1, 0);
                b.uv.push(u + (k === 1 || k === 2 ? 0.0615 : 0.001), v - (k < 2 ? 0.0615 : 0.001));
                b.col.push(1, 1, 1);
              }
              b.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
            }
            continue;
          }
          if (id === 41) appendCactusSpines(b, ox + x, y, oz + z);
          const top = y + 2 < HEIGHT ? c.data[x + z * 16 + (y + 2) * 256] : 0;
          const overheadShade = top && BLOCKS[top]?.solid ? 0.97 : 1;
          const shape = SHAPES[id],
            isBed = shape?.kind === "bed";
          for (const sourceFace of shape ? shapeFaces(id) : fullCubeFaces) {
            const fi = sourceFace.face;
            const f = faces[fi],
              nx = x + f.d[0],
              ny = y + f.d[1],
              nz = z + f.d[2];
            const next =
              nx >= 0 && nx < 16 && nz >= 0 && nz < 16 && ny >= 0 && ny < HEIGHT
                ? c.data[nx + nz * 16 + ny * 256]
                : this.world.get(ox + nx, ny, oz + nz);
            const occluder =
              next === id || (BLOCKS[next]?.solid && !BLOCKS[next]?.transparent) ? next : 0;
            const boundary =
              !shape || sourceFace.vertices[0][Math.floor(fi / 2)] === (fi % 2 === 0 ? 1 : 0);
            // Most terrain faces touch air or another full cube; neither needs rectangle clipping.
            if (
              occluder &&
              boundary &&
              (!SHAPES[occluder] || SHAPES[occluder].kind === "double-slab")
            )
              continue;
            const clipped = occluder && boundary ? exposedFace(sourceFace, occluder) : null;
            for (let part = 0; part < (clipped?.length ?? 1); part++) {
              const visible = clipped ? clipped[part] : sourceFace;
              let tile =
                id === 61 ? CHEST_FACE_TILES[fi] : isBed ? bedFaceTile(id, fi) : blockTexture(id);
              if (fi === 2) {
                if (id === 1) tile = 254;
                if ([5, 25, 43, 47, 49, 52, 76].includes(id)) tile = 255;
              }
              const u = (tile % 16) / 16,
                v = 1 - Math.floor(tile / 16) / 16,
                eps = 0.001;
              const base = b.p.length / 3;
              for (let k = 0; k < 4; k++) {
                const corner = visible.vertices[k];
                b.p.push(
                  ox + x + corner[0],
                  y +
                    corner[1] -
                    (id === 7 && corner[1] === 1
                      ? this.waterCorner(ox + x + corner[0], y, oz + z + corner[2])
                      : 0),
                  oz + z + corner[2],
                );
                b.n.push(...f.d);
                if (!shape && !clipped) {
                  b.uv.push(
                    u + (k >= 2 ? 0.0625 - eps : eps),
                    v - (k === 0 || k === 3 ? 0.0625 - eps : eps),
                  );
                } else {
                  const uv = isBed ? bedFaceUV(id, fi, corner) : faceUV(fi, corner);
                  b.uv.push(
                    u + eps + uv[0] * (0.0625 - 2 * eps),
                    v - 0.0625 + eps + uv[1] * (0.0625 - 2 * eps),
                  );
                }
                const shade = block.glow ? 1 : f.s * overheadShade;
                b.col.push(shade, shade, shade);
              }
              b.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
            }
          }
        }
    for (let i = 0; i < 5; i++) {
      const b = buckets[i];
      if (!b.p.length) continue;
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.Float32BufferAttribute(b.p, 3));
      geo.setAttribute("normal", new THREE.Float32BufferAttribute(b.n, 3));
      geo.setAttribute("uv", new THREE.Float32BufferAttribute(b.uv, 2));
      geo.setAttribute("color", new THREE.Float32BufferAttribute(b.col, 3));
      geo.setIndex(b.idx);
      geo.computeBoundingSphere();
      const mesh = new THREE.Mesh(geo, this.materials[i]);
      mesh.matrixAutoUpdate = false;
      mesh.castShadow = i === 0;
      mesh.receiveShadow = i === 0;
      group.add(mesh);
    }
    this.scene.add(group);
    this.meshes.set(key, group);
    c.dirty = false;
  }
  waterCorner(x: number, y: number, z: number) {
    let total = 0,
      count = 0;
    for (const dx of [-1, 0])
      for (const dz of [-1, 0])
        if (this.world.get(x + dx, y, z + dz) === 7) {
          if (this.world.get(x + dx, y + 1, z + dz) === 7) return 0;
          total += this.waterDrop(x + dx, y, z + dz);
          count++;
        }
    return count ? total / count : 0.12;
  }
  waterDrop(x: number, y: number, z: number) {
    if (this.world.get(x, y + 1, z) === 7) return 0;
    const level = this.world.waterLevels[this.world.dimension + ":" + x + "," + y + "," + z] ?? 0;
    return level === 8 ? 0.04 : 0.12 + level * 0.095;
  }
  disposeGroup(group: THREE.Group) {
    this.scene.remove(group);
    group.traverse((o) => {
      if (o instanceof THREE.Mesh) o.geometry.dispose();
    });
  }
  dimensionChanged() {
    for (const g of this.meshes.values()) this.disposeGroup(g);
    this.meshes.clear();
    const d = this.world.dimension;
    this.sky.visible = d === "overworld";
    this.clouds.visible = d === "overworld";
    this.scene.background = new THREE.Color(
      d === "nether" ? "#321b20" : d === "end" ? "#141423" : "#a6d0d7",
    );
    this.scene.fog = new THREE.Fog(
      d === "nether" ? "#68372e" : d === "end" ? "#272237" : "#b9d9d6",
      d === "overworld" ? 52 : 30,
      d === "overworld" ? 115 : 90,
    );
    this.ambient.color.set(d === "nether" ? "#ffad80" : d === "end" ? "#bda7f2" : "#daf4ff");
    this.ambient.intensity = d === "overworld" ? 2.15 : 2.5;
    this.sun.intensity = d === "overworld" ? 3 : 0.7;
    this.ensure(0, 0, true);
  }
  animate = () => {
    if (!this.running) return;
    this.raf = requestAnimationFrame(this.animate);
    const now = performance.now() / 1000,
      dt = Math.min(0.045, this.time ? now - this.time : 0.016);
    this.time = now;
    if (this.preview && !this.previewVisible) return;
    if (this.preview) {
      this.camera.position.set(30 + Math.sin(now * 0.045) * 9, 30, 39 + Math.cos(now * 0.045) * 8);
      this.camera.lookAt(0, 17, -5);
    }
    this.waterUniform.value = now;
    this.onFrame?.(dt);
    this.sky.position.copy(this.camera.position);
    updateCloudField(this.cloudField, this.camera.position.x, this.camera.position.z, now);
    if (this.renderScene) this.renderScene();
    else this.renderer.render(this.scene, this.camera);
  };
  dispose() {
    this.running = false;
    cancelAnimationFrame(this.raf);
    window.removeEventListener("resize", this.resize);
    this.scene.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        if (o instanceof THREE.InstancedMesh) o.dispose();
        o.geometry.dispose();
        if (Array.isArray(o.material)) o.material.forEach((m) => m.dispose());
        else o.material.dispose();
      }
    });
    this.atlas.texture.dispose();
    this.renderer.dispose();
    this.canvas.remove();
  }
}
