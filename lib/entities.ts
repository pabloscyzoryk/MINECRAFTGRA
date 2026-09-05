import * as THREE from "three";
import type { World } from "./world";
import { DRAGON_MAX_HEALTH, DRAGON_ENRAGED_HEALTH } from "./dragon-balance";
import { clearDamagePath } from "./player-physics";
export type MobObserver = Pick<THREE.Ray, "origin" | "direction">;
export type MobKind =
  | "sheep"
  | "pig"
  | "cow"
  | "chicken"
  | "zombie"
  | "creeper"
  | "skeleton"
  | "enderman"
  | "ghast"
  | "piglin"
  | "blaze"
  | "slime"
  | "fox"
  | "frog"
  | "bee";
export const MOB_NAMES: Record<MobKind, string> = {
  fox: "Lis",
  frog: "Żaba",
  bee: "Pszczoła",
  sheep: "Owca",
  pig: "Świnia",
  cow: "Krowa",
  chicken: "Kura",
  zombie: "Zombie",
  creeper: "Creeper",
  skeleton: "Szkielet",
  enderman: "Enderman",
  ghast: "Ghast",
  piglin: "Piglin",
  blaze: "Płomyk",
  slime: "Szlam",
};
export const cubeGeo = new THREE.BoxGeometry(1, 1, 1);
const materialCache = new Map<string, THREE.MeshStandardMaterial>();
export function mat(color: string, glow = false) {
  const key = color + glow;
  let m = materialCache.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({
      color,
      roughness: 0.85,
      emissive: glow ? color : "#000000",
      emissiveIntensity: glow ? 1 : 0,
    });
    materialCache.set(key, m);
  }
  return m;
}
export function cube(
  parent: THREE.Object3D,
  color: string,
  x: number,
  y: number,
  z: number,
  w: number,
  h: number,
  d: number,
  glow = false,
) {
  const mesh = new THREE.Mesh(cubeGeo, mat(color, glow));
  mesh.position.set(x, y, z);
  mesh.scale.set(w, h, d);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}
