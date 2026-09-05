import { Multiplayer } from "./multiplayer";
import { VoiceChat } from "./voice";
import { FaceCamera } from "./face-camera";
import { miningDuration, weapon } from "./combat";
import { harvestAllowed, harvestHint, isMineableBlock, minedResource } from "./mining";
import { armorSlot, armorMultiplier, normalizeEquipment, emptyEquipment } from "./armor";
import { InventoryPack, type PackData, type Stack } from "./inventory";
import { applyCraftResult, type SlotRef } from "./inventory-gestures";
import {
  BlockCracks,
  DroppedItems,
  handSwing,
  SWING_DURATION,
  type DropData,
} from "./interaction-effects";
import { PointerMotion } from "./pointer-motion";
import { BlockParticles } from "./block-particles";
import { requestRawPointerLock } from "./pointer-capture";
import { clearDamagePath, fallDamage, moveVertical } from "./player-physics";
import { damageCauseLabel, type DamageCause } from "./damage-causes";
import { ignitePortal } from "./portals";
import * as THREE from "three";
import { DRAGON_MAX_HEALTH, restoreDragonHealth } from "./dragon-balance";
import { Adventure, type AdventureData } from "./adventure";
import { WorldRenderer } from "./renderer";
import { BLOCKS, ITEMS, RECIPES, DIMENSIONS, item, type Dimension, type Mode } from "./blocks";
import { Mob, Dragon, cube, MOB_NAMES, type MobKind, disposeEntityMaterials } from "./entities";
import { AudioFX } from "./audio";
import { FluidSystem } from "./fluid";
import { Atmosphere } from "./atmosphere";
import { SkinModel, readSkin, type FirstPersonArm } from "./skin-model";
import { DEFAULT_SETTINGS, DEFAULT_BINDINGS, type Action, type GameSettings } from "./settings";
import { normalizeDifficulty, difficultyRules, type Difficulty } from "./difficulty";
import {
  HorrorDirector,
  type HorrorContext,
  type HorrorEvent,
  type HorrorSave,
} from "./horror-director";
import { HorrorPresentation } from "./horror-presentation";
import { placeHorrorEvent } from "./horror-placement";
import { HorrorHunt, type HuntWire } from "./horror-hunt";
import { createHuntEnvironment } from "./horror-terrain";
const NO_MOVEMENT_KEYS: ReadonlySet<string> = new Set();
const PHYSICAL_PANELS = new Set(["inventory", "crafting", "chest", "furnace", "chat"]);
export type { GameSettings } from "./settings";
export type Snapshot = {
  needsCapture: boolean;
  pack: PackData;
  craftResult: { id: number; n: number } | null;
  perspective: number;
  adventure: ReturnType<Adventure["snapshot"]>;
  active: boolean;
  started: boolean;
  mode: Mode;
  difficulty: Difficulty;
  horrorOverlay: number;
  horrorThreat: HuntWire | null;
  dimension: Dimension;
  health: number;
  food: number;
  xp: number;
  selected: number;
  hotbar: number[];
  inventory: Record<number, number>;
  x: number;
  y: number;
  z: number;
  biome: string;
  day: number;
  night: boolean;
  flying: boolean;
  target: string;
  mining: number;
  fps: number;
  dragon: number;
  crystals: number;
  won: boolean;
  toast: string;
  objective: string;
  saved: boolean;
  damage: number;
  underwater: boolean;
  oxygen: number;
  weather: string;
  sprinting: boolean;
  crouching: boolean;
};
type Target = {
  x: number;
  y: number;
  z: number;
  px: number;
  py: number;
  pz: number;
  id: number;
  distance: number;
};
type Projectile = {
  mesh: THREE.Mesh;
  velocity: THREE.Vector3;
  life: number;
  enemy: boolean;
  power: number;
};
type Particle = {
  mesh: THREE.Mesh;
  velocity: THREE.Vector3;
  life: number;
  max: number;
};
type Crystal = { mesh: THREE.Group; index: number; alive: boolean };

