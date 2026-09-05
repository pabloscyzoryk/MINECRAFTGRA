import type { Game } from "./engine";
import { Mob } from "./entities";
import { castleLoot, castleSites, describeCastle, firstCastle } from "./castles";
import { BIOMES, findBiome } from "./biomes";
import { hash } from "./world";
import { fromCounts, chestCounts, type ChestSlots } from "./chest-slots";
import { createFurnace, restoreFurnace, tickFurnace, type FurnaceState } from "./furnace";
import {
  armorSlot,
  armorPoints,
  clickArmorSlot,
  emptyEquipment,
  equipArmorItem,
  migrateEquipment,
  type ArmorSlot,
  type Equipment,
  type ArmorSource,
} from "./armor";
import type { Stack } from "./inventory";
import { bedRestExit, resolveBedRest } from "./bed-rest";
import { canonicalBlock, type V3 } from "./block-shapes";
import { findSafeWorldSpawn } from "./safe-spawn";
export type AdventureData = {
  furnaces: Record<string, FurnaceState>;
  chestSlots: Record<string, ChestSlots>;
  discovered: string[];
  opened: number;
  harvested: number;
  armor: number;
  equipment: Equipment;
  awards: string[];
  storage: Record<string, Record<number, number>>;
  crops: Record<string, number>;
  spawn: { x: number; y: number; z: number } | null;
  bedSpawn: V3 | null;
  waypoint: { x: number; z: number; name: string } | null;
  castleDefeated: string[];
};
export const newAdventure = (): AdventureData => ({
  furnaces: {},
  chestSlots: {},
  discovered: [],
  opened: 0,
  harvested: 0,
  armor: 0,
  equipment: emptyEquipment(),
  awards: [],
  storage: {},
  crops: {},
  spawn: null,
  bedSpawn: null,
  waypoint: null,
  castleDefeated: [],
});
export class Adventure {
  data: AdventureData = newAdventure();
  currentChest = "";
  currentFurnace = "";
  furnaceUiTime = 0;
  timer = 0;
  growthTimer = 0;
  constructor(public game: Game) {}
  reset() {
    this.data = newAdventure();
    this.currentChest = "";
    this.currentFurnace = "";
  }
  key(x: number, y: number, z: number) {
    return this.game.world.dimension + ":" + x + "," + y + "," + z;
  }
  quests() {
    const g = this.game,
      d = this.data;
    return [
      {
        id: "miner",
        name: "Pierwszy tunel",
        description: "Wydobądź 50 bloków.",
        value: g.mined,
        target: 50,
        reward: 40,
      },
      {
        id: "builder",
        name: "Mój kawałek świata",
        description: "Postaw 30 bloków.",
        value: g.placed,
        target: 30,
        reward: 50,
      },
      {
        id: "explorer",
        name: "Za kolejnym horyzontem",
        description: "Odkryj 5 różnych biomów.",
        value: d.discovered.length,
        target: 5,
        reward: 100,
      },
      {
        id: "collector",
        name: "Śladami dawnych osad",
        description: "Otwórz 3 skrzynie w strukturach.",
        value: d.opened,
        target: 3,
        reward: 100,
      },
      {
        id: "farmer",
        name: "Od ziarna do chleba",
        description: "Zbierz 10 dojrzałych upraw.",
        value: d.harvested,
        target: 10,
        reward: 80,
      },
      {
        id: "diamond",
        name: "Diamentowa epoka",
        description: "Zdobądź diamentowy kilof.",
        value: g.inventory[103] > 0 ? 1 : 0,
        target: 1,
        reward: 100,
      },
      {
        id: "nether",
        name: "Po drugiej stronie ognia",
        description: "Odwiedź Nether.",
        value: g.visited.includes("nether") ? 1 : 0,
        target: 1,
        reward: 100,
      },
      {
        id: "dragon",
        name: "Koniec jest początkiem",
        description: "Pokonaj smoka Endu.",
        value: g.won ? 1 : 0,
        target: 1,
        reward: 200,
      },
    ];
  }
  snapshot() {
    const d = this.data,
      p = this.game.position,
      w = d.waypoint;
    return {
      discovered: [...d.discovered],
      opened: d.opened,
      harvested: d.harvested,
      armor: d.armor,
      equipment: { ...d.equipment },
      armorPoints: armorPoints(d.equipment),
      awards: [...d.awards],
      quests: this.quests(),
      chest: { ...d.storage[this.currentChest] },
      chestSlots: this.chestSlots().map((s) => (s ? { ...s } : null)),
      furnace:
        this.currentFurnace && d.furnaces[this.currentFurnace]
          ? structuredClone(d.furnaces[this.currentFurnace])
          : null,
      waypoint: w
        ? {
            ...w,
            distance: Math.round(Math.hypot(w.x - p.x, w.z - p.z)),
            angle: ((Math.atan2(w.x - p.x, -(w.z - p.z)) + this.game.yaw) * 180) / Math.PI,
          }
        : null,
    };
  }
  tick(dt: number) {
    const g = this.game,
      d = this.data;
    this.timer += dt;
    this.growthTimer += dt;
    if (!g.net && this.growthTimer >= 1) {
      const elapsed = this.growthTimer;
      this.growthTimer = 0;
      for (const key of Object.keys(d.crops)) {
        if (!key.startsWith(g.world.dimension + ":")) continue;
        const [x, y, z] = key.split(":")[1].split(",").map(Number);
        if (!g.world.chunks.has(Math.floor(x / 16) + "," + Math.floor(z / 16))) continue;
        const id = g.world.get(x, y, z);
        if (![64, 65, 66].includes(id)) {
          delete d.crops[key];
          continue;
        }
        if (id === 66) continue;
        let wet = false;
        for (let dx = -4; dx <= 4 && !wet; dx++)
          for (let dz = -4; dz <= 4; dz++) if (g.world.get(x + dx, y - 1, z + dz) === 7) wet = true;
        d.crops[key] += elapsed * (wet ? 1 : 0.18);
        const next = d.crops[key] >= 60 ? 66 : d.crops[key] >= 30 ? 65 : 64;
        if (next !== id) g.world.set(x, y, z, next);
      }
    }
    if (this.timer < 1) return;
    this.timer = 0;
    this.spawnCastleGuards();
    if (g.world.dimension === "overworld") {
      const b = g.world.biomeInfo(g.position.x, g.position.z);
      if (!d.discovered.includes(b.id)) {
        d.discovered.push(b.id);
        g.xp += 15;
        g.notify("Nowy biom: " + b.name + " • +15 PD");
      }
    }
    for (const q of this.quests())
      if (q.value >= q.target && !d.awards.includes(q.id)) {
        d.awards.push(q.id);
        g.xp += q.reward;
        g.audio.play("craft");
        g.notify("Osiągnięcie: " + q.name + " • +" + q.reward + " PD");
      }
  }
  chestSlots() {
    if (!this.currentChest) return Array(27).fill(null) as ChestSlots;
    this.data.chestSlots ??= {};
    return (this.data.chestSlots[this.currentChest] ??= fromCounts(
      this.data.storage[this.currentChest] ?? {},
    ));
  }
  furnaceState() {
    return this.currentFurnace ? this.data.furnaces[this.currentFurnace] : undefined;
  }
  openFurnace(x: number, y: number, z: number) {
    if (this.game.net) return this.game.net.openFurnace(x, y, z);
    this.currentFurnace = this.key(x, y, z);
    this.data.furnaces[this.currentFurnace] ??= createFurnace();
    this.game.audio.play("place");
    this.game.pause("furnace");
  }
  tickFurnaces(dt: number) {
    const g = this.game;
    for (const [key, state] of Object.entries(this.data.furnaces)) {
      if (!key.startsWith(g.world.dimension + ":")) continue;
      const [x, y, z] = key.split(":")[1].split(",").map(Number);
      if (Math.hypot(x - g.position.x, z - g.position.z) > 96) continue;
      if (g.world.get(x, y, z) !== 29) {
        this.furnaceBlockChanged(x, y, z);
        continue;
      }
      tickFurnace(state, dt);
    }
    this.furnaceUiTime += dt;
    if (g.pauseReason === "furnace" && this.furnaceUiTime >= 0.1) {
      this.furnaceUiTime = 0;
      g.emit();
    }
  }
  furnaceBlockChanged(x: number, y: number, z: number) {
    const g = this.game,
      key = this.key(x, y, z),
      state = this.data.furnaces[key];
    if (g.net || !state || g.world.get(x, y, z) === 29) return;
    delete this.data.furnaces[key];
    for (const stack of state.slots)
      if (stack)
        g.drops.spawn(stack.id, stack.n, g.position.clone().set(x + 0.5, y + 0.5, z + 0.5));
    if (this.currentFurnace === key) {
      this.currentFurnace = "";
      if (g.pauseReason === "furnace") g.resume();
    }
  }
  setChestSlots(slots: ChestSlots) {
    this.data.chestSlots[this.currentChest] = slots;
    this.data.storage[this.currentChest] = chestCounts(slots);
  }
  openChest(x: number, y: number, z: number) {
    if (this.game.net) {
      this.game.net.openChest(x, y, z);
      return;
    }
    const g = this.game,
      key = this.key(x, y, z);
    this.currentChest = key;
    if (!this.data.storage[key]) {
      const placed = Object.prototype.hasOwnProperty.call(g.world.edits, key);
      let loot: Record<number, number> = {};
      if (!placed) {
        loot = {
          107: 3,
          113: 16,
          110: 2 + Math.floor(hash(x, z, g.world.seed) * 4),
          116: 6,
        };
        if (Math.hypot(x, z) > 29) {
          loot[119] = 1;
          loot[111] = 1 + Math.floor(hash(z, x, g.world.seed + 8) * 3);
        }
        for (const castle of g.world.castlesNearby(x, z, 0)) {
          const supplies = castleLoot(castle, x, y, z);
          if (supplies) {
            loot = supplies;
            break;
          }
        }
        this.data.opened++;
      }
      this.data.storage[key] = loot;
    }
    g.audio.play("place");
    g.pause("chest");
  }
  transfer(id: number, toChest: boolean) {
    if (this.game.net) return;
    const g = this.game,
      storage = this.data.storage[this.currentChest];
    if (!storage) return;
    const from = toChest ? g.inventory : storage,
      to = toChest ? storage : g.inventory,
      n = from[id] ?? 0;
    if (n < 1) return;
    to[id] = (to[id] ?? 0) + n;
    delete from[id];
    g.audio.play("place");
    g.emit();
  }
  takeAll() {
    for (const id of Object.keys(this.data.storage[this.currentChest] ?? {}))
      this.transfer(Number(id), false);
    this.game.notify("Zawartość skrzyni przeniesiona do ekwipunku.");
  }
  mineSpecial(id: number, x: number, y: number, z: number) {
    const g = this.game,
      key = this.key(x, y, z);
    if (id === 29 && this.data.furnaces[key]) {
      for (const stack of this.data.furnaces[key].slots) if (stack) g.add(stack.id, stack.n);
      delete this.data.furnaces[key];
    }
    if ([64, 65, 66].includes(id)) {
      delete this.data.crops[key];
      g.add(116, id === 66 ? 3 : 1);
      if (id === 66) {
        g.add(117, 2);
        this.data.harvested++;
      }
      return true;
    }
    if (id === 42) {
      g.add(hash(x, z, Math.floor(g.clock)) > 0.78 ? 124 : 42);
      return true;
    }
    if (id === 79) {
      if (hash(x, z, Math.floor(g.clock)) > 0.35) g.add(116);
      return true;
    }
    if (id === 61 && this.data.storage[key]) {
      for (const [item, n] of Object.entries(this.data.storage[key])) g.add(Number(item), n);
      this.data.storage[key] = {};
      delete this.data.chestSlots[key];
    }
    return false;
  }
  plant(x: number, y: number, z: number) {
    const g = this.game;
    if (g.world.dimension !== "overworld") {
      g.notify("Pszenica rośnie w Nadziemiu.");
      return;
    }
    if (g.world.get(x, y - 1, z) !== 63 || g.world.get(x, y, z) !== 0) {
      g.notify("Posadź nasiona na pustej uprawnej ziemi.");
      return;
    }
    if (g.mode !== "creative" && !(g.inventory[116] > 0)) return;
    g.world.set(x, y, z, 64);
    this.data.crops[this.key(x, y, z)] = 0;
    if (g.mode !== "creative") g.inventory[116]--;
    g.audio.play("place");
    g.actionCooldown = 0.2;
    g.emit();
  }
  bed(x: number, y: number, z: number) {
    return this.game.beginRest(x, y, z);
  }