export class Mob {
  group = new THREE.Group();
  legs: THREE.Object3D[] = [];
  arms: THREE.Object3D[] = [];
  elbows: THREE.Group[] = [];
  hands: THREE.Group[] = [];
  tendrils: THREE.Group[] = [];
  jaw: THREE.Object3D | null = null;
  bow: THREE.Group | null = null;
  bowString: THREE.Object3D | null = null;
  bowStrings: THREE.Mesh[] = [];
  bowArrow: THREE.Group | null = null;
  eyes: THREE.Mesh[] = [];
  head = new THREE.Group();
  tails: THREE.Object3D[] = [];
  wings: THREE.Object3D[] = [];
  skinMaterials: {
    material: THREE.MeshStandardMaterial;
    emissive: THREE.Color;
    intensity: number;
    opacity: number;
  }[] = [];
  baseScale = new THREE.Vector3(1, 1, 1);
  elapsed = Math.random() * 20;
  gait = 0;
  walkBlend = 0;
  deathTime = 0;
  attackClock = 0;
  rangedAttack = false;
  state = "idle";
  hp = 20;
  hostile = false;
  timer = Math.random() * 8;
  attackCooldown = 0;
  heading = Math.random() * 6.28;
  dead = false;
  /** Endermen remain neutral until provoked; the server persists the remaining anger. */
  anger = 0;
  eyeContact = 0;
  /** Multiplayer provocation belongs to one player, never whichever bystander is closest. */
  angerTarget = "";
  private hurtTime = 0;
  get hurt() {
    return this.hurtTime;
  }
  set hurt(value: number) {
    const time = Number.isFinite(value) ? Math.max(0, value) : 0;
    if (time > this.hurtTime && this.kind === "enderman" && !this.dead) this.anger = 30;
    this.hurtTime = time;
  }
  fuse = 0;
  size = 0.65;
  speed = 1.1;
  flying = false;
  private disposed = false;
  private gazeRay = new THREE.Ray();
  private gazeInverse = new THREE.Matrix4();
  private gazeBox = new THREE.Box3();
  private gazePoint = new THREE.Vector3();
  private gazeCenter = new THREE.Vector3();
  constructor(
    public kind: MobKind,
    x: number,
    z: number,
    world: World,
  ) {
    this.hostile = [
      "zombie",
      "creeper",
      "skeleton",
      "enderman",
      "ghast",
      "piglin",
      "blaze",
      "slime",
    ].includes(kind);
    this.flying = ["ghast", "blaze", "bee"].includes(kind);
    this.hp = kind === "enderman" ? 40 : kind === "ghast" ? 30 : 20;
    this.speed = this.hostile ? 1.9 : 1;
    this.group.position.set(x, world.surface(x, z) + (this.flying ? 7 : 0), z);
    this.make();
    this.rig();
  }
  make() {
    const k = this.kind,
      g = this.group;
    const eye = (x: number, y: number, z: number, color = "#202428") => {
      const m = cube(g, color, x, y, z, 0.085, 0.09, 0.018, k === "enderman");
      this.eyes.push(m);
      return m;
    };
    if (k === "bee") {
      cube(g, "#e8b647", 0, 0.45, 0, 0.65, 0.55, 0.9);
      for (const z of [-0.22, 0.14]) cube(g, "#574838", 0, 0.45, z, 0.67, 0.57, 0.16);
      cube(g, "#efc65c", 0, 0.5, -0.51, 0.62, 0.53, 0.28);
      eye(-0.2, 0.54, -0.66);
      eye(0.2, 0.54, -0.66);
      for (const side of [-1, 1]) {
        this.wings.push(cube(g, "#dff6f1", side * 0.48, 0.77, 0, 0.65, 0.045, 0.57));
        cube(g, "#493b2b", side * 0.16, 0.9, -0.51, 0.045, 0.36, 0.045);
        for (const z of [-0.23, 0.2])
          this.legs.push(cube(g, "#493b2b", side * 0.24, 0.08, z, 0.045, 0.28, 0.045));
      }
      this.size = 0.5;
      this.speed = 1.4;
    } else if (k === "frog") {
      cube(g, "#819b49", 0, 0.3, 0, 0.65, 0.42, 0.72);
      cube(g, "#a4b657", 0, 0.52, -0.3, 0.75, 0.38, 0.42);
      cube(g, "#d9d69c", 0, 0.35, -0.52, 0.56, 0.12, 0.02);
      for (const side of [-1, 1]) {
        cube(g, "#98ae54", side * 0.27, 0.78, -0.35, 0.24, 0.2, 0.25);
        eye(side * 0.27, 0.8, -0.482);
        for (const z of [-0.28, 0.3])
          this.legs.push(cube(g, "#738b3f", side * 0.38, 0.12, z, 0.28, 0.18, 0.38));
      }
      this.size = 0.5;
      this.speed = 0.8;
    } else if (k === "fox") {
      cube(g, "#c87537", 0, 0.65, 0, 0.62, 0.55, 1.05);
      cube(g, "#e48d42", 0, 0.82, -0.61, 0.56, 0.51, 0.51);
      cube(g, "#ead9ba", 0, 0.66, -0.91, 0.42, 0.19, 0.24);
      cube(g, "#433329", 0, 0.7, -1.05, 0.15, 0.12, 0.1);
      for (const side of [-1, 1]) {
        eye(side * 0.16, 0.88, -0.88);
        cube(g, "#da843d", side * 0.2, 1.2, -0.56, 0.18, 0.32, 0.2);
        cube(g, "#463426", side * 0.2, 1.34, -0.57, 0.15, 0.08, 0.16);
        for (const z of [-0.34, 0.35])
          this.legs.push(cube(g, "#574032", side * 0.21, 0.21, z, 0.14, 0.43, 0.18));
      }
      const tail = new THREE.Group();
      tail.position.set(0, 0.7, 0.44);
      g.add(tail);
      cube(tail, "#d28140", 0, 0, 0.43, 0.33, 0.34, 0.86);
      cube(tail, "#f0e4cc", 0, 0, 0.87, 0.32, 0.33, 0.25);
      this.tails.push(tail);
      this.speed = 1.5;
    } else if (["sheep", "pig", "cow", "chicken"].includes(k)) {
      const col =
        k === "sheep" ? "#e6e1d5" : k === "pig" ? "#e8a29b" : k === "cow" ? "#665243" : "#efead9";
      const small = k === "chicken" ? 0.55 : 1;
      cube(g, col, 0, 0.85, 0, 0.85, 0.7, 1.25);
      cube(g, k === "sheep" ? "#9e9180" : col, 0, 1.05, -0.73, 0.58, 0.55, 0.52);
      for (const x of [-0.27, 0.27])
        for (const z of [-0.42, 0.42])
          this.legs.push(
            cube(g, k === "pig" ? "#c48880" : "#837969", x, 0.28, z, 0.22, 0.56, 0.23),
          );
      eye(-0.16, 1.16, -1);
      eye(0.16, 1.16, -1);
      if (k === "pig") cube(g, "#c8797c", 0, 0.98, -1.03, 0.28, 0.19, 0.13);
      if (k === "cow") {
        cube(g, "#e8dfc9", 0.15, 0.98, -0.1, 0.59, 0.45, 0.7);
        cube(g, "#e8dfc9", -0.18, 0.96, 0.35, 0.46, 0.5, 0.3);
        for (const x of [-0.28, 0.28]) cube(g, "#c6bea4", x, 1.4, -0.71, 0.12, 0.25, 0.13);
      }
      if (k === "chicken") {
        cube(g, "#d5a846", 0, 1.01, -1.04, 0.24, 0.14, 0.21);
        cube(g, "#c84c41", 0, 0.81, -1, 0.13, 0.16, 0.1);
      }
      g.scale.setScalar(small);
    } else if (k === "ghast") {
      cube(g, "#d7d3d5", 0, 1, 0, 2.4, 2.4, 2.4);
      for (let x = -1; x <= 1; x++)
        for (let z = -1; z <= 1; z++) {
          const root = new THREE.Group(),
            end = new THREE.Group();
          root.position.set(x * 0.7, -0.12, z * 0.7);
          cube(root, "#c5bdc8", 0, -0.35, 0, 0.29, 0.72, 0.29);
          end.position.y = -0.69;
          cube(end, "#aaa0b0", 0, -0.32, 0, 0.23, 0.67 + ((x + z + 3) % 3) * 0.09, 0.23);
          root.add(end);
          g.add(root);
          this.legs.push(root);
          this.tendrils.push(end);
        }
      cube(g, "#542f40", -0.58, 1.3, -1.22, 0.45, 0.17, 0.05);
      cube(g, "#542f40", 0.58, 1.3, -1.22, 0.45, 0.17, 0.05);
      this.jaw = cube(g, "#542f40", 0, 0.58, -1.22, 0.5, 0.5, 0.05);
      this.size = 1.8;
    } else if (k === "slime") {
      const shell = cube(g, "#92cb78", 0, 0.65, 0, 1.3, 1.3, 1.3);
      shell.userData.opacity = 0.38;
      shell.castShadow = false;
      cube(g, "#5f9b4e", 0, 0.6, 0.02, 0.87, 0.81, 0.87);
      eye(-0.28, 0.86, -0.66);
      eye(0.28, 0.86, -0.66);
      cube(g, "#263c27", 0, 0.48, -0.66, 0.36, 0.12, 0.02);
    } else if (k === "blaze") {
      cube(g, "#dcb644", 0, 1.5, 0, 0.7, 0.6, 0.6, true);
      eye(-0.18, 1.65, -0.31);
      eye(0.18, 1.65, -0.31);
      for (let i = 0; i < 12; i++) {
        const a = ((i % 4) * Math.PI) / 2,
          ring = Math.floor(i / 4);
        this.legs.push(
          cube(
            g,
            "#e6ac3b",
            Math.cos(a) * 0.6,
            0.35 + ring * 0.48,
            Math.sin(a) * 0.6,
            0.16,
            0.7,
            0.16,
            true,
          ),
        );
      }
    } else if (k === "creeper") {
      cube(g, "#759858", 0, 1.1, 0, 0.65, 1.1, 0.48);
      cube(g, "#769a59", 0, 1.87, 0, 0.75, 0.72, 0.65);
      for (const x of [-0.24, 0.24])
        for (const z of [-0.25, 0.25])
          this.legs.push(cube(g, "#668748", x, 0.28, z, 0.27, 0.55, 0.32));
      cube(g, "#273622", -0.18, 1.98, -0.331, 0.18, 0.2, 0.02);
      cube(g, "#273622", 0.18, 1.98, -0.331, 0.18, 0.2, 0.02);
      cube(g, "#273622", 0, 1.73, -0.331, 0.18, 0.3, 0.02);
      for (const x of [-0.13, 0.13]) cube(g, "#273622", x, 1.62, -0.331, 0.15, 0.2, 0.02);
    } else {
      const end = k === "enderman",
        skin = end
          ? "#25242f"
          : k === "zombie"
            ? "#698255"
            : k === "skeleton"
              ? "#cdc7b8"
              : "#b99a81",
        shirt = k === "zombie" ? "#538d95" : k === "piglin" ? "#805e43" : skin,
        legs = k === "zombie" ? "#615b8a" : skin;
      if (k === "skeleton") {
        cube(g, skin, 0, 1.23, 0.08, 0.13, 0.76, 0.13);
        for (const y of [1.03, 1.23, 1.43]) cube(g, skin, 0, y, 0, 0.57, 0.09, 0.31);
        cube(g, skin, 0, 0.86, 0, 0.45, 0.15, 0.27);
      } else cube(g, shirt, 0, end ? 1.76 : 1.23, 0, end ? 0.45 : 0.64, end ? 1.1 : 0.75, 0.34);
      cube(g, skin, 0, end ? 2.64 : 1.92, 0, 0.64, 0.64, 0.58);
      for (const x of [-0.18, 0.18])
        this.legs.push(
          cube(
            g,
            legs,
            x,
            end ? 0.77 : 0.45,
            0,
            end ? 0.13 : k === "skeleton" ? 0.13 : 0.24,
            end ? 1.54 : 0.9,
            0.25,
          ),
        );
      for (const x of [-0.47, 0.47]) {
        const arm = cube(
          g,
          skin,
          x,
          end ? 1.55 : 1.19,
          0,
          end ? 0.11 : 0.2,
          end ? 1.7 : 0.78,
          0.23,
        );
        this.legs.push(arm);
      }
      eye(-0.17, end ? 2.71 : 2, -0.3, end ? "#bf77ff" : "#292d26");
      eye(0.17, end ? 2.71 : 2, -0.3, end ? "#bf77ff" : "#292d26");
      if (k === "piglin") cube(g, "#d1b192", 0, 1.8, -0.36, 0.31, 0.2, 0.19);
    }
  }
  rig() {
    const g = this.group,
      k = this.kind;
    this.baseScale.copy(g.scale);
    const animal = ["sheep", "cow", "pig", "chicken", "fox"].includes(k);
    const humanoid = ["zombie", "skeleton", "piglin", "enderman", "creeper"].includes(k);
    if (animal || humanoid || k === "frog" || k === "bee") {
      this.head.position.set(
        0,
        animal ? 0.9 : k === "frog" ? 0.48 : k === "bee" ? 0.5 : k === "enderman" ? 2.42 : 1.65,
        animal ? -0.55 : k === "frog" ? -0.3 : k === "bee" ? -0.45 : 0,
      );
      // Moving meshes removes them from g.children, so iterate a stable copy.
      for (const o of g.children.slice()) {
        if (!(o instanceof THREE.Mesh) || this.legs.includes(o) || this.wings.includes(o)) continue;
        const isHead = animal
          ? o.position.z < -0.5 && o.position.y > 0.6
          : k === "frog"
            ? o.position.y > 0.4 && o.position.z < -0.15
            : k === "bee"
              ? o.position.z < -0.4
              : o.position.y > (k === "enderman" ? 2.3 : 1.58);
        if (isHead) {
          o.position.sub(this.head.position);
          this.head.add(o);
        }
      }
      g.add(this.head);
    }
    if (animal && k !== "fox") {
      const tail = new THREE.Group();
      tail.position.set(0, 0.95, 0.62);
      g.add(tail);
      cube(tail, k === "pig" ? "#ce8c85" : "#9d9582", 0, -0.12, 0.1, 0.08, 0.3, 0.08);
      this.tails.push(tail);
    }
    if (k === "chicken")
      for (const side of [-1, 1])
        this.wings.push(cube(g, "#ded8c8", side * 0.5, 0.93, 0, 0.16, 0.45, 0.72));
    if (!["ghast", "blaze"].includes(k))
      this.legs = this.legs.map((l) => {
        const pivot = new THREE.Group();
        pivot.position.copy(l.position);
        pivot.position.y += (l as THREE.Mesh).scale.y * 0.45;
        l.position.sub(pivot.position);
        g.add(pivot);
        pivot.add(l);
        return pivot;
      });
    this.addDetails();
    const materials = new Map<THREE.Material, THREE.MeshStandardMaterial>();
    g.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        const source = o.material as THREE.MeshStandardMaterial;
        let material = materials.get(source);
        if (!material) {
          material = source.clone();
          if (typeof o.userData.opacity === "number") {
            material.transparent = true;
            material.opacity = o.userData.opacity;
            material.depthWrite = false;
          }
          materials.set(source, material);
          this.skinMaterials.push({
            material,
            emissive: material.emissive.clone(),
            intensity: material.emissiveIntensity,
            opacity: material.opacity,
          });
        }
        o.material = material;
      }
    });
  }
  /** Small surface details share cube geometry and one instanced draw per color and joint. */
  private patches(parent: THREE.Object3D, color: string, boxes: number[][], glow = false) {
    const mesh = new THREE.InstancedMesh(cubeGeo, mat(color, glow), boxes.length);
    const transform = new THREE.Object3D();
    boxes.forEach(([x, y, z, w, h, d], i) => {
      transform.position.set(x, y, z);
      transform.scale.set(w, h, d);
      transform.updateMatrix();
      mesh.setMatrixAt(i, transform.matrix);
    });
    mesh.name = "surface-details";
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    mesh.matrixAutoUpdate = false;
    parent.add(mesh);
    return mesh;
  }
  private addDetails() {
    const k = this.kind,
      g = this.group,
      head = this.head;
    const face = (
      color: string,
      x: number,
      y: number,
      z: number,
      w: number,
      h: number,
      d: number,
      glow = false,
    ) =>
      cube(
        head,
        color,
        x - head.position.x,
        y - head.position.y,
        z - head.position.z,
        w,
        h,
        d,
        glow,
      );
    if (["zombie", "skeleton", "piglin", "enderman"].includes(k)) {
      this.arms = this.legs.slice(2);
      for (const [i, arm] of this.arms.entries()) {
        const original = arm.children[0] as THREE.Mesh;
        const color = "#" + (original.material as THREE.MeshStandardMaterial).color.getHexString();
        const length = original.scale.y,
          width = k === "skeleton" ? 0.12 : original.scale.x;
        arm.remove(original);
        cube(arm, color, 0, -length * 0.23, 0, width, length * 0.5, 0.2);
        const elbow = new THREE.Group(),
          hand = new THREE.Group();
        elbow.name = "elbow";
        elbow.position.y = -length * 0.46;
        cube(elbow, color, 0, -length * 0.23, 0, width, length * 0.5, 0.2);
        hand.name = "hand";
        hand.position.y = -length * 0.49;
        cube(hand, color, 0, -0.015, -0.015, width * 1.18, 0.13, 0.23);
        const fingers = k === "enderman" ? 0.21 : 0.09;
        this.patches(
          hand,
          color,
          [-1, 0, 1].map((n) => [
            n * width * 0.32,
            -fingers * 0.5 - 0.06,
            -0.045,
            width * 0.22,
            fingers,
            0.08,
          ]),
        );
        elbow.add(hand);
        arm.add(elbow);
        this.elbows.push(elbow);
        this.hands.push(hand);
        if (k === "zombie")
          cube(arm, "#538d95", 0, -length * 0.1, 0, width * 1.11, length * 0.27, 0.225);
        if (k === "piglin")
          cube(arm, "#6b4935", 0, -length * 0.09, 0, width * 1.3, length * 0.27, 0.25);
        if (k === "skeleton") cube(elbow, "#99968d", 0, 0, 0, 0.16, 0.13, 0.16);
        arm.name = i ? "right-arm" : "left-arm";
      }
    }
    if (k === "zombie") {
      face("#41583b", 0, 2.16, -0.295, 0.64, 0.15, 0.025);
      face("#394732", 0.06, 1.8, -0.302, 0.32, 0.07, 0.025);
      face("#92a77a", -0.09, 1.77, -0.318, 0.09, 0.045, 0.025);
      this.patches(head, "#526b43", [
        [0.23, 0.39, -0.306, 0.12, 0.15, 0.026],
        [-0.24, 0.15, -0.306, 0.1, 0.09, 0.027],
      ]);
      this.patches(g, "#698255", [
        [-0.2, 0.89, -0.18, 0.14, 0.2, 0.025],
        [0.13, 0.94, -0.18, 0.13, 0.1, 0.025],
        [0.322, 1.26, 0.02, 0.025, 0.19, 0.15],
      ]);
      this.patches(g, "#334e56", [
        [0, 1.48, -0.179, 0.18, 0.12, 0.024],
        [-0.19, 1.2, -0.179, 0.13, 0.08, 0.024],
      ]);
    } else if (k === "skeleton") {
      for (const side of [-1, 1]) face("#343b38", side * 0.17, 2, -0.301, 0.21, 0.2, 0.027);
      face("#52574f", 0, 1.87, -0.306, 0.085, 0.12, 0.035);
      this.jaw = face("#b7b2a4", 0, 1.62, -0.015, 0.53, 0.13, 0.55);
      this.jaw.userData.baseY = this.jaw.position.y;
      this.patches(
        head,
        "#777b70",
        [-2, -1, 0, 1, 2].map((x) => [x * 0.087, 0.08, -0.309, 0.038, 0.095, 0.025]),
      );
      const bow = (this.bow = new THREE.Group());
      bow.name = "bone-bow";
      this.hands[0].add(bow);
      cube(bow, "#745137", 0, 0, 0, 0.095, 0.5, 0.095);
      for (const side of [-1, 1]) {
        const limb = cube(bow, "#a57a49", 0, side * 0.34, -0.09, 0.075, 0.3, 0.07);
        limb.rotation.x = side * 0.5;
        cube(bow, "#594331", 0, side * 0.47, -0.17, 0.065, 0.12, 0.065);
      }
      this.bowString = new THREE.Group();
      this.bowString.name = "string-nock";
      bow.add(this.bowString);
      for (let i = 0; i < 2; i++) {
        const string = cube(bow, "#dfcf9f", 0, 0, 0, 0.014, 0.47, 0.014);
        string.castShadow = false;
        this.bowStrings.push(string);
      }
      this.bowArrow = new THREE.Group();
      bow.add(this.bowArrow);
      cube(this.bowArrow, "#b8a787", 0, 0, -0.36, 0.04, 0.04, 0.72);
      cube(this.bowArrow, "#b7beb8", 0, 0, -0.76, 0.09, 0.08, 0.17);
    } else if (k === "enderman") {
      for (const eye of this.eyes) {
        eye.scale.x = 0.245;
        eye.scale.y = 0.06;
        eye.userData.openHeight = 0.06;
      }
      face("#e5bbff", -0.17, 2.71, -0.313, 0.055, 0.035, 0.026, true);
      face("#e5bbff", 0.17, 2.71, -0.313, 0.055, 0.035, 0.026, true);
      face("#16161e", 0, 2.5, -0.303, 0.36, 0.045, 0.02);
      this.patches(g, "#383140", [
        [0.23, 1.83, 0, 0.018, 0.65, 0.15],
        [-0.23, 1.62, 0, 0.018, 0.45, 0.14],
        [0, 1.42, -0.178, 0.16, 0.12, 0.023],
      ]);
    } else if (k === "piglin") {
      for (const side of [-1, 1]) {
        face("#b99077", side * 0.4, 2.07, 0, 0.24, 0.25, 0.16);
        face("#d1a58b", side * 0.43, 2.07, -0.085, 0.13, 0.15, 0.018);
        face("#f0e1b8", side * 0.2, 1.79, -0.41, 0.075, 0.26, 0.08);
        face("#775743", side * 0.075, 1.82, -0.46, 0.065, 0.045, 0.02);
      }
      this.patches(g, "#46362c", [
        [0, 0.92, 0, 0.67, 0.13, 0.38],
        [0.18, 1.2, -0.18, 0.11, 0.5, 0.023],
      ]);
      cube(g, "#dfb64e", 0, 0.92, -0.205, 0.19, 0.17, 0.055);
      const sword = new THREE.Group();
      sword.name = "golden-cleaver";
      sword.position.y = 0.08;
      this.hands[1].add(sword);
      cube(sword, "#5c402c", 0, -0.09, 0, 0.085, 0.26, 0.085);
      cube(sword, "#d8ac3a", 0, -0.21, 0, 0.32, 0.075, 0.12);
      cube(sword, "#ecc85d", 0, -0.48, 0, 0.17, 0.49, 0.065);
      cube(sword, "#fff0a8", -0.065, -0.48, -0.012, 0.028, 0.49, 0.07);
      cube(sword, "#f5d987", 0, -0.77, 0, 0.1, 0.09, 0.055);
    } else if (k === "creeper") {
      this.patches(g, "#4d723c", [
        [-0.18, 1.39, -0.25, 0.19, 0.18, 0.027],
        [0.17, 0.88, -0.25, 0.2, 0.21, 0.027],
        [0.33, 1.17, 0, 0.025, 0.16, 0.27],
        [-0.33, 1.05, 0, 0.025, 0.29, 0.17],
        [0.06, 1.21, 0.25, 0.21, 0.22, 0.027],
      ]);
      this.patches(head, "#a3ba74", [
        [-0.25, 0.47, -0.34, 0.13, 0.16, 0.025],
        [0.08, 0.54, -0.34, 0.2, 0.1, 0.025],
        [0.385, 0.19, 0, 0.024, 0.2, 0.18],
      ]);
      this.patches(head, "#526c3d", [
        [0.24, 0.32, -0.34, 0.16, 0.11, 0.025],
        [-0.18, -0.11, -0.34, 0.11, 0.12, 0.025],
      ]);
      for (const leg of this.legs) cube(leg, "#3f6133", 0, -0.19, -0.02, 0.28, 0.14, 0.35);
    } else if (k === "ghast") {
      this.patches(g, "#a89daa", [
        [-0.58, 0.99, -1.226, 0.11, 0.4, 0.023],
        [0.58, 0.9, -1.226, 0.11, 0.58, 0.023],
        [-0.81, 1.25, -1.226, 0.12, 0.12, 0.023],
        [0.81, 1.25, -1.226, 0.12, 0.12, 0.023],
        [-0.95, 1.92, -1.208, 0.25, 0.12, 0.02],
        [0.8, -0.03, -1.208, 0.31, 0.17, 0.02],
      ]);
      this.patches(g, "#ebe5e5", [
        [-1.211, 0.7, 0, 0.02, 0.4, 0.6],
        [1.211, 1.65, -0.6, 0.02, 0.27, 0.45],
        [0.2, 2.211, 0.3, 0.4, 0.02, 0.7],
      ]);
    } else if (k === "blaze") {
      cube(g, "#f77722", 0, 0.72, 0, 0.35, 0.72, 0.35, true);
      cube(g, "#fff2a1", 0, 0.83, 0, 0.2, 0.39, 0.2, true);
      this.patches(g, "#995727", [
        [-0.22, 1.74, -0.31, 0.21, 0.075, 0.026],
        [0.22, 1.74, -0.31, 0.21, 0.075, 0.026],
        [0, 1.37, -0.31, 0.35, 0.075, 0.024],
      ]);
      for (const rod of this.legs) cube(rod, "#ffdd77", 0, 0, 0, 1.13, 0.18, 1.13, true);
    } else if (k === "slime") {
      this.patches(g, "#acd98f", [
        [-0.32, 1.08, -0.667, 0.36, 0.075, 0.023],
        [-0.48, 0.87, -0.667, 0.075, 0.27, 0.023],
        [0.661, 0.98, -0.26, 0.022, 0.15, 0.3],
      ]);
      this.patches(g, "#79bc63", [
        [0.22, 0.85, 0.17, 0.19, 0.2, 0.2],
        [-0.2, 0.4, 0.28, 0.2, 0.15, 0.16],
      ]);
    } else if (k === "pig") {
      for (const side of [-1, 1]) {
        face("#a95f65", side * 0.075, 0.98, -1.103, 0.055, 0.055, 0.026);
        face("#d99590", side * 0.31, 1.35, -0.71, 0.2, 0.2, 0.13);
      }
    } else if (k === "cow") {
      face("#b9968b", 0, 0.92, -1.013, 0.48, 0.22, 0.085);
      for (const side of [-1, 1]) face("#4d3932", side * 0.12, 0.92, -1.063, 0.075, 0.055, 0.018);
    }
  }
  /** The mob faces local -Z; positive X rotation carries a hanging hand forward. */
  poseArms(progress: number) {
    const idle = this.kind === "zombie" ? 1.1 : 0.035;
    const smooth = (t: number) => {
      const p = THREE.MathUtils.clamp(t, 0, 1);
      return p * p * (3 - 2 * p);
    };
    const contact = 0.31 / 0.65;
    const angle =
      progress < 0
        ? idle
        : progress < 0.23
          ? THREE.MathUtils.lerp(idle, 2.6, smooth(progress / 0.23))
          : progress < contact
            ? THREE.MathUtils.lerp(2.6, 1.15, smooth((progress - 0.23) / (contact - 0.23)))
            : THREE.MathUtils.lerp(1.15, idle, smooth((progress - contact) / (1 - contact)));
    for (const [i, arm] of this.arms.entries()) {
      arm.rotation.set(
        angle + (progress < 0 ? Math.sin(this.gait + i * Math.PI) * 0.45 * this.walkBlend : 0),
        0,
        (i ? 1 : -1) * 0.055,
        "YXZ",
      );
      this.elbows[i].rotation.set(
        progress >= 0 && progress < contact
          ? Math.sin((progress / contact) * Math.PI) * 0.38
          : 0.04,
        0,
        0,
      );
    }
    if (this.bow) {
      const ranged = this.rangedAttack && progress >= 0 && progress < 1;
      if (ranged) {
        const blend =
          progress < contact
            ? smooth(progress / 0.15)
            : 1 - smooth((progress - contact) / (1 - contact));
        const left = this.arms[0],
          right = this.arms[1];
        left.rotation.set(
          THREE.MathUtils.lerp(idle, Math.PI / 2, blend),
          -0.55 * blend,
          -0.055 * (1 - blend),
          "YXZ",
        );
        this.elbows[0].rotation.set(0.04 * (1 - blend), 0, 0);
        // Solve the two arm segments in the horizontal draw plane. The hand meets
        // the nock at shoulder height instead of dipping below the arrow.
        const draw =
          -0.185 + 0.45 * (progress < contact ? Math.sin(((progress / contact) * Math.PI) / 2) : 1);
        const target = new THREE.Vector3(0, this.elbows[0].position.y + this.hands[0].position.y, 0)
          .applyQuaternion(left.quaternion)
          .add(left.position)
          .add(new THREE.Vector3(0, 0, draw))
          .sub(right.position);
        const upper = -this.elbows[1].position.y,
          lower = -this.hands[1].position.y;
        const distance = THREE.MathUtils.clamp(
          Math.hypot(target.x, target.z),
          Math.abs(upper - lower) + 0.00001,
          upper + lower - 0.00001,
        );
        const heading = Math.atan2(-target.x, -target.z);
        const shoulder = Math.acos(
          THREE.MathUtils.clamp(
            (upper * upper + distance * distance - lower * lower) / (2 * upper * distance),
            -1,
            1,
          ),
        );
        const bend =
          Math.PI -
          Math.acos(
            THREE.MathUtils.clamp(
              (upper * upper + lower * lower - distance * distance) / (2 * upper * lower),
              -1,
              1,
            ),
          );
        right.rotation.set(
          THREE.MathUtils.lerp(idle, Math.PI / 2, blend),
          (heading + shoulder) * blend,
          0.055 * (1 - blend),
          "YXZ",
        );
        this.elbows[1].rotation.set(0.04 * (1 - blend), 0, bend * blend);
      }
      this.bow.quaternion
        .copy(this.arms[0].quaternion)
        .multiply(this.elbows[0].quaternion)
        .invert();
      const pull =
        this.rangedAttack && progress >= 0 && progress < contact
          ? Math.sin(((progress / contact) * Math.PI) / 2)
          : 0;
      const drawPoint = new THREE.Vector3(0, 0, -0.185 + pull * 0.45);
      if (this.bowString) this.bowString.position.copy(drawPoint);
      this.bowStrings.forEach((string, i) => {
        const tip = new THREE.Vector3(0, (i ? 1 : -1) * 0.47, -0.17);
        const segment = drawPoint.clone().sub(tip);
        string.position.copy(tip).add(drawPoint).multiplyScalar(0.5);
        string.scale.set(0.014, segment.length(), 0.014);
        string.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), segment.normalize());
      });
      if (this.bowArrow) {
        this.bowArrow.position.copy(drawPoint);
        this.bowArrow.visible = !ranged || progress < contact;
      }
    }
  }
  die() {
    if (this.dead) return;
    this.dead = true;
    this.deathTime = 0;
    this.state = "dead";
    this.attackClock = 0;
    this.anger = 0;
    this.eyeContact = 0;
    this.angerTarget = "";
  }
  /** A narrow band across the actual animated eyes; aiming at its body never provokes it. */
  looksIntoEyes(observer: MobObserver | undefined, world: World) {
    if (!observer || this.kind !== "enderman" || this.dead || this.eyes.length < 2) return false;
    const { origin, direction } = observer;
    if (
      ![origin.x, origin.y, origin.z, direction.x, direction.y, direction.z].every(
        Number.isFinite,
      ) ||
      direction.lengthSq() < 1e-8
    )
      return false;
    this.head.updateWorldMatrix(true, false);
    this.gazeCenter.copy(this.eyes[0].position).add(this.eyes[1].position).multiplyScalar(0.5);
    this.gazePoint.copy(this.gazeCenter).applyMatrix4(this.head.matrixWorld);
    if (origin.distanceToSquared(this.gazePoint) > 24 * 24) return false;
    this.gazeInverse.copy(this.head.matrixWorld).invert();
    this.gazeRay.origin.copy(origin);
    this.gazeRay.direction.copy(direction);
    this.gazeRay.applyMatrix4(this.gazeInverse);
    // The back of the head occludes its eyes, just as a wall does.
    if (this.gazeRay.origin.z >= this.gazeCenter.z) return false;
    this.gazeBox.min.set(
      this.gazeCenter.x - 0.29,
      this.gazeCenter.y - 0.08,
      this.gazeCenter.z - 0.045,
    );
    this.gazeBox.max.set(
      this.gazeCenter.x + 0.29,
      this.gazeCenter.y + 0.08,
      this.gazeCenter.z + 0.045,
    );
    if (!this.gazeRay.intersectBox(this.gazeBox, this.gazePoint)) return false;
    this.gazePoint.applyMatrix4(this.head.matrixWorld);
    return clearDamagePath(origin, this.gazePoint, (x, y, z) => world.solid(x, y, z));
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.group.traverse((o) => {
      if (o instanceof THREE.InstancedMesh) o.dispose();
    });
    for (const m of this.skinMaterials) m.material.dispose();
    this.skinMaterials = [];
  }
  update(
    dt: number,
    _t: number,
    player: THREE.Vector3,
    world: World,
    damage: (n: number) => void,
    shoot: (p: THREE.Vector3) => void,
    explode: (p: THREE.Vector3) => void,
    observer?: MobObserver,
  ) {
    this.elapsed += dt;
    const t = this.elapsed,
      k = this.kind,
      pos = this.group.position;
    if (this.dead) {
      this.deathTime += dt;
      const p = Math.min(1, this.deathTime / 0.7);
      this.group.rotation.z = Math.sin((p * Math.PI) / 2) * 1.45;
      this.group.position.y -= dt * 0.12;
      for (const m of this.skinMaterials) {
        m.material.transparent = true;
        m.material.opacity = m.opacity * Math.max(0, 1 - (this.deathTime - 0.6) / 0.65);
      }
      if (this.deathTime > 1.3) this.group.visible = false;
      return;
    }
    this.timer -= dt;
    this.attackCooldown -= dt;
    this.hurt = Math.max(0, this.hurt - dt);
    this.anger = Math.max(0, this.anger - dt);
    if (k === "enderman" && dt > 0) {
      const watching = this.looksIntoEyes(observer, world);
      this.eyeContact = watching ? Math.min(0.25, this.eyeContact + Math.max(0, dt)) : 0;
      if (this.eyeContact >= 0.25) this.anger = 30;
    }
    // Old saves can contain a pending attack without provocation; never land that stale hit.
    if (k === "enderman" && this.anger <= 0) {
      this.attackClock = 0;
      if (this.eyeContact <= 0) this.angerTarget = "";
    }
    const dist = pos.distanceTo(player),
      alert = this.hostile && (k !== "enderman" || this.anger > 0) && dist < 27,
      ranged = ["skeleton", "ghast", "blaze"].includes(k);
    if (alert) this.heading = Math.atan2(player.x - pos.x, player.z - pos.z);
    else if (this.timer <= 0) {
      this.heading += Math.random() * 2.5 - 1.25;
      this.timer = 2 + Math.random() * 5;
    }
    if (this.attackClock > 0) {
      const before = this.attackClock;
      this.attackClock -= dt;
      if (before > 0.34 && this.attackClock <= 0.34) {
        if (this.rangedAttack) {
          if (dist < 30) shoot(pos.clone().add(new THREE.Vector3(0, 1.5, 0)));
        } else if (dist < 2.65) damage(k === "enderman" ? 4 : 2);
      }
    } else if (
      alert &&
      this.attackCooldown <= 0 &&
      k !== "creeper" &&
      (dist < 2.1 || (ranged && dist > 4))
    ) {
      this.rangedAttack = ranged && dist > 4;
      this.attackClock = 0.65;
      this.attackCooldown = this.rangedAttack ? 3 : 1.4;
    }
    if (k === "creeper") {
      this.fuse = Math.max(0, this.fuse + (dist < 2.4 ? dt : -dt * 0.7));
      if (this.fuse > 1.3) {
        explode(pos.clone());
        this.die();
        return;
      }
    }
    const graze = !this.hostile && !this.flying && Math.sin(t * 0.65) < -0.35;
    const walk = alert
      ? dist > (ranged ? 7 : 1.6) && this.attackClock <= 0.1
      : !graze && Math.sin(t * 0.7) > -0.3;
    this.state =
      this.hurt > 0
        ? "hurt"
        : this.attackClock > 0
          ? "attack"
          : this.fuse > 0.1
            ? "fuse"
            : walk
              ? "walk"
              : graze
                ? "graze"
                : "idle";
    const previous = pos.clone(),
      speed = this.speed * (this.hurt > 0 ? -2 : alert ? 1.25 : 1);
    if (walk || this.hurt > 0) {
      const nx = pos.x + Math.sin(this.heading) * speed * dt,
        nz = pos.z + Math.cos(this.heading) * speed * dt;
      if (this.flying) {
        pos.x = nx;
        pos.z = nz;
      } else {
        const floor = world.surface(nx, nz);
        if (
          floor - pos.y < 1.25 &&
          floor > 1 &&
          world.get(nx, floor, nz) !== 7 &&
          world.get(nx, floor, nz) !== 15
        ) {
          pos.x = nx;
          pos.z = nz;
          pos.y += (floor - pos.y) * Math.min(1, dt * 12);
        } else this.heading += dt * 4;
      }
    }
    const moving = Math.hypot(pos.x - previous.x, pos.z - previous.z) > 0.0001;
    this.walkBlend = THREE.MathUtils.lerp(this.walkBlend, moving ? 1 : 0, 1 - Math.exp(-dt * 9));
    this.gait += dt * (alert ? 10 : 7);
    const turn =
      THREE.MathUtils.euclideanModulo(
        this.heading + Math.PI - this.group.rotation.y + Math.PI,
        Math.PI * 2,
      ) - Math.PI;
    this.group.rotation.y += turn * (1 - Math.exp(-dt * 7));
    this.group.rotation.z = this.flying
      ? THREE.MathUtils.clamp(-turn * 0.18, -0.35, 0.35)
      : Math.sin(this.gait) * 0.022 * this.walkBlend;
    this.group.scale.copy(this.baseScale);
    this.group.scale.y *= 1 + Math.sin(t * 2.6) * 0.012 + Math.sin(t * 23) * this.fuse * 0.075;
    if (this.flying) {
      const target =
        world.surface(pos.x, pos.z) +
        (k === "bee" ? 1.6 : 7) +
        Math.sin(t * (k === "bee" ? 3 : 1.5)) * 0.35;
      pos.y += (target - pos.y) * (1 - Math.exp(-dt * 2));
    }
    if (k === "slime" || k === "frog") {
      const hop = Math.max(0, Math.sin(this.gait * 0.48)),
        amount = this.walkBlend;
      pos.y = world.surface(pos.x, pos.z) + hop * (k === "frog" ? 0.5 : 0.9) * amount;
      this.group.scale.y *= 1 + Math.cos(this.gait * 0.96) * 0.19 * amount;
      this.group.scale.x *= 1 - Math.cos(this.gait * 0.96) * 0.09 * amount;
      this.group.scale.z = this.group.scale.x;
    }
    const look =
      dist < 7 && !alert
        ? THREE.MathUtils.clamp(
            Math.atan2(player.x - pos.x, player.z - pos.z) - this.heading,
            -0.65,
            0.65,
          )
        : Math.sin(t * 0.75) * 0.18;
    this.head.rotation.y = THREE.MathUtils.lerp(this.head.rotation.y, look, 1 - Math.exp(-dt * 6));
    this.head.rotation.x = THREE.MathUtils.lerp(
      this.head.rotation.x,
      graze ? -0.7 + Math.sin(t * 6) * 0.09 : alert ? -0.08 : Math.sin(t * 1.6) * 0.045,
      1 - Math.exp(-dt * 5),
    );
    const blink = k !== "enderman" && t % 4.8 > 4.64 ? 0.13 : 1;
    for (const e of this.eyes) e.scale.y = (e.userData.openHeight ?? 0.09) * blink;
    this.legs.forEach((l, i) => {
      if (k === "ghast") {
        l.rotation.x = Math.sin(t * 2.1 + i * 0.6) * 0.27;
        l.rotation.z = Math.cos(t * 1.7 + i) * 0.17;
      } else if (k === "blaze") {
        const ring = Math.floor(i / 4),
          radius = 0.52 + ring * 0.1 + this.attackClock * 0.32;
        const a = t * (ring % 2 ? 1.2 : -0.9) + ((i % 4) * Math.PI) / 2 + ring * 0.4;
        l.position.set(
          Math.cos(a) * radius,
          0.35 + ring * 0.48 + Math.sin(t * 2 + i) * 0.1,
          Math.sin(a) * radius,
        );
        l.rotation.z = Math.sin(t + i) * 0.25;
      } else {
        l.rotation.x =
          Math.sin(this.gait + (i === 0 || i === 3 ? 0 : Math.PI)) * 0.65 * this.walkBlend;
      }
    });
    const attackProgress =
      this.attackClock > 0 ? THREE.MathUtils.clamp((0.65 - this.attackClock) / 0.65, 0, 1) : -1;
    this.poseArms(attackProgress);
    this.tendrils.forEach((tip, i) => {
      tip.rotation.x = Math.sin(t * 2.1 + i * 0.6 - 0.65) * 0.31;
      tip.rotation.z = Math.cos(t * 1.7 + i - 0.4) * 0.2;
    });
    if (this.jaw) {
      if (k === "ghast")
        this.jaw.scale.y =
          0.5 + (attackProgress >= 0 ? Math.sin(attackProgress * Math.PI) * 0.65 : 0);
      else
        this.jaw.position.y =
          this.jaw.userData.baseY -
          (attackProgress >= 0 ? Math.sin(attackProgress * Math.PI) * 0.09 : 0);
    }
    this.tails.forEach((tail, i) => {
      tail.rotation.y = Math.sin(t * (k === "fox" ? 3 : 5) + i) * 0.38;
      tail.rotation.x = (graze ? -0.1 : 0.15) + Math.sin(t * 2) * 0.12;
    });
    this.wings.forEach((wing, i) => {
      wing.rotation.z =
        (i === 0 ? 1 : -1) *
        (k === "bee" ? 0.3 + Math.sin(t * 65) * 0.85 : Math.sin(t * 12) * 0.25 * this.walkBlend);
    });
    for (const { material, emissive, intensity } of this.skinMaterials) {
      material.emissive.copy(emissive);
      material.emissiveIntensity = intensity;
      if (this.hurt > 0) {
        material.emissive.set("#ee4236");
        material.emissiveIntensity = 0.55;
      } else if (this.fuse > 0.2) {
        material.emissive.set("#fff4c2");
        material.emissiveIntensity = Math.max(0, Math.sin(t * 25)) * 0.7;
      }
    }
  }
}

