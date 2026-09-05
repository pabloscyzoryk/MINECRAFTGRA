import * as THREE from "three";
import type { Game } from "./engine";
import { Mob, cube, mat } from "./entities";
import { SkinModel, readSkin, defaultSkin } from "./skin-model";
import { PROTOCOL, type PlayerWire, type SkinWire, type FrameWire, type Vec } from "./net-protocol";
import { VoiceChat } from "./voice";
import { weapon } from "./combat";
import { SWING_DURATION } from "./interaction-effects";
import { DRAGON_MAX_HEALTH } from "./dragon-balance";
import { damageCauseLabel } from "./damage-causes";
import { normalizeEquipment, type ArmorSlot } from "./armor";
import type { InventoryGesture } from "./inventory-gestures";
import type { Stack } from "./inventory";
import { chestCounts, type ChestSlots } from "./chest-slots";
import { restoreFurnace, type FurnaceState } from "./furnace";
import { normalizeDifficulty, type Difficulty } from "./difficulty";
import {
  validFaceFrame,
  FACE_FRAME_INTERVAL,
  FACE_FRAME_TIMEOUT,
  FACE_ROOM_FRAME_BUDGET,
} from "./net-protocol";
type Remote = {
  model: SkinModel;
  label: THREE.Sprite;
  wire: PlayerWire;
  position: THREE.Vector3;
  skinKey: string;
  swingTime?: number;
};
export class Multiplayer {
  socket: WebSocket | null = null;
  status = "Łączenie…";
  connected = false;
  initialized = false;
  closed = false;
  fatal = false;
  id = "";
  clock = 90;
  horrorClock = 0;
  huntClock = 0;
  damageNoticeAt = -Infinity;
  difficulty: Difficulty;
  ping = 0;
  nick: string;
  token = "";
  skin: SkinWire | null = null;
  players: PlayerWire[] = [];
  remotes = new Map<string, Remote>();
  appearances = new Map<string, { nick: string; skin?: SkinWire }>();
  entities = new Map<string, Mob>();
  dropMeshes = new Map<string, THREE.Mesh>();
  shotMeshes: THREE.Mesh[] = [];
  voice: VoiceChat;
  chat: { nick: string; text: string; time: number; system?: boolean }[] = [];
  stamina = 100;
  protection = 0;
  blocking = false;
  lastFrame: FrameWire | null = null;
  lastFrameAt = 0;
  networkClock = 0;
  profileClock = 0;
  uiClock = 0;
  reconnectDelay = 1000;
  reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  joinTimer: ReturnType<typeof setTimeout> | null = null;
  pending = new Map<string, { command: any; at: number; callback?: (data: any) => void }>();
  applied = new Set<string>();
  sequence = 0;
  listeners = new Set<() => void>();
  chestBusy = false;
  inventoryRevision = 0;
  chestRevisions = new Map<string, number>();
  furnaceRevisions = new Map<string, number>();
  furnaceOpenGeneration = 0;
  furnaceRefreshKey: string | null = null;
  faceFrames = new Map<string, { frame: string; at: number }>();
  faceLastSent = -Infinity;
  inventoryQueue: {
    gesture:
      | InventoryGesture
      | { type: "settle"; size: 2 | 3 }
      | { type: "armor"; slot: ArmorSlot }
      | {
          type: "equipArmor";
          id: number;
          from?: { area: "slots" | "grid"; index: number };
          expected?: Stack | null;
        };
    chestKey: string | null;
    furnaceKey: string | null;
  }[] = [];
  constructor(
    public game: Game,
    nick: string,
    difficulty: Difficulty = normalizeDifficulty(game.difficulty),
  ) {
    this.nick = nick;
    this.difficulty = normalizeDifficulty(difficulty);
    try {
      this.token = localStorage.getItem("blockland.online.token") ?? "";
      localStorage.setItem("blockland.online.nick", nick);
    } catch {}
    if (!/^[a-f0-9]{64}$/.test(this.token)) {
      const bytes = crypto.getRandomValues(new Uint8Array(32));
      this.token = Array.from(bytes, (n) => n.toString(16).padStart(2, "0")).join("");
      try {
        localStorage.setItem("blockland.online.token", this.token);
      } catch {}
    }
    this.voice =
      game.voice ??
      new VoiceChat(
        (audio) => this.send({ type: "voice", audio }),
        () => this.connected,
        () => this.emit(),
      );
  }
  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };
  emit() {
    for (const fn of this.listeners) fn();
  }
  async connect() {
    const data = await readSkin();
    if (this.closed) return;
    this.skin = {
      skin: data.skin.toDataURL(),
      cape: data.cape.toDataURL(),
      capeEnabled: data.capeEnabled,
    };
    this.open();
  }
  open() {
    if (this.closed) return;
    this.status = "Łączenie z publicznym światem…";
    this.emit();
    const url = new URL("/api/game", location.href);
    url.protocol = location.protocol === "https:" ? "wss:" : "ws:";
    try {
      this.socket = new WebSocket(url);
      this.socket.onopen = () => {
        this.status = "Wczytywanie wspólnego świata…";
        this.join();
        this.send({ type: "ping", time: performance.now() });
      };
      this.socket.onmessage = (e) => {
        try {
          this.receive(JSON.parse(String(e.data)));
        } catch (err) {
          console.error("Network message", err);
        }
      };
      this.socket.onerror = () => {
        this.status = "Nie można połączyć się z serwerem.";
        this.emit();
      };
      this.socket.onclose = () => {
        this.clearRemoteFaces();
        this.connected = false;
        if (!this.closed && (!this.game.net || this.game.net === this)) {
          this.voice.blur();
          this.game.horror?.clear();
          this.game.horrorThreat = null;
          this.game.emit();
        }
        if (!this.closed && !this.fatal) {
          this.status = "Połączenie przerwane. Ponawianie…";
          this.reconnectTimer = setTimeout(() => this.open(), this.reconnectDelay);
          this.reconnectDelay = Math.min(10000, this.reconnectDelay * 1.6);
        }
        this.emit();
      };
    } catch {
      this.status = "Multiplayer wymaga uruchomienia gry z adresu serwera HTTPS.";
      this.emit();
    }
  }
  join() {
    this.send({
      type: "join",
      protocol: PROTOCOL,
      token: this.token,
      nick: this.nick,
      skin: this.skin,
      difficulty: this.difficulty,
    });
    if (this.joinTimer) clearTimeout(this.joinTimer);
    this.joinTimer = setTimeout(() => {
      if (!this.connected && !this.closed && !this.fatal) this.join();
    }, 3000);
  }
  send(data: unknown) {
    if (this.socket?.readyState === WebSocket.OPEN && this.socket.bufferedAmount < 300000)
      this.socket.send(JSON.stringify(data));
  }
  request(command: Record<string, unknown>, callback?: (data: any) => void) {
    if (
      this.chestBusy &&
      !["inventoryGesture", "settleInventory", "armor", "equipArmor", "environmentDamage"].includes(
        String(command.type),
      )
    )
      return "";
    if (!this.connected) {
      this.game.notify("Poczekaj na połączenie z serwerem.");
      return "";
    }
    const req = this.token.slice(0, 8) + "-" + Date.now().toString(36) + "-" + ++this.sequence;
    const c = { ...command, req };
    this.pending.set(req, { command: c, callback, at: performance.now() });
    this.sendInput();
    this.sendProfile(true);
    this.send({ type: "command", command: c });
    return req;
  }
  receive(data: any) {
    if (this.closed) return;
    const g = this.game;
    if (data.type === "horrorReset") {
      g.horror?.clear();
      g.horrorThreat = null;
      g.emit();
      return;
    }
    if (data.type === "horrorHunt") {
      if (Number.isFinite(data.clock)) this.huntClock = Math.max(0, data.clock);
      const hunt = data.hunt;
      g.horrorThreat =
        g.difficulty === "horror" &&
        hunt &&
        hunt.dimension === g.world.dimension &&
        Array.isArray(hunt.p) &&
        hunt.p.length === 3 &&
        hunt.p.every(Number.isFinite) &&
        Number.isFinite(hunt.hp) &&
        Number.isFinite(hunt.maxHp) &&
        hunt.maxHp > 0 &&
        hunt.hp >= 0 &&
        hunt.hp <= hunt.maxHp &&
        typeof hunt.id === "string" &&
        Number.isFinite(hunt.yaw) &&
        Number.isFinite(hunt.phaseAt) &&
        Number.isFinite(hunt.phaseDuration) &&
        hunt.phaseDuration >= 0 &&
        [
          "telegraph",
          "stalk",
          "lungeTell",
          "lunge",
          "vulnerable",
          "caught",
          "escaped",
          "banished",
        ].includes(hunt.phase) &&
        Array.isArray(hunt.viewerIds) &&
        hunt.viewerIds.includes(this.id)
          ? structuredClone(hunt)
          : null;
      g.emit();
      return;
    }
    if (data.type === "horror") {
      g.receiveHorror(data.event);
      return;
    }
    if (data.type === "vitals") {
      if (typeof data.food === "number") g.food = Math.max(0, Math.min(20, data.food));
      if (typeof data.health === "number") g.health = Math.max(0, Math.min(20, data.health));
      if (data.difficulty) {
        this.difficulty = normalizeDifficulty(data.difficulty);
        g.setDifficulty(this.difficulty, true);
      }
      g.emit();
      return;
    }
    if (data.type === "ready") {
      this.join();
      return;
    }
    if (data.type === "resync") {
      this.join();
      return;
    }
    if (data.type === "error") {
      this.status = String(data.message);
      this.fatal = !!data.fatal;
      if (this.fatal) {
        this.connected = false;
        this.socket?.close();
      }
      this.emit();
      return;
    }
    if (data.type === "pong") {
      this.ping = Math.round(performance.now() - data.time);
      return;
    }
    if (data.type === "welcome") {
      g.horrorThreat = null;
      this.clearRemoteFaces();
      this.faceLastSent = -Infinity;
      this.furnaceOpenGeneration++;
      this.furnaceRefreshKey = g.pauseReason === "furnace" ? g.adventure.currentFurnace : null;
      this.furnaceRevisions.clear();
      g.adventure.data.furnaces = {};
      this.inventoryRevision = Number(data.profile?.inventoryRevision) || 0;
      this.id = data.id;
      this.connected = true;
      this.status = "Połączono";
      this.reconnectDelay = 1000;
      this.clock = data.clock;
      this.horrorClock = Number(data.horrorClock) || 0;
      this.difficulty = normalizeDifficulty(data.profile?.difficulty);
      if (this.joinTimer) clearTimeout(this.joinTimer);
      if (!this.initialized) {
        g.net = this;
        const s = data.profile ?? {};
        g.restore({
          v: 1,
          seed: data.seed,
          mode: "survival",
          difficulty: this.difficulty,
          dimension: data.player.dimension,
          position: data.player.p,
          yaw: data.player.yaw,
          pitch: data.player.pitch,
          edits: data.edits,
          waterLevels: data.water,
          health: data.health,
          food: s.food ?? 20,
          xp: s.xp ?? 0,
          inventory: s.inventory ?? {},
          pack: s.pack,
          clock: data.clock,
          adventure: { ...s.adventure, equipment: s.equipment ?? s.adventure?.equipment },
          crystals: data.crystals,
          dragon: data.dragon,
          dragonMaxHealth: DRAGON_MAX_HEALTH,
          won: data.won,
          visited: s.visited ?? ["overworld"],
        });
        g.clearDynamic();
        if (g.world.dimension === "end") g.spawnDragon();
        g.started = true;
        g.preview = false;
        g.net = this;
        g.health = data.health;
        this.initialized = true;
        g.onMenu("");
        g.resume();
        if (g.health <= 0) g.pause("death");
      } else {
        g.world.edits = { ...data.edits };
        g.world.waterLevels = { ...data.water };
        g.world.chunks.clear();
        g.dimensionChanged();
        g.ensure(g.position.x, g.position.z, true);
      }
      if (this.initialized) {
        g.pack.restore(data.profile?.pack ?? {});
        if (!data.profile?.pack) g.pack.reconcile(data.profile?.inventory ?? {});
        g.inventory = g.pack.counts();
        g.hotbar = g.pack.slots.slice(0, 9).map((s) => s?.id ?? 0);
        g.heldId = -1;
      }
      g.adventure.data.equipment = normalizeEquipment(
        data.profile?.equipment ?? data.profile?.adventure?.equipment,
      );
      g.adventure.data.armor = g.adventure.data.equipment.chest;
      g.health = data.health;
      g.setDifficulty(this.difficulty, true);
      if (g.health <= 0) {
        this.inventoryQueue = [];
        g.pause("death");
      }
      this.sendInput();
      this.sendFaceFrame(g.faceCamera?.latestFrame ?? null);
      for (const p of this.pending.values()) {
        p.at = performance.now();
        this.send({ type: "command", command: p.command });
      }
      this.refreshFurnace();
      this.emit();
      return;
    }
    if (data.type === "faceFrame") {
      if (
        this.closed ||
        typeof data.sender !== "string" ||
        data.sender.length > 64 ||
        data.sender === this.id ||
        !validFaceFrame(data.frame)
      )
        return;
      this.faceFrames ??= new Map();
      if (data.frame === null) this.faceFrames.delete(data.sender);
      else this.faceFrames.set(data.sender, { frame: data.frame, at: performance.now() });
      this.remotes.get(data.sender)?.model.setFaceFrame(data.frame);
      return;
    }
    if (data.type === "appearance") {
      this.appearances.set(data.id, { nick: data.nick, skin: data.skin });
      const r = this.remotes.get(data.id);
      if (r && data.skin) this.loadRemoteSkin(r, data.skin);
      return;
    }
    if (data.type === "frame") {
      if (!this.initialized) return;
      this.lastFrame = data;
      this.lastFrameAt = performance.now();
      this.clock = data.clock;
      if (Number.isFinite(data.horrorClock)) this.horrorClock = data.horrorClock;
      this.players = data.players;
      this.stamina = data.combat?.[this.id]?.stamina ?? this.stamina;
      this.protection = data.combat?.[this.id]?.protection ?? 0;
      for (const [dimension, x, y, z, id, level] of data.changes) {
        const key = dimension + ":" + [x, y, z];
        g.world.edits[key] = id;
        if (level >= 0) g.world.waterLevels[key] = level;
        else delete g.world.waterLevels[key];
        if (
          dimension === g.world.dimension &&
          g.world.chunks.has(Math.floor(x / 16) + "," + Math.floor(z / 16))
        )
          g.world.set(x, y, z, id, true);
      }
      g.won = data.won;
      g.dragonHealth = data.dragon?.hp ?? g.dragonHealth;
      g.crystalsDestroyed = [...data.crystals];
      for (const c of g.crystals)
        if (data.crystals.includes(c.index)) {
          g.releaseCrystal(c);
        }
      if (data.dragon && g.dragon) {
        Object.assign(g.dragon, data.dragon);
        g.dragon.group.position.fromArray(data.dragon.p);
        g.dragon.group.rotation.set(...(data.dragon.r as Vec));
      }
      this.syncPlayers();
      this.syncMobs(data);
      this.syncDrops(data.drops);
      this.syncShots(data.shots ?? []);
      return;
    }
    if (data.type === "result") {
      const pending = this.pending.get(data.req);
      this.pending.delete(data.req);
      if (this.applied.has(data.req)) return;
      this.applied.add(data.req);
      if (this.applied.size > 500) this.applied.delete(this.applied.values().next().value!);
      const currentPack = (Number(data.inventoryRevision) || 0) >= this.inventoryRevision;
      if (data.pack && currentPack) {
        g.pack.restore(data.pack);
        g.inventory = g.pack.counts();
        g.hotbar = g.pack.slots.slice(0, 9).map((s) => s?.id ?? 0);
        g.heldId = -1;
        this.inventoryRevision = Number(data.inventoryRevision) || 0;
      }
      if (data.equipment && currentPack) {
        g.adventure.data.equipment = normalizeEquipment(data.equipment);
        g.adventure.data.armor = g.adventure.data.equipment.chest;
      }
      if (data.ok) {
        if (!data.pack && currentPack) {
          for (const [id, n] of data.cost ?? [])
            g.inventory[id] = Math.max(0, (g.inventory[id] ?? 0) - n);
          g.syncPack();
          for (const [id, n] of data.grant ?? []) g.add(id, n);
        }
        if (typeof data.food === "number") g.food = data.food;
        if (data.xp) g.xp += data.xp;
        if (data.mined) g.mined++;
        if (data.placed) g.placed++;
        if (typeof data.health === "number") g.health = data.health;
        if (data.message) g.notify(data.message);
        if (data.bed)
          g.adventure.data.spawn = { x: g.position.x, y: g.position.y, z: g.position.z };
        g.emit();
      } else if (data.message) g.notify(data.message);
      if (data.chest) {
        this.applyChest(data.chest.key, data.chest.slots ?? [], data.chest.revision);
        g.emit();
      }
      if (data.furnace)
        this.applyFurnace(data.furnace.key, data.furnace.state, data.furnace.revision);
      pending?.callback?.(data);
      this.refreshFurnace();
      return;
    }
    if (data.type === "chestUpdate") {
      this.applyChest(data.key, data.slots, data.revision);
      return;
    }
    if (data.type === "furnaceUpdate") {
      this.applyFurnace(data.key, data.state, data.revision);
      return;
    }
    if (data.type === "damage") {
      this.inventoryRevision = Math.max(
        this.inventoryRevision,
        Number(data.inventoryRevision) || 0,
      );
      g.health = data.health;
      g.damageFlash = 0.5;
      g.audio.play("hurt");
      const cause = damageCauseLabel(data.reason),
        now = performance.now();
      if (g.health > 0 && cause && now - (this.damageNoticeAt ?? -Infinity) >= 3000) {
        this.damageNoticeAt = now;
        g.notify(cause);
      }
      if (Array.isArray(data.knockback)) g.velocity.add(new THREE.Vector3(...data.knockback));
      if (data.health <= 0) {
        this.inventoryQueue = [];
        g.horror?.clear();
        g.horrorThreat = null;
        g.adventure.data.equipment = normalizeEquipment(null);
        g.adventure.data.armor = 0;
        g.pack.reset();
        g.inventory = {};
        g.hotbar = Array(9).fill(0);
        g.pause("death");
      }
      g.emit();
      return;
    }
    if (data.type === "award") {
      g.xp += data.xp ?? 0;
      if (data.message) g.notify(data.message);
      g.emit();
      return;
    }
    if (data.type === "history") {
      this.chat = data.messages ?? [];
      this.emit();
      return;
    }
    if (data.type === "chat") {
      this.chat.push({
        nick: String(data.nick),
        text: String(data.text),
        time: Number(data.time),
        system: !!data.system,
      });
      this.chat = this.chat.slice(-60);
      this.emit();
      return;
    }
    if (data.type === "voice") {
      this.voice.receive(data.sender, data.audio);
      return;
    }
  }
  changeDifficulty(value: Difficulty) {
    const next = normalizeDifficulty(value);
    const req = this.request({ type: "difficulty", difficulty: next }, (data) => {
      if (!data.ok) return;
      this.difficulty = normalizeDifficulty(data.difficulty);
      this.game.setDifficulty(this.difficulty, true);
      this.emit();
    });
    if (!req && this.chestBusy)
      this.game.notify("Poczekaj na zakończenie przenoszenia przedmiotów.");
    return req;
  }
  sendInput() {
    const g = this.game;
    const active =
      g.active && !g.needsCapture && (typeof document === "undefined" || !document.hidden);
    this.send({
      type: "input",
      active,
      sprinting: active && g.sprinting,
      furnaceKey: g.pauseReason === "furnace" ? g.adventure.currentFurnace : null,
      p: g.position.toArray(),
      yaw: g.yaw,
      pitch: g.pitch,
      dimension: g.world.dimension,
      moving: active && Math.abs(g.velocity.x) + Math.abs(g.velocity.z) > 0.2,
      crouch: active && g.crouching,
      swing: active && g.swingTime > 0,
      swingProgress: active && g.swingTime > 0 ? 1 - g.swingTime / SWING_DURATION : -1,
      held: g.hotbar[g.selected] ?? 0,
      blocking: active && g.rightDown,
      grounded: g.grounded,
      armor: g.adventure.data.armor,
    });
  }
  sendProfile(force = false) {
    if (!this.connected || !this.initialized || (this.chestBusy && !force)) return;
    const g = this.game;
    g.syncPack();
    this.send({
      type: "profile",
      data: {
        inventoryRevision: this.inventoryRevision,
        pack: g.pack.snapshot(),
        selected: g.selected,
        inventory: { ...g.inventory },
        food: g.food,
        health: g.health,
        xp: g.xp,
        adventure: { ...g.adventure.data, storage: {}, chestSlots: {}, crops: {}, furnaces: {} },
        visited: g.visited,
        mined: g.mined,
        placed: g.placed,
      },
    });
  }
  tick(dt: number) {
    if (this.closed) return;
    for (const [id, face] of this.faceFrames ?? [])
      if (performance.now() - face.at > FACE_FRAME_TIMEOUT) {
        this.faceFrames.delete(id);
        this.remotes.get(id)?.model.setFaceFrame(null);
      }
    this.refreshFurnace();
    this.flushInventory();
    this.clock += dt;
    this.horrorClock += dt;
    this.huntClock = (this.huntClock ?? 0) + dt;
    this.networkClock += dt;
    this.profileClock += dt;
    this.uiClock += dt;
    if (this.connected && this.networkClock >= 0.1) {
      this.networkClock = 0;
      this.sendInput();
      for (const p of this.pending.values())
        if (performance.now() - p.at > 2000) {
          p.at = performance.now();
          this.send({ type: "command", command: p.command });
        }
    }
    if (this.profileClock >= 2) {
      this.profileClock = 0;
      this.sendProfile();
      this.send({ type: "ping", time: performance.now() });
    }
    if (this.uiClock > 0.15) {
      this.uiClock = 0;
      this.emit();
    }
    const g = this.game;
    for (const r of this.remotes.values()) {
      r.model.setEquipment?.(r.wire.equipment);
      r.model.group.visible = r.wire.dimension === g.world.dimension && (r.wire.health ?? 20) > 0;
      const dist = r.model.group.position.distanceTo(r.position);
      if (dist > 10) r.model.group.position.copy(r.position);
      else r.model.group.position.lerp(r.position, 1 - Math.exp(-dt * 14));
      const target = Math.PI + r.wire.yaw;
      const angle = Math.atan2(
        Math.sin(target - r.model.group.rotation.y),
        Math.cos(target - r.model.group.rotation.y),
      );
      r.model.group.rotation.y += angle * (1 - Math.exp(-dt * 15));
      r.swingTime = Math.max(0, (r.swingTime ?? 0) - dt);
      r.model.pose(
        this.clock,
        r.wire.moving,
        r.wire.crouch,
        r.swingTime ? 1 - r.swingTime / SWING_DURATION : -1,
      );
      r.model.head.rotation.x = -r.wire.pitch;
      r.label.visible = r.model.group.visible;
    }
    for (const m of this.entities.values()) {
      const target = m.group.userData.target as Vec | undefined;
      if (target) m.group.position.lerp(new THREE.Vector3(...target), 1 - Math.exp(-dt * 15));
    }
    if (g.world.dimension === "end" && g.dragon && this.lastFrame?.dragon) {
      const pos = g.dragon.group.position.clone();
      g.dragon.update(dt, 0, new THREE.Vector3(999, 0, 999), () => {});
      g.dragon.group.position.lerp(pos, 0.4);
    }
    for (const d of this.lastFrame?.drops ?? []) {
      if (d.dimension !== g.world.dimension || d.grace > 0) continue;
      if (
        Math.hypot(d.p[0] - g.position.x, d.p[1] - (g.position.y + 0.7), d.p[2] - g.position.z) <
          1.65 &&
        !Array.from(this.pending.values()).some(
          (p) => p.command.type === "pickup" && p.command.key === d.key,
        )
      ) {
        const capacity = g.pack.capacity(d.id);
        if (capacity) this.request({ type: "pickup", key: d.key, capacity });
      }
    }
  }
  syncPlayers() {
    const ids = new Set(this.players.map((p) => p.id));
    for (const [id, r] of this.remotes)
      if (!ids.has(id) || id === this.id) {
        r.model.group.removeFromParent();
        r.model.dispose();
        r.label.material.map?.dispose();
        r.label.material.dispose();
        this.remotes.delete(id);
        this.faceFrames.delete(id);
      }
    for (const p of this.players) {
      if (p.id === this.id) continue;
      let r = this.remotes.get(p.id);
      if (!r) {
        const model = new SkinModel(defaultSkin());
        model.group.position.fromArray(p.p);
        const canvas = document.createElement("canvas");
        canvas.width = 256;
        canvas.height = 48;
        const c = canvas.getContext("2d")!;
        c.fillStyle = "#14251cbb";
        c.fillRect(0, 0, 256, 48);
        c.font = "bold 24px Arial";
        c.textAlign = "center";
        c.fillStyle = "#f4ffe4";
        c.fillText(p.nick, 128, 33);
        const texture = new THREE.CanvasTexture(canvas);
        const label = new THREE.Sprite(
          new THREE.SpriteMaterial({ map: texture, depthTest: true, transparent: true }),
        );
        label.position.set(0, 2.3, 0);
        label.scale.set(2.6, 0.49, 1);
        model.group.add(label);
        this.game.scene.add(model.group);
        r = { model, label, wire: p, position: new THREE.Vector3(...p.p), skinKey: "" };
        this.remotes.set(p.id, r);
        const face = this.faceFrames.get(p.id);
        if (face && performance.now() - face.at <= FACE_FRAME_TIMEOUT)
          model.setFaceFrame(face.frame);
        const skin = this.appearances.get(p.id)?.skin;
        if (skin) this.loadRemoteSkin(r, skin);
      }
      r.model.setHeldItem(p.held);
      if (p.swing) {
        const progress = p.swingProgress ?? 0;
        const previous = r.wire.swingProgress ?? 0;
        if (!r.wire.swing || !r.swingTime || progress + 0.15 < previous)
          r.swingTime = SWING_DURATION * (1 - progress);
      }
      r.wire = p;
      r.position.fromArray(p.p);
    }
  }
  loadRemoteSkin(r: Remote, skin: SkinWire) {
    if (r.skinKey === skin.skin + skin.cape) return;
    r.skinKey = skin.skin + skin.cape;
    for (const key of ["skin", "cape"] as const) {
      const img = new Image();
      img.onload = () => {
        if (this.closed) return;
        const dest = r.model.data[key];
        if (img.width === dest.width && img.height === dest.height) {
          const c = dest.getContext("2d")!;
          c.clearRect(0, 0, dest.width, dest.height);
          c.drawImage(img, 0, 0);
          r.model.data.capeEnabled = skin.capeEnabled;
          r.model.refresh();
        }
      };
      img.src = skin[key];
    }
  }
  syncMobs(frame: FrameWire) {
    const g = this.game,
      wires = (frame.mobs[g.world.dimension] ?? []).filter(
        (w) => Math.hypot(w.p[0] - g.position.x, w.p[2] - g.position.z) < 100,
      ),
      ids = new Set(wires.map((m) => m.id));
    for (const [id, m] of this.entities)
      if (!ids.has(id)) {
        m.group.removeFromParent();
        m.dispose();
        this.entities.delete(id);
      }
    for (const w of wires) {
      let m = this.entities.get(w.id);
      if (!m || !m.group.parent) {
        m = new Mob(w.kind, w.p[0], w.p[2], g.world);
        m.group.position.fromArray(w.p);
        m.group.userData.netId = w.id;
        g.scene.add(m.group);
        this.entities.set(w.id, m);
      }
      Object.assign(m, {
        hp: w.hp,
        dead: w.dead,
        elapsed: w.elapsed,
        gait: w.gait,
        walkBlend: w.walkBlend,
        heading: w.heading,
        attackClock: w.attackClock,
        rangedAttack: !!w.rangedAttack,
        hurt: w.hurt,
        anger: Math.max(0, Math.min(30, Number(w.anger) || 0)),
        fuse: w.fuse,
        deathTime: w.deathTime,
        timer: Math.max(1, w.timer),
        attackCooldown: 5,
      });
      m.update(
        0,
        this.clock,
        new THREE.Vector3(...w.target),
        g.world,
        () => {},
        () => {},
        () => {},
      );
      // The zero-delta presentation update has no local observer; keep server gaze progress.
      m.eyeContact = Math.max(0, Math.min(0.25, Number(w.eyeContact) || 0));
      m.group.rotation.set(...w.r);
      if (w.head) m.head.rotation.set(w.head[0], w.head[1], 0);
      m.group.userData.target = w.p;
    }
    g.mobs = [...this.entities.values()];
  }
  syncDrops(drops: any[]) {
    const ids = new Set(drops.map((d) => d.key));
    for (const [id, mesh] of this.dropMeshes)
      if (!ids.has(id)) {
        mesh.removeFromParent();
        this.dropMeshes.delete(id);
      }
    for (const d of drops) {
      let mesh = this.dropMeshes.get(d.key);
      if (!mesh) {
        mesh = cube(this.game.scene, "#d9ca88", ...(d.p as Vec), 0.22, 0.22, 0.22);
        this.dropMeshes.set(d.key, mesh);
      }
      mesh.position.fromArray(d.p);
      mesh.rotation.y = this.clock * 2;
    }
  }
  syncShots(shots: any[]) {
    shots = shots.filter(
      (s) =>
        s.dimension === this.game.world.dimension &&
        Array.isArray(s.p) &&
        s.p.length === 3 &&
        s.p.every(Number.isFinite),
    );
    while (this.shotMeshes.length > shots.length) this.shotMeshes.pop()!.removeFromParent();
    shots.forEach((s, i) => {
      this.shotMeshes[i] ??= cube(
        this.game.scene,
        s.enemy ? "#dfb0ff" : "#e6d1a1",
        0,
        0,
        0,
        0.13,
        0.13,
        0.45,
        !!s.enemy,
      );
      this.shotMeshes[i].position.fromArray(s.p);
      this.shotMeshes[i].material = mat(s.enemy ? "#dfb0ff" : "#e6d1a1", !!s.enemy);
    });
  }
  mine(t: { x: number; y: number; z: number; id: number }) {
    if ([...this.pending.values()].some((p) => p.command.type === "mine")) return;
    const { x, y, z, id } = t,
      dimension = this.game.world.dimension;
    this.request({ type: "mine", x, y, z, expected: id }, (result) => {
      if (!result.ok || this.game.world.dimension !== dimension) return;
      if (this.game.settings.particles)
        this.game.blockParticles?.break(id, { x: x + 0.5, y: y + 0.5, z: z + 0.5 });
      this.game.audio.play("break");
    });
  }
  interact() {
    const g = this.game,
      t = g.target,
      id = g.hotbar[g.selected];
    if (id === 126) return true;
    if ([106, 107, 105].includes(id)) return false;
    if (!t) return false;
    if (t.id === 29) {
      this.openFurnace(t.x, t.y, t.z);
      return true;
    }
    if ([28, 30].includes(t.id)) {
      g.pause("crafting");
      return true;
    }
    if (t.id === 61) {
      this.openChest(t.x, t.y, t.z);
      return true;
    }
    if (id > 0 && !g.inventory[id] && t.id !== 62) {
      g.notify("Nie masz tego przedmiotu.");
      return true;
    }
    this.request({ type: "use", x: t.x, y: t.y, z: t.z, place: [t.px, t.py, t.pz] });
    g.actionCooldown = 0.25;
    return true;
  }
  attack() {
    const g = this.game,
      stats = weapon(g.hotbar[g.selected]);
    const ray = g.playerEyeRay();
    let distance = stats.reach,
      command: Record<string, unknown> | null = null;
    const test = (p: THREE.Vector3, r: number, c: Record<string, unknown>) => {
      const hit = ray.intersectSphere(new THREE.Sphere(p, r), new THREE.Vector3());
      if (hit) {
        const d = hit.distanceTo(ray.origin);
        if (d < distance && (!g.target || d < g.target.distance)) {
          distance = d;
          command = c;
        }
      }
    };
    const hunt = g.horrorThreat;
    if (
      g.difficulty === "horror" &&
      hunt &&
      hunt.dimension === g.world.dimension &&
      !["caught", "escaped", "banished"].includes(hunt.phase)
    )
      test(new THREE.Vector3(...hunt.p).add(new THREE.Vector3(0, 1.9, 0)), 1.1, {
        type: "huntHit",
        target: hunt.id,
      });
    for (const [id, r] of this.remotes)
      if (r.wire.dimension === g.world.dimension)
        test(r.model.group.position.clone().add(new THREE.Vector3(0, 1, 0)), 0.68, {
          type: "pvp",
          target: id,
        });
    for (const m of g.mobs)
      if (!m.dead)
        test(m.group.position.clone().add(new THREE.Vector3(0, 1, 0)), m.size, {
          type: "hit",
          target: m.group.userData.netId,
        });
    for (const c of g.crystals)
      if (c.alive) test(c.mesh.position, 1, { type: "hit", crystal: c.index });
    if (g.dragon && !g.won) test(g.dragon.group.position, 3, { type: "hit", target: "dragon" });
    if (command) {
      this.request(command);
      g.attackCooldown = stats.cooldown;
      g.swingTime = SWING_DURATION;
      return true;
    }
    return false;
  }
  shoot() {
    if (!(this.game.inventory[113] > 0)) {
      this.game.notify("Brak strzał.");
      return;
    }
    this.request({
      type: "shoot",
      direction: this.game.playerEyeRay().direction.toArray(),
    });
    this.game.actionCooldown = 0.5;
    this.game.attackCooldown = 0.5;
    this.game.audio.play("bow");
  }
  openChest(x: number, y: number, z: number) {
    this.request({ type: "chest", x, y, z }, (data) => {
      if (data.ok) {
        this.game.adventure.currentChest = data.chest.key;
        this.applyChest(data.chest.key, data.chest.slots, data.chest.revision);
        this.game.pause("chest");
      }
    });
    this.game.actionCooldown = 0.3;
  }
  openFurnace(x: number, y: number, z: number, refresh = false) {
    const g = this.game,
      dimension = g.world.dimension,
      key = dimension + ":" + [x, y, z],
      lockGeneration = g.lockGeneration,
      generation = ++this.furnaceOpenGeneration;
    const req = this.request({ type: "openFurnace", x, y, z }, (data) => {
      if (
        this.closed ||
        generation !== this.furnaceOpenGeneration ||
        g.health <= 0 ||
        !g.started ||
        g.preview ||
        g.world.dimension !== dimension ||
        g.lockGeneration !== lockGeneration
      )
        return;
      if (
        refresh
          ? g.pauseReason !== "furnace" || g.adventure.currentFurnace !== key
          : !g.active || g.pauseReason !== ""
      )
        return;
      if (
        !data.ok ||
        data.furnace?.key !== key ||
        !g.adventure.data.furnaces[key] ||
        g.world.get(x, y, z) !== 29
      ) {
        if (refresh) {
          g.adventure.currentFurnace = "";
          g.resume();
        }
        return;
      }
      g.adventure.currentFurnace = key;
      if (refresh) g.emit();
      else g.pause("furnace");
    });
    g.actionCooldown = 0.3;
    return req;
  }
  refreshFurnace() {
    const key = this.furnaceRefreshKey;
    if (!key) return;
    const g = this.game;
    if (
      this.closed ||
      g.health <= 0 ||
      g.pauseReason !== "furnace" ||
      g.adventure.currentFurnace !== key ||
      !key.startsWith(g.world.dimension + ":")
    ) {
      this.furnaceRefreshKey = null;
      return;
    }
    if (!this.connected || !this.initialized || this.chestBusy || this.pending.size) return;
    const [x, y, z] = key
      .slice(g.world.dimension.length + 1)
      .split(",")
      .map(Number);
    this.furnaceRefreshKey = null;
    if (!this.openFurnace(x, y, z, true)) this.furnaceRefreshKey = key;
  }
  applyFurnace(key: string, state: FurnaceState | null, revision = 0) {
    if (revision < (this.furnaceRevisions.get(key) ?? 0)) return;
    this.furnaceRevisions.set(key, revision);
    const adventure = this.game.adventure;
    if (state) adventure.data.furnaces[key] = restoreFurnace(state);
    else {
      delete adventure.data.furnaces[key];
      if (adventure.currentFurnace === key) {
        adventure.currentFurnace = "";
        if (this.game.pauseReason === "furnace") {
          this.game.notify("Piec został zniszczony.");
          this.game.resume();
        }
      }
    }
    if (adventure.currentFurnace === key) this.game.emit();
  }
  chestClick(index: number, right: boolean, quick: boolean) {
    this.inventoryGesture({ type: "click", slot: { area: "chest", index }, right, quick }, true);
  }
  applyChest(key: string, slots: ChestSlots, revision = 0) {
    if (revision < (this.chestRevisions.get(key) ?? 0)) return;
    this.chestRevisions.set(key, revision);
    this.game.adventure.data.chestSlots[key] = structuredClone(slots);
    this.game.adventure.data.storage[key] = chestCounts(slots);
    if (this.game.adventure.currentChest === key) this.game.emit();
  }
  inventoryGesture(gesture: InventoryGesture, chestOpen: boolean | "furnace" = false) {
    if (this.closed || this.fatal) return;
    const g = this.game;
    const captured = structuredClone(gesture);
    if (
      captured.type === "move" &&
      ["chest", "furnace"].includes(captured.from.area) &&
      !g.pack.cursor &&
      !Object.hasOwn(captured, "expected")
    )
      captured.expected = structuredClone(
        captured.from.area === "furnace"
          ? (g.adventure.furnaceState()?.slots[captured.from.index] ?? null)
          : g.adventure.chestSlots()[captured.from.index],
      );
    this.inventoryQueue.push({
      gesture: captured,
      chestKey: chestOpen === true ? g.adventure.currentChest : null,
      furnaceKey: chestOpen === "furnace" ? g.adventure.currentFurnace : null,
    });
    this.flushInventory();
  }
  settleInventory(size: 2 | 3 = 2) {
    if (this.closed || this.fatal) return;
    this.inventoryQueue.push({
      gesture: { type: "settle", size },
      chestKey: null,
      furnaceKey: null,
    });
    this.flushInventory();
  }
  armorSlot(slot: ArmorSlot) {
    if (this.closed || this.fatal || this.game.health <= 0) return;
    this.inventoryQueue.push({
      gesture: { type: "armor", slot },
      chestKey: null,
      furnaceKey: null,
    });
    this.flushInventory();
  }
  equipArmor(
    id: number,
    from?: { area: "slots" | "grid"; index: number },
    expected?: Stack | null,
  ) {
    if (this.closed || this.fatal || this.game.health <= 0) return;
    this.inventoryQueue.push({
      gesture: {
        type: "equipArmor",
        id,
        ...(from
          ? {
              from: { ...from },
              expected: structuredClone(
                expected === undefined ? (this.game.pack[from.area][from.index] ?? null) : expected,
              ),
            }
          : {}),
      },
      chestKey: null,
      furnaceKey: null,
    });
    this.flushInventory();
  }
  flushInventory() {
    if (
      this.closed ||
      !this.connected ||
      !this.initialized ||
      this.game.health <= 0 ||
      this.furnaceRefreshKey ||
      this.chestBusy ||
      this.pending.size ||
      !this.inventoryQueue.length
    )
      return;
    const job = this.inventoryQueue.shift()!;
    this.chestBusy = true;
    const command =
      job.gesture.type === "armor"
        ? {
            type: "armor",
            slot: job.gesture.slot,
            baseRevision: this.inventoryRevision,
            expectedCursor: structuredClone(this.game.pack.cursor),
            expectedEquipped: this.game.adventure.data.equipment[job.gesture.slot],
          }
        : job.gesture.type === "equipArmor"
          ? {
              type: "equipArmor",
              id: job.gesture.id,
              baseRevision: this.inventoryRevision,
              ...(job.gesture.from
                ? { from: job.gesture.from, expected: job.gesture.expected }
                : {}),
            }
          : job.gesture.type === "settle"
            ? {
                type: "settleInventory",
                size: job.gesture.size,
                baseRevision: this.inventoryRevision,
              }
            : {
                type: "inventoryGesture",
                gesture: job.gesture,
                chestKey: job.chestKey,
                furnaceKey: job.furnaceKey,
                baseRevision: this.inventoryRevision,
              };
    const req = this.request(command, () => {
      this.chestBusy = false;
      this.game.emit();
      this.emit();
      this.flushInventory();
    });
    if (!req) {
      this.chestBusy = false;
      this.inventoryQueue.unshift(job);
    }
  }
  sendChat(text: string) {
    const value = text.trim();
    if (value) this.send({ type: "chat", text: value.slice(0, 240) });
  }
  sendFaceFrame(frame: string | null) {
    if (this.closed || !this.connected || !this.initialized || !validFaceFrame(frame)) return;
    // Camera images are replaceable. Never enqueue another image behind pending gameplay traffic.
    if (frame !== null && (this.socket?.bufferedAmount ?? 0) > 32000) return;
    const now = performance.now();
    const interval = Math.max(
      FACE_FRAME_INTERVAL * 1000,
      ((this.players?.length ?? 1) * 1000) / FACE_ROOM_FRAME_BUDGET,
    );
    if (frame !== null && now - (this.faceLastSent ?? -Infinity) + 1 < interval) return;
    if (frame !== null) this.faceLastSent = now;
    this.send({ type: "faceFrame", frame });
  }
  clearRemoteFaces() {
    this.faceFrames?.clear();
    for (const remote of this.remotes?.values() ?? []) remote.model.setFaceFrame(null);
  }
  close() {
    if (this.closed) return;
    const ownsSession = this.game.net === this || this.game.net === undefined;
    if (ownsSession) {
      this.game.horror?.clear();
      this.game.horrorThreat = null;
    }
    this.sendFaceFrame(null);
    this.clearRemoteFaces();
    this.sendProfile();
    this.closed = true;
    this.inventoryQueue = [];
    this.connected = false;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.joinTimer) clearTimeout(this.joinTimer);
    if (this.game.voice === this.voice) {
      if (ownsSession) {
        this.voice.disable();
        this.voice.clearRemote();
      }
    } else this.voice.close();
    this.socket?.close(1000);
    for (const r of this.remotes.values()) {
      r.model.group.removeFromParent();
      r.model.dispose();
      r.label.material.map?.dispose();
      r.label.material.dispose();
    }
    this.remotes.clear();
    for (const m of this.entities.values()) m.group.removeFromParent();
    this.entities.clear();
    for (const m of this.dropMeshes.values()) m.removeFromParent();
    for (const m of this.shotMeshes) m.removeFromParent();
    this.emit();
  }
}