  respawn() {
    const g = this.game,
      p = this.data.spawn;
    let bed = this.data.bedSpawn;
    // Older saves stored only the safe standing point. Recover its nearby bed once,
    // rather than keeping a permanent spawn coordinate after that bed is destroyed.
    if (!bed && p) {
      g.ensure(p.x, p.z, true);
      const candidates: { p: V3; distance: number }[] = [];
      for (let x = Math.floor(p.x) - 4; x <= Math.floor(p.x) + 4; x++)
        for (let z = Math.floor(p.z) - 4; z <= Math.floor(p.z) + 4; z++)
          for (let y = Math.max(1, Math.floor(p.y) - 4); y <= Math.floor(p.y) + 3; y++)
            if (canonicalBlock(g.world.get(x, y, z)) === 62)
              candidates.push({
                p: [x, y, z],
                distance: Math.hypot(x + 0.5 - p.x, y - p.y, z + 0.5 - p.z),
              });
      candidates.sort((a, b) => a.distance - b.distance);
      for (const candidate of candidates) {
        const rest = resolveBedRest(g.world, ...candidate.p);
        if (rest) {
          bed = rest.foot;
          break;
        }
      }
    }
    if (bed) {
      g.ensure(bed[0], bed[2], true);
      const rest = resolveBedRest(g.world, ...bed);
      const exit = rest ? bedRestExit(g.world, rest) : null;
      if (exit) {
        this.data.bedSpawn = [...rest!.foot];
        this.data.spawn = { x: exit[0], y: exit[1], z: exit[2] };
        this.data.equipment = emptyEquipment();
        this.data.armor = 0;
        g.position.fromArray(exit);
        return true;
      }
    }
    this.data.bedSpawn = null;
    this.data.spawn = null;
    const exit = findSafeWorldSpawn(g.world);
    if (!exit) return false;
    this.data.equipment = emptyEquipment();
    this.data.armor = 0;
    g.ensure(exit[0], exit[2], true);
    g.position.fromArray(exit);
    return true;
  }
  locate(id: string, teleport = false) {
    const g = this.game,
      r = findBiome(id, g.world.seed, g.position.x, g.position.z);
    if (!r) {
      g.notify("Nie znaleziono tego biomu w pobliżu.");
      return;
    }
    this.data.waypoint = { x: r.x, z: r.z, name: r.biome.name };
    if (teleport && g.mode === "creative") {
      if (g.world.dimension !== "overworld") g.travel("overworld");
      g.ensure(r.x, r.z, true);
      g.position.set(r.x + 0.5, g.world.surface(r.x, r.z) + 0.1, r.z + 0.5);
      g.velocity.set(0, 0, 0);
    }
    g.notify("Cel wyprawy: " + r.biome.name);
    g.emit();
  }
  clearWaypoint() {
    this.data.waypoint = null;
    this.game.emit();
  }
  /** Defenders belong to one landmark and defeated IDs survive dimension changes and reloads. */
  spawnCastleGuards() {
    const g = this.game;
    if (g.net || g.world.dimension !== "overworld") return;
    for (const mob of g.mobs)
      if (mob.dead && mob.guard && !this.data.castleDefeated.includes(mob.guard.id))
        this.data.castleDefeated.push(mob.guard.id);
    for (const castle of g.world.castlesNearby(g.position.x, g.position.z, 60)) {
      for (const guard of castle.guards) {
        if (
          Math.hypot(guard.p[0] - g.position.x, guard.p[2] - g.position.z) > 82 ||
          this.data.castleDefeated.includes(guard.id) ||
          g.mobs.some((m) => m.guard?.id === guard.id)
        )
          continue;
        g.world.chunk(Math.floor(guard.p[0] / 16), Math.floor(guard.p[2] / 16));
        if (
          g.world.solid(guard.p[0], guard.p[1] + 1, guard.p[2]) ||
          g.world.solid(guard.p[0], guard.p[1] + 2, guard.p[2])
        )
          continue;
        const mob = new Mob("knight", guard.p[0], guard.p[2], g.world);
        mob.group.position.fromArray(guard.p);
        mob.guard = {
          id: guard.id,
          castleId: castle.id,
          home: [castle.x, castle.y, castle.z],
          post: [...guard.p],
          radius: 42,
        };
        g.mobs.push(mob);
        g.scene.add(mob.group);
      }
    }
  }
  locateCastle(teleport = false) {
    const g = this.game;
    if (g.world.dimension !== "overworld") {
      g.notify("Zamków szukaj w Nadziemiu.");
      return;
    }
    const sites = castleSites(g.world.seed, g.position.x, g.position.z, 600);
    const site =
      sites.sort(
        (a, b) =>
          Math.hypot(a.x - g.position.x, a.z - g.position.z) -
          Math.hypot(b.x - g.position.x, b.z - g.position.z),
      )[0] ?? firstCastle(g.world.seed);
    const castle = describeCastle(site, (x, z) => g.world.height(x, z));
    this.data.waypoint = { x: castle.entrance[0], z: castle.entrance[2] + 8, name: castle.name };
    if (teleport && g.mode === "creative") {
      const [x, , z] = castle.entrance;
      g.ensure(x, z + 8, true);
      g.position.set(x + 0.5, g.world.surface(x, z + 8) + 0.1, z + 8.5);
      g.velocity.set(0, 0, 0);
      this.spawnCastleGuards();
    }
    g.notify("Cel wyprawy: " + castle.name + ". Zabierz pancerz i zapasy.");
    g.emit();
  }
  equipArmor(id: number, from?: ArmorSource, expected?: Stack | null) {
    if (!armorSlot(id)) return;
    if (this.game.net) return this.game.net.equipArmor(id, from, expected);
    if (!from && this.game.mode === "creative" && !this.game.pack.counts()[id])
      this.game.add(id, 1);
    if (!equipArmorItem(this.game.pack, this.data.equipment, id, from, expected)) return;
    this.data.armor = this.data.equipment.chest;
    this.game.commitPack();
    this.game.notify("Pancerz założony.");
  }
  armorSlot(slot: ArmorSlot) {
    if (this.game.net) return this.game.net.armorSlot(slot);
    if (!clickArmorSlot(this.game.pack, this.data.equipment, slot)) return;
    this.data.armor = this.data.equipment.chest;
    this.game.commitPack();
  }
  restore(value: Partial<AdventureData> | undefined) {
    this.reset();
    if (!value || typeof value !== "object") return;
    this.data = { ...this.data, ...value };
    this.data.bedSpawn =
      Array.isArray(value.bedSpawn) &&
      value.bedSpawn.length === 3 &&
      value.bedSpawn.every(Number.isInteger) &&
      value.bedSpawn[1] >= 1 &&
      value.bedSpawn[1] <= 72
        ? [value.bedSpawn[0], value.bedSpawn[1], value.bedSpawn[2]]
        : null;
    const spawn = value.spawn;
    this.data.spawn =
      spawn && [spawn.x, spawn.y, spawn.z].every(Number.isFinite)
        ? { x: spawn.x, y: spawn.y, z: spawn.z }
        : null;
    this.data.equipment = migrateEquipment(
      value.equipment,
      Number(value.armor) || 0,
      this.game.pack,
    );
    this.data.armor = this.data.equipment.chest;
    this.game.inventory = this.game.pack.counts();
    this.data.discovered = Array.isArray(value.discovered)
      ? value.discovered.filter((id) => BIOMES.some((b) => b.id === id))
      : [];
    this.data.awards = Array.isArray(value.awards)
      ? value.awards.filter((id) => typeof id === "string")
      : [];
    this.data.castleDefeated = Array.isArray(value.castleDefeated)
      ? [
          ...new Set(
            value.castleDefeated.filter(
              (id) => typeof id === "string" && /^castle:(?:first|-?\d+,-?\d+):guard:\d$/.test(id),
            ),
          ),
        ].slice(0, 4096)
      : [];
    this.data.storage = value.storage && typeof value.storage === "object" ? value.storage : {};
    this.data.crops = value.crops && typeof value.crops === "object" ? value.crops : {};
    this.data.furnaces = {};
    for (const [key, state] of Object.entries(value.furnaces ?? {}))
      if (/^(overworld|nether|end):-?\d+,\d+,-?\d+$/.test(key))
        this.data.furnaces[key] = restoreFurnace(state);
  }
}
