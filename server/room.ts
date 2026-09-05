import * as THREE from "three";
import { weapon, miningDuration } from "../lib/combat";
import { harvestAllowed, isMineableBlock, minedResource } from "../lib/mining";
import {
  ARMOR_SLOTS,
  normalizeEquipment,
  armorMultiplier,
  clickArmorSlot,
  equipArmorItem,
  migrateEquipment,
  type Equipment,
  type ArmorSlot,
} from "../lib/armor";
import { fromCounts, chestCounts, clickStack, type ChestSlots } from "../lib/chest-slots";
import { InventoryPack, maxStack } from "../lib/inventory";
import type { Stack } from "../lib/inventory";
import { applyCraftResult, applyInventoryGesture, validGesture } from "../lib/inventory-gestures";
import {
  createFurnace,
  restoreFurnace,
  tickFurnace,
  furnaceRecipe,
  type FurnaceState,
} from "../lib/furnace";
import { World, hash } from "../lib/world";
import { FluidSystem } from "../lib/fluid";
import { BLOCKS, ITEMS, type Dimension } from "../lib/blocks";
import { Mob, Dragon, type MobKind } from "../lib/entities";
import { DRAGON_MAX_HEALTH, restoreDragonHealth } from "../lib/dragon-balance";
import { ignitePortal } from "../lib/portals";
import {
  DIFFICULTIES,
  normalizeDifficulty,
  difficultyRules,
  type Difficulty,
} from "../lib/difficulty";
import { HorrorDirector, type HorrorContext, type HorrorEvent } from "../lib/horror-director";
import { placeHorrorEvent } from "../lib/horror-placement";
import { HorrorHunt, type HuntSignal } from "../lib/horror-hunt";
import { createHuntEnvironment } from "../lib/horror-terrain";
import {
  DIMENSIONS_NET,
  MAX_PLAYERS,
  validNick,
  validVec,
  validFaceFrame,
  FACE_FRAME_INTERVAL,
  FACE_FRAME_TIMEOUT,
  FACE_ROOM_FRAME_BUDGET,
  type Vec,
  type PlayerWire,
  type MobWire,
  type DropWire,
  type BlockWire,
  type FrameWire,
  type Command,
} from "../lib/net-protocol";
type Player = PlayerWire & {
  profile: Record<string, unknown>;
  lastAction: number;
  health: number;
  hurtUntil: number;
  responses: Record<string, unknown>;
  stamina: number;
  spawnUntil: number;
  blockUntil: number;
  blocking: boolean;
  grounded: boolean;
  armor: number;
  equipment: Equipment;
  healed: number;
  lastChat: number;
  difficulty: Difficulty;
  active: boolean;
  sprinting: boolean;
  hungerClock: number;
  pvpUntil: number;
};
type Region = {
  world: World;
  fluid: FluidSystem;
  mobs: Map<string, Mob>;
  populated: Set<string>;
  crops: Record<string, number>;
};
type Shot = {
  p: THREE.Vector3;
  v: THREE.Vector3;
  dimension: Dimension;
  owner: string;
  life: number;
  power?: number;
};
type PendingDrop = Pick<DropWire, "dimension" | "id" | "n" | "p" | "v">;
const vec = (p: Vec) => new THREE.Vector3(...p);
const round = (n: number) => Math.round(n * 1000) / 1000;
const array = (p: THREE.Vector3) => p.toArray().map(round) as Vec;
const mobFields = [
  "hp",
  "elapsed",
  "gait",
  "walkBlend",
  "heading",
  "attackClock",
  "hurt",
  "fuse",
  "deathTime",
  "timer",
] as const;
export class Room {
  seed = 24680;
  clock = 90;
  private restoredProvocationsUntil = 0;
  private restoredProvocations = new Set<string>();
  tickId = 0;
  sequence = 0;
  won = false;
  crystals: number[] = [];
  players = new Map<string, Player>();
  regions = new Map<Dimension, Region>();
  changes = new Map<string, BlockWire>();
  storage: Record<string, Record<number, number>> = {};
  slots: Record<string, ChestSlots> = {};
  chestRevisions: Record<string, number> = {};
  furnaces: Record<string, FurnaceState> = {};
  furnaceRevisions: Record<string, number> = {};
  furnaceViewers = new Map<string, string>();
  dirtyFurnaces = new Set<string>();
  chat: { nick: string; text: string; time: number; system?: boolean }[] = [];
  drops: DropWire[] = [];
  pendingDrops: PendingDrop[] = [];
  facePeers = new Map<string, { seen: number; sent: number; viewers: Set<string> }>();
  shots: Shot[] = [];
  dragon = new Dragon();
  horror = new HorrorDirector(this.seed);
  horrorHunt = new HorrorHunt();
  huntViewers = new Set<string>();
  huntEnvironment = createHuntEnvironment(
    (dimension) => this.region(dimension).world,
    (dimension, x, z) => {
      this.ensure(dimension, x, z, 0);
    },
  );
  constructor(
    public send: (id: string, data: unknown) => void,
    public now = () => Date.now(),
  ) {
    for (const dimension of DIMENSIONS_NET) {
      const world = new World(this.seed);
      world.dimension = dimension;
      const fluid = new FluidSystem(world);
      const wake = world.onEdit!;
      world.onEdit = (x, y, z) => {
        wake(x, y, z);
        const key = dimension + ":" + [x, y, z];
        if (world.get(x, y, z) !== 29 && this.furnaces[key]) this.removeFurnace(key);
        this.changes.set(key, [
          dimension,
          x,
          y,
          z,
          world.get(x, y, z),
          world.waterLevels[key] ?? -1,
        ]);
      };
      this.regions.set(dimension, {
        world,
        fluid,
        mobs: new Map(),
        populated: new Set(),
        crops: {},
      });
    }
  }
  region(d: Dimension) {
    return this.regions.get(d)!;
  }
  ensure(d: Dimension, x: number, z: number, r = 1) {
    const w = this.region(d).world,
      cx = Math.floor(x / 16),
      cz = Math.floor(z / 16);
    for (let a = -r; a <= r; a++) for (let b = -r; b <= r; b++) w.chunk(cx + a, cz + b);
    return w;
  }
  reply(p: Player, c: Command, data: Record<string, unknown> = {}) {
    const response = { type: "result", req: c.req, ...data };
    if (data.ok) {
      const inv = { ...((p.profile.inventory ?? {}) as Record<number, number>) };
      for (const [id, n] of (data.cost ?? []) as number[][])
        inv[id] = Math.max(0, (inv[id] ?? 0) - n);
      for (const [id, n] of (data.grant ?? []) as number[][]) inv[id] = (inv[id] ?? 0) + n;
      for (const [id, delta] of (data.inventoryDelta ?? []) as number[][])
        inv[id] = Math.max(0, (inv[id] ?? 0) + delta);
      const pack = new InventoryPack();
      if (p.profile.pack) pack.restore(p.profile.pack as any);
      for (const extra of pack.reconcile(inv, Number(p.profile.selected) || 0)) {
        this.drop(p.dimension, extra.id, extra.n, [p.p[0], p.p[1] + 0.7, p.p[2]]);
        inv[extra.id] -= extra.n;
      }
      p.profile.inventory = pack.counts();
      p.profile.pack = pack.snapshot();
      p.profile.inventoryRevision = (Number(p.profile.inventoryRevision) || 0) + 1;
      (response as any).pack = pack.snapshot();
    }
    (response as any).inventoryRevision = Number(p.profile.inventoryRevision) || 0;
    (response as any).equipment = { ...p.equipment };
    if (data.chest) {
      const chest = data.chest as { key: string };
      (response as any).chest = { ...chest, revision: this.chestRevisions[chest.key] ?? 0 };
    }
    if (data.furnace) {
      const furnace = data.furnace as { key: string };
      (response as any).furnace = { ...furnace, revision: this.furnaceRevisions[furnace.key] ?? 0 };
    }
    if (!data.ok && ["inventoryGesture", "settleInventory", "armor", "equipArmor"].includes(c.type))
      (response as any).pack = p.profile.pack;
    const snapshot = structuredClone(response);
    p.responses[c.req] = snapshot;
    const keys = Object.keys(p.responses);
    if (keys.length > 100) delete p.responses[keys[0]];
    this.send(p.id, snapshot);
  }
  join(id: string, nick: string, skin: PlayerWire["skin"], difficulty?: unknown) {
    if (!validNick(nick))
      return this.send(id, {
        type: "error",
        fatal: true,
        message: "Nick: 3–20 liter, cyfr, znaków _ lub -.",
      });
    const active = [...this.players.values()].filter((p) => this.now() - p.seen < 12000);
    if (active.some((p) => p.id !== id && p.nick.toLocaleLowerCase() === nick.toLocaleLowerCase()))
      return this.send(id, {
        type: "error",
        fatal: true,
        message: "Ten nick jest zajęty. Wybierz inny.",
      });
    if (!active.some((p) => p.id === id) && active.length >= MAX_PLAYERS)
      return this.send(id, {
        type: "error",
        fatal: true,
        message: "Serwer jest pełny. Spróbuj za chwilę.",
      });
    let p = this.players.get(id);
    if (!p) {
      const w = this.ensure("overworld", 8, 22);
      p = {
        id,
        nick,
        p: [8.5, w.surface(8, 22) + 0.05, 22.5],
        yaw: 0.22,
        pitch: 0,
        dimension: "overworld",
        moving: false,
        crouch: false,
        swing: false,
        held: 0,
        seen: this.now(),
        profile: { difficulty: normalizeDifficulty(difficulty), food: 20 },
        difficulty: normalizeDifficulty(difficulty),
        active: false,
        sprinting: false,
        hungerClock: 0,
        pvpUntil: 0,
        lastAction: 0,
        health: 20,
        hurtUntil: 0,
        responses: {},
        stamina: 100,
        spawnUntil: this.now() + 8000,
        blockUntil: 0,
        blocking: false,
        grounded: true,
        armor: 0,
        equipment: normalizeEquipment(null),
        healed: 0,
        lastChat: 0,
      };
      this.players.set(id, p);
    }
    p.nick = nick;
    p.skin = skin;
    p.seen = this.now();
    this.restoredProvocations.delete(id);
    const selectedDifficulty = normalizeDifficulty(
      difficulty,
      normalizeDifficulty(p.profile.difficulty),
    );
    if (selectedDifficulty !== p.difficulty) this.horror.reset(id);
    p.difficulty = selectedDifficulty;
    p.profile.difficulty = selectedDifficulty;
    p.active = false;
    p.profile.equipment = { ...p.equipment };
    this.send(id, {
      type: "welcome",
      id,
      seed: this.seed,
      player: this.publicPlayer(p),
      profile: p.profile,
      health: p.health,
      clock: this.clock,
      edits: this.edits(),
      water: this.water(),
      crystals: this.crystals,
      won: this.won,
      dragon: this.dragon.hp,
      horrorClock: this.horror.elapsed,
    });
    this.send(id, { type: "history", messages: this.chat });
  }
  publicPlayer(p: Player): PlayerWire {
    return {
      id: p.id,
      nick: p.nick,
      p: p.p,
      yaw: p.yaw,
      pitch: p.pitch,
      dimension: p.dimension,
      moving: p.moving,
      crouch: p.crouch,
      swing: p.swing,
      swingProgress: p.swingProgress,
      held: p.held,
      seen: p.seen,
      health: p.health,
      difficulty: p.difficulty,
      equipment: { ...p.equipment },
    };
  }
  clearFace(id: string) {
    const previous = this.facePeers.get(id);
    if (previous?.viewers.size)
      this.send("*", {
        type: "faceFrame",
        sender: id,
        frame: null,
        viewers: [...previous.viewers],
        cleared: [],
      });
    this.facePeers.delete(id);
  }
  pruneFaces() {
    for (const [id, face] of this.facePeers) {
      const player = this.players.get(id);
      if (
        !player ||
        player.health <= 0 ||
        this.now() - player.seen > 12000 ||
        this.now() - face.seen > FACE_FRAME_TIMEOUT
      )
        this.clearFace(id);
    }
  }
  faceFrame(id: string, frame: unknown) {
    const player = this.players.get(id);
    if (!player || !validFaceFrame(frame)) return;
    if (frame === null || player.health <= 0 || this.now() - player.seen > 12000) {
      this.clearFace(id);
      return;
    }
    const now = this.now(),
      previous = this.facePeers.get(id) ?? {
        seen: now,
        sent: -Infinity,
        viewers: new Set<string>(),
      };
    previous.seen = now;
    this.facePeers.set(id, previous);
    // 3 FPS for small groups; about 18 relayed frames/s across a crowded public room.
    const interval = Math.max(
      FACE_FRAME_INTERVAL * 1000,
      (this.facePeers.size * 1000) / FACE_ROOM_FRAME_BUDGET,
    );
    if (now - previous.sent + 1 < interval) return;
    previous.sent = now;
    const viewers = new Set(
      [...this.players.values()]
        .filter(
          (other) =>
            other.id !== id &&
            other.health > 0 &&
            this.now() - other.seen < 12000 &&
            other.dimension === player.dimension &&
            vec(other.p).distanceToSquared(vec(player.p)) <= 60 * 60,
        )
        .map((other) => other.id),
    );
    const cleared = [...previous.viewers].filter((viewer) => !viewers.has(viewer));
    previous.viewers = viewers;
    if (viewers.size || cleared.length)
      this.send("*", {
        type: "faceFrame",
        sender: id,
        frame: viewers.size ? frame : null,
        viewers: [...viewers],
        cleared,
      });
  }
  input(id: string, m: Record<string, unknown>) {
    const p = this.players.get(id);
    if (!p) return;
    if (
      validVec(m.p) &&
      m.p[1] > -100 &&
      m.p[1] < 200 &&
      DIMENSIONS_NET.includes(m.dimension as Dimension)
    ) {
      p.p = m.p;
      p.dimension = m.dimension as Dimension;
      p.yaw = Number.isFinite(m.yaw) ? Number(m.yaw) : 0;
      p.pitch = Math.max(-1.54, Math.min(1.54, Number(m.pitch) || 0));
      if (
        p.active &&
        m.active !== true &&
        p.difficulty === "horror" &&
        !this.horrorHunt.view(id).some((hunt) => hunt.phase === "caught")
      )
        this.send(id, { type: "horrorReset" });
      p.active = m.active === true;
      p.moving = p.active && !!m.moving;
      if (m.furnaceKey === null) this.furnaceViewers.delete(id);
      else if (
        typeof m.furnaceKey === "string" &&
        this.furnaces[m.furnaceKey] &&
        this.furnaceInReach(p, m.furnaceKey)
      )
        this.furnaceViewers.set(id, m.furnaceKey);
      p.sprinting = p.active && m.sprinting === true;
      p.crouch = p.active && !!m.crouch;
      p.swing = p.active && !!m.swing;
      p.swingProgress = p.swing ? Math.max(0, Math.min(1, Number(m.swingProgress) || 0)) : -1;
      p.held =
        Number.isInteger(m.held) && (BLOCKS[Number(m.held)] || ITEMS.some((i) => i.id === m.held))
          ? Number(m.held)
          : 0;
      if (p.held > 0 && !this.owns(p, p.held)) p.held = 0;
      p.blocking = p.active && !!m.blocking && p.held === 126;
      p.grounded = !!m.grounded;
      // Equipment is changed only by atomic inventory commands, never by input metadata.
      p.armor = p.equipment.chest;
      p.seen = this.now();
      this.ensure(p.dimension, p.p[0], p.p[2]);
    }
  }
  profile(id: string, m: Record<string, unknown>) {
    const p = this.players.get(id);
    if (!p || !m || typeof m !== "object" || JSON.stringify(m).length > 24000) return;
    const inventory = (p.profile.inventory ?? {}) as Record<number, number>;
    const revision = Number(p.profile.inventoryRevision) || 0;
    let pack = p.profile.pack;
    if (m.pack && typeof m.pack === "object" && (m.inventoryRevision ?? 0) === revision) {
      const candidate = new InventoryPack();
      candidate.restore(m.pack as any);
      const counts = candidate.counts();
      const keys = new Set([...Object.keys(counts), ...Object.keys(inventory)]);
      if ([...keys].every((k) => (counts[Number(k)] ?? 0) === (inventory[Number(k)] ?? 0)))
        pack = candidate.snapshot();
    }
    const health = p.health;
    const food = Number.isFinite(p.profile.food) ? Number(p.profile.food) : 20;
    p.profile = {
      ...m,
      inventory,
      pack,
      inventoryRevision: revision,
      lastMine: p.profile.lastMine,
      difficulty: p.difficulty,
      food,
      equipment: { ...p.equipment },
    };
    // Profile packets can contain old health from before regeneration or an ACK.
    // Only an explicit, deduplicated environmentDamage command may report local hazards.
    p.profile.health = health;
  }
  owns(p: Player, id: number, n = 1) {
    return (
      Number.isInteger(n) &&
      n > 0 &&
      (((p.profile.inventory ?? {}) as Record<number, number>)[id] ?? 0) >= n
    );
  }
  command(id: string, c: Command) {
    const p = this.players.get(id);
    if (!p || typeof c.req !== "string" || c.req.length > 80) return;
    if (p.responses[c.req]) {
      this.send(id, p.responses[c.req]);
      return;
    }
    const reject = (message: string) => this.reply(p, c, { ok: false, message });
    if (c.type === "difficulty") {
      if (!DIFFICULTIES.includes(c.difficulty as Difficulty))
        return reject("Nieprawidłowa trudność.");
      p.difficulty = normalizeDifficulty(c.difficulty);
      p.profile.difficulty = p.difficulty;
      this.horror.reset(id);
      this.horrorHunt.reset(id);
      this.broadcastHunts();
      this.send(id, { type: "horrorReset" });
      return this.reply(p, c, { ok: true, difficulty: p.difficulty });
    }
    if (c.type === "respawn") {
      if (p.health > 0) return reject("Postać jeszcze żyje.");
      p.health = 20;
      p.stamina = 100;
      p.spawnUntil = this.now() + 8000;
      p.hurtUntil = this.now() + 3000;
      p.profile = { ...p.profile, inventory: {}, pack: undefined };
      p.equipment = normalizeEquipment(null);
      p.profile.equipment = { ...p.equipment };
      p.armor = 0;
      p.profile.food = 20;
      p.hungerClock = 0;
      this.horror.reset(id);
      this.horrorHunt.reset(id);
      this.broadcastHunts();
      this.send(id, { type: "horrorReset" });
      return this.reply(p, c, { ok: true, health: 20 });
    }
    if (c.type === "heal") {
      const rules = difficultyRules(p.pvpUntil > this.now() ? "normal" : p.difficulty);
      if (this.now() - p.healed < rules.regenerationSeconds * 1000 || Number(p.profile.food) < 14)
        return reject("Regeneracja wymaga jedzenia.");
      p.healed = this.now();
      p.health = Math.min(20, p.health + rules.regenerationAmount);
      return this.reply(p, c, { ok: true, health: p.health });
    }
    if (p.health <= 0) return reject("Najpierw odrodź postać.");
    if (c.type === "armor" || c.type === "equipArmor") {
      const revision = Number(p.profile.inventoryRevision) || 0;
      if (c.baseRevision !== revision) return reject("Ekwipunek się zmienił. Spróbuj ponownie.");
      const pack = new InventoryPack();
      pack.restore((p.profile.pack ?? {}) as any);
      pack.reconcile((p.profile.inventory ?? {}) as Record<number, number>);
      const equipment = { ...p.equipment };
      if (c.type === "armor") {
        if (!ARMOR_SLOTS.includes(c.slot as ArmorSlot))
          return reject("Nieprawidłowe miejsce pancerza.");
        const expected = c.expectedCursor as { id?: unknown; n?: unknown } | null | undefined;
        if (
          expected !== undefined &&
          (expected === null
            ? pack.cursor !== null
            : !pack.cursor || expected.id !== pack.cursor.id || expected.n !== pack.cursor.n)
        )
          return reject("Przedmiot trzymany kursorem się zmienił.");
        if (
          c.expectedEquipped !== undefined &&
          c.expectedEquipped !== equipment[c.slot as ArmorSlot]
        )
          return reject("Pancerz w tym miejscu się zmienił.");
        if (!clickArmorSlot(pack, equipment, c.slot as ArmorSlot))
          return reject("Ten przedmiot nie pasuje do miejsca pancerza.");
      } else {
        const from = c.from as { area: "slots" | "grid"; index: number } | undefined;
        if (
          from !== undefined &&
          (!from ||
            !["slots", "grid"].includes(from.area) ||
            !Number.isInteger(from.index) ||
            from.index < 0 ||
            from.index >= pack[from.area].length)
        )
          return reject("Nieprawidłowe źródło elementu pancerza.");
        if (
          !Number.isInteger(c.id) ||
          !equipArmorItem(
            pack,
            equipment,
            Number(c.id),
            from,
            c.expected as Stack | null | undefined,
          )
        )
          return reject("Nie masz tego elementu pancerza w wybranym miejscu.");
      }
      p.equipment = equipment;
      p.armor = equipment.chest;
      p.profile.equipment = { ...equipment };
      p.profile.pack = pack.snapshot();
      p.profile.inventory = pack.counts();
      return this.reply(p, c, { ok: true });
    }
    if (c.type === "environmentDamage") {
      if (
        !["fall", "lava", "drowning", "void"].includes(String(c.reason)) ||
        typeof c.amount !== "number" ||
        !Number.isFinite(c.amount) ||
        c.amount <= 0 ||
        c.amount > 100
      )
        return reject("Nieprawidłowe obrażenia środowiskowe.");
      this.damage(p, c.amount, [0, 0, 0], "environment", String(c.reason));
      return this.reply(p, c, { ok: true });
    }
    if (c.type === "transfer") return reject("Użyj pól skrzyni.");
    if (c.type === "inventoryGesture" || c.type === "settleInventory") {
      if (c.baseRevision !== (Number(p.profile.inventoryRevision) || 0))
        return reject("Ekwipunek się zmienił. Spróbuj ponownie.");
      const pack = new InventoryPack();
      pack.restore((p.profile.pack ?? {}) as any);
      pack.reconcile((p.profile.inventory ?? {}) as Record<number, number>);
      if (c.type === "settleInventory") {
        if (c.size !== 2 && c.size !== 3) return reject("Nieprawidłowy rozmiar wytwarzania.");
        for (const extra of pack.clearGrid())
          this.drop(p.dimension, extra.id, extra.n, [p.p[0], p.p[1] + 0.7, p.p[2]]);
        pack.size = c.size;
        p.profile.pack = pack.snapshot();
        p.profile.inventory = pack.counts();
        return this.reply(p, c, { ok: true });
      }
      if (!validGesture(c.gesture)) return reject("Nieprawidłowy gest ekwipunku.");
      let slots: ChestSlots | undefined,
        key = "",
        furnace: FurnaceState | undefined,
        furnaceKey = "";
      if (c.chestKey != null && c.furnaceKey != null) return reject("Wybierz jeden pojemnik.");
      if (c.chestKey != null) {
        if (typeof c.chestKey !== "string" || !c.chestKey.startsWith(p.dimension + ":"))
          return reject("Skrzynia jest w innym wymiarze.");
        const [x, y, z] = c.chestKey
          .slice(p.dimension.length + 1)
          .split(",")
          .map(Number);
        if (
          ![x, y, z].every(Number.isInteger) ||
          y < 1 ||
          y > 70 ||
          Math.hypot(p.p[0] - x, p.p[1] + 1 - y, p.p[2] - z) > 8
        )
          return reject("Skrzynia jest poza zasięgiem.");
        const w = this.ensure(p.dimension, x, z);
        if (w.get(x, y, z) !== 61) return reject("Nie ma tutaj skrzyni.");
        key = p.dimension + ":" + [x, y, z];
        if (!this.slots[key]) return reject("Najpierw otwórz skrzynię.");
        slots = this.slots[key].map((s) => (s ? { ...s } : null));
      }
      if (c.furnaceKey != null) {
        if (typeof c.furnaceKey !== "string" || !this.furnaceInReach(p, c.furnaceKey))
          return reject("Piec jest poza zasięgiem lub został zniszczony.");
        furnaceKey = c.furnaceKey;
        if (!this.furnaces[furnaceKey]) return reject("Najpierw otwórz piec.");
        furnace = structuredClone(this.furnaces[furnaceKey]);
      }
      if (!applyInventoryGesture(pack, c.gesture, slots, furnace?.slots))
        return reject("Stos lub pole się zmieniły. Spróbuj ponownie.");
      p.profile.pack = pack.snapshot();
      p.profile.inventory = pack.counts();
      if (slots) {
        this.slots[key] = slots;
        this.storage[key] = chestCounts(slots);
        const revision = (this.chestRevisions[key] = (this.chestRevisions[key] ?? 0) + 1);
        this.send("*", { type: "chestUpdate", key, slots: structuredClone(slots), revision });
      }
      if (furnace) {
        if (furnace.recipeId !== (furnaceRecipe(furnace.slots[0]?.id ?? 0)?.input ?? null)) {
          furnace.progress = 0;
          furnace.recipeId = furnaceRecipe(furnace.slots[0]?.id ?? 0)?.input ?? null;
        }
        this.furnaces[furnaceKey] = furnace;
        this.furnaceRevisions[furnaceKey] = (this.furnaceRevisions[furnaceKey] ?? 0) + 1;
        this.broadcastFurnace(furnaceKey);
      }
      return this.reply(p, c, {
        ok: true,
        ...(slots ? { chest: { key, slots } } : {}),
        ...(furnace ? { furnace: { key: furnaceKey, state: furnace } } : {}),
      });
    }
    const w = this.ensure(p.dimension, p.p[0], p.p[2]);
    if (c.type === "craft") {
      const pack = new InventoryPack();
      pack.restore((p.profile.pack ?? {}) as any);
      const near = (id: number) => {
        for (let x = -4; x <= 4; x++)
          for (let y = -2; y <= 2; y++)
            for (let z = -4; z <= 4; z++)
              if (w.get(p.p[0] + x, p.p[1] + y, p.p[2] + z) === id) return true;
        return false;
      };
      if (pack.size === 3 && !near(28) && !near(30))
        return reject("Wytwarzanie 3 × 3 wymaga stołu.");
      if (
        !applyCraftResult(pack, { quick: !!c.quick, to: c.to as any, expected: c.expected as any })
      )
        return reject("Brak składników lub miejsca.");
      p.profile.pack = pack.snapshot();
      p.profile.inventory = pack.counts();
      return this.reply(p, c, { ok: true });
    }
    if (c.type === "eat") {
      if (![106, 107].includes(p.held) || !this.owns(p, p.held)) return reject("Brak jedzenia.");
      if (this.now() - p.lastAction < 600) return reject("Poczekaj chwilę.");
      p.lastAction = this.now();
      p.health = Math.min(20, p.health + 2);
      p.profile.food = Math.min(20, Number(p.profile.food ?? 20) + 6);
      return this.reply(p, c, {
        ok: true,
        cost: [[p.held, 1]],
        health: p.health,
        food: p.profile.food,
      });
    }
    if (c.type === "pickup") {
      const d = this.drops.find((d) => d.key === c.key && d.dimension === p.dimension);
      if (!d || d.grace > 0 || vec(d.p).distanceTo(vec(p.p).add(new THREE.Vector3(0, 0.7, 0))) > 2)
        return reject("Przedmiot jest poza zasięgiem.");
      const n = Math.max(0, Math.min(d.n, Number(c.capacity) || 0));
      if (!n) return reject("Brak miejsca.");
      d.n -= n;
      this.drops = this.drops.filter((d) => d.n > 0);
      this.drainPendingDrops();
      return this.reply(p, c, { ok: true, grant: [[d.id, n]] });
    }
    if (c.type === "drop") {
      const item = Number(c.item),
        n = Math.floor(Number(c.n));
      if (!this.validItem(item) || n < 1 || n > 64 || !validVec(c.v))
        return reject("Nieprawidłowy przedmiot.");
      if (!this.owns(p, item, n)) return reject("Brak przedmiotów do wyrzucenia.");
      this.drop(
        p.dimension,
        item,
        n,
        [p.p[0], p.p[1] + 1.3, p.p[2]],
        c.v.map((v) => Math.max(-8, Math.min(8, v))) as Vec,
      );
      return this.reply(p, c, { ok: true, cost: [[item, n]] });
    }
    if (c.type === "pvp") {
      const target = this.players.get(String(c.target));
      const stats = weapon(p.held);
      if (
        !target ||
        target.id === p.id ||
        target.dimension !== p.dimension ||
        this.now() - target.seen > 12000 ||
        target.health <= 0
      )
        return reject("Gracz jest poza zasięgiem.");
      if (
        this.safe(p) ||
        this.safe(target) ||
        this.now() < p.spawnUntil ||
        this.now() < target.spawnUntil
      )
        return reject("Tutaj działa ochrona gracza.");
      if (this.now() - p.lastAction < stats.cooldown * 1000 || p.stamina < stats.stamina)
        return reject("Zaczekaj, aż odzyskasz wytrzymałość.");
      const from = vec(p.p).add(new THREE.Vector3(0, 1.5, 0)),
        to = vec(target.p).add(new THREE.Vector3(0, 1, 0)),
        delta = to.clone().sub(from);
      if (delta.length() > stats.reach + 0.65) return reject("Za daleko.");
      const aim = new THREE.Vector3(
        -Math.sin(p.yaw) * Math.cos(p.pitch),
        Math.sin(p.pitch),
        -Math.cos(p.yaw) * Math.cos(p.pitch),
      );
      if (aim.dot(delta.clone().normalize()) < 0.45 || !this.lineClear(w, from, to))
        return reject("Cel jest zasłonięty.");
      p.lastAction = this.now();
      p.stamina -= stats.stamina;
      const critical = !p.grounded && p.p[1] > target.p[1] + 0.25;
      let damage = stats.damage * (critical ? 1.25 : 1);
      const toAttacker = vec(p.p).sub(vec(target.p)).normalize(),
        facing = new THREE.Vector3(-Math.sin(target.yaw), 0, -Math.cos(target.yaw));
      if (
        target.blocking &&
        this.now() > target.blockUntil &&
        target.stamina >= 10 &&
        facing.dot(toAttacker) > 0.15
      ) {
        target.stamina -= 15;
        if (stats.shieldBreak) {
          target.blockUntil = this.now() + 1800;
          damage *= 0.65;
        } else damage *= 0.25;
      }
      const knock = delta.normalize().multiplyScalar(stats.knockback);
      knock.y = 2.8;
      p.pvpUntil = target.pvpUntil = this.now() + 20000;
      this.damage(target, Math.max(1, Math.round(damage)), array(knock), "pvp", "pvp");
      return this.reply(p, c, { ok: true, message: critical ? "Trafienie krytyczne!" : undefined });
    }
    if (c.type === "huntHit") {
      const stats = weapon(p.held);
      if (
        p.difficulty !== "horror" ||
        this.now() - p.lastAction < stats.cooldown * 1000 ||
        p.stamina < stats.stamina
      )
        return reject("Nie możesz teraz zaatakować tego celu.");
      const hit = this.horrorHunt.attack(
        {
          huntId: String(c.target),
          attackerId: id,
          damage: stats.damage,
          reach: stats.reach,
          cooldown: stats.cooldown,
        },
        this.horrorContexts(
          [...this.players.values()].filter((player) => this.now() - player.seen < 12000),
        ),
        this.huntEnvironment,
      );
      if (!hit.ok) return reject("Gość jest zasłonięty, odporny lub poza zasięgiem.");
      p.lastAction = this.now();
      p.stamina -= stats.stamina;
      this.broadcastHunts();
      return this.reply(p, c, { ok: true, huntDamage: hit.damage });
    }
    if (c.type === "hit") {
      if (this.now() - p.lastAction < weapon(p.held).cooldown * 1000)
        return reject("Poczekaj na kolejny zamach.");
      p.lastAction = this.now();
      const mob = this.region(p.dimension).mobs.get(String(c.target));
      const power = weapon(p.held).damage;
      if (mob && !mob.dead && vec(p.p).distanceTo(mob.group.position) < 6) {
        this.hitMob(p, mob, power);
        return this.reply(p, c, { ok: true });
      }
      if (
        p.dimension === "end" &&
        c.target === "dragon" &&
        !this.won &&
        vec(p.p).distanceTo(this.dragon.group.position) < 8
      ) {
        this.hitDragon(power);
        return this.reply(p, c, { ok: true });
      }
      const ci = Number(c.crystal);
      if (
        p.dimension === "end" &&
        Number.isInteger(ci) &&
        ci >= 0 &&
        ci < 8 &&
        vec(p.p).distanceTo(this.crystalPosition(ci)) < 6
      ) {
        this.breakCrystal(ci);
        return this.reply(p, c, { ok: true });
      }
      return reject("Cel jest poza zasięgiem.");
    }
    if (c.type === "shoot") {
      if (p.held !== 105 || !this.owns(p, 105) || !this.owns(p, 113))
        return reject("Brak łuku lub strzał.");
      if (this.now() - p.lastAction < 400 || !validVec(c.direction))
        return reject("Poczekaj na kolejny strzał.");
      p.lastAction = this.now();
      this.shots.push({
        p: vec(p.p).add(new THREE.Vector3(0, 1.55, 0)),
        v: vec(c.direction).normalize().multiplyScalar(37),
        dimension: p.dimension,
        owner: p.id,
        life: 5,
      });
      return this.reply(p, c, { ok: true, cost: [[113, 1]], shot: true });
    }
    const x = Number(c.x),
      y = Number(c.y),
      z = Number(c.z);
    if (
      ![x, y, z].every(Number.isInteger) ||
      y < 1 ||
      y > 70 ||
      Math.hypot(p.p[0] - x, p.p[1] + 1 - y, p.p[2] - z) > 8
    )
      return reject("Blok jest poza zasięgiem.");
    this.ensure(p.dimension, x, z);
    const block = w.get(x, y, z),
      key = p.dimension + ":" + [x, y, z];
    if (c.type === "openFurnace") {
      if (block !== 29) return reject("Nie ma tutaj pieca.");
      const state = (this.furnaces[key] ??= createFurnace());
      this.furnaceViewers.set(id, key);
      return this.reply(p, c, { ok: true, furnace: { key, state } });
    }
    if (c.type === "chest" || c.type === "chestClick") {
      if (block !== 61) return reject("Nie ma tutaj skrzyni.");
      if (!this.storage[key]) {
        this.storage[key] = Object.hasOwn(w.edits, key)
          ? {}
          : { 107: 3, 113: 16, 110: 2 + Math.floor(hash(x, z, this.seed) * 4), 116: 6 };
        if (Math.hypot(x, z) > 29 && !Object.hasOwn(w.edits, key)) {
          this.storage[key][119] = 1;
          this.storage[key][111] = 2;
        }
      }
      this.slots[key] ??= fromCounts(this.storage[key]);
      const storage = this.storage[key];
      let grant: number[][] = [],
        cost: number[][] = [];
      if (c.type === "chestClick") {
        const index = Number(c.index);
        if (!Number.isInteger(index) || index < 0 || index >= 27)
          return reject("Nieprawidłowe pole.");
        const cursor = c.cursor as { id: number; n: number } | null;
        if (
          cursor &&
          (!this.validItem(cursor.id) ||
            !Number.isInteger(cursor.n) ||
            cursor.n < 1 ||
            cursor.n > maxStack(cursor.id))
        )
          return reject("Nieprawidłowy stos.");
        if (cursor && !this.owns(p, cursor.id, cursor.n)) return reject("Nie masz tego stosu.");
        let nextCursor = cursor;
        if (c.quick) {
          const stack = this.slots[key][index];
          if (stack) {
            const n = Math.max(0, Math.min(stack.n, Number(c.capacity) || 0));
            grant = [[stack.id, n]];
            stack.n -= n;
            if (!stack.n) this.slots[key][index] = null;
          }
        } else {
          const result = clickStack(this.slots[key][index], cursor, !!c.right);
          this.slots[key][index] = result.slot;
          nextCursor = result.cursor;
        }
        if (!c.quick) {
          const current = new InventoryPack();
          current.restore((p.profile.pack ?? {}) as any);
          current.cursor = nextCursor;
          p.profile.pack = current.snapshot();
        }
        this.storage[key] = chestCounts(this.slots[key]);
        const revision = (this.chestRevisions[key] = (this.chestRevisions[key] ?? 0) + 1);
        this.send("*", {
          type: "chestUpdate",
          key,
          slots: structuredClone(this.slots[key]),
          revision,
        });
        return this.reply(p, c, {
          ok: true,
          chest: { key, slots: this.slots[key] },
          cursor: nextCursor,
          inventoryDelta: c.quick
            ? []
            : [
                ...(cursor ? [[cursor.id, -cursor.n]] : []),
                ...(nextCursor ? [[nextCursor.id, nextCursor.n]] : []),
              ],
          grant,
        });
      }
      return this.reply(p, c, {
        ok: true,
        chest: { key, items: { ...storage }, slots: this.slots[key] },
        grant,
        cost,
      });
    }
    if (
      this.now() - p.lastAction < 110 &&
      !(c.type === "mine" && miningDuration(block, p.held) === 0)
    )
      return reject("Poczekaj chwilę.");
    p.lastAction = this.now();
    if (c.type === "mine") {
      if (block !== c.expected || !isMineableBlock(block, y))
        return reject("Ten blok już się zmienił lub nie można go wydobyć.");
      const elapsed = this.now() - (Number(p.profile.lastMine) || 0);
      if (elapsed < miningDuration(block, p.held) * 650)
        return reject("Blok wymaga dłuższego kopania.");
      p.profile.lastMine = this.now();
      w.set(x, y, z, 0);
      const grant: number[][] = [];
      const harvest = harvestAllowed(block, p.held);
      if (harvest && [64, 65, 66].includes(block)) {
        grant.push([116, block === 66 ? 3 : 1]);
        if (block === 66) grant.push([117, 2]);
        delete this.region(p.dimension).crops[key];
      } else if (harvest && block === 79) {
        if (Math.random() < 0.65) grant.push([116, 1]);
      } else if (harvest) {
        const resource = minedResource(block);
        grant.push([block === 42 && Math.random() < 0.22 ? 124 : resource.id, resource.n]);
      }
      if (block === 61 && this.storage[key]) {
        for (const [i, n] of Object.entries(this.storage[key])) grant.push([Number(i), n]);
        delete this.storage[key];
        delete this.slots[key];
      }
      return this.reply(p, c, {
        ok: true,
        grant,
        mined: true,
        xp: harvest ? (block === 22 ? 8 : 1) : 0,
      });
    }
    if (c.type === "use") {
      const held = p.held;
      if (block !== 62 && held > 0 && !this.owns(p, held)) return reject("Brak przedmiotu.");
      if (held === 123) {
        const ok = ignitePortal(w, x, y, z);
        return this.reply(p, c, {
          ok,
          message: ok ? "Portal rozpalony." : "Napraw obsydianową ramę portalu.",
        });
      }
      if (held === 118 && [1, 2, 54].includes(block)) {
        w.set(x, y, z, 63);
        return this.reply(p, c, { ok: true });
      }
      if (held === 114 && block === 7 && (w.waterLevels[key] ?? 0) === 0) {
        w.set(x, y, z, 0);
        return this.reply(p, c, { ok: true, cost: [[114, 1]], grant: [[115, 1]] });
      }
      if (block === 62) {
        if (this.clock % 600 > 330) this.clock = Math.ceil(this.clock / 600) * 600 + 90;
        return this.reply(p, c, { ok: true, message: "Punkt odrodzenia ustawiony.", bed: true });
      }
      if (!validVec(c.place) || !c.place.every(Number.isInteger)) return reject("Brak miejsca.");
      const [a, b, d] = c.place;
      if (Math.hypot(a - x, b - y, d - z) > 1.01 || b < 1 || b > 70)
        return reject("Nieprawidłowe miejsce.");
      this.ensure(p.dimension, a, d);
      const old = w.get(a, b, d);
      if (old !== 0 && old !== 7 && !(held === 115 && old === 15) && !BLOCKS[old]?.plant)
        return reject("To miejsce jest zajęte.");
      const next = held === 115 ? 7 : held === 116 ? 64 : held;
      if (!BLOCKS[next] || next < 1 || next === 13 || next === 18)
        return reject("Nie można postawić tego przedmiotu.");
      if (held === 116 && (p.dimension !== "overworld" || w.get(a, b - 1, d) !== 63))
        return reject("Nasiona wymagają ziemi uprawnej.");
      if (
        BLOCKS[next].solid &&
        [...this.players.values()].some(
          (q) =>
            this.now() - q.seen < 12000 &&
            q.dimension === p.dimension &&
            a + 1 > q.p[0] - 0.3 &&
            a < q.p[0] + 0.3 &&
            d + 1 > q.p[2] - 0.3 &&
            d < q.p[2] + 0.3 &&
            b + 1 > q.p[1] &&
            b < q.p[1] + 1.8,
        )
      )
        return reject("W tym miejscu stoi gracz.");
      if (held === 115) {
        if (p.dimension !== "nether" && !w.pourWater(a, b, d))
          return reject("Brak miejsca na wodę.");
      } else w.set(a, b, d, next);
      if (next === 64) this.region(p.dimension).crops[p.dimension + ":" + [a, b, d]] = 0;
      return this.reply(p, c, {
        ok: true,
        cost: [[held, 1]],
        grant: held === 115 ? [[114, 1]] : [],
        placed: true,
      });
    }
    reject("Nieznana akcja.");
  }
  validItem(id: number) {
    return Number.isInteger(id) && id > 0 && (!!BLOCKS[id] || ITEMS.some((i) => i.id === id));
  }
  drop(dimension: Dimension, id: number, n: number, p: Vec, v: Vec = [0, 2, 0]) {
    if (!this.validItem(id) || !Number.isSafeInteger(n) || n <= 0) return;
    if (this.drops.length >= 300) {
      this.queuePendingDrop({ dimension, id, n, p: [...p], v: [...v] });
      return;
    }
    this.drops.push({
      key: "d" + ++this.sequence,
      dimension,
      id,
      n,
      p: [...p],
      v: [...v],
      life: 300,
      grace: 1,
    });
  }
  queuePendingDrop(drop: PendingDrop) {
    const same = this.pendingDrops.filter(
      (d) => d.dimension === drop.dimension && d.id === drop.id,
    );
    let target = same.find((d) =>
      d.p.every((value, axis) => Math.floor(value / 16) === Math.floor(drop.p[axis] / 16)),
    );
    if (!target && this.pendingDrops.length >= 512 && same.length)
      target = same.reduce((nearest, d) =>
        vec(d.p).distanceToSquared(vec(drop.p)) < vec(nearest.p).distanceToSquared(vec(drop.p))
          ? d
          : nearest,
      );
    if (target) {
      target.n += drop.n;
      return;
    }
    if (this.pendingDrops.length >= 512) {
      // At the spatial-group cap, retain one location per material and dimension.
      // The finite item catalog bounds the snapshot while every quantity is preserved.
      const groups = new Map<string, PendingDrop>();
      for (const pending of this.pendingDrops) {
        const key = pending.dimension + ":" + pending.id,
          group = groups.get(key);
        if (group) group.n += pending.n;
        else groups.set(key, pending);
      }
      this.pendingDrops = [...groups.values()];
    }
    this.pendingDrops.push(drop);
  }
  drainPendingDrops() {
    while (this.drops.length < 300 && this.pendingDrops.length) {
      const next = this.pendingDrops.shift()!;
      this.drop(next.dimension, next.id, next.n, next.p, next.v);
    }
  }
  damage(
    p: Player,
    n: number,
    knockback: Vec = [0, 0, 0],
    source: "environment" | "pvp" = "environment",
    reason: string = source,
  ) {
    if (p.health <= 0 || p.hurtUntil > this.now()) return;
    if (source !== "pvp") n = Math.max(0.1, n * difficultyRules(p.difficulty).environmentDamage);
    if (!["fall", "void", "drowning", "hunger", "horror"].includes(reason))
      n *= armorMultiplier(p.equipment);
    p.health = Math.max(0, p.health - n);
    p.healed = this.now();
    p.hurtUntil = this.now() + 800;
    if (p.health === 0) {
      for (const id of Object.values(p.equipment))
        if (id) this.drop(p.dimension, id, 1, [p.p[0], p.p[1] + 0.7, p.p[2]]);
      p.equipment = normalizeEquipment(null);
      p.profile.equipment = { ...p.equipment };
      p.armor = 0;
      const inventory = (p.profile.inventory ?? {}) as Record<number, number>;
      for (const [id, n] of Object.entries(inventory))
        if (this.validItem(Number(id)))
          this.drop(p.dimension, Number(id), Math.min(2304, Number(n) || 0), [
            p.p[0],
            p.p[1] + 0.7,
            p.p[2],
          ]);
      p.profile = { ...p.profile, inventory: {}, pack: undefined };
      this.horror.reset(p.id);
      this.horrorHunt.reset(p.id);
      this.send(p.id, { type: "horrorReset" });
      this.message("Serwer", p.nick + " poległ. Przedmioty czekają w miejscu śmierci.", true);
    }
    if (p.health === 0)
      p.profile.inventoryRevision = (Number(p.profile.inventoryRevision) || 0) + 1;
    this.send(p.id, {
      type: "damage",
      health: p.health,
      amount: n,
      reason,
      knockback,
      inventoryRevision: Number(p.profile.inventoryRevision) || 0,
    });
  }
  safe(p: Player) {
    return p.dimension === "overworld" && Math.hypot(p.p[0] - 8, p.p[2] - 22) < 12;
  }
  lineClear(w: World, a: THREE.Vector3, b: THREE.Vector3) {
    const delta = b.clone().sub(a),
      distance = delta.length();
    delta.normalize();
    for (let t = 0.25; t < distance - 0.3; t += 0.25) {
      const p = a.clone().addScaledVector(delta, t);
      if (w.solid(p.x, p.y, p.z)) return false;
    }
    return true;
  }
  message(nick: string, text: string, system = false) {
    const message = { nick, text, time: this.now(), system };
    this.chat.push(message);
    this.chat = this.chat.slice(-60);
    this.send("*", { type: "chat", ...message });
  }
  chatMessage(id: string, text: unknown) {
    const p = this.players.get(id);
    if (!p || typeof text !== "string" || this.now() - p.lastChat < 800) return;
    const value = text
      .split("")
      .filter((char) => char.charCodeAt(0) >= 32 && char.charCodeAt(0) !== 127)
      .join("")
      .trim()
      .slice(0, 240);
    if (!value) return;
    p.lastChat = this.now();
    this.message(p.nick, value);
  }

