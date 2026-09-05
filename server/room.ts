import * as THREE from "three";
import { weapon, miningDuration } from "../lib/combat";
import { fromCounts, chestCounts, clickStack, type ChestSlots } from "../lib/chest-slots";
import { InventoryPack, maxStack } from "../lib/inventory";
import { applyInventoryGesture, validGesture } from "../lib/inventory-gestures";
import { World, hash } from "../lib/world";
import { FluidSystem } from "../lib/fluid";
import { BLOCKS, ITEMS, type Dimension } from "../lib/blocks";
import { Mob, Dragon, type MobKind } from "../lib/entities";
import { ignitePortal } from "../lib/portals";
import {
  DIMENSIONS_NET,
  MAX_PLAYERS,
  validNick,
  validVec,
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
  healed: number;
  lastChat: number;
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
};
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
  chat: { nick: string; text: string; time: number; system?: boolean }[] = [];
  drops: DropWire[] = [];
  shots: Shot[] = [];
  dragon = new Dragon();
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
    if (data.chest) {
      const chest = data.chest as { key: string };
      (response as any).chest = { ...chest, revision: this.chestRevisions[chest.key] ?? 0 };
    }
    if (!data.ok && ["inventoryGesture", "settleInventory"].includes(c.type))
      (response as any).pack = p.profile.pack;
    const snapshot = structuredClone(response);
    p.responses[c.req] = snapshot;
    const keys = Object.keys(p.responses);
    if (keys.length > 100) delete p.responses[keys[0]];
    this.send(p.id, snapshot);
  }
  join(id: string, nick: string, skin: PlayerWire["skin"]) {
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
        profile: {},
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
        healed: 0,
        lastChat: 0,
      };
      this.players.set(id, p);
    }
    p.nick = nick;
    p.skin = skin;
    p.seen = this.now();
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
    };
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
      p.moving = !!m.moving;
      p.crouch = !!m.crouch;
      p.swing = !!m.swing;
      p.swingProgress = p.swing ? Math.max(0, Math.min(1, Number(m.swingProgress) || 0)) : -1;
      p.held =
        Number.isInteger(m.held) && (BLOCKS[Number(m.held)] || ITEMS.some((i) => i.id === m.held))
          ? Number(m.held)
          : 0;
      if (p.held > 0 && !this.owns(p, p.held)) p.held = 0;
      p.blocking = !!m.blocking && p.held === 126;
      p.grounded = !!m.grounded;
      p.armor =
        [121, 122].includes(Number(m.armor)) && this.owns(p, Number(m.armor)) ? Number(m.armor) : 0;
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
    p.profile = {
      ...m,
      inventory,
      pack,
      inventoryRevision: revision,
      lastMine: p.profile.lastMine,
    };
    if (typeof m.health === "number" && Number.isFinite(m.health) && m.health < health)
      this.damage(p, health - Math.max(0, m.health));
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
    if (c.type === "respawn") {
      if (p.health > 0) return reject("Postać jeszcze żyje.");
      p.health = 20;
      p.stamina = 100;
      p.spawnUntil = this.now() + 8000;
      p.hurtUntil = this.now() + 3000;
      p.profile = { ...p.profile, inventory: {}, pack: undefined };
      return this.reply(p, c, { ok: true, health: 20 });
    }
    if (c.type === "heal") {
      if (this.now() - p.healed < 6000 || Number(p.profile.food) < 14)
        return reject("Regeneracja wymaga jedzenia.");
      p.healed = this.now();
      p.health = Math.min(20, p.health + 1);
      return this.reply(p, c, { ok: true, health: p.health });
    }
    if (p.health <= 0) return reject("Najpierw odrodź postać.");
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
        key = "";
      if (c.chestKey !== null) {
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
      if (!applyInventoryGesture(pack, c.gesture, slots))
        return reject("Stos lub pole się zmieniły. Spróbuj ponownie.");
      p.profile.pack = pack.snapshot();
      p.profile.inventory = pack.counts();
      if (slots) {
        this.slots[key] = slots;
        this.storage[key] = chestCounts(slots);
        const revision = (this.chestRevisions[key] = (this.chestRevisions[key] ?? 0) + 1);
        this.send("*", { type: "chestUpdate", key, slots: structuredClone(slots), revision });
      }
      return this.reply(p, c, { ok: true, ...(slots ? { chest: { key, slots } } : {}) });
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
      if (pack.size === 3 && !near(28) && !near(29) && !near(30))
        return reject("Wytwarzanie 3 × 3 wymaga stołu.");
      if (!pack.takeResult(near(29), !!c.quick)) return reject("Brak składników lub miejsca.");
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
      damage *= target.armor === 122 ? 0.55 : target.armor === 121 ? 0.75 : 1;
      const knock = delta.normalize().multiplyScalar(stats.knockback);
      knock.y = 2.8;
      this.damage(target, Math.max(1, Math.round(damage)), array(knock));
      return this.reply(p, c, { ok: true, message: critical ? "Trafienie krytyczne!" : undefined });
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
    if (this.now() - p.lastAction < 110) return reject("Poczekaj chwilę.");
    p.lastAction = this.now();
    if (c.type === "mine") {
      const elapsed = this.now() - (Number(p.profile.lastMine) || 0);
      if (elapsed < miningDuration(block, p.held) * 650)
        return reject("Blok wymaga dłuższego kopania.");
      p.profile.lastMine = this.now();
      if (block !== c.expected || !block || [7, 13, 18, 35].includes(block))
        return reject("Ten blok już się zmienił.");
      if (block === 12 && p.held !== 103) return reject("Obsydian wymaga diamentowego kilofa.");
      w.set(x, y, z, 0);
      const grant: number[][] = [];
      if ([64, 65, 66].includes(block)) {
        grant.push([116, block === 66 ? 3 : 1]);
        if (block === 66) grant.push([117, 2]);
        delete this.region(p.dimension).crops[key];
      } else if (block === 79) {
        if (Math.random() < 0.65) grant.push([116, 1]);
      } else
        grant.push([
          block === 1
            ? 2
            : block === 3
              ? 9
              : block === 20
                ? 109
                : block === 22
                  ? 111
                  : block === 42 && Math.random() < 0.22
                    ? 124
                    : block,
          1,
        ]);
      if (block === 61 && this.storage[key]) {
        for (const [i, n] of Object.entries(this.storage[key])) grant.push([Number(i), n]);
        delete this.storage[key];
        delete this.slots[key];
      }
      return this.reply(p, c, { ok: true, grant, mined: true, xp: block === 22 ? 8 : 1 });
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
      if (old !== 0 && old !== 7 && !BLOCKS[old]?.plant) return reject("To miejsce jest zajęte.");
      const next = held === 115 ? 7 : held === 116 ? 64 : held;
      if (!BLOCKS[next] || next < 1 || next === 35 || next === 13 || next === 18)
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
      if (!(held === 115 && p.dimension === "nether")) w.set(a, b, d, next);
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
    if (this.drops.length >= 300) return;
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
  damage(p: Player, n: number, knockback: Vec = [0, 0, 0]) {
    if (p.health <= 0 || p.hurtUntil > this.now()) return;
    p.health = Math.max(0, p.health - n);
    p.hurtUntil = this.now() + 800;
    if (p.health === 0) {
      const inventory = (p.profile.inventory ?? {}) as Record<number, number>;
      for (const [id, n] of Object.entries(inventory))
        if (this.validItem(Number(id)))
          this.drop(p.dimension, Number(id), Math.min(2304, Number(n) || 0), [
            p.p[0],
            p.p[1] + 0.7,
            p.p[2],
          ]);
      p.profile = { ...p.profile, inventory: {}, pack: undefined };
      this.message("Serwer", p.nick + " poległ. Przedmioty czekają w miejscu śmierci.", true);
    }
    if (p.health === 0)
      p.profile.inventoryRevision = (Number(p.profile.inventoryRevision) || 0) + 1;
    this.send(p.id, {
      type: "damage",
      health: p.health,
      amount: n,
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
    if (m.hp <= 0) {
      m.die();
      this.drop(
        p.dimension,
        m.hostile ? 109 : m.kind === "sheep" ? 32 : 107,
        m.hostile ? 2 : 1,
        array(m.group.position),
      );
      if (m.kind === "enderman") this.drop(p.dimension, 111, 1, array(m.group.position));
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
  tick(dt: number) {
    this.clock += dt;
    this.tickId++;
    const active = [...this.players.values()].filter((p) => this.now() - p.seen < 12000);
    for (const p of active) {
      p.stamina = Math.min(100, p.stamina + dt * (p.blocking ? 5 : 18));
      this.populate(p);
    }
    for (const [dimension, r] of this.regions) {
      const targets = active.filter((p) => p.dimension === dimension && p.health > 0);
      if (!targets.length) continue;
      r.fluid.tick(dt);
      for (const [id, m] of r.mobs) {
        let p = targets[0];
        for (const q of targets)
          if (
            vec(q.p).distanceToSquared(m.group.position) <
            vec(p.p).distanceToSquared(m.group.position)
          )
            p = q;
        m.update(
          dt,
          this.clock,
          vec(p.p),
          r.world,
          (n) => this.damage(p, n),
          (pos) => this.enemyShot(dimension, pos, p),
          (pos) => {
            for (const q of targets) if (vec(q.p).distanceTo(pos) < 4) this.damage(q, 8);
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
    if (end.length)
      this.dragon.update(dt, 8 - this.crystals.length, vec(end[0].p), (pos) =>
        this.enemyShot("end", pos, end[Math.floor(Math.random() * end.length)]),
      );
    for (const s of this.shots) {
      s.life -= dt;
      s.p.addScaledVector(s.v, dt);
      const w = this.ensure(s.dimension, s.p.x, s.p.z, 0);
      if (w.solid(s.p.x, s.p.y, s.p.z)) s.life = 0;
      if (!s.owner) {
        for (const p of active)
          if (
            p.dimension === s.dimension &&
            vec(p.p)
              .add(new THREE.Vector3(0, 1, 0))
              .distanceTo(s.p) < 0.9
          ) {
            if (!this.safe(p) && this.now() > p.spawnUntil) this.damage(p, 4);
            s.life = 0;
            break;
          }
      } else {
        const p = this.players.get(s.owner);
        if (p) {
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
              this.damage(target, 7, array(s.v.clone().normalize().multiplyScalar(3)));
              s.life = 0;
              break;
            }
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
        }
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
  }
  enemyShot(d: Dimension, pos: THREE.Vector3, p: Player) {
    this.shots.push({
      p: pos.clone(),
      v: vec(p.p)
        .add(new THREE.Vector3(0, 1, 0))
        .sub(pos)
        .normalize()
        .multiplyScalar(12),
      dimension: d,
      owner: "",
      life: 6,
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
      chat: this.chat,
      drops: this.drops,
      players: [...this.players.values()],
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
      time: this.dragon.time,
      dead: this.dragon.dead,
      deathTime: this.dragon.deathTime,
    };
  }
  restore(s: ReturnType<Room["save"]>) {
    if (s.version !== 1) throw Error("Unsupported world");
    this.clock = s.clock;
    this.tickId = s.tick;
    this.sequence = s.sequence;
    this.won = s.won;
    this.crystals = s.crystals;
    this.storage = s.storage;
    this.slots = s.slots ?? {};
    this.chestRevisions = s.chestRevisions ?? {};
    this.chat = s.chat ?? [];
    this.drops = s.drops;
    Object.assign(this.dragon, s.dragon);
    this.players = new Map(s.players.map((p) => [p.id, { ...p, seen: 0 }]));
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