type SavedGame = {
  pack?: PackData;
  drops?: DropData[];
  v: number;
  seed: number;
  mode: string;
  difficulty?: Difficulty;
  horror?: HorrorSave;
  dimension: Dimension;
  position: number[];
  yaw?: number;
  pitch?: number;
  edits?: Record<string, number>;
  waterLevels?: Record<string, number>;
  inventory?: Record<number, number>;
  hotbar?: number[];
  health: number;
  food: number;
  xp: number;
  clock: number;
  won?: boolean;
  crystals?: number[];
  dragon?: number;
  dragonMaxHealth?: number;
  visited?: Dimension[];
  mined?: number;
  placed?: number;
  adventure?: Partial<AdventureData>;
};
const SAVE_KEY = "blockland.world.v1";
export class Game extends WorldRenderer {
  net: Multiplayer | null = null;
  needsCapture = false;
  lockGeneration = 0;
  lockPending = false;
  captureSince = 0;
  adventure = new Adventure(this);
  pack = new InventoryPack();
  drops = new DroppedItems(this);
  cracks: BlockCracks;
  swingTime = 0;
  pointerMotion = new PointerMotion();
  active = false;
  started = false;
  mode: Mode = "survival";
  difficulty: Difficulty = "normal";
  horrorDirector = new HorrorDirector();
  horrorHunt = new HorrorHunt();
  horrorThreat: HuntWire | null = null;
  private deathHandled = false;
  fallDistance = 0;
  lastDamageNotice = -Infinity;
  horror: HorrorPresentation;
  position = new THREE.Vector3(8, 20, 22);
  velocity = new THREE.Vector3();
  yaw = 0.22;
  pitch = 0;
  keys = new Set<string>();
  grounded = false;
  flying = false;
  health = 20;
  food = 20;
  xp = 0;
  hotbar: number[] = Array(9).fill(0);
  inventory: Record<number, number> = {};
  selected = 0;
  target: Target | null = null;
  mining = 0;
  mineKey = "";
  leftDown = false;
  rightDown = false;
  canvasContextUntil = 0;
  attackCooldown = 0;
  actionCooldown = 0;
  portalCooldown = 0;
  portalTime = 0;
  clock = 90;
  stepTimer = 0;
  hungerTimer = 0;
  regenerationTimer = 0;
  damageTimer = 0;
  saveTimer = 0;
  updateTimer = 0;
  meshTimer = 0;
  mobTimer = 0;
  lastSpace = 0;
  damageFlash = 0;
  toast = "";
  toastTimer = 0;
  fps = 60;
  frames = 0;
  frameClock = 0;
  saveAvailable = false;
  won = false;
  crystalsDestroyed: number[] = [];
  dragonHealth = DRAGON_MAX_HEALTH;
  visited: Dimension[] = ["overworld"];
  mined = 0;
  placed = 0;
  pauseReason = "";
  dragLook = false;
  touchLook: { id: number; x: number; y: number } | null = null;
  lastDrag: { x: number; y: number } | null = null;
  settings: GameSettings = {
    ...DEFAULT_SETTINGS,
    bindings: { ...DEFAULT_BINDINGS },
  };
  fluid: FluidSystem;
  atmosphere: Atmosphere;
  avatar: SkinModel | null = null;
  voice: VoiceChat;
  faceCamera: FaceCamera;
  oxygen = 20;
  sprinting = false;
  crouching = false;
  lastForward = 0;
  perspective = 0;
  eyeHeight = 1.62;
  wasInWater = false;
  skinGeneration = 0;
  mobs: Mob[] = [];
  dragon: Dragon | null = null;
  crystals: Crystal[] = [];
  projectiles: Projectile[] = [];
  particles: Particle[] = [];
  blockParticles = new BlockParticles(this.scene, 192);
  audio = new AudioFX();
  outline: THREE.LineSegments;
  hand = new THREE.Group();
  torch: THREE.PointLight;
  onUpdate: (s: Snapshot) => void;
  onMenu: (panel: string) => void;
  iconAtlas: string = "";
  heldId = -1;
  private lastPillarHint = -Infinity;
  viewArm: FirstPersonArm | null = null;
  constructor(
    mount: HTMLElement,
    onUpdate: (s: Snapshot) => void,
    onMenu: (panel: string) => void,
  ) {
    super(mount);
    this.onUpdate = onUpdate;
    this.onMenu = onMenu;
    this.voice = new VoiceChat(
      (audio) => this.net?.send({ type: "voice", audio }),
      () => !!this.net?.connected,
      () => {
        this.net?.emit();
      },
    );
    this.faceCamera = new FaceCamera((frame) => this.net?.sendFaceFrame(frame));
    this.iconAtlas = this.atlas.canvas.toDataURL();
    this.outline = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(1.006, 1.006, 1.006)),
      new THREE.LineBasicMaterial({
        color: "#172821",
        transparent: true,
        opacity: 0.75,
      }),
    );
    this.outline.visible = false;
    this.cracks = new BlockCracks(this.scene);
    this.scene.add(this.outline);
    this.scene.add(this.camera);
    this.camera.add(this.hand);
    this.hand.visible = false;
    this.torch = new THREE.PointLight("#ffd18b", 0, 13, 2);
    this.scene.add(this.torch);
    this.fluid = new FluidSystem(this.world);
    const fluidEdit = this.world.onEdit;
    this.world.onEdit = (x, y, z) => {
      fluidEdit?.(x, y, z);
      this.adventure.furnaceBlockChanged(x, y, z);
    };
    this.atmosphere = new Atmosphere(this);
    this.horror = new HorrorPresentation(this.scene, this.camera, this.audio);
    void this.reloadSkin();
    window.addEventListener("blockland-skin", this.skinChanged);
    let savedSettings: Partial<GameSettings> = {};
    try {
      savedSettings = JSON.parse(localStorage.getItem("blockland.settings") ?? "null") ?? {};
    } catch {}
    if (window.matchMedia("(pointer: coarse)").matches && !Object.keys(savedSettings).length)
      savedSettings = { view: 2, resolution: 0.8, shadows: false };
    this.applySettings(savedSettings);
    this.spawnMobs();
    try {
      this.saveAvailable = !!localStorage.getItem(SAVE_KEY);
    } catch {}
    this.onFrame = this.tick;
    document.addEventListener("keydown", this.keyDown, true);
    document.addEventListener("keyup", this.keyUp);
    document.addEventListener("mousemove", this.mouseMove);
    document.addEventListener("pointerlockchange", this.pointerLock);
    window.addEventListener("blur", this.blur);
    window.addEventListener("beforeunload", this.beforeUnload);
    this.canvas.addEventListener("mousedown", this.mouseDown);
    window.addEventListener("mouseup", this.mouseUp);
    document.addEventListener("contextmenu", this.contextMenu, true);
    this.canvas.addEventListener("wheel", this.wheel, { passive: false });
    this.canvas.addEventListener("touchstart", this.touchStart, {
      passive: false,
    });
    this.canvas.addEventListener("touchmove", this.touchMove, {
      passive: false,
    });
    this.canvas.addEventListener("touchend", this.touchEnd);
    this.canvas.addEventListener("touchcancel", this.touchEnd);
    this.emit();
  }
  notify(message: string) {
    this.toast = message;
    this.toastTimer = 4;
    this.emit();
  }
  snapshot(): Snapshot {
    this.syncPack();
    const result = this.pack.recipe();
    return {
      needsCapture: this.needsCapture,
      pack: this.pack.snapshot(),
      craftResult: result ? { id: result.out, n: result.n } : null,
      perspective: this.perspective,
      adventure: this.adventure.snapshot(),
      active: this.active,
      started: this.started,
      mode: this.mode,
      difficulty: this.difficulty ?? "normal",
      horrorOverlay: this.horror?.overlay ?? 0,
      horrorThreat: this.horrorThreat ?? null,
      dimension: this.world.dimension,
      health: this.health,
      food: this.food,
      xp: this.xp,
      selected: this.selected,
      hotbar: [...this.hotbar],
      inventory: { ...this.inventory },
      x: Math.floor(this.position.x),
      y: Math.floor(this.position.y),
      z: Math.floor(this.position.z),
      biome: this.world.biomeAt(this.position.x, this.position.y, this.position.z),
      day: Math.floor(this.clock / 600) + 1,
      night: (this.clock % 600) / 600 > 0.58,
      flying: this.flying,
      target: this.target ? item(this.target.id).name : "",
      mining: this.mining,
      fps: this.fps,
      dragon: this.dragon?.hp ?? -1,
      crystals: this.crystals.filter((c) => c.alive).length,
      won: this.won,
      toast: this.toast,
      objective: this.objective(),
      saved: this.saveAvailable,
      damage: this.damageFlash,
      underwater: this.world.waterAt(
        this.position.x,
        this.position.y + this.eyeHeight,
        this.position.z,
      ),
      oxygen: this.oxygen,
      weather: this.atmosphere.weather,
      sprinting: this.sprinting,
      crouching: this.crouching,
    };
  }
  emit() {
    this.onUpdate?.(this.snapshot());
  }
  objective() {
    if (this.won) return "Wolny świat — smok został pokonany";
    if (this.world.dimension === "end")
      return this.crystals.some((c) => c.alive)
        ? "Zniszcz kryształy na obsydianowych wieżach"
        : "Pokonaj smoka. Celuj z łuku!";
    if (this.world.dimension === "nether") return "Odkryj fortecę i portal do Endu";
    if (this.mined < 5) return "Zdobądź 5 bloków • " + this.mined + "/5";
    if (this.placed < 5) return "Zbuduj coś swojego • " + this.placed + "/5";
    if (!this.visited.includes("nether"))
      return "Odszukaj ruiny portalu, napraw obsydianową ramę i użyj krzesiwa";
    if (!this.visited.includes("end")) return "Portal Endu: X 20, Z −15";
    return "Wróć do Endu i pokonaj smoka";
  }
  setDifficulty(value: Difficulty, fromServer = false) {
    const next = normalizeDifficulty(value);
    if (this.net && !fromServer) {
      this.net.changeDifficulty(next);
      return;
    }
    if (this.difficulty !== next) {
      this.horror?.clear();
      this.horrorDirector?.reset("local");
      this.resetHorrorHunt();
      this.regenerationTimer = 0;
    }
    this.difficulty = next;
    this.emit();
  }
  receiveHorror(event: HorrorEvent) {
    if (
      this.difficulty !== "horror" ||
      this.health <= 0 ||
      ((!this.active || this.needsCapture) && event.reason !== "caught")
    )
      return;
    if (event.dimension !== this.world.dimension) return;
    if (event.reason === "caught" && !event.viewerIds.includes(this.net?.id ?? "local")) return;
    this.horror?.event(event);
  }
  horrorCaught() {
    return (
      this.horrorThreat?.phase === "caught" &&
      this.horrorThreat.targetId === (this.net?.id ?? "local")
    );
  }
  resetHorrorHunt() {
    this.horrorHunt?.reset("local");
    this.horrorThreat = null;
  }
  horrorContext(active = this.active && !this.needsCapture && !document.hidden): HorrorContext {
    return {
      id: "local",
      p: this.position.toArray(),
      yaw: this.yaw,
      pitch: this.pitch,
      dimension: this.world.dimension,
      difficulty: this.difficulty,
      active,
      alive: this.health > 0,
      night: this.clock % 600 > 350,
      underground: this.world.surface(this.position.x, this.position.z) - this.position.y > 5,
    };
  }
  huntEnvironment() {
    return createHuntEnvironment(
      () => this.world,
      (_dimension, x, z) => this.ensure(x, z),
    );
  }
  killByHorror(huntId: string) {
    if (
      this.net ||
      this.difficulty !== "horror" ||
      this.health <= 0 ||
      this.horrorThreat?.id !== huntId ||
      this.horrorThreat.phase !== "caught"
    )
      return;
    this.health = 0;
    this.damageFlash = 0.45;
    this.audio.play("hurt");
    this.finishDeath();
    this.emit();
  }
  updateHorror(dt: number) {
    const active =
      this.active &&
      !this.needsCapture &&
      this.health > 0 &&
      !document.hidden &&
      (!this.net || this.net.connected);
    if (!this.net && this.difficulty === "horror") {
      const hunt = (this.horrorHunt ??= new HorrorHunt());
      const player = this.horrorContext(active),
        env = this.huntEnvironment();
      const engaged = hunt.view("local").length > 0;
      for (const event of this.horrorDirector.tick(dt, [
        { ...player, active: active && !engaged },
      ])) {
        if (event.kind === "jumpscare") {
          const threat = hunt.start(event, [player], env);
          if (threat) {
            this.horrorThreat = threat;
            this.horror?.clear();
            this.notify("Gość cię obserwuje. Znajdź drogę ucieczki albo przygotuj broń.");
          }
          continue;
        }
        if (["watcher", "silhouette", "approach"].includes(event.kind)) {
          placeHorrorEvent(event, this.position.toArray(), player.underground, this.world);
        }
        this.receiveHorror(event);
      }
      const result = hunt.tick(dt, [player], env);
      for (const signal of result.signals) {
        if (signal.type === "caught" && signal.playerId === "local") {
          this.horrorThreat = signal.hunt;
          this.velocity?.set(0, 0, 0);
          this.keys?.clear();
          this.leftDown = this.rightDown = false;
          this.horror?.clear();
          this.receiveHorror({
            id: signal.hunt.id + ":caught",
            kind: "jumpscare",
            p: signal.hunt.p,
            duration: 1.3,
            intensity: 1,
            seed: signal.hunt.seed,
            reason: "caught",
            viewerIds: ["local"],
            dimension: signal.hunt.dimension,
            at: this.horrorDirector.elapsed,
            yaw: signal.hunt.yaw,
          });
        } else if (signal.type === "death" && signal.playerId === "local") {
          this.killByHorror(signal.huntId);
        } else if (signal.type === "ended" && this.health > 0) {
          this.notify(
            signal.reason === "banished"
              ? "Gość został przepędzony. Przez chwilę jesteś bezpieczny."
              : "Udało ci się zgubić Gościa. Złap oddech.",
          );
        }
      }
      this.horrorThreat = hunt.view("local")[0] ?? null;
    }
    this.horror?.update(dt, {
      enabled: this.difficulty === "horror",
      active:
        (active ||
          (this.horrorCaught() && !document.hidden && (!this.net || this.net.connected))) &&
        this.health > 0,
      dimension: this.world.dimension,
      player: this.position,
      yaw: this.yaw,
      pitch: this.pitch,
      time: this.net?.horrorClock ?? this.horrorDirector.elapsed,
      huntTime: this.net?.huntClock ?? this.horrorHunt?.elapsed ?? 0,
      threat: this.horrorThreat ?? null,
      viewerId: this.net?.id ?? "local",
      volume: this.settings.horrorVolume,
      jumpscares: this.settings.horrorJumpscares,
      reducedMotion: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    });
  }
  start(mode: Mode, resume = false, seed = 24680, difficulty: Difficulty = this.difficulty) {
    this.fallDistance = 0;
    this.resetHorrorHunt();
    this.deathHandled = false;
    if (this.net) {
      this.net.close();
      this.net = null;
    }
    this.audio.enable();
    if (!this.started || !resume) {
      if (resume && this.saveAvailable) {
        if (!this.load()) return;
      } else {
        this.difficulty = normalizeDifficulty(difficulty);
        this.horrorDirector = new HorrorDirector(seed);
        this.hungerTimer = this.regenerationTimer = 0;
        this.mode = mode;
        this.adventure.reset();
        this.clearDynamic();
        this.world.seed = seed;
        this.world.edits = {};
        this.world.waterLevels = {};
        this.fluid.clear();
        this.world.switch("overworld");
        this.dimensionChanged();
        this.pack.reset();
        this.drops.clear();
        this.inventory = {};
        this.hotbar = Array(9).fill(0);
        this.syncPack();
        this.health = 20;
        this.food = 20;
        this.oxygen = 20;
        this.xp = 0;
        this.won = false;
        this.dragonHealth = DRAGON_MAX_HEALTH;
        this.crystalsDestroyed = [];
        this.clock = 90;
        this.mined = 0;
        this.placed = 0;
        this.visited = ["overworld"];
        this.position.set(8.5, this.world.surface(8, 22) + 0.05, 22.5);
        this.yaw = 0.22;
        this.pitch = 0;
        this.spawnMobs();
      }
    }
    this.started = true;
    this.preview = false;
    this.hand.visible = true;
    this.resume();
    this.notify(
      resume && this.saveAvailable
        ? "Witaj z powrotem! Świat wczytany."
        : this.mode === "creative"
          ? "Kreatywny • pełna paleta bloków i swobodne latanie"
          : "Witaj w Zielonej dolinie! E otwiera ekwipunek.",
    );
  }
  resume() {
    if (this.health <= 0) return;
    this.returnCraftItems();
    this.active = true;
    this.pauseReason = "";
    this.preview = false;
    this.keys.clear();
    this.leftDown = false;
    this.rightDown = false;
    this.audio.enable();
    this.onMenu("");
    this.capturePointer();
    this.emit();
  }
  capturePointer(forceMouse = false) {
    if (!this.active) return;
    if (
      !forceMouse &&
      window.matchMedia("(pointer: coarse)").matches &&
      !window.matchMedia("(any-pointer: fine)").matches
    ) {
      this.needsCapture = false;
      return;
    }
    if (document.pointerLockElement === this.canvas) {
      this.needsCapture = false;
      this.lockPending = false;
      return;
    }
    (this.pointerMotion ??= new PointerMotion()).reset();
    this.pointerMotion.raw = false;
    const generation = ++this.lockGeneration;
    this.lockPending = true;
    this.captureSince = performance.now();
    this.needsCapture = true;
    this.dragLook = false;
    this.canvas.tabIndex = -1;
    this.canvas.focus({ preventScroll: true });
    try {
      requestRawPointerLock(this.canvas, () => this.active && generation === this.lockGeneration)
        .then((raw) => {
          if (generation === this.lockGeneration) this.pointerMotion.raw = raw;
        })
        .catch(() => {})
        .finally(() => {
          if (generation !== this.lockGeneration) return;
          this.lockPending = false;
          this.needsCapture = document.pointerLockElement !== this.canvas;
          this.emit();
        });
    } catch {
      this.lockPending = false;
      this.emit();
    }
  }
  pause(panel = "pause") {
    if (!this.started) return;
    this.cracks.update(null, 0);
    if (panel === "inventory" || panel === "crafting") {
      this.returnCraftItems(panel === "crafting" ? 3 : 2);
    }
    this.lockGeneration++;
    this.lockPending = false;
    this.needsCapture = false;
    this.swingTime = 0;
    this.pointerMotion?.reset();
    this.active = false;
    this.horror?.clear();
    this.pauseReason = panel;
    this.sprinting = false;
    this.keys.clear();
    this.leftDown = false;
    this.rightDown = false;
    this.mining = 0;
    this.touchLook = null;
    this.outline.visible = false;
    if (document.pointerLockElement === this.canvas) document.exitPointerLock();
    this.save(false);
    this.onMenu(panel);
    this.emit();
  }
  toMenu() {
    this.resetHorrorHunt();
    this.pause("");
    this.net?.close();
    this.net = null;
    this.started = false;
    this.preview = true;
    this.hand.visible = false;
    this.onMenu("");
    this.emit();
  }
  respawn() {
    this.fallDistance = 0;
    this.resetHorrorHunt();
    this.deathHandled = false;
    this.horror?.clear();
    this.horrorDirector?.reset("local");
    this.hungerTimer = this.regenerationTimer = 0;
    this.net?.request({ type: "respawn" });
    this.pack.reset();
    this.inventory = {};
    this.hotbar = Array(9).fill(0);
    this.health = 20;
    this.food = 20;
    this.oxygen = 20;
    this.velocity.set(0, 0, 0);
    if (this.world.dimension !== "overworld") this.travel("overworld");
    this.position.set(8.5, this.world.surface(8, 22) + 0.05, 22.5);
    this.adventure.respawn();
    this.damageTimer = 2;
    this.resume();
  }
  select(slot: number) {
    if (this.horrorCaught()) return;
    this.selected = ((slot % 9) + 9) % 9;
    this.mining = 0;
    this.emit();
  }
  syncPack() {
    const overflow = this.pack.reconcile(this.inventory, this.selected);
    this.inventory = this.pack.counts();
    this.hotbar = this.pack.slots.slice(0, 9).map((s) => s?.id ?? 0);
    for (const s of overflow)
      this.drops.spawn(s.id, s.n, this.position.clone().add(new THREE.Vector3(0, 1, 0)));
  }
  commitPack() {
    this.inventory = this.pack.counts();
    this.hotbar = this.pack.slots.slice(0, 9).map((s) => s?.id ?? 0);
    this.heldId = -1;
    this.emit();
  }
  returnCraftItems(size: 2 | 3 = 2) {
    if (this.net) {
      this.net.settleInventory(size);
      return;
    }
    const extra = this.pack.clearGrid();
    this.inventory = this.pack.counts();
    for (const s of extra)
      this.drops.spawn(s.id, s.n, this.position.clone().add(new THREE.Vector3(0, 1, 0)));
    this.hotbar = this.pack.slots.slice(0, 9).map((s) => s?.id ?? 0);
    this.pack.size = size;
  }
  clickSlot(area: "slots" | "grid", index: number, right = false, quick = false) {
    if (this.net?.pending.size) return;
    this.pack.click(area, index, right, quick);
    this.commitPack();
  }
  moveSlot(fromArea: "slots" | "grid", from: number, toArea: "slots" | "grid", to: number) {
    if (this.net?.pending.size) return;
    this.pack.move(fromArea, from, toArea, to);
    this.commitPack();
  }
  takeCraft(quick = false, to?: SlotRef, expected?: Stack | null) {
    if (this.net) {
      if (this.net.pending.size) return;
      this.net.sendProfile();
      this.net.request({ type: "craft", quick, to, expected }, (d) => {
        if (d.ok) this.audio.play("craft");
      });
      return;
    }
    if (applyCraftResult(this.pack, { quick, to, expected })) {
      this.audio.play("craft");
      this.commitPack();
    }
  }
  fillCraft(index: number) {
    if (this.net?.pending.size) return;
    if (!this.pack.fillRecipe(index, this.mode === "creative"))
      this.notify("Brakuje składników albo miejsca. Ten przepis może wymagać stołu 3 × 3.");
    this.commitPack();
  }
  equip(id: number) {
    if (armorSlot(id)) {
      this.adventure.equipArmor(id);
      this.emit();
      return;
    }
    if (this.mode === "creative") {
      this.pack.slots[this.selected] = id ? { id, n: id >= 101 ? 1 : 64 } : null;
      this.commitPack();
    } else {
      const i = this.pack.slots.findIndex((s) => s?.id === id);
      if (i >= 0) {
        [this.pack.slots[i], this.pack.slots[this.selected]] = [
          this.pack.slots[this.selected],
          this.pack.slots[i],
        ];
        this.commitPack();
      }
    }
  }
  add(id: number, n = 1) {
    if (id < 1 || n < 1) return;
    this.inventory[id] = (this.inventory[id] ?? 0) + n;
    this.emit();
  }
  dropSelected(all = false) {
    const s = this.pack.slots[this.selected];
    if (!s) return;
    const n = all ? s.n : 1,
      id = s.id;
    s.n -= n;
    if (!s.n) this.pack.slots[this.selected] = null;
    this.commitPack();
    const dir = new THREE.Vector3(
      -Math.sin(this.yaw) * Math.cos(this.pitch),
      Math.sin(this.pitch),
      -Math.cos(this.yaw) * Math.cos(this.pitch),
    );
    this.drops.spawn(
      id,
      n,
      this.position
        .clone()
        .add(new THREE.Vector3(0, this.eyeHeight, 0))
        .addScaledVector(dir, 0.6),
      dir.multiplyScalar(4.4).add(new THREE.Vector3(0, 1.4, 0)),
    );
    this.audio.play("place");
  }
  dropCursor() {
    const s = this.pack.cursor;
    if (!s) return;
    this.drops.spawn(s.id, s.n, this.position.clone().add(new THREE.Vector3(0, 1, 0)));
    this.pack.cursor = null;
    this.commitPack();
  }
  craft(index: number) {
    const r = RECIPES[index];
    if (!r) return false;
    if (this.mode !== "creative" && !r.need.every(([id, n]) => (this.inventory[id] ?? 0) >= n)) {
      this.notify("Brakuje składników do tej receptury.");
      return false;
    }
    if (this.mode !== "creative") {
      if (r.out === 110 && !this.inventory[29] && !this.nearBlock(29)) {
        this.notify("Wytwórz piec, aby przetopić żelazo.");
        return false;
      }
      for (const [id, n] of r.need) this.inventory[id] -= n;
    }
    this.add(r.out, r.n);
    this.audio.play("craft");
    this.notify("Wytworzono: " + item(r.out).name + " ×" + r.n);
    return true;
  }
  nearBlock(id: number) {
    const p = this.position;
    for (let x = -4; x <= 4; x++)
      for (let z = -4; z <= 4; z++)
        for (let y = -2; y <= 2; y++)
          if (this.world.get(p.x + x, p.y + y, p.z + z) === id) return true;
    return false;
  }
  eat() {
    if (this.net) {
      this.net.request({ type: "eat" });
      this.actionCooldown = 0.6;
      return;
    }
    const id = this.hotbar[this.selected];
    if (![106, 107].includes(id) || (!this.inventory[id] && this.mode !== "creative")) return;
    this.food = Math.min(20, this.food + 6);
    this.health = Math.min(20, this.health + 2);
    if (this.mode !== "creative") this.inventory[id]--;
    this.audio.play("eat");
    this.actionCooldown = 0.6;
    this.emit();
  }
  travel(d: Dimension) {
    this.fallDistance = 0;
    if (d === this.world.dimension) return;
    this.resetHorrorHunt();
    this.dragonHealth = this.dragon?.hp ?? this.dragonHealth;
    this.clearDynamic();
    this.fluid.clear();
    this.world.switch(d);
    this.dimensionChanged();
    this.velocity.set(0, 0, 0);
    this.position.set(
      d === "overworld" ? 8.5 : d === "end" ? 0.5 : 0.5,
      30,
      d === "end" ? 39.5 : d === "overworld" ? 22.5 : 11.5,
    );
    this.position.y = this.world.surface(this.position.x, this.position.z) + 0.1;
    this.pitch = 0;
    this.yaw = 0;
    this.portalCooldown = 5;
    this.portalTime = 0;
    if (!this.visited.includes(d)) this.visited.push(d);
    this.spawnMobs();
    if (d === "end") this.spawnDragon();
    this.wakeWater();
    this.audio.play("portal");
    this.notify("Odkryto wymiar: " + DIMENSIONS[d].name);
    this.save(false);
    this.emit();
  }
  clearDynamic() {
    this.blockParticles?.clear();
    this.horror?.clear();
    for (const m of this.mobs) {
      this.scene.remove(m.group);
      m.dispose();
    }
    this.mobs = [];
    if (this.dragon) {
      this.scene.remove(this.dragon.group);
      this.dragon.group.traverse((o) => {
        if (o instanceof THREE.Mesh && o.geometry.type !== "BoxGeometry") {
          o.geometry.dispose();
          (o.material as THREE.Material).dispose();
        }
      });
    }
    this.dragon = null;
    for (const c of this.crystals) this.releaseCrystal(c);
    this.crystals = [];
    for (const p of this.projectiles) this.scene.remove(p.mesh);
    this.projectiles = [];
    for (const p of this.particles) this.scene.remove(p.mesh);
    this.particles = [];
  }
  spawnMobs() {
    if (this.net) return;
    for (const m of this.mobs) {
      this.scene.remove(m.group);
      m.dispose();
    }
    this.mobs = [];
    const d = this.world.dimension;
    const kinds: MobKind[] =
      d === "overworld"
        ? [
            "sheep",
            "pig",
            "cow",
            "chicken",
            "sheep",
            "pig",
            "cow",
            "chicken",
            "sheep",
            "pig",
            "slime",
          ]
        : d === "nether"
          ? ["piglin", "blaze", "ghast", "piglin", "blaze", "piglin"]
          : ["enderman", "enderman", "enderman", "enderman", "enderman"];
    for (let i = 0; i < kinds.length; i++) {
      const a = (i / kinds.length) * Math.PI * 2,
        r = 14 + (i % 4) * 5;
      let x = Math.cos(a) * r,
        z = Math.sin(a) * r;
      if (d === "overworld" && i < 4) {
        x = 12 + i * 2;
        z = 10 + i * 2;
      }
      const m = new Mob(
        d === "overworld" && i >= 4 ? (this.world.biomeInfo(x, z).mob as MobKind) : kinds[i],
        x + this.position.x,
        z + this.position.z,
        this.world,
      );
      this.mobs.push(m);
      this.scene.add(m.group);
    }
  }
  spawnDragon() {
    if (this.won) return;
    this.dragon = new Dragon();
    this.dragon.hp = this.dragonHealth;
    this.scene.add(this.dragon.group);
    for (let i = 0; i < 8; i++) {
      if (this.crystalsDestroyed.includes(i)) continue;
      const a = (i / 8) * Math.PI * 2,
        x = Math.round(Math.cos(a) * 29),
        z = Math.round(Math.sin(a) * 29),
        h = 30 + (i % 3) * 4;
      const group = new THREE.Group();
      group.position.set(x + 0.5, h + 1, z + 0.5);
      const gem = cube(group, "#e99dff", 0, 0, 0, 0.9, 0.9, 0.9, true);
      gem.rotation.set(0.6, 0.2, 0.6);
      const cageBox = new THREE.BoxGeometry(1.45, 1.45, 1.45);
      const cage = new THREE.LineSegments(
        new THREE.EdgesGeometry(cageBox),
        new THREE.LineBasicMaterial({ color: "#b2ddd0" }),
      );
      cageBox.dispose();
      cage.rotation.set(0.6, 0.2, 0.6);
      group.add(cage);
      const light = new THREE.PointLight("#cd7aff", 6, 8);
      group.add(light);
      this.crystals.push({ mesh: group, index: i, alive: true });
      this.scene.add(group);
    }
  }
  releaseCrystal(c: Crystal) {
    if (c.mesh.userData.disposed) return;
    c.mesh.userData.disposed = true;
    c.alive = false;
    c.mesh.removeFromParent();
    c.mesh.traverse((object) => {
      if (object instanceof THREE.LineSegments) {
        object.geometry.dispose();
        for (const material of Array.isArray(object.material) ? object.material : [object.material])
          material.dispose();
      }
      if (object instanceof THREE.PointLight) object.dispose();
    });
    // Crystal cubes use the shared entity geometry/material cache.
    c.mesh.clear();
  }
  destroyCrystal(c: Crystal) {
    if (this.net) {
      this.net.request({ type: "hit", crystal: c.index });
      return;
    }
    if (!c.alive) return;
    this.releaseCrystal(c);
    this.crystalsDestroyed.push(c.index);
    this.burst(c.mesh.position, "#d793ff", 24);
    this.audio.play("break");
    this.xp += 15;
    this.notify("Kryształ zniszczony • pozostało " + this.crystals.filter((c) => c.alive).length);
  }
  hitDragon(n: number) {
    if (this.net) {
      this.net.request({ type: "hit", target: "dragon" });
      return;
    }
    if (!this.dragon || this.won) return;
    this.dragon.hp -= n;
    this.dragonHealth = this.dragon.hp;
    this.burst(this.dragon.group.position, "#bb8ada", 5);
    this.audio.play("hit");
    if (this.dragon.hp <= 0) {
      this.dragon.hp = 0;
      this.dragon.dead = true;
      this.dragon.deathTime = 0;
      this.won = true;
      this.xp += 500;
      this.burst(this.dragon.group.position, "#ead0ff", 90);
      this.audio.play("win");
      this.notify("Smok pokonany! Portal w centrum wyspy prowadzi do domu.");
      this.save(false);
      this.emit();
    }
  }
  hitMob(m: Mob, n: number) {
    if (this.net) {
      this.net.request({ type: "hit", target: m.group.userData.netId });
      return;
    }
    m.hp -= n;
    m.hurt = 0.3;
    this.audio.play("hit");
    this.burst(m.group.position.clone().add(new THREE.Vector3(0, 1, 0)), "#bb8872", 6);
    if (m.hp <= 0) {
      m.die();
      this.xp += m.hostile ? 8 : 3;
      this.add(m.hostile ? 109 : m.kind === "sheep" ? 32 : 107, m.hostile ? 2 : 1);
      if (m.kind === "cow") this.add(140, 1 + Math.floor(Math.random() * 2));
      if (m.kind === "enderman") this.add(111, 1);
      this.notify(MOB_NAMES[m.kind] + " • +" + (m.hostile ? 8 : 3) + " PD");
    }
  }
  damage(n: number, reason: DamageCause = "environment") {
    if (
      !Number.isFinite(n) ||
      n <= 0 ||
      this.mode === "creative" ||
      this.damageTimer > 0 ||
      this.health <= 0 ||
      this.horrorCaught()
    )
      return;
    if (this.net) {
      if (!this.net.connected || !["fall", "lava", "drowning", "void"].includes(reason)) return;
      this.net.request({ type: "environmentDamage", amount: n, reason });
      // Health and death come exclusively from the server; throttle contact reports.
      this.damageTimer = 0.8;
      return;
    }
    if (!["fall", "void", "drowning", "hunger", "horror"].includes(reason))
      n *= armorMultiplier(
        normalizeEquipment(this.adventure.data.equipment, this.adventure.data.armor),
      );
    n = Math.max(1, Math.ceil(n * difficultyRules(this.difficulty).environmentDamage));
    this.health = Math.max(0, this.health - n);
    this.damageTimer = 0.8;
    this.damageFlash = 0.45;
    this.audio.play("hurt");
    if (this.health <= 0) this.finishDeath();
    else if (performance.now() - (this.lastDamageNotice ?? -Infinity) >= 3000) {
      this.lastDamageNotice = performance.now();
      this.notify(damageCauseLabel(reason) ?? "Obrażenia");
    }
    this.emit();
  }
  damageFrom(n: number, source: THREE.Vector3, reason: DamageCause) {
    if (clearDamagePath(source, this.playerEyeRay().origin, (x, y, z) => this.world.solid(x, y, z)))
      this.damage(n, reason);
  }
  finishDeath() {
    if (this.deathHandled || this.health > 0) return;
    this.deathHandled = true;
    if (this.net) this.net.sendProfile();
    else {
      this.syncPack();
      for (const [id, n] of Object.entries(this.inventory))
        this.drops.spawn(Number(id), n, this.position.clone().add(new THREE.Vector3(0, 0.8, 0)));
      for (const id of Object.values(
        normalizeEquipment(this.adventure.data.equipment, this.adventure.data.armor),
      ))
        if (id) this.drops.spawn(id, 1, this.position.clone().add(new THREE.Vector3(0, 0.8, 0)));
      this.adventure.data.equipment = emptyEquipment();
      this.adventure.data.armor = 0;
      this.pack.reset();
      this.inventory = {};
      this.hotbar = Array(9).fill(0);
    }
    this.resetHorrorHunt();
    this.pause("death");
  }
  explode = (pos: THREE.Vector3) => {
    this.burst(pos, "#d99b58", 30);
    if (this.position.distanceTo(pos) < 4)
      this.damageFrom(8, pos.clone().add(new THREE.Vector3(0, 1, 0)), "explosion");
    for (let x = -2; x <= 2; x++)
      for (let y = 0; y < 3; y++)
        for (let z = -2; z <= 2; z++)
          if (x * x + y * y + z * z < 6) {
            const wx = Math.floor(pos.x + x),
              wy = Math.floor(pos.y + y),
              wz = Math.floor(pos.z + z),
              id = this.world.get(wx, wy, wz);
            if (id && ![12, 13, 18, 35].includes(id)) this.world.set(wx, wy, wz, 0);
          }
  };
  shootEnemy = (pos: THREE.Vector3, power = 4, speed = 12, aim?: THREE.Vector3) => {
    if (!this.active || this.mode === "creative") return;
    const target = aim?.clone() ?? this.position.clone().add(new THREE.Vector3(0, 1, 0));
    const velocity = target.sub(pos).normalize().multiplyScalar(speed);
    const mesh = cube(
      this.scene,
      this.world.dimension === "end" ? "#d397fb" : "#f9a351",
      pos.x,
      pos.y,
      pos.z,
      0.35,
      0.35,
      0.35,
      true,
    );
    this.projectiles.push({ mesh, velocity, life: 5, enemy: true, power });
  };
  shoot() {
    if (this.horrorCaught()) return;
    if (this.net) {
      this.net.shoot();
      return;
    }
    if (this.mode !== "creative" && !(this.inventory[113] > 0)) {
      this.notify("Brak strzał. Wytwórz je w ekwipunku.");
      this.actionCooldown = 0.6;
      return;
    }
    if (this.mode !== "creative") this.inventory[113]--;
    const ray = this.playerEyeRay(),
      dir = ray.direction,
      origin = ray.origin.clone().addScaledVector(dir, 0.6);
    const mesh = cube(this.scene, "#cbbb8f", origin.x, origin.y, origin.z, 0.06, 0.06, 0.75);
    mesh.quaternion.setFromEuler(new THREE.Euler(this.pitch, this.yaw, 0, "YXZ"));
    this.projectiles.push({
      mesh,
      velocity: dir.multiplyScalar(37),
      life: 5,
      enemy: false,
      power: 20,
    });
    this.audio.play("bow");
    this.actionCooldown = 0.45;
    this.attackCooldown = 0.45;
    this.emit();
  }
  /** Gameplay aiming comes from the player's eyes, regardless of the F5 display camera. */
  playerEyeRay() {
    return new THREE.Ray(
      this.position.clone().add(new THREE.Vector3(0, this.eyeHeight, 0)),
      new THREE.Vector3(
        -Math.sin(this.yaw) * Math.cos(this.pitch),
        Math.sin(this.pitch),
        -Math.cos(this.yaw) * Math.cos(this.pitch),
      ),
    );
  }
  raycast(max = 6): Target | null {
    const { direction: dir, origin: p } = this.playerEyeRay();
    let px = Math.floor(p.x),
      py = Math.floor(p.y),
      pz = Math.floor(p.z);
    for (let t = 0; t < max; t += 0.045) {
      const x = Math.floor(p.x + dir.x * t),
        y = Math.floor(p.y + dir.y * t),
        z = Math.floor(p.z + dir.z * t),
        id = this.world.get(x, y, z);
      if (
        id &&
        (id !== 7 || this.hotbar[this.selected] === 114) &&
        (id !== 15 || this.hotbar[this.selected] === 115)
      )
        return { x, y, z, px, py, pz, id, distance: t };
      px = x;
      py = y;
      pz = z;
    }
    return null;
  }
  attack() {
    if (this.attackCooldown > 0 || this.horrorCaught()) return false;
    if (!(this.swingTime > 0)) this.swingTime = SWING_DURATION;
    if (this.net) return this.net.attack();
    const ray = this.playerEyeRay();
    let closest = weapon(this.hotbar[this.selected]).reach,
      hit: Mob | Crystal | Dragon | HuntWire | null = null;
    const test = (obj: Mob | Crystal | Dragon | HuntWire, pos: THREE.Vector3, r: number) => {
      const at = ray.intersectSphere(new THREE.Sphere(pos, r), new THREE.Vector3());
      if (at) {
        const dist = at.distanceTo(ray.origin);
        if (dist < closest && (!this.target || dist < this.target.distance)) {
          closest = dist;
          hit = obj;
        }
      }
    };
    for (const m of this.mobs)
      if (!m.dead) test(m, m.group.position.clone().add(new THREE.Vector3(0, 1, 0)), m.size);
    for (const c of this.crystals) if (c.alive) test(c, c.mesh.position, 1);
    if (this.dragon && !this.dragon.dead) test(this.dragon, this.dragon.group.position, 3);
    const threat = this.horrorThreat;
    if (this.difficulty === "horror" && threat && threat.dimension === this.world.dimension)
      test(threat, new THREE.Vector3(...threat.p).add(new THREE.Vector3(0, 1.75, 0)), 0.85);
    const targeted = hit as Mob | Crystal | Dragon | HuntWire | null;
    if (threat && targeted === threat) {
      const stats = weapon(this.hotbar[this.selected]);
      const result = this.horrorHunt.attack(
        {
          huntId: threat.id,
          attackerId: "local",
          damage: stats.damage,
          reach: stats.reach,
          cooldown: stats.cooldown,
        },
        [this.horrorContext()],
        this.huntEnvironment(),
      );
      this.attackCooldown = stats.cooldown;
      if (result.ok) {
        this.audio.play("hit");
        this.horrorThreat = this.horrorHunt.view("local")[0] ?? null;
        this.emit();
      }
      return result.ok;
    }
    const entity = targeted as Mob | Crystal | Dragon | null;
    if (entity) {
      const id = this.hotbar[this.selected];
      if (entity instanceof Mob) this.hitMob(entity, weapon(id).damage);
      else if (entity instanceof Dragon) this.hitDragon(id === 108 ? 15 : id === 104 ? 10 : 3);
      else this.destroyCrystal(entity);
      this.attackCooldown = weapon(id).cooldown;
      return true;
    }
    return false;
  }
  setMining(value: boolean) {
    this.leftDown = value;
  }
  toggleFlight() {
    if (this.mode === "creative") {
      this.flying = !this.flying;
      this.velocity.y = 0;
      this.emit();
    }
  }
  interact() {
    if (this.horrorCaught()) return;
    if (this.actionCooldown > 0) return;
    if (this.net && this.net.interact()) return;
    const id = this.hotbar[this.selected];
    const t = this.target;
    if (id === 123 && t) {
      const lit = ignitePortal(this.world, t.x, t.y, t.z);
      this.notify(
        lit
          ? "Portal rozpalony. Wejdź w fioletową taflę."
          : "Napraw ramę z obsydianu: otwór 2 × 3 bloki, potem użyj krzesiwa.",
      );
      this.audio.play(lit ? "portal" : "place");
      this.actionCooldown = 0.5;
      return;
    }
    if (t?.id === 61) {
      this.adventure.openChest(t.x, t.y, t.z);
      return;
    }
    if (t?.id === 29) {
      this.adventure.openFurnace(t.x, t.y, t.z);
      return;
    }
    if (t?.id === 62) {
      this.adventure.bed(t.x, t.y, t.z);
      return;
    }
    if (id === 105) {
      this.shoot();
      return;
    }
    if ([106, 107].includes(id)) {
      this.eat();
      return;
    }
    if (id === 118 && t && [1, 2, 54].includes(t.id)) {
      this.world.set(t.x, t.y, t.z, 63);
      this.audio.play("place");
      this.actionCooldown = 0.25;
      return;
    }
    if (id === 116 && t) {
      this.adventure.plant(t.px, t.py, t.pz);
      return;
    }
    if (id === 114 && t?.id === 7) {
      if (this.fluid.level(t.x, t.y, t.z) !== 0) {
        this.notify("Nabierz wodę ze źródła, nie ze strumienia.");
        this.actionCooldown = 0.5;
        return;
      }
      this.world.set(t.x, t.y, t.z, 0);
      if (this.mode !== "creative")
        this.inventory[114] = Math.max(0, (this.inventory[114] ?? 1) - 1);
      this.add(115);
      this.hotbar[this.selected] = 115;
      this.audio.play("bucket");
      this.actionCooldown = 0.3;
      return;
    }
    if (id === 115 && t) {
      if (this.world.dimension !== "nether") {
        if (!this.world.pourWater(t.px, t.py, t.pz)) return;
        this.audio.play("splash");
      } else {
        this.burst(new THREE.Vector3(t.px, t.py, t.pz), "#b8c4c0", 15);
        this.notify("Woda wyparowała w gorącym Netherze.");
      }
      if (this.mode !== "creative")
        this.inventory[115] = Math.max(0, (this.inventory[115] ?? 1) - 1);
      this.add(114);
      this.hotbar[this.selected] = 114;
      this.actionCooldown = 0.3;
      return;
    }
    if (t && [28, 30].includes(t.id)) {
      this.pause("crafting");
      return;
    }
    if (!t || id >= BLOCKS.length || id < 1) return;
    if (this.mode !== "creative" && !(this.inventory[id] > 0)) {
      this.notify("Nie masz tego bloku w ekwipunku.");
      this.actionCooldown = 0.5;
      return;
    }
    const { x: px, y: py, z: pz } = { x: t.px, y: t.py, z: t.pz };
    const p = this.position;
    if (
      px + 1 > p.x - 0.3 &&
      px < p.x + 0.3 &&
      pz + 1 > p.z - 0.3 &&
      pz < p.z + 0.3 &&
      py + 1 > p.y &&
      py < p.y + 1.8 &&
      BLOCKS[id].solid
    )
      return;
    if (py <= 0 || py >= 71) return;
    this.world.set(px, py, pz, id);
    if (this.mode !== "creative") this.inventory[id]--;
    this.placed++;
    this.audio.play("place");
    this.actionCooldown = 0.2;
    this.emit();
  }
  mine(dt: number) {
    if (this.horrorCaught()) return;
    if (this.hotbar[this.selected] === 105) {
      if (this.actionCooldown <= 0) this.shoot();
      return;
    }
    if (this.attack()) return;
    const t = this.target;
    if (!t) {
      this.mining = 0;
      return;
    }
    if (!isMineableBlock(t.id, t.y)) {
      this.mining = 0;
      return;
    }
    const held = this.hotbar[this.selected] ?? 0;
    const key = t.x + "," + t.y + "," + t.z + "," + held;
    if (key !== this.mineKey) {
      this.mineKey = key;
      this.mining = 0;
      if (this.mode === "survival") {
        const hint = harvestHint(t.id, held);
        if (hint) this.notify(hint);
      }
    }
    let duration = miningDuration(t.id, held);
    if (this.mode === "creative") duration = 0.13;
    if (this.settings.particles)
      this.blockParticles?.chip(
        t.id,
        { x: t.x + 0.5, y: t.y + 0.5, z: t.z + 0.5 },
        { x: t.px - t.x, y: t.py - t.y, z: t.pz - t.z },
      );
    this.mining = duration === 0 ? 1 : this.mining + dt / duration;
    if (this.mining >= 1) {
      if (this.net) {
        this.net.mine(t);
        this.mining = 0;
        this.actionCooldown = 0.15;
        return;
      }
      this.world.set(t.x, t.y, t.z, 0);
      const harvest = harvestAllowed(t.id, held);
      // Container contents remain recoverable even when the block itself cannot drop.
      const special =
        ((this.mode === "survival" && harvest) || [29, 61].includes(t.id)) &&
        this.adventure.mineSpecial(t.id, t.x, t.y, t.z);
      if (this.mode === "survival" && harvest && !special) {
        const drop = minedResource(t.id);
        this.add(drop.id, drop.n);
        if (t.id === 6 && Math.random() < 0.12) this.add(106);
      }
      this.mined++;
      if (this.mode === "survival" && harvest) this.xp += t.id === 22 ? 8 : 1;
      if (this.settings.particles)
        this.blockParticles?.break(t.id, { x: t.x + 0.5, y: t.y + 0.5, z: t.z + 0.5 });
      this.audio.play("break");
      this.mining = 0;
      this.emit();
    }
  }
  burst(pos: THREE.Vector3, color: string, n: number) {
    if (!this.settings.particles) return;
    for (let i = 0; i < n; i++) {
      if (this.particles.length > 150) break;
      const mesh = cube(this.scene, color, pos.x, pos.y, pos.z, 0.09, 0.09, 0.09);
      mesh.castShadow = false;
      this.particles.push({
        mesh,
        velocity: new THREE.Vector3(
          (Math.random() - 0.5) * 5,
          Math.random() * 4,
          (Math.random() - 0.5) * 5,
        ),
        life: 0.5 + Math.random() * 0.5,
        max: 1,
      });
    }
  }
  collision(p: THREE.Vector3, height = this.crouching ? 1.45 : 1.75) {
    for (let x = Math.floor(p.x - 0.29); x <= Math.floor(p.x + 0.29); x++)
      for (let z = Math.floor(p.z - 0.29); z <= Math.floor(p.z + 0.29); z++)
        for (let y = Math.floor(p.y + 0.00001); y <= Math.floor(p.y + height); y++)
          if (this.world.solid(x, y, z)) return true;
    return false;
  }
  move(dt: number, controlsEnabled = true) {
    if (this.horrorCaught()) {
      this.velocity.set(0, 0, 0);
      return;
    }
    const p = this.position,
      w = this.world,
      k = controlsEnabled ? this.keys : NO_MOVEMENT_KEYS;
    this.crouching = k.has("ShiftLeft") || (!this.flying && this.collision(p, 1.75));
    const inWater = w.waterAt(p.x, p.y + 0.55, p.z);
    const forward = (k.has("KeyW") ? 1 : 0) - (k.has("KeyS") ? 1 : 0),
      strafe = (k.has("KeyD") ? 1 : 0) - (k.has("KeyA") ? 1 : 0),
      sprint =
        controlsEnabled &&
        (this.sprinting || k.has("ControlLeft")) &&
        this.food > 5 &&
        !this.crouching;
    const speed = this.flying
      ? sprint
        ? 18
        : 10
      : inWater
        ? 2.8
        : sprint
          ? 6.6
          : this.crouching
            ? 1.5
            : 4.35;
    const norm = Math.hypot(forward, strafe) || 1;
    const dx = ((-Math.sin(this.yaw) * forward + Math.cos(this.yaw) * strafe) / norm) * speed * dt,
      dz = ((-Math.cos(this.yaw) * forward - Math.sin(this.yaw) * strafe) / norm) * speed * dt;
    if (this.flying) this.velocity.y = (k.has("Space") ? 1 : k.has("ShiftLeft") ? -1 : 0) * speed;
    else {
      this.velocity.y -= (inWater ? 8 : 24) * dt;
      if (inWater) this.velocity.y = Math.max(-3, this.velocity.y);
      if (k.has("Space") && (this.grounded || inWater)) {
        this.velocity.y = inWater ? 4 : 8.2;
        this.grounded = false;
        if (!inWater) this.audio.play("jump");
      }
    }
    for (const [axis, delta] of [
      ["x", dx],
      ["z", dz],
    ] as const) {
      p[axis] += delta;
      if (
        this.collision(p) ||
        (this.crouching && this.grounded && !this.flying && !w.solid(p.x, p.y - 0.12, p.z))
      ) {
        p[axis] -= delta;
        if (
          window.matchMedia?.("(pointer: coarse)").matches &&
          !window.matchMedia?.("(any-pointer: fine)").matches &&
          this.grounded &&
          delta
        )
          this.velocity.y = 8.2;
      }
    }
    if (this.flying || inWater || this.velocity.y >= 0) this.fallDistance = 0;
    const vertical = moveVertical(
      p,
      this.velocity.y * dt,
      (pos) => this.collision(pos),
      this.grounded,
    );
    this.grounded = vertical.landed;
    const landedInWater = inWater || w.waterAt(p.x, p.y + 0.1, p.z);
    if (!this.flying && !landedInWater)
      this.fallDistance = (this.fallDistance || 0) + vertical.distance;
    else this.fallDistance = 0;
    if (vertical.hit) {
      if (vertical.landed) {
        if (!landedInWater && !this.flying) this.damage(fallDamage(this.fallDistance), "fall");
        this.fallDistance = 0;
      }
      this.velocity.y = 0;
    }
    if (p.y < -15) {
      this.damage(100, "void");
      if (this.mode === "creative") p.y = 40;
    }
    if (p.y > 110) p.y = 110;
    if (w.get(p.x, p.y, p.z) === 15 || w.get(p.x, p.y - 0.1, p.z) === 15) this.damage(4, "lava");
    if (p.y < 1 && !this.collision(p)) this.damage(100, "void");
    if ((forward || strafe) && this.grounded) {
      this.stepTimer -= dt;
      if (this.stepTimer <= 0) {
        this.audio.play("step");
        this.stepTimer = sprint ? 0.28 : 0.42;
      }
    }
    const rules = difficultyRules(this.difficulty);
    if (!this.net && this.mode === "survival") {
      this.hungerTimer +=
        dt * ((forward || strafe) && this.grounded ? (sprint ? 1.8 : 1) : 0.25) * rules.hungerRate;
      this.regenerationTimer =
        this.food > 14 && this.damageTimer <= 0 ? (this.regenerationTimer || 0) + dt : 0;
      if (this.regenerationTimer >= rules.regenerationSeconds) {
        this.regenerationTimer = 0;
        this.health = Math.min(20, this.health + rules.regenerationAmount);
      }
    }
    if (!this.net && this.mode === "survival" && this.hungerTimer > 25) {
      this.food = Math.max(0, this.food - 1);
      this.hungerTimer = 0;
      if (this.food === 0) this.damage(1, "hunger");
    }
    if (inWater && !this.wasInWater) this.audio.play("splash");
    this.wasInWater = inWater;
    const submerged = w.waterAt(p.x, p.y + this.eyeHeight, p.z);
    if (this.mode === "survival") {
      this.oxygen = Math.max(0, Math.min(20, this.oxygen + (submerged ? -1.8 : 6) * dt));
      if (this.oxygen <= 0) this.damage(2, "drowning");
    }
    if (inWater) {
      const l = this.fluid.level(Math.floor(p.x), Math.floor(p.y), Math.floor(p.z));
      if (l > 0 && l < 8) {
        for (const [cx, cz] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ]) {
          const nl = this.fluid.level(Math.floor(p.x) + cx, Math.floor(p.y), Math.floor(p.z) + cz);
          if (nl > l) {
            const next = p.clone().add(new THREE.Vector3(cx * dt * 0.35, 0, cz * dt * 0.35));
            if (!this.collision(next)) p.copy(next);
          }
        }
      }
    }
    this.eyeHeight += ((this.crouching ? 1.3 : 1.62) - this.eyeHeight) * Math.min(1, dt * 14);
    const bob =
      this.settings.viewBob && this.grounded && (forward || strafe)
        ? Math.sin(this.clock * (sprint ? 15 : 11)) * 0.038
        : 0;
    this.camera.position.set(p.x, p.y + this.eyeHeight + bob, p.z);
    this.camera.rotation.set(this.pitch, this.yaw, 0, "YXZ");
    if (this.avatar) {
      this.avatar.setEquipment(this.adventure.data.equipment);
      this.avatar.group.position.copy(p);
      this.avatar.group.rotation.y = this.yaw + Math.PI;
      this.avatar.head.rotation.x = -this.pitch;
      this.avatar.group.visible = this.perspective !== 0;
      this.avatar.pose(
        this.time,
        !!(forward || strafe),
        this.crouching,
        this.swingTime > 0 ? 1 - this.swingTime / SWING_DURATION : -1,
      );
    }
    if (this.perspective !== 0) {
      const side = this.perspective === 1 ? -1 : 1;
      const eye = this.camera.position.clone(),
        dir = this.camera.getWorldDirection(new THREE.Vector3());
      let distance = 4;
      for (let d = 0.2; d < 4; d += 0.15) {
        const v = eye.clone().addScaledVector(dir, side * d);
        if (w.solid(v.x, v.y, v.z)) {
          distance = d - 0.2;
          break;
        }
      }
      this.camera.position.copy(eye).addScaledVector(dir, side * distance);
      this.camera.lookAt(this.perspective === 2 ? eye : eye.clone().addScaledVector(dir, 4));
    }
    this.sun.position.set(p.x + 35, 65, p.z + 28);
    this.sun.target.position.set(p.x, 10, p.z);
    this.torch.position.copy(this.camera.position);
    this.torch.intensity = this.hotbar[this.selected] === 48 ? 9 : 0;
  }
  /** A cursor panel disables controls, not gravity; Escape still pauses a solo world. */
  panelPhysicsActive() {
    return !!(
      this.started &&
      !this.preview &&
      !this.active &&
      this.health > 0 &&
      !document.hidden &&
      this.pauseReason !== "death" &&
      (this.net || PHYSICAL_PANELS.has(this.pauseReason))
    );
  }
  tickPanelPhysics(dt: number) {
    this.damageTimer = Math.max(0, this.damageTimer - dt);
    this.damageFlash = Math.max(0, this.damageFlash - dt);
    this.move(dt, false);
    this.meshTimer += dt;
    if (this.meshTimer > 0.1) {
      this.ensure(this.position.x, this.position.z);
      this.meshTimer = 0;
    }
    this.updateTimer += dt;
    if (this.updateTimer > 0.12) {
      this.emit();
      this.updateTimer = 0;
    }
    this.saveTimer += dt;
    if (this.saveTimer > 15) {
      this.save(false);
      this.saveTimer = 0;
    }
  }
  tick = (dt: number) => {
    this.blockParticles?.update(dt, this.world, {
      enabled: this.settings.particles,
      maxParticles: this.settings.view <= 2 ? 96 : 192,
    });
    this.faceCamera?.update(dt);
    this.avatar?.setFaceTexture(this.faceCamera?.texture ?? null);
    this.net?.tick(dt);
    if (
      !this.net &&
      this.started &&
      !this.preview &&
      !document.hidden &&
      (this.active || ["furnace", "chest", "inventory", "crafting"].includes(this.pauseReason))
    )
      this.adventure.tickFurnaces(dt);
    this.frames++;
    this.frameClock += dt;
    if (this.frameClock > 1) {
      this.fps = Math.round(this.frames / this.frameClock);
      this.frames = 0;
      this.frameClock = 0;
    }
    if (!this.active) {
      if (this.panelPhysicsActive()) this.tickPanelPhysics(dt);
      if (
        this.horrorCaught() ||
        (!this.net && this.difficulty === "horror" && this.horrorHunt?.view("local").length)
      )
        this.updateHorror(dt);
      if (!this.horrorCaught()) this.horror?.clear();
      this.audio.update(0, false, this.world.dimension);
      if (this.avatar) this.avatar.group.visible = false;
      this.atmosphere.tick(
        dt,
        this.clock,
        this.settings,
        this.camera.position,
        this.world.dimension,
        this.world.biome(0, 0),
        () => {},
      );
      if (this.preview)
        for (const m of this.mobs)
          m.update(
            dt,
            this.time,
            new THREE.Vector3(999, 0, 999),
            this.world,
            () => {},
            () => {},
            () => {},
          );
      return;
    }
    if (this.net) this.clock = this.net.clock;
    else if (this.settings.dayCycle) this.clock += (dt * 600) / this.settings.dayDuration;
    else this.clock = Math.floor(this.clock / 600) * 600 + this.settings.timeOfDay * 6;
    if (!this.net) this.fluid.tick(dt);
    this.adventure.tick(dt);
    if (!this.net) this.drops.tick(dt);
    this.swingTime = Math.max(0, this.swingTime - dt);
    if (this.leftDown && this.swingTime <= 0) this.swingTime = SWING_DURATION;
    this.attackCooldown = Math.max(0, this.attackCooldown - dt);
    this.actionCooldown = Math.max(0, this.actionCooldown - dt);
    this.damageTimer -= dt;
    this.damageFlash = Math.max(0, this.damageFlash - dt);
    this.portalCooldown -= dt;
    this.move(dt, !this.needsCapture);
    this.updateHorror(dt);
    if (!this.active) return;
    this.target = this.raycast();
    if (this.target) {
      this.outline.visible = true;
      this.outline.position.set(this.target.x + 0.5, this.target.y + 0.5, this.target.z + 0.5);
    } else this.outline.visible = false;
    if (this.leftDown) this.mine(dt);
    else this.mining = 0;
    if (this.rightDown) this.interact();
    this.cracks.update(this.target, this.mining);
    this.updateHand();
    const here = this.world.get(this.position.x, this.position.y + 1, this.position.z),
      below = this.world.get(this.position.x, this.position.y - 0.05, this.position.z);
    if ((here === 13 || here === 18 || below === 18) && this.portalCooldown <= 0) {
      this.portalTime += dt;
      if (this.portalTime > 1) {
        if (this.world.dimension === "end" && !this.won && this.mode === "survival") {
          this.notify("Pokonaj smoka, aby otworzyć portal powrotny.");
          this.portalCooldown = 3;
        } else
          this.travel(
            here === 13
              ? this.world.dimension === "overworld"
                ? "nether"
                : "overworld"
              : this.world.dimension === "end"
                ? "overworld"
                : "end",
          );
      }
    } else this.portalTime = 0;
    if (!this.net) {
      const observer = this.needsCapture ? undefined : this.playerEyeRay();
      for (const m of this.mobs)
        m.update(
          dt,
          this.time,
          this.position,
          this.world,
          (n) =>
            this.damageFrom(n, m.group.position.clone().add(new THREE.Vector3(0, 1.4, 0)), "mob"),
          this.shootEnemy,
          this.explode,
          observer,
        );
    }
    const alive = this.crystals.filter((c) => c.alive).length;
    if (!this.net) this.dragon?.update(dt, alive, this.position, this.shootEnemy);
    for (const c of this.crystals)
      if (c.alive) {
        c.mesh.rotation.y += dt;
        c.mesh.children[0].rotation.z += dt * 0.5;
      }
    this.updateProjectiles(dt);
    this.updateParticles(dt);
    this.mobTimer += dt;
    if (!this.net && this.mobTimer > 20) {
      this.mobTimer = 0;
      this.mobs = this.mobs.filter((m) => {
        if ((m.dead && m.deathTime > 1.3) || m.group.position.distanceTo(this.position) > 100) {
          this.scene.remove(m.group);
          m.dispose();
          return false;
        }
        return true;
      });
      if (this.mobs.length < 20) {
        const night = this.clock % 600 > 350,
          d = this.world.dimension;
        const kinds: MobKind[] =
          d === "end"
            ? ["enderman"]
            : d === "nether"
              ? ["blaze", "piglin", "ghast"]
              : night
                ? ["zombie", "creeper", "skeleton"]
                : [this.world.biomeInfo(this.position.x, this.position.z).mob as MobKind, "bee"];
        const k = kinds[Math.floor(Math.random() * kinds.length)],
          a = Math.random() * 6.28;
        const m = new Mob(
          k,
          this.position.x + Math.cos(a) * 25,
          this.position.z + Math.sin(a) * 25,
          this.world,
        );
        this.mobs.push(m);
        this.scene.add(m.group);
      }
    }
    if (this.world.dimension === "overworld") {
      const phase = (this.clock % 600) / 600,
        daylight =
          phase < 0.5
            ? 1
            : phase < 0.65
              ? 1 - (phase - 0.5) / 0.15
              : phase < 0.9
                ? 0.08
                : 0.08 + ((phase - 0.9) / 0.1) * 0.92;
      this.sun.intensity = 0.1 + daylight * 2.9;
      this.ambient.intensity = 0.5 + daylight * 1.65;
      const sm = this.sky.material as THREE.ShaderMaterial;
      sm.uniforms.top.value.set("#18283f").lerp(new THREE.Color("#65a9ca"), daylight);
      sm.uniforms.bottom.value.set("#33404c").lerp(new THREE.Color("#dbeddf"), daylight);
      (this.scene.fog as THREE.Fog).color.copy(sm.uniforms.bottom.value);
    }
    this.atmosphere.tick(
      dt,
      this.clock,
      this.settings,
      this.position,
      this.world.dimension,
      this.world.biome(this.position.x, this.position.z),
      () => this.audio.play("thunder"),
    );
    this.audio.music =
      this.settings.music *
      (this.difficulty === "horror" ? 0.18 * (1 - (this.horror?.overlay ?? 0)) : 1);
    this.audio.update(this.atmosphere.wet, true, this.world.dimension);
    this.meshTimer += dt;
    if (this.meshTimer > 0.1) {
      this.ensure(this.position.x, this.position.z);
      this.meshTimer = 0;
    }
    this.saveTimer += dt;
    if (this.saveTimer > 15) {
      this.save(false);
      this.saveTimer = 0;
    }
    this.toastTimer -= dt;
    if (this.toastTimer <= 0) this.toast = "";
    this.updateTimer += dt;
    if (this.updateTimer > 0.12) {
      this.emit();
      this.updateTimer = 0;
    }
  };
  updateHand() {
    const id = this.hotbar[this.selected] ?? 0;
    if (!this.viewArm && this.avatar) {
      this.viewArm = this.avatar.createFirstPersonArm();
      this.hand.add(this.viewArm.group);
    }
    this.avatar?.setHeldItem(id);
    this.viewArm?.setHeldItem(id);
    const swing =
      this.swingTime > 0
        ? handSwing(1 - this.swingTime / SWING_DURATION)
        : { x: 0, y: 0, z: 0, rx: 0, rz: 0 };
    this.hand.rotation.set(0, 0, 0);
    this.hand.position.set(0, 0, 0);
    this.viewArm?.pose(
      swing,
      this.settings.viewBob ? Math.sin(this.time * 3) * 0.008 : 0,
      this.camera.fov,
      this.camera.aspect,
    );
    this.heldId = id;
    this.hand.visible = this.active && this.perspective === 0;
  }
  updateProjectiles(dt: number) {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.life -= dt;
      const steps = Math.ceil((p.velocity.length() * dt) / 0.25);
      let remove = p.life <= 0;
      for (let j = 0; j < steps && !remove; j++) {
        const from = p.mesh.position.clone();
        p.mesh.position.addScaledVector(p.velocity, dt / steps);
        const pos = p.mesh.position;
        if (this.world.solid(pos.x, pos.y, pos.z)) {
          if (!p.enemy) {
            const id = this.world.get(pos.x, pos.y, pos.z);
            if (this.settings?.particles)
              this.blockParticles?.chip(
                id,
                {
                  x: Math.floor(pos.x) + 0.5,
                  y: Math.floor(pos.y) + 0.5,
                  z: Math.floor(pos.z) + 0.5,
                },
                { x: -p.velocity.x, y: -p.velocity.y, z: -p.velocity.z },
              );
            if (
              id === 12 &&
              this.world.dimension === "end" &&
              this.crystals.some((c) => c.alive) &&
              performance.now() - (this.lastPillarHint ?? -Infinity) > 8000
            ) {
              this.lastPillarHint = performance.now();
              this.notify("Strzała trafiła w filar. Odsuń się i celuj ponad jego szczyt.");
            }
          }
          remove = true;
          break;
        }
        if (p.enemy) {
          if (pos.distanceTo(this.position.clone().add(new THREE.Vector3(0, 1, 0))) < 1) {
            this.damage(p.power, "projectile");
            remove = true;
          }
        } else {
          const threat = this.horrorThreat;
          if (
            !this.net &&
            this.difficulty === "horror" &&
            threat &&
            threat.dimension === this.world.dimension
          ) {
            const result = this.horrorHunt.projectileHit(
              {
                huntId: threat.id,
                attackerId: "local",
                damage: p.power,
                from: from.toArray(),
                to: pos.toArray(),
              },
              [this.horrorContext()],
              this.huntEnvironment(),
            );
            if (result.ok) {
              this.audio.play("hit");
              this.horrorThreat = this.horrorHunt.view("local")[0] ?? null;
              remove = true;
              break;
            }
          }
          if (
            this.dragon &&
            !this.dragon.dead &&
            pos.distanceTo(this.dragon.group.position) < 3.8
          ) {
            this.hitDragon(p.power);
            remove = true;
          }
          for (const c of this.crystals)
            if (c.alive && pos.distanceTo(c.mesh.position) < 1.1) {
              this.destroyCrystal(c);
              remove = true;
              break;
            }
          for (const m of this.mobs)
            if (
              !m.dead &&
              pos.distanceTo(m.group.position.clone().add(new THREE.Vector3(0, 1, 0))) <
                m.size + 0.25
            ) {
              this.hitMob(m, p.power);
              remove = true;
              break;
            }
        }
        if (this.world.solid(pos.x, pos.y, pos.z)) remove = true;
      }
      if (!p.enemy) p.velocity.y -= 2.5 * dt;
      if (remove) {
        this.burst(p.mesh.position, p.enemy ? "#e7a55e" : "#cec499", 3);
        this.scene.remove(p.mesh);
        this.projectiles.splice(i, 1);
      }
    }
  }
  updateParticles(dt: number) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      p.velocity.y -= 10 * dt;
      p.mesh.position.addScaledVector(p.velocity, dt);
      p.mesh.rotation.x += dt * 5;
      p.mesh.scale.setScalar(0.1 * Math.max(0, p.life));
      if (p.life <= 0) {
        this.scene.remove(p.mesh);
        this.particles.splice(i, 1);
      }
    }
  }
  applySettings(next: Partial<GameSettings>) {
    const legacy = next.bindings as Partial<GameSettings["bindings"]> | undefined;
    if (legacy && !legacy.drop) {
      next = {
        ...next,
        bindings: {
          ...DEFAULT_BINDINGS,
          ...legacy,
          ...(legacy.eat === "KeyQ" ? { eat: "KeyR" } : {}),
          drop: "KeyQ",
        },
      };
    }
    this.settings = {
      ...DEFAULT_SETTINGS,
      ...this.settings,
      ...next,
      bindings: {
        ...DEFAULT_BINDINGS,
        ...this.settings.bindings,
        ...next.bindings,
      },
    };
    for (const action of Object.keys(DEFAULT_BINDINGS) as Action[]) {
      const binding = this.settings.bindings[action];
      if (typeof binding !== "string" || !binding.trim() || binding.length > 40)
        this.settings.bindings[action] = DEFAULT_BINDINGS[action];
    }
    const clamp = (n: number, lo: number, hi: number, fallback: number) =>
      Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : fallback;
    this.settings.sensitivity = clamp(this.settings.sensitivity, 0.2, 2.5, 1);
    this.settings.view = Math.round(clamp(this.settings.view, 2, 6, 4));
    this.settings.volume = clamp(this.settings.volume, 0, 1, 0.5);
    this.settings.music = clamp(this.settings.music, 0, 1, 0.25);
    this.settings.weatherVolume = clamp(this.settings.weatherVolume, 0, 1, 0.3);
    this.settings.horrorVolume = clamp(this.settings.horrorVolume, 0, 1, 0.65);
    this.settings.horrorJumpscares = this.settings.horrorJumpscares !== false;
    this.settings.resolution = clamp(this.settings.resolution, 0.5, 2, 1.25);
    this.settings.dayDuration = clamp(this.settings.dayDuration, 120, 1800, 600);
    this.settings.fog = clamp(this.settings.fog, 0.5, 1.5, 1);
    this.settings.weatherDensity = clamp(this.settings.weatherDensity, 0.1, 1, 0.8);
    this.radius = this.settings.view;
    this.camera.fov = clamp(this.settings.fov, 50, 100, 72);
    this.camera.updateProjectionMatrix();
    this.renderer.shadowMap.enabled = this.settings.shader !== "off" && !!this.settings.shadows;
    this.audio.volume = this.settings.volume;
    this.audio.music = this.settings.music;
    this.audio.weatherVolume = this.settings.weatherVolume;
    this.atmosphere?.configure(this.settings);
    try {
      localStorage.setItem("blockland.settings", JSON.stringify(this.settings));
    } catch {}
    this.emit();
  }
  async reloadSkin() {
    const generation = ++this.skinGeneration;
    const data = await readSkin();
    if (!this.running || generation !== this.skinGeneration) return;
    this.viewArm?.dispose();
    this.viewArm = null;
    if (this.avatar) {
      this.scene.remove(this.avatar.group);
      this.avatar.dispose();
    }
    this.avatar = new SkinModel(data);
    this.avatar.setFaceTexture(this.faceCamera?.texture ?? null);
    this.avatar.group.visible = false;
    this.scene.add(this.avatar.group);
    this.heldId = -1;
  }
  skinChanged = () => {
    void this.reloadSkin();
  };
  wakeWater() {
    this.fluid.clear();
    const prefix = this.world.dimension + ":";
    for (const key of Object.keys(this.world.waterLevels)) {
      if (key.startsWith(prefix)) {
        const [x, y, z] = key.slice(prefix.length).split(",").map(Number);
        if (Math.abs(x - this.position.x) < 80 && Math.abs(z - this.position.z) < 80)
          this.fluid.wake(x, y, z);
      }
    }
  }

  lastSaveJson = "";
  save(show = true) {
    if (!this.started) return;
    if (this.net) {
      this.net.sendProfile();
      if (show) this.notify("Postęp przesłany na serwer.");
      return;
    }
    try {
      const data = {
        v: 1,
        seed: this.world.seed,
        mode: this.mode,
        difficulty: this.difficulty,
        horror: this.difficulty === "horror" ? this.horrorDirector.save() : undefined,
        dimension: this.world.dimension,
        position: this.position.toArray(),
        yaw: this.yaw,
        pitch: this.pitch,
        adventure: this.adventure.data,
        edits: this.world.edits,
        waterLevels: this.world.waterLevels,
        inventory: this.inventory,
        pack: this.pack.snapshot(),
        drops: this.drops.save(),
        hotbar: this.hotbar,
        health: this.health,
        food: this.food,
        xp: this.xp,
        clock: this.clock,
        won: this.won,
        crystals: this.crystalsDestroyed,
        dragon: this.dragon?.hp ?? this.dragonHealth,
        dragonMaxHealth: DRAGON_MAX_HEALTH,
        visited: this.visited,
        mined: this.mined,
        placed: this.placed,
      };
      this.lastSaveJson = JSON.stringify(data);
      localStorage.setItem(SAVE_KEY, this.lastSaveJson);
      this.saveAvailable = true;
      if (show) this.notify("Świat zapisany w tej przeglądarce.");
    } catch {
      this.notify("Brak miejsca na zapis. Wyeksportuj świat do pliku.");
    }
  }
  load() {
    try {
      const s = JSON.parse(localStorage.getItem(SAVE_KEY) ?? "null");
      if (!s || s.v !== 1) throw new Error("Nieprawidłowy zapis");
      this.restore(s);
      return true;
    } catch {
      this.notify("Nie udało się odczytać zapisu. Rozpocznij nowy świat.");
      return false;
    }
  }
  restore(s: SavedGame) {
    this.fallDistance = 0;
    this.resetHorrorHunt();
    this.deathHandled = false;
    if (
      s.v !== 1 ||
      !["overworld", "nether", "end"].includes(s.dimension) ||
      !Array.isArray(s.position) ||
      s.position.length !== 3 ||
      !s.position.every((n: unknown) => typeof n === "number" && Number.isFinite(n))
    )
      throw new Error("Nieprawidłowy zapis");
    this.clearDynamic();
    this.mode = s.mode === "creative" ? "creative" : "survival";
    this.difficulty = normalizeDifficulty(s.difficulty);
    this.horrorDirector = new HorrorDirector(Number(s.seed) || 24680);
    if (this.difficulty === "horror" && s.horror) this.horrorDirector.restore(s.horror);
    this.hungerTimer = this.regenerationTimer = 0;
    this.world.seed = Number(s.seed) || 24680;
    this.world.edits = typeof s.edits === "object" && s.edits ? s.edits : {};
    for (const key of Object.keys(this.world.edits))
      if (!BLOCKS[this.world.edits[key]] || !/^(overworld|nether|end):-?\d+,\d+,-?\d+$/.test(key))
        delete this.world.edits[key];
    this.world.waterLevels = {};
    for (const [key, n] of Object.entries(s.waterLevels ?? {}))
      if (
        typeof n === "number" &&
        Number.isInteger(n) &&
        n >= 0 &&
        n <= 8 &&
        /^(overworld|nether|end):-?\d+,\d+,-?\d+$/.test(key)
      )
        this.world.waterLevels[key] = n;
    this.fluid.clear();
    this.world.switch(s.dimension);
    this.dimensionChanged();
    this.position.fromArray(s.position);
    this.ensure(this.position.x, this.position.z, true);
    this.yaw = Number(s.yaw) || 0;
    this.pitch = Math.max(-1.54, Math.min(1.54, Number(s.pitch) || 0));
    this.pack.reset();
    this.inventory = {};
    for (const [id, n] of Object.entries(s.inventory ?? {}))
      if (
        (BLOCKS[Number(id)] || ITEMS.some((i) => i.id === Number(id))) &&
        typeof n === "number" &&
        Number.isFinite(n)
      )
        this.inventory[Number(id)] = Math.max(0, Math.floor(n));
    this.hotbar =
      Array.isArray(s.hotbar) && s.hotbar.length === 9
        ? s.hotbar.map((id: number) => (BLOCKS[id] || ITEMS.some((i) => i.id === id) ? id : 1))
        : [101, 104, 8, 9, 48, 105, 113, 107, 106];
    if (s.pack) {
      this.pack.restore(s.pack);
      this.inventory = this.pack.counts();
    } else {
      for (let i = 0; i < 9; i++) {
        const id = this.hotbar[i],
          n = Math.min(this.inventory[id] ?? 0, id >= 101 ? 1 : 64);
        if (id && n) {
          this.pack.slots[i] = { id, n };
        }
      }
      this.syncPack();
    }
    this.hotbar = this.pack.slots.slice(0, 9).map((s) => s?.id ?? 0);
    this.drops.restore(s.drops);
    this.health = Math.max(1, Math.min(20, Number(s.health) || 20));
    this.food = Math.max(0, Math.min(20, Number(s.food) || 0));
    this.xp = Number(s.xp) || 0;
    this.clock = Number(s.clock) || 90;
    this.won = !!s.won;
    this.crystalsDestroyed = Array.isArray(s.crystals)
      ? s.crystals.filter((n: number) => Number.isInteger(n) && n >= 0 && n < 8)
      : [];
    this.dragonHealth = restoreDragonHealth(s.dragon, s.dragonMaxHealth, !!s.won);
    this.visited = Array.isArray(s.visited)
      ? s.visited.filter((v: string) => ["overworld", "nether", "end"].includes(v))
      : ["overworld"];
    this.mined = Number(s.mined) || 0;
    this.placed = Number(s.placed) || 0;
    this.adventure.restore(s.adventure);
    this.spawnMobs();
    if (s.dimension === "end") this.spawnDragon();
    this.velocity.set(0, 0, 0);
    this.portalCooldown = 4;
    this.oxygen = 20;
    this.wakeWater();
  }
  exportWorld() {
    if (this.net) {
      this.notify("Wspólny świat zapisuje się na serwerze.");
      return;
    }
    this.save(false);
    const json = this.lastSaveJson;
    if (!json) return;
    const url = URL.createObjectURL(new Blob([json], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "blockland-world.json";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  importWorld(text: string) {
    if (this.net) {
      this.notify("Odłącz się od serwera, aby importować świat jednoosobowy.");
      return false;
    }
    try {
      const data = JSON.parse(text);
      this.restore(data);
      this.started = true;
      this.preview = false;
      this.save(false);
      this.pause();
      this.notify("Świat wczytany. Możesz kontynuować przygodę.");
      return true;
    } catch {
      this.notify("Ten plik nie jest poprawnym zapisem Blockland.");
      return false;
    }
  }
  keyDown = (e: KeyboardEvent) => {
    if (this.horrorCaught()) return;
    const target = e.target as HTMLElement;
    if (target?.matches?.("input,textarea,select") || target?.closest?.('[contenteditable="true"]'))
      return;
    const action = (Object.keys(this.settings.bindings ?? DEFAULT_BINDINGS) as Action[]).find(
      (a) => (this.settings.bindings?.[a] ?? DEFAULT_BINDINGS[a]) === e.code,
    );
    if (!this.active) {
      const matching =
        action === this.pauseReason ||
        (action === "inventory" && ["crafting", "chest", "furnace"].includes(this.pauseReason));
      if (
        this.started &&
        !this.preview &&
        this.health > 0 &&
        !e.repeat &&
        (e.code === "Escape" || matching)
      ) {
        e.preventDefault();
        e.stopPropagation?.();
        this.resume();
      }
      return;
    }
    if (e.code === "Escape" && !e.repeat) {
      e.preventDefault();
      e.stopPropagation?.();
      this.pause();
      return;
    }
    if (this.net && ["Enter", "KeyT"].includes(e.code) && !e.repeat) {
      e.preventDefault();
      this.pause("chat");
      return;
    }
    if (action && ["journal", "inventory", "dimensions", "help"].includes(action)) {
      e.preventDefault();
      if (!e.repeat) this.pause(action);
      return;
    }
    if (this.needsCapture) return;
    if (!action) return;
    e.preventDefault();
    const movement: Partial<Record<Action, string>> = {
      forward: "KeyW",
      back: "KeyS",
      left: "KeyA",
      right: "KeyD",
      jump: "Space",
      sneak: "ShiftLeft",
      sprint: "ControlLeft",
    };
    if (movement[action]) this.keys.add(movement[action]!);
    if (e.repeat) return;
    const now = performance.now();
    if (action === "forward") {
      if (this.settings.doubleTapSprint && now - this.lastForward < 300) this.sprinting = true;
      this.lastForward = now;
    }
    if (action === "fly" && this.mode === "creative") {
      this.flying = !this.flying;
      this.velocity.y = 0;
      this.notify(this.flying ? "Latanie włączone" : "Latanie wyłączone");
    }
    if (action === "perspective") {
      this.perspective = (this.perspective + 1) % 3;
      this.heldId = -1;
    }
    if (action === "eat") this.eat();
    if (action === "drop") this.dropSelected(e.ctrlKey);
    if (action.startsWith("slot")) this.select(Number(action.slice(4)) - 1);
    if (action === "jump") {
      if (this.mode === "creative" && now - this.lastSpace < 280) {
        this.flying = !this.flying;
        this.velocity.y = 0;
      }
      this.lastSpace = now;
    }
  };
  keyUp = (e: KeyboardEvent) => {
    const movement: Partial<Record<Action, string>> = {
      forward: "KeyW",
      back: "KeyS",
      left: "KeyA",
      right: "KeyD",
      jump: "Space",
      sneak: "ShiftLeft",
      sprint: "ControlLeft",
    };
    for (const [action, key] of Object.entries(movement))
      if (
        (this.settings.bindings?.[action as Action] ?? DEFAULT_BINDINGS[action as Action]) ===
        e.code
      ) {
        this.keys.delete(key);
        if (action === "forward") this.sprinting = false;
      }
  };

  mouseMove = (e: MouseEvent) => {
    if (
      this.horrorCaught() ||
      !this.active ||
      (
        e as MouseEvent & {
          sourceCapabilities?: { firesTouchEvents?: boolean };
        }
      ).sourceCapabilities?.firesTouchEvents
    )
      return;
    if (document.pointerLockElement === this.canvas) {
      const motion = this.pointerMotion?.sample(e, performance.now());
      if (!motion) return;
      this.yaw -= motion.x * 0.0022 * this.settings.sensitivity;
      this.pitch = Math.max(
        -1.54,
        Math.min(
          1.54,
          this.pitch -
            motion.y * 0.0022 * this.settings.sensitivity * (this.settings.invertY ? -1 : 1),
        ),
      );
    } else if (this.dragLook && this.lastDrag) {
      this.yaw -= (e.clientX - this.lastDrag.x) * 0.004;
      this.pitch = Math.max(
        -1.54,
        Math.min(
          1.54,
          this.pitch - (e.clientY - this.lastDrag.y) * 0.004 * (this.settings.invertY ? -1 : 1),
        ),
      );
      this.lastDrag = { x: e.clientX, y: e.clientY };
    }
  };
  pointerLock = () => {
    if (document.pointerLockElement === this.canvas) {
      if (!this.active) {
        document.exitPointerLock();
        return;
      }
      this.needsCapture = false;
      this.lockPending = false;
      this.dragLook = false;
      (this.pointerMotion ??= new PointerMotion()).lock(performance.now());
      this.emit();
    } else {
      this.pointerMotion?.reset();
      if (this.active) {
        this.needsCapture = true;
        if (!this.lockPending && performance.now() - this.captureSince > 300) this.pause();
        else this.emit();
      }
    }
  };
  mouseDown = (e: MouseEvent) => {
    if (
      this.horrorCaught() ||
      !this.active ||
      (
        e as MouseEvent & {
          sourceCapabilities?: { firesTouchEvents?: boolean };
        }
      ).sourceCapabilities?.firesTouchEvents
    )
      return;
    // Opening a dialog releases pointer lock before Chrome dispatches contextmenu;
    // its target can therefore be the new dialog, an input, or even the body.
    if (e.button === 2) this.canvasContextUntil = performance.now() + 1000;
    if (document.pointerLockElement !== this.canvas) {
      this.capturePointer(true);
      e.preventDefault();
      return;
    }
    e.preventDefault();
    if (this.dragLook && e.button === 0) this.lastDrag = { x: e.clientX, y: e.clientY };
    if (e.button === (this.settings.swapMouse ? 2 : 0)) {
      this.leftDown = true;
      if (
        !this.attack() &&
        this.target &&
        miningDuration(this.target.id, this.hotbar[this.selected]) === 0
      )
        this.mine(0);
    }
    if (e.button === (this.settings.swapMouse ? 0 : 2)) {
      this.rightDown = true;
      this.interact();
    }
    if (e.button === 1 && this.target && this.mode === "creative") this.equip(this.target.id);
  };
  mouseUp = () => {
    this.leftDown = false;
    this.rightDown = false;
    this.lastDrag = null;
    this.mining = 0;
  };
  contextMenu = (e: Event) => {
    const fromCanvas = performance.now() <= (this.canvasContextUntil || 0);
    this.canvasContextUntil = 0;
    if (fromCanvas) {
      e.preventDefault();
      return;
    }
    const target = e.target as Element | null;
    if (target?.closest?.('input,textarea,[contenteditable]:not([contenteditable="false"])'))
      return;
    if (
      target === this.canvas ||
      target?.closest?.(".game-root,.game-dialog,.mc-inventory,.chest-inventory")
    )
      e.preventDefault();
  };
  wheel = (e: WheelEvent) => {
    if (!this.active || this.horrorCaught()) return;
    e.preventDefault();
    this.select(this.selected + (e.deltaY > 0 ? 1 : -1));
  };
  touchStart = (e: TouchEvent) => {
    if (!this.active || this.horrorCaught()) return;
    e.preventDefault();
    if (this.touchLook) return;
    const t = e.changedTouches[0];
    if (!t) return;
    this.touchLook = { id: t.identifier, x: t.clientX, y: t.clientY };
  };
  touchMove = (e: TouchEvent) => {
    if (!this.active || !this.touchLook || this.horrorCaught()) return;
    e.preventDefault();
    const t = Array.from(e.touches).find((t) => t.identifier === this.touchLook?.id);
    if (t) {
      this.yaw -= (t.clientX - this.touchLook.x) * 0.005 * this.settings.sensitivity;
      this.pitch = Math.max(
        -1.54,
        Math.min(
          1.54,
          this.pitch -
            (t.clientY - this.touchLook.y) *
              0.005 *
              this.settings.sensitivity *
              (this.settings.invertY ? -1 : 1),
        ),
      );
      this.touchLook = { id: t.identifier, x: t.clientX, y: t.clientY };
    }
  };
  touchEnd = (e: TouchEvent) => {
    if (Array.from(e.changedTouches).some((t) => t.identifier === this.touchLook?.id))
      this.touchLook = null;
  };
  blur = () => {
    if (this.active) this.pause();
  };
  beforeUnload = () => this.save(false);
  override dispose() {
    this.resetHorrorHunt();
    this.save(false);
    this.net?.close();
    this.net = null;
    this.voice.close();
    this.faceCamera.dispose();
    document.removeEventListener("keydown", this.keyDown, true);
    document.removeEventListener("keyup", this.keyUp);
    document.removeEventListener("mousemove", this.mouseMove);
    document.removeEventListener("pointerlockchange", this.pointerLock);
    document.removeEventListener("contextmenu", this.contextMenu, true);
    this.canvasContextUntil = 0;
    window.removeEventListener("blur", this.blur);
    window.removeEventListener("beforeunload", this.beforeUnload);
    window.removeEventListener("mouseup", this.mouseUp);
    window.removeEventListener("blockland-skin", this.skinChanged);
    this.skinGeneration++;
    this.horror?.dispose();
    this.audio.dispose();
    this.atmosphere.dispose();
    this.renderScene = undefined;
    this.viewArm?.dispose();
    this.viewArm = null;
    this.avatar?.dispose();
    this.clearDynamic();
    this.blockParticles?.dispose();
    this.cracks.dispose();
    this.drops.clear();
    disposeEntityMaterials();
    super.dispose();
  }
}