  hitMob(p: Player, m: Mob, n: number) {
    if (m.dead) return;
    m.hp -= n;
    m.hurt = 0.3;
    if (m.kind === "enderman") {
      m.anger = 30;
      m.angerTarget = p.id;
      m.eyeContact = 0;
    }
    if (m.hp <= 0) {
      m.die();
      this.drop(
        p.dimension,
        m.hostile ? 109 : m.kind === "sheep" ? 32 : 107,
        m.hostile ? 2 : 1,
        array(m.group.position),
      );
      if (m.kind === "enderman") this.drop(p.dimension, 111, 1, array(m.group.position));
      if (m.kind === "cow") this.drop(p.dimension, 140, 1, array(m.group.position));
      this.send(p.id, { type: "award", xp: m.hostile ? 8 : 3 });
    }
  }
  hitDragon(n: number) {
    if (this.won) return;
    this.dragon.hp = Math.max(0, this.dragon.hp - n);
    if (this.dragon.hp <= 0) {
      this.won = true;
      this.dragon.dead = true;
      this.dragon.deathTime = 0;
      for (const p of this.players.values())
        if (this.now() - p.seen < 12000)
          this.send(p.id, {
            type: "award",
            xp: 500,
            message: "Wspólne zwycięstwo! Smok pokonany.",
          });
    }
  }
  crystalPosition(i: number) {
    const a = (i / 8) * Math.PI * 2;
    return new THREE.Vector3(
      Math.round(Math.cos(a) * 29) + 0.5,
      31 + (i % 3) * 4,
      Math.round(Math.sin(a) * 29) + 0.5,
    );
  }
  breakCrystal(i: number) {
    if (!this.crystals.includes(i)) this.crystals.push(i);
  }
  populate(p: Player) {
    const r = this.region(p.dimension),
      cell = Math.floor(p.p[0] / 48) + "," + Math.floor(p.p[2] / 48);
    if (r.populated.has(cell) || r.mobs.size >= 24) return;
    r.populated.add(cell);
    const kinds: MobKind[] =
      p.dimension === "end"
        ? ["enderman", "enderman"]
        : p.dimension === "nether"
          ? ["piglin", "blaze", "ghast"]
          : this.clock % 600 > 350
            ? ["zombie", "creeper", "skeleton"]
            : [r.world.biomeInfo(p.p[0], p.p[2]).mob as MobKind, "sheep", "pig", "bee"];
    for (let i = 0; i < kinds.length; i++) {
      const a = (i / kinds.length) * Math.PI * 2,
        x = p.p[0] + Math.cos(a) * 16,
        z = p.p[2] + Math.sin(a) * 16;
      this.ensure(p.dimension, x, z);
      const m = new Mob(kinds[i], x, z, r.world);
      r.mobs.set("m" + ++this.sequence, m);
    }
  }
  horrorContexts(players: Player[]): HorrorContext[] {
    return players.map((p) => {
      const world = this.region(p.dimension).world;
      return {
        id: p.id,
        p: p.p,
        yaw: p.yaw,
        pitch: p.pitch,
        dimension: p.dimension,
        difficulty: normalizeDifficulty(p.difficulty),
        active: p.active,
        alive: p.health > 0,
        night: p.dimension !== "overworld" || this.clock % 600 > 350,
        underground: world.surface(p.p[0], p.p[2]) > p.p[1] + 5,
      };
    });
  }
  broadcastHunts() {
    for (const player of this.players.values()) {
      const hunt =
        player.difficulty === "horror" && player.health > 0 && this.now() - player.seen < 12000
          ? (this.horrorHunt.view(player.id)[0] ?? null)
          : null;
      if (hunt || this.huntViewers.has(player.id))
        this.send(player.id, { type: "horrorHunt", hunt, clock: this.horrorHunt.elapsed });
      if (hunt) this.huntViewers.add(player.id);
      else this.huntViewers.delete(player.id);
    }
  }
  applyHuntSignals(signals: HuntSignal[]) {
    for (const signal of signals) {
      if (signal.type === "caught") {
        const p = this.players.get(signal.playerId),
          hunt = signal.hunt;
        if (!p || p.difficulty !== "horror" || p.health <= 0) continue;
        p.hurtUntil = Math.max(p.hurtUntil, this.now() + 1400);
        const event: HorrorEvent = {
          id: "caught-" + hunt.id,
          kind: "jumpscare",
          p: [...hunt.p],
          duration: 1.3,
          intensity: 1,
          seed: hunt.seed,
          reason: "caught",
          viewerIds: [p.id],
          dimension: hunt.dimension,
          at: this.horror.elapsed,
          yaw: hunt.yaw,
        };
        this.send(p.id, { type: "horror", event });
      } else if (signal.type === "death") {
        const p = this.players.get(signal.playerId);
        if (p && p.difficulty === "horror" && p.health > 0 && this.now() - p.seen < 12000) {
          p.hurtUntil = 0;
          this.damage(p, 1000000, [0, 0, 0], "environment", "horror");
        }
      } else {
        for (const id of signal.hunt.viewerIds) {
          const p = this.players.get(id);
          if (p?.difficulty === "horror" && p.health > 0 && this.now() - p.seen < 12000)
            this.send(id, {
              type: "award",
              xp: signal.reason === "banished" ? 100 : 0,
              message:
                signal.reason === "banished"
                  ? "Gość został odpędzony. +100 PD"
                  : "Zgubiłeś Gościa. Odzyskaj oddech.",
            });
        }
      }
    }
  }
  tickHorror(dt: number, players: Player[]) {
    const contexts = this.horrorContexts(players);
    for (const event of this.horror.tick(
      dt,
      contexts.map((context) => ({
        ...context,
        active: context.active && !this.horrorHunt.view(context.id).length,
      })),
    )) {
      const viewers = event.viewerIds.filter((id) => {
        const p = this.players.get(id);
        return (
          p?.active && p.health > 0 && p.difficulty === "horror" && p.dimension === event.dimension
        );
      });
      if (!viewers.length) continue;
      event.viewerIds = viewers;
      if (event.kind === "jumpscare") {
        this.horrorHunt.start(event, contexts, this.huntEnvironment);
        continue;
      }
      if (["watcher", "silhouette", "approach"].includes(event.kind)) {
        const anchor = this.players.get(viewers[0])!,
          underground = contexts.find((c) => c.id === anchor.id)!.underground;
        this.placeHorrorEvent(event, anchor.p, underground);
      }
      for (const id of viewers) this.send(id, { type: "horror", event: structuredClone(event) });
    }
    const update = this.horrorHunt.tick(dt, contexts, this.huntEnvironment);
    this.applyHuntSignals(update.signals);
    if (this.tickId % 2 === 0 || update.signals.length) this.broadcastHunts();
  }
  furnaceInReach(p: Player, key: string) {
    if (!key.startsWith(p.dimension + ":")) return false;
    const coords = key
      .slice(p.dimension.length + 1)
      .split(",")
      .map(Number);
    if (coords.length !== 3 || !coords.every(Number.isInteger)) return false;
    const [x, y, z] = coords;
    if (
      key !== p.dimension + ":" + [x, y, z] ||
      y < 1 ||
      y > 70 ||
      Math.hypot(p.p[0] - x, p.p[1] + 1 - y, p.p[2] - z) > 8
    )
      return false;
    return this.ensure(p.dimension, x, z, 0).get(x, y, z) === 29;
  }
  broadcastFurnace(key: string) {
    const state = this.furnaces[key] ?? null,
      revision = this.furnaceRevisions[key] ?? 0;
    for (const [id, selected] of this.furnaceViewers) {
      if (selected !== key) continue;
      const p = this.players.get(id);
      if (!p || this.now() - p.seen > 12000 || (state && !this.furnaceInReach(p, key))) {
        this.furnaceViewers.delete(id);
        continue;
      }
      this.send(id, {
        type: "furnaceUpdate",
        key,
        state: state ? structuredClone(state) : null,
        revision,
      });
      if (!state) this.furnaceViewers.delete(id);
    }
  }
  removeFurnace(key: string) {
    const state = this.furnaces[key];
    if (!state) return;
    const [dimension, position] = key.split(":"),
      [x, y, z] = position.split(",").map(Number);
    delete this.furnaces[key];
    this.furnaceRevisions[key] = (this.furnaceRevisions[key] ?? 0) + 1;
    this.dirtyFurnaces.delete(key);
    for (const stack of state.slots)
      if (stack) this.drop(dimension as Dimension, stack.id, stack.n, [x + 0.5, y + 0.6, z + 0.5]);
    this.broadcastFurnace(key);
  }
  tickFurnaces(dt: number, players: Player[]) {
    for (const [key, state] of Object.entries(this.furnaces)) {
      const [dimension, position] = key.split(":"),
        [x, y, z] = position.split(",").map(Number);
      if (
        !players.some((p) => p.dimension === dimension && Math.hypot(p.p[0] - x, p.p[2] - z) <= 96)
      )
        continue;
      if (this.ensure(dimension as Dimension, x, z, 0).get(x, y, z) !== 29) {
        this.removeFurnace(key);
        continue;
      }
      if (tickFurnace(state, dt)) {
        this.furnaceRevisions[key] = (this.furnaceRevisions[key] ?? 0) + 1;
        this.dirtyFurnaces.add(key);
      }
    }
    if (this.tickId % 4 === 0) {
      for (const key of this.dirtyFurnaces) this.broadcastFurnace(key);
      this.dirtyFurnaces.clear();
    }
  }
  placeHorrorEvent(event: HorrorEvent, anchor: Vec, underground: boolean) {
    placeHorrorEvent(event, anchor, underground, this.region(event.dimension).world, (x, z) => {
      this.ensure(event.dimension, x, z, 0);
    });
  }
  tick(dt: number) {
    this.pruneFaces();
    this.clock += dt;
    this.tickId++;
    const active = [...this.players.values()].filter((p) => this.now() - p.seen < 12000);
    this.tickFurnaces(dt, active);
    this.tickHorror(dt, active);
    for (const p of active) {
      if (!p.active || p.health <= 0) continue;
      const rules = difficultyRules(p.pvpUntil > this.now() ? "normal" : p.difficulty);
      p.hungerClock =
        (p.hungerClock || 0) + dt * (p.moving ? (p.sprinting ? 1.8 : 1) : 0.25) * rules.hungerRate;
      if (p.hungerClock >= 25) {
        p.hungerClock -= 25;
        p.profile.food = Math.max(0, Number(p.profile.food ?? 20) - 1);
        if (p.profile.food === 0) this.damage(p, 1, [0, 0, 0], "environment", "hunger");
      }
      if (
        Number(p.profile.food ?? 20) > 14 &&
        p.health < 20 &&
        this.now() - p.healed >= rules.regenerationSeconds * 1000
      ) {
        p.healed = this.now();
        p.health = Math.min(20, p.health + rules.regenerationAmount);
      }
      if (this.tickId % 20 === 0)
        this.send(p.id, {
          type: "vitals",
          food: p.profile.food ?? 20,
          health: p.health,
          difficulty: p.difficulty,
        });
    }
    for (const p of active) {
      p.stamina = Math.min(100, p.stamina + dt * (p.blocking ? 5 : 18));
      this.populate(p);
    }
    for (const [dimension, r] of this.regions) {
      const targets = active.filter((p) => p.dimension === dimension && p.health > 0);
      for (const m of r.mobs.values()) {
        if (m.kind !== "enderman") continue;
        const owner = this.players.get(m.angerTarget);
        if (
          !m.dead &&
          m.anger > 0 &&
          this.restoredProvocations.has(m.angerTarget) &&
          owner?.seen === 0 &&
          owner.health > 0 &&
          owner.dimension === dimension &&
          this.now() < this.restoredProvocationsUntil
        ) {
          // Restored profiles reconnect after the first tick; wait briefly without attacking anyone.
          m.attackClock = 0;
          m.anger = Math.max(0, m.anger - dt);
          if (m.anger > 0) continue;
          m.angerTarget = "";
          m.eyeContact = 0;
        }
        if (m.dead || (m.anger > 0 && !targets.some((p) => p.id === m.angerTarget))) {
          // Losing the provoker never transfers an already pending attack to an innocent player.
          m.anger = 0;
          m.angerTarget = "";
          m.eyeContact = 0;
          m.attackClock = 0;
        } else if (m.anger <= 0 && m.eyeContact <= 0) m.angerTarget = "";
      }
      if (!targets.length) continue;
      const observers = targets
        .filter((p) => p.active)
        .map((p) => ({
          player: p,
          ray: new THREE.Ray(
            vec(p.p).add(new THREE.Vector3(0, p.crouch ? 1.3 : 1.62, 0)),
            new THREE.Vector3(
              -Math.sin(p.yaw) * Math.cos(p.pitch),
              Math.sin(p.pitch),
              -Math.cos(p.yaw) * Math.cos(p.pitch),
            ),
          ),
        }));
      r.fluid.tick(dt);
      for (const [id, m] of r.mobs) {
        if (m.kind === "enderman" && m.anger > 0 && !targets.some((p) => p.id === m.angerTarget))
          continue;
        let p = targets[0];
        for (const q of targets)
          if (
            vec(q.p).distanceToSquared(m.group.position) <
            vec(p.p).distanceToSquared(m.group.position)
          )
            p = q;
        if (m.kind === "enderman") {
          const provoker = m.anger > 0 ? targets.find((q) => q.id === m.angerTarget) : undefined;
          if (provoker) p = provoker;
          else {
            // An observer may stand behind a nearer player who is looking elsewhere.
            let watching: (typeof observers)[number] | undefined;
            for (const observer of observers)
              if (
                m.looksIntoEyes(observer.ray, r.world) &&
                (!watching ||
                  vec(observer.player.p).distanceToSquared(m.group.position) <
                    vec(watching.player.p).distanceToSquared(m.group.position))
              )
                watching = observer;
            if (watching) {
              p = watching.player;
              if (m.angerTarget !== p.id) m.eyeContact = 0;
              m.angerTarget = p.id;
            } else {
              m.angerTarget = "";
              m.eyeContact = 0;
            }
          }
        }
        m.update(
          dt,
          this.clock,
          vec(p.p),
          r.world,
          (n) => {
            if (
              m.group.position.distanceTo(vec(p.p)) < 2.65 &&
              this.lineClear(
                r.world,
                m.group.position.clone().add(new THREE.Vector3(0, 1.3, 0)),
                vec(p.p).add(new THREE.Vector3(0, 1.3, 0)),
              )
            )
              this.damage(p, n, [0, 0, 0], "environment", "mob");
          },
          (pos) => {
            if (this.lineClear(r.world, pos, vec(p.p).add(new THREE.Vector3(0, 1.3, 0))))
              this.enemyShot(dimension, pos, p);
          },
          (pos) => {
            for (const q of targets)
              if (
                vec(q.p).distanceTo(pos) < 4 &&
                this.lineClear(
                  r.world,
                  pos.clone().add(new THREE.Vector3(0, 1, 0)),
                  vec(q.p).add(new THREE.Vector3(0, 1, 0)),
                )
              )
                this.damage(q, 8, [0, 0, 0], "environment", "explosion");
            for (let x = -2; x <= 2; x++)
              for (let y = 0; y < 3; y++)
                for (let z = -2; z <= 2; z++)
                  if (x * x + y * y + z * z < 6) {
                    const a = Math.floor(pos.x + x),
                      b = Math.floor(pos.y + y),
                      c = Math.floor(pos.z + z),
                      block = r.world.get(a, b, c);
                    if (block && ![12, 13, 18, 35].includes(block)) r.world.set(a, b, c, 0);
                  }
          },
          m.kind === "enderman"
            ? observers.find((observer) => observer.player === p)?.ray
            : undefined,
        );
        if (
          (m.dead && m.deathTime > 1.4) ||
          !targets.some((q) => vec(q.p).distanceTo(m.group.position) < 110)
        ) {
          m.dispose();
          r.mobs.delete(id);
          r.populated.clear();
        }
      }
      if (this.tickId % 20 === 0) {
        for (const key of Object.keys(r.crops)) {
          const [x, y, z] = key.split(":")[1].split(",").map(Number);
          const id = r.world.get(x, y, z);
          if (![64, 65, 66].includes(id)) {
            delete r.crops[key];
            continue;
          }
          if (id === 66) continue;
          let wet = false;
          for (let a = -4; a <= 4 && !wet; a++)
            for (let b = -4; b <= 4; b++) if (r.world.get(x + a, y - 1, z + b) === 7) wet = true;
          r.crops[key] += wet ? 1 : 0.18;
          const next = r.crops[key] >= 60 ? 66 : r.crops[key] >= 30 ? 65 : 64;
          if (next !== id) r.world.set(x, y, z, next);
        }
        // Keep server memory bounded while preserving every edit in the durable map.
        if (r.world.chunks.size > 180)
          for (const [key, c] of r.world.chunks)
            if (
              !targets.some(
                (p) => Math.abs(p.p[0] / 16 - c.cx) < 5 && Math.abs(p.p[2] / 16 - c.cz) < 5,
              )
            )
              r.world.chunks.delete(key);
      }
    }
    const end = active.filter((p) => p.dimension === "end" && p.health > 0);
    if (end.length) {
      const target = end[Math.floor(this.dragon.time / 6) % end.length];
      this.dragon.update(dt, 8 - this.crystals.length, vec(target.p), (pos, power, speed, aim) =>
        this.enemyShot("end", pos, target, power, speed, aim),
      );
    }
    for (const s of this.shots) {
      const previousShot = array(s.p);
      s.life -= dt;
      s.p.addScaledVector(s.v, dt);
      const w = this.ensure(s.dimension, s.p.x, s.p.z, 0);
      if (w.solid(s.p.x, s.p.y, s.p.z) || !this.lineClear(w, vec(previousShot), s.p)) s.life = 0;
      if (s.life <= 0) continue;
      if (!s.owner) {
        for (const p of active)
          if (
            p.dimension === s.dimension &&
            p.health > 0 &&
            vec(p.p)
              .add(new THREE.Vector3(0, 1, 0))
              .distanceTo(s.p) < 0.9
          ) {
            if (!this.safe(p) && this.now() > p.spawnUntil)
              this.damage(p, s.power ?? 4, [0, 0, 0], "environment", "projectile");
            s.life = 0;
            break;
          }
      } else {
        const p = this.players.get(s.owner);
        if (p && p.dimension === s.dimension && this.now() - p.seen < 12000) {
          if (s.life > 0 && p.difficulty === "horror") {
            const contexts = this.horrorContexts(active);
            for (const hunt of this.horrorHunt.view(p.id))
              if (
                this.horrorHunt.projectileHit(
                  {
                    huntId: hunt.id,
                    attackerId: p.id,
                    damage: 20,
                    from: previousShot,
                    to: array(s.p),
                  },
                  contexts,
                  this.huntEnvironment,
                ).ok
              ) {
                s.life = 0;
                this.broadcastHunts();
                break;
              }
          }
          if (s.life <= 0) continue;
          for (const target of active)
            if (
              target.id !== p.id &&
              target.dimension === s.dimension &&
              target.health > 0 &&
              !this.safe(target) &&
              !this.safe(p) &&
              this.now() > target.spawnUntil &&
              this.now() > p.spawnUntil &&
              vec(target.p)
                .add(new THREE.Vector3(0, 1, 0))
                .distanceTo(s.p) < 0.8
            ) {
              p.pvpUntil = target.pvpUntil = this.now() + 20000;
              this.damage(
                target,
                7,
                array(s.v.clone().normalize().multiplyScalar(3)),
                "pvp",
                "pvp",
              );
              s.life = 0;
              break;
            }
          if (s.life <= 0) continue;
          for (const m of this.region(s.dimension).mobs.values())
            if (
              !m.dead &&
              m.group.position
                .clone()
                .add(new THREE.Vector3(0, 1, 0))
                .distanceTo(s.p) <
                m.size + 0.4
            ) {
              this.hitMob(p, m, 20);
              s.life = 0;
              break;
            }
          if (s.life <= 0) continue;
          if (s.dimension === "end") {
            for (let i = 0; i < 8; i++)
              if (!this.crystals.includes(i) && this.crystalPosition(i).distanceTo(s.p) < 1.4) {
                this.breakCrystal(i);
                s.life = 0;
              }
            if (!this.won && this.dragon.group.position.distanceTo(s.p) < 3.4) {
              this.hitDragon(20);
              s.life = 0;
            }
          }
        } else s.life = 0;
      }
    }
    this.shots = this.shots.filter((s) => s.life > 0);
    for (const d of this.drops) {
      d.life -= dt;
      d.grace -= dt;
      const w = this.ensure(d.dimension, d.p[0], d.p[2], 0);
      d.v[1] -= 14 * dt;
      for (let a = 0; a < 3; a++) {
        const old = d.p[a];
        d.p[a] += d.v[a] * dt;
        if (w.solid(d.p[0], d.p[1] - 0.13, d.p[2]) || w.solid(d.p[0], d.p[1] + 0.1, d.p[2])) {
          d.p[a] = old;
          d.v[a] = 0;
        }
      }
      d.v[0] *= Math.exp(-dt * 2);
      d.v[2] *= Math.exp(-dt * 2);
    }
    this.drops = this.drops.filter((d) => d.life > 0 && d.n > 0 && d.p[1] > -30);
    this.drainPendingDrops();
  }
  enemyShot(
    d: Dimension,
    pos: THREE.Vector3,
    p: Player,
    power = 4,
    speed = 12,
    aim?: THREE.Vector3,
  ) {
    this.shots.push({
      p: pos.clone(),
      v: (aim?.clone() ?? vec(p.p).add(new THREE.Vector3(0, 1, 0)))
        .sub(pos)
        .normalize()
        .multiplyScalar(speed),
      dimension: d,
      owner: "",
      life: 6,
      power,
    });
  }
  mobWire(id: string, m: Mob): MobWire {
    const values = Object.fromEntries(mobFields.map((k) => [k, round(m[k])]));
    return {
      id,
      kind: m.kind,
      p: array(m.group.position),
      r: [m.group.rotation.x, m.group.rotation.y, m.group.rotation.z].map(round) as Vec,
      dead: m.dead,
      ...values,
      target: [999, 0, 999],
      head: [round(m.head.rotation.x), round(m.head.rotation.y)],
      rangedAttack: m.rangedAttack,
      anger: round(m.anger),
      eyeContact: round(m.eyeContact),
      angerTarget: m.angerTarget || undefined,
    } as MobWire;
  }
  frame(): FrameWire & {
    shots: unknown[];
    combat: Record<string, { stamina: number; protection: number }>;
  } {
    const mobs: FrameWire["mobs"] = {};
    for (const [d, r] of this.regions) mobs[d] = [...r.mobs].map(([id, m]) => this.mobWire(id, m));
    const dragon = {
      hp: round(this.dragon.hp),
      orbit: this.dragon.orbit,
      time: this.dragon.time,
      shot: this.dragon.shot,
      radius: this.dragon.radius,
      dead: this.dragon.dead,
      deathTime: this.dragon.deathTime,
      p: array(this.dragon.group.position),
      r: [
        this.dragon.group.rotation.x,
        this.dragon.group.rotation.y,
        this.dragon.group.rotation.z,
      ] as Vec,
    };
    const changes = [...this.changes.values()];
    this.changes.clear();
    return {
      combat: Object.fromEntries(
        [...this.players].map(([id, p]) => [
          id,
          { stamina: round(p.stamina), protection: Math.max(0, p.spawnUntil - this.now()) },
        ]),
      ),
      type: "frame",
      tick: this.tickId,
      clock: this.clock,
      horrorClock: this.horror.elapsed,
      players: [...this.players.values()]
        .filter((p) => this.now() - p.seen < 12000)
        .map((p) => this.publicPlayer(p)),
      mobs,
      drops: this.drops,
      dragon,
      crystals: this.crystals,
      won: this.won,
      changes,
      shots: this.shots.map((s) => ({ p: array(s.p), dimension: s.dimension, enemy: !s.owner })),
    };
  }
  edits(): Record<string, number> {
    return Object.assign({}, ...[...this.regions.values()].map((r) => r.world.edits));
  }
  water(): Record<string, number> {
    return Object.assign({}, ...[...this.regions.values()].map((r) => r.world.waterLevels));
  }
  save() {
    return {
      version: 1,
      seed: this.seed,
      clock: this.clock,
      tick: this.tickId,
      sequence: this.sequence,
      won: this.won,
      crystals: this.crystals,
      dragon: this.frameDragon(),
      edits: this.edits(),
      water: this.water(),
      storage: this.storage,
      slots: this.slots,
      chestRevisions: this.chestRevisions,
      furnaces: this.furnaces,
      furnaceRevisions: this.furnaceRevisions,
      horror: this.horror.save(),
      chat: this.chat,
      drops: this.drops,
      players: [...this.players.values()],
      pendingDrops: this.pendingDrops,
      regions: [...this.regions].map(([d, r]) => ({
        d,
        mobs: [...r.mobs].map(([id, m]) => this.mobWire(id, m)),
        populated: [...r.populated],
        crops: r.crops,
      })),
    };
  }
  frameDragon() {
    return {
      hp: this.dragon.hp,
      maxHp: DRAGON_MAX_HEALTH,
      orbit: this.dragon.orbit,
      time: this.dragon.time,
      dead: this.dragon.dead,
      deathTime: this.dragon.deathTime,
    };
  }
  restore(s: ReturnType<Room["save"]>) {
    if (s.version !== 1) throw Error("Unsupported world");
    this.facePeers.clear();
    this.clock = s.clock;
    this.restoredProvocationsUntil = this.now() + 12000;
    this.restoredProvocations.clear();
    this.tickId = s.tick;
    this.sequence = s.sequence;
    this.won = s.won;
    this.crystals = s.crystals;
    this.storage = s.storage;
    this.slots = s.slots ?? {};
    this.chestRevisions = s.chestRevisions ?? {};
    this.furnaces = Object.fromEntries(
      Object.entries(s.furnaces ?? {})
        .filter(([key]) => /^(overworld|nether|end):-?\d+,-?\d+,-?\d+$/.test(key))
        .map(([key, state]) => [key, restoreFurnace(state)]),
    );
    this.furnaceRevisions = s.furnaceRevisions ?? {};
    this.furnaceViewers.clear();
    this.dirtyFurnaces.clear();
    this.horror.restore(s.horror);
    this.horrorHunt = new HorrorHunt();
    this.huntViewers.clear();
    this.chat = s.chat ?? [];
    this.drops = s.drops;
    this.pendingDrops = [];
    for (const d of s.pendingDrops ?? [])
      if (
        DIMENSIONS_NET.includes(d.dimension) &&
        this.validItem(d.id) &&
        Number.isSafeInteger(d.n) &&
        d.n > 0 &&
        validVec(d.p) &&
        validVec(d.v)
      )
        this.queuePendingDrop({
          dimension: d.dimension,
          id: d.id,
          n: d.n,
          p: [...d.p],
          v: [...d.v],
        });
    Object.assign(this.dragon, s.dragon);
    this.dragon.hp = restoreDragonHealth(s.dragon?.hp, s.dragon?.maxHp, s.won);
    if (!Number.isFinite(s.dragon?.orbit)) this.dragon.orbit = (Number(s.dragon?.time) || 0) * 0.26;
    this.players = new Map(
      s.players.map((p) => {
        const difficulty = normalizeDifficulty(p.profile?.difficulty);
        const pack = new InventoryPack();
        pack.restore((p.profile.pack ?? {}) as any);
        pack.reconcile((p.profile.inventory ?? {}) as Record<number, number>);
        const equipment = migrateEquipment(
          p.equipment,
          Number((p.profile.adventure as any)?.armor ?? p.armor) || 0,
          pack,
        );
        return [
          p.id,
          {
            ...p,
            equipment,
            armor: equipment.chest,
            seen: 0,
            active: false,
            sprinting: false,
            difficulty,
            hungerClock: Number(p.hungerClock) || 0,
            pvpUntil: 0,
            profile: {
              ...p.profile,
              equipment: { ...equipment },
              pack: pack.snapshot(),
              inventory: pack.counts(),
              difficulty,
              food: Number.isFinite(p.profile?.food) ? p.profile.food : 20,
            },
          },
        ];
      }),
    );
    for (const rr of s.regions) {
      const r = this.region(rr.d);
      r.world.edits = Object.fromEntries(
        Object.entries(s.edits).filter(([key]) => key.startsWith(rr.d + ":")),
      );
      r.world.waterLevels = Object.fromEntries(
        Object.entries(s.water).filter(([key]) => key.startsWith(rr.d + ":")),
      );
      r.world.chunks.clear();
      r.populated = new Set(rr.populated);
      r.crops = rr.crops;
      for (const m of r.mobs.values()) m.dispose();
      r.mobs.clear();
      for (const wire of rr.mobs) {
        this.ensure(rr.d, wire.p[0], wire.p[2]);
        const m = new Mob(wire.kind, wire.p[0], wire.p[2], r.world);
        for (const k of mobFields) m[k] = wire[k];
        // Damage flash can provoke an Enderman; persisted anger must win over that setter.
        m.anger = Math.max(0, Math.min(30, Number(wire.anger) || 0));
        m.eyeContact = Math.max(0, Math.min(0.25, Number(wire.eyeContact) || 0));
        m.angerTarget =
          typeof wire.angerTarget === "string" && wire.angerTarget.length <= 64
            ? wire.angerTarget
            : "";
        if (m.anger > 0 && m.angerTarget) this.restoredProvocations.add(m.angerTarget);
        m.rangedAttack = !!wire.rangedAttack;
        m.dead = wire.dead;
        m.group.position.fromArray(wire.p);
        m.group.rotation.set(...wire.r);
        r.mobs.set(wire.id, m);
      }
      for (const key of Object.keys(s.water)) {
        if (!key.startsWith(rr.d + ":")) continue;
        const [x, y, z] = key.split(":")[1].split(",").map(Number);
        r.fluid.wake(x, y, z);
      }
    }
  }
}