export class Dragon {
  group = new THREE.Group();
  wings: THREE.Group[] = [];
  tail: THREE.Mesh[] = [];
  neck = new THREE.Group();
  jaw: THREE.Mesh | null = null;
  radius = 27;
  deathTime = 0;
  hp = DRAGON_MAX_HEALTH;
  orbit = 0;
  time = 0;
  shot = 0;
  dead = false;
  constructor() {
    const g = this.group;
    cube(g, "#30303c", 0, 0, 0, 2.2, 1.8, 5);
    cube(g, "#595363", 0, 0.7, 0, 1, 1, 3.5);
    cube(g, "#292833", 0, 0.1, -3.4, 1.35, 1.15, 2.2);
    cube(g, "#373442", 0, 0.1, -5.1, 1.7, 1.3, 1.6);
    this.jaw = cube(g, "#22222b", 0, -0.25, -6, 1.5, 0.45, 1.2);
    for (const x of [-0.65, 0.65]) {
      cube(g, "#d597ff", x, 0.4, -5.93, 0.36, 0.23, 0.04, true);
      cube(g, "#a8a0ac", x, 0.95, -4.65, 0.26, 0.85, 0.3);
    }
    for (let i = 0; i < 7; i++) {
      const m = cube(g, "#30303c", 0, 0, 3 + i * 1.25, 1.15 - i * 0.12, 0.9 - i * 0.085, 1.5);
      this.tail.push(m);
      cube(g, "#77707f", 0, 1.05, 2 - i, 0.22, 0.55, 0.35);
    }
    for (const side of [-1, 1]) {
      const wing = new THREE.Group();
      wing.position.set(side * 0.8, 0.65, -0.3);
      g.add(wing);
      cube(wing, "#544b63", side * 3.3, 0, -0.2, 6.7, 0.2, 0.23);
      const geo = new THREE.BufferGeometry();
      geo.setAttribute(
        "position",
        new THREE.Float32BufferAttribute(
          [
            0,
            0,
            -0.3,
            side * 8,
            0,
            -1.4,
            side * 6,
            0,
            3.4,
            0,
            0,
            -0.3,
            side * 6,
            0,
            3.4,
            side * 2,
            0,
            2.8,
          ],
          3,
        ),
      );
      geo.computeVertexNormals();
      const mesh = new THREE.Mesh(
        geo,
        new THREE.MeshStandardMaterial({
          color: "#46374f",
          side: THREE.DoubleSide,
          roughness: 1,
        }),
      );
      mesh.castShadow = true;
      wing.add(mesh);
      for (let i = 0; i < 3; i++) {
        const bone = cube(wing, "#6b5e76", side * (2 + i * 1.7), 0, 1.15, 0.16, 0.15, 3.4);
        bone.rotation.y = side * (0.6 - i * 0.2);
      }
      this.wings.push(wing);
      for (const z of [-1, 1.7]) cube(g, "#262632", side * 1.3, -1, z, 0.45, 1.25, 0.65);
    }
    this.neck.position.set(0, 0, -2.5);
    // Moving meshes removes them from g.children, so iterate a stable copy.
    for (const o of g.children.slice())
      if (o instanceof THREE.Mesh && o.position.z < -2.5) {
        o.position.sub(this.neck.position);
        this.neck.add(o);
      }
    g.add(this.neck);
    this.group.position.set(27, 33, 0);
  }
  update(
    dt: number,
    crystals: number,
    player: THREE.Vector3,
    shoot: (p: THREE.Vector3, power?: number, speed?: number, aim?: THREE.Vector3) => void,
  ) {
    if (this.dead) {
      this.deathTime += dt;
      this.group.position.y -= dt * (2 + this.deathTime * 2);
      this.group.rotation.z += dt * 0.7;
      this.group.rotation.x += dt * 0.25;
      this.wings.forEach((w, i) => (w.rotation.z = (i ? 1 : -1) * Math.min(1.5, this.deathTime)));
      if (this.deathTime > 3) this.group.visible = false;
      return;
    }
    this.time += dt;
    this.shot -= dt;
    const t = this.time,
      enraged = this.hp <= DRAGON_ENRAGED_HEALTH,
      phase = t % (enraged ? 17 : 21),
      angularSpeed = enraged ? 0.3 : 0.26;
    this.orbit += dt * angularSpeed;
    this.hp = Math.min(DRAGON_MAX_HEALTH, this.hp + Math.max(0, Math.min(8, crystals)) * 0.4 * dt);
    const swoop = phase > (enraged ? 10 : 14);
    this.radius = THREE.MathUtils.lerp(this.radius, swoop ? 12 : 27, 1 - Math.exp(-dt * 1.4));
    const radius = this.radius;
    this.group.position.set(
      Math.cos(this.orbit) * radius,
      THREE.MathUtils.lerp(
        this.group.position.y,
        swoop ? 23 : 33 + Math.sin(t * 0.5) * 4,
        1 - Math.exp(-dt * 1.7),
      ),
      Math.sin(this.orbit) * radius,
    );
    this.group.rotation.y = -this.orbit;
    this.group.rotation.z = -0.13 + Math.sin(t * 0.55) * 0.09;
    this.group.rotation.x = swoop ? 0.08 + Math.sin(t) * 0.06 : Math.sin(t * 0.8) * 0.04;
    this.neck.rotation.x = Math.sin(t * 1.8) * 0.08 + (swoop ? 0.12 : 0);
    this.neck.rotation.y = Math.sin(t * 0.8) * 0.12;
    if (this.jaw) this.jaw.rotation.x = this.shot < 0.5 ? -0.45 : Math.sin(t * 1.2) * 0.025;
    this.wings.forEach((w, i) => {
      const side = i === 0 ? 1 : -1;
      w.rotation.z = (Math.sin(t * (swoop ? 5 : 3.7)) * 0.55 + 0.12) * side;
      w.rotation.y = Math.sin(t * 3.7 + 0.7) * side * 0.09;
      w.rotation.x = Math.cos(t * 3.7) * 0.08;
      w.scale.x = 1 - Math.max(0, Math.sin(t * 3.7)) * 0.12;
    });
    this.tail.forEach((p, i) => {
      p.position.x = Math.sin(t * 1.8 - i * 0.4) * i * 0.2;
      p.position.y = Math.cos(t * 1.3 - i * 0.3) * i * 0.07;
      p.rotation.y = Math.cos(t * 1.8 - i * 0.4) * 0.22;
      p.rotation.x = Math.sin(t * 1.3 - i * 0.3) * 0.07;
    });
    if (this.shot < 0 && this.group.position.distanceTo(player) < 70) {
      const origin = this.group.localToWorld(new THREE.Vector3(0, 0, -6));
      const target = player.clone().add(new THREE.Vector3(0, 1, 0));
      const side = target
        .clone()
        .sub(origin)
        .cross(new THREE.Vector3(0, 1, 0))
        .normalize();
      // A visible spread punishes standing still while leaving gaps for a sideways dodge.
      for (const offset of enraged ? [-2.8, 0, 2.8] : [0, Math.sin(t) > 0 ? 2.8 : -2.8])
        shoot(
          origin.clone(),
          enraged ? 7 : 6,
          enraged ? 17 : 15,
          target.clone().addScaledVector(side, offset),
        );
      this.shot = enraged ? 1.45 : crystals ? 2.6 : 1.9;
    }
  }
}
export function disposeEntityMaterials() {
  for (const m of materialCache.values()) m.dispose();
  materialCache.clear();
}
