import * as THREE from "three";
import type { Game } from "./engine";
import { Mob, cube } from "./entities";
import { SkinModel, readSkin, defaultSkin } from "./skin-model";
import { PROTOCOL, type PlayerWire, type SkinWire, type FrameWire, type Vec } from "./net-protocol";
import { VoiceChat } from "./voice";
import { weapon } from "./combat";
import { itemArt } from "./item-art";
import type { InventoryGesture } from "./inventory-gestures";
import { chestCounts, type ChestSlots } from "./chest-slots";
type Remote = {
  model: SkinModel;
  label: THREE.Sprite;
  wire: PlayerWire;
  position: THREE.Vector3;
  skinKey: string;
  held?: THREE.Mesh;
  heldId?: number;
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
  inventoryQueue: {
    gesture: InventoryGesture | { type: "settle"; size: 2 | 3 };
    chestKey: string | null;
  }[] = [];
  constructor(
    public game: Game,
    nick: string,
  ) {
    this.nick = nick;
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
    this.voice = new VoiceChat(
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
        this.connected = false;
        this.voice.blur();
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
    if (this.chestBusy && !["inventoryGesture", "settleInventory"].includes(String(command.type)))
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
    const g = this.game;
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
      this.inventoryRevision = Number(data.profile?.inventoryRevision) || 0;
      this.id = data.id;
      this.connected = true;
      this.status = "Połączono";
      this.reconnectDelay = 1000;
      this.clock = data.clock;
      if (this.joinTimer) clearTimeout(this.joinTimer);
      if (!this.initialized) {
        g.net = this;
        const s = data.profile ?? {};
        g.restore({
          v: 1,
          seed: data.seed,
          mode: "survival",
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
          adventure: s.adventure,
          crystals: data.crystals,
          dragon: data.dragon,
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
      if (data.profile?.pack && this.initialized) {
        g.pack.restore(data.profile.pack);
        g.inventory = g.pack.counts();
        g.hotbar = g.pack.slots.slice(0, 9).map((s) => s?.id ?? 0);
      }
      g.health = data.health;
      if (g.health <= 0) g.pause("death");
      this.sendInput();
      for (const p of this.pending.values()) {
        p.at = performance.now();
        this.send({ type: "command", command: p.command });
      }
      this.emit();
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
      pending?.callback?.(data);
      return;
    }
    if (data.type === "chestUpdate") {
      this.applyChest(data.key, data.slots, data.revision);
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
      if (Array.isArray(data.knockback)) g.velocity.add(new THREE.Vector3(...data.knockback));
      if (data.health <= 0) {
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
  sendInput() {
    const g = this.game;
    this.send({
      type: "input",
      p: g.position.toArray(),
      yaw: g.yaw,
      pitch: g.pitch,
      dimension: g.world.dimension,
      moving: g.active && Math.abs(g.velocity.x) + Math.abs(g.velocity.z) > 0.2,
      crouch: g.crouching,
      swing: g.swingTime > 0,
      swingProgress: g.swingTime > 0 ? 1 - g.swingTime / 0.36 : -1,
      held: g.hotbar[g.selected] ?? 0,
      blocking: g.rightDown,
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
        adventure: { ...g.adventure.data, storage: {}, chestSlots: {}, crops: {} },
        visited: g.visited,
        mined: g.mined,
        placed: g.placed,
      },
    });
  }
  tick(dt: number) {
    if (this.closed) return;
    this.flushInventory();
    this.clock += dt;
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
        r.swingTime ? 1 - r.swingTime / 0.36 : -1,
      );
      r.model.head.rotation.x = r.wire.pitch;
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
        r.held?.geometry.dispose();
        if (r.held) {
          const m = r.held.material as THREE.MeshBasicMaterial;
          m.map?.dispose();
          m.dispose();
        }
        r.model.group.removeFromParent();
        r.model.dispose();
        r.label.material.map?.dispose();
        r.label.material.dispose();
        this.remotes.delete(id);
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
        const skin = this.appearances.get(p.id)?.skin;
        if (skin) this.loadRemoteSkin(r, skin);
      }
      if (r.heldId !== p.held) {
        if (r.held) {
          r.held.removeFromParent();
          r.held.geometry.dispose();
          const m = r.held.material as THREE.MeshBasicMaterial;
          m.map?.dispose();
          m.dispose();
          r.held = undefined;
        }
        r.heldId = p.held;
        if (p.held) {
          const texture = new THREE.TextureLoader().load(itemArt(p.held));
          texture.colorSpace = THREE.SRGBColorSpace;
          texture.magFilter = THREE.NearestFilter;
          texture.minFilter = THREE.NearestFilter;
          const held = new THREE.Mesh(
            new THREE.PlaneGeometry(0.45, 0.45),
            new THREE.MeshBasicMaterial({
              map: texture,
              transparent: true,
              alphaTest: 0.1,
              side: THREE.DoubleSide,
            }),
          );
          held.position.set(0, -0.65, 0.18);
          held.rotation.x = -0.5;
          r.model.joints.armR.add(held);
          r.held = held;
        }
      }
      if (p.swing) {
        const progress = p.swingProgress ?? 0;
        const previous = r.wire.swingProgress ?? 0;
        if (!r.wire.swing || !r.swingTime || progress + 0.15 < previous)
          r.swingTime = 0.36 * (1 - progress);
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
        hurt: w.hurt,
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
    });
  }
  mine(t: { x: number; y: number; z: number; id: number }) {
    if ([...this.pending.values()].some((p) => p.command.type === "mine")) return;
    this.request({ type: "mine", x: t.x, y: t.y, z: t.z, expected: t.id });
  }
  interact() {
    const g = this.game,
      t = g.target,
      id = g.hotbar[g.selected];
    if (id === 126) return true;
    if ([106, 107, 105].includes(id)) return false;
    if (!t) return false;
    if ([28, 29, 30].includes(t.id)) {
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
    const ray = new THREE.Ray(g.camera.position, g.camera.getWorldDirection(new THREE.Vector3()));
    let distance = stats.reach,
      command: Record<string, unknown> | null = null;
    const test = (p: THREE.Vector3, r: number, c: Record<string, unknown>) => {
      const hit = ray.intersectSphere(new THREE.Sphere(p, r), new THREE.Vector3());
      if (hit) {
        const d = hit.distanceTo(g.camera.position);
        if (d < distance && (!g.target || d < g.target.distance)) {
          distance = d;
          command = c;
        }
      }
    };
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
      g.swingTime = 0.36;
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
      direction: this.game.camera.getWorldDirection(new THREE.Vector3()).toArray(),
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
  inventoryGesture(gesture: InventoryGesture, chestOpen = false) {
    if (this.closed || this.fatal) return;
    const g = this.game;
    const captured = structuredClone(gesture);
    if (
      captured.type === "move" &&
      captured.from.area === "chest" &&
      !g.pack.cursor &&
      !Object.hasOwn(captured, "expected")
    )
      captured.expected = structuredClone(g.adventure.chestSlots()[captured.from.index]);
    this.inventoryQueue.push({
      gesture: captured,
      chestKey: chestOpen ? g.adventure.currentChest : null,
    });
    this.flushInventory();
  }
  settleInventory(size: 2 | 3 = 2) {
    if (this.closed || this.fatal) return;
    this.inventoryQueue.push({ gesture: { type: "settle", size }, chestKey: null });
    this.flushInventory();
  }
  flushInventory() {
    if (
      this.closed ||
      !this.connected ||
      !this.initialized ||
      this.chestBusy ||
      this.pending.size ||
      !this.inventoryQueue.length
    )
      return;
    const job = this.inventoryQueue.shift()!;
    this.chestBusy = true;
    const command =
      job.gesture.type === "settle"
        ? { type: "settleInventory", size: job.gesture.size, baseRevision: this.inventoryRevision }
        : {
            type: "inventoryGesture",
            gesture: job.gesture,
            chestKey: job.chestKey,
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
  close() {
    if (this.closed) return;
    this.sendProfile();
    this.closed = true;
    this.inventoryQueue = [];
    this.connected = false;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.joinTimer) clearTimeout(this.joinTimer);
    this.voice.close();
    this.socket?.close(1000);
    for (const r of this.remotes.values()) {
      if (r.held) {
        r.held.geometry.dispose();
        const material = r.held.material as THREE.MeshBasicMaterial;
        material.map?.dispose();
        material.dispose();
      }
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
