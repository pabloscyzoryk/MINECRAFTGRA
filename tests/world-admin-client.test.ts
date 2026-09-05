import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { Multiplayer } from "../lib/multiplayer";
import { InventoryPack } from "../lib/inventory";
import { newAdventure } from "../lib/adventure";
import { PROTOCOL } from "../lib/net-protocol";

class Socket {
  static OPEN = 1;
  static instances: Socket[] = [];
  readyState = 1;
  bufferedAmount = 0;
  sent: any[] = [];
  closeCalls: unknown[] = [];
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  constructor(_url: unknown) {
    Socket.instances.push(this);
  }
  send(data: string) {
    this.sent.push(JSON.parse(data));
  }
  close(...args: unknown[]) {
    this.closeCalls.push(args);
    this.readyState = 3;
  }
  message(data: unknown) {
    this.onmessage?.({ data: JSON.stringify(data) });
  }
}

async function fixture(
  run: (
    f: ReturnType<typeof makeGame> & {
      net: Multiplayer;
      socket: Socket;
      storage: Map<string, string>;
      timers: { callback: () => void; delay: number; cancelled: boolean }[];
    },
  ) => void | Promise<void>,
) {
  const storage = new Map([["blockland.online.token", "a".repeat(64)]]);
  const timers: { callback: () => void; delay: number; cancelled: boolean }[] = [];
  const overrides: Record<string, unknown> = {
    WebSocket: Socket,
    location: { href: "https://game.example/", protocol: "https:" },
    localStorage: {
      getItem: (key: string) => storage.get(key),
      setItem: (key: string, value: string) => storage.set(key, value),
    },
    document: { hidden: false },
    setTimeout: (callback: () => void, delay: number) => {
      const timer = { callback, delay, cancelled: false };
      timers.push(timer);
      return timer;
    },
    clearTimeout: (timer: { cancelled: boolean }) => {
      if (timer) timer.cancelled = true;
    },
  };
  const previous = new Map(
    Object.keys(overrides).map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]),
  );
  for (const [key, value] of Object.entries(overrides))
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  Socket.instances = [];
  const game = makeGame();
  const net = new Multiplayer(game.game, "Tester");
  game.game.net = net;
  net.worldId = "legacy";
  net.initialized = net.connected = true;
  net.skin = { skin: "skin-kept", cape: "cape-kept", capeEnabled: true };
  net.open();
  const socket = Socket.instances[0];
  try {
    await run({ ...game, net, socket, storage, timers });
  } finally {
    net.close();
    for (const [key, value] of previous)
      if (value) Object.defineProperty(globalThis, key, value);
      else Reflect.deleteProperty(globalThis, key);
  }
}
function makeGame() {
  const restoreCalls: any[] = [],
    pauses: string[] = [],
    notices: string[] = [];
  const pack = new InventoryPack();
  pack.slots[0] = { id: 22, n: 19 };
  const game: any = {
    difficulty: "normal",
    health: 20,
    food: 16,
    xp: 42,
    selected: 0,
    heldId: 22,
    active: true,
    started: true,
    preview: false,
    pauseReason: "",
    keys: new Set(["KeyW"]),
    leftDown: true,
    rightDown: true,
    position: new THREE.Vector3(66, 18, 72),
    velocity: new THREE.Vector3(3, -1, 1),
    yaw: 0,
    pitch: 0,
    pack,
    inventory: pack.counts(),
    hotbar: pack.slots.slice(0, 9).map((s) => s?.id ?? 0),
    visited: ["overworld", "nether"],
    crystals: [],
    mobs: [],
    eating: null,
    rest: null,
    world: {
      seed: 24680,
      dimension: "overworld",
      edits: { "overworld:8,16,22": 22 },
      waterLevels: {},
      chunks: new Map(),
    },
    voice: { blur() {}, clearRemote() {}, disable() {}, close() {}, receive() {} },
    audio: { play() {} },
    adventure: {
      data: newAdventure(),
      currentChest: "old",
      currentFurnace: "old",
      reset() {
        this.data = newAdventure();
        this.currentChest = this.currentFurnace = "";
      },
    },
    syncPack() {
      this.inventory = this.pack.counts();
    },
    eatingHeld() {
      return false;
    },
    pause(reason: string) {
      this.active = false;
      this.pauseReason = reason;
      this.keys.clear();
      this.leftDown = this.rightDown = false;
      pauses.push(reason);
      this.net.sendProfile();
    },
    resume() {
      this.active = true;
      this.pauseReason = "";
    },
    applyRestState(state: unknown, p?: number[]) {
      this.rest = state;
      if (p) this.position.fromArray(p);
    },
    endRest() {
      this.rest = null;
    },
    applyEatingState(state: unknown) {
      this.eating = state;
    },
    clearDynamic() {},
    dimensionChanged() {},
    ensure() {},
    spawnDragon() {},
    onMenu() {},
    emit() {},
    setDifficulty(d: string) {
      this.difficulty = d;
    },
    notify(message: string) {
      notices.push(message);
    },
    restore(data: any) {
      restoreCalls.push(data);
      this.world.seed = data.seed;
      this.world.edits = data.edits;
      this.world.dimension = data.dimension;
      this.position.fromArray(data.position);
      this.pack.restore(data.pack ?? {});
      this.inventory = this.pack.counts();
      this.xp = data.xp;
      this.food = data.food;
      this.adventure.reset();
    },
  };
  return { game, restoreCalls, pauses, notices };
}
function welcome(worldId = "new-world", seed = 91) {
  return {
    type: "welcome",
    worldId,
    seed,
    id: "self-new",
    clock: 90,
    health: 20,
    edits: {},
    water: {},
    crystals: [],
    won: false,
    profile: {
      inventoryRevision: 0,
      pack: new InventoryPack().snapshot(),
      food: 20,
      xp: 0,
      adventure: newAdventure(),
    },
    player: {
      dimension: "overworld",
      p: [8.5, 16, 22.5],
      yaw: 0,
      pitch: 0,
      bedRest: null,
      bedRestRevision: 0,
    },
  };
}

test("Administrator password is a one-shot packet and is never retained, retried or stored", () =>
  fixture(async ({ net, socket, storage, timers, game }) => {
    const secret = "private-password-for-test";
    const before = game.pack.snapshot();
    const request = net.unlockWorld(secret);
    const packet = socket.sent.at(-1);
    assert.equal(packet.type, "worldAdmin");
    assert.equal(packet.password, secret);
    assert.equal(packet.worldId, "legacy");
    assert.equal(net.pending.size, 0);
    assert(!JSON.stringify([...(net as any).adminRequests]).includes(secret));
    assert(!JSON.stringify([...storage]).includes(secret));
    assert.deepEqual(game.pack.snapshot(), before);
    net.tick(2.1);
    assert.equal(socket.sent.filter((p) => p.type === "worldAdmin").length, 1);
    net.receive({
      type: "worldAdminResult",
      req: packet.req,
      ok: false,
      message: "Nieprawidłowe hasło",
      worldId: "legacy",
    });
    assert.equal((await request).ok, false);
    assert.equal(net.adminExpiresAt, 0);
    assert.equal((net as any).adminRequests.size, 0);
    assert(timers.find((t) => t.delay === 20000)!.cancelled);
  }));

test("Unlock expiry is server-owned; failed reset preserves world and inventory, and mismatched generations are rejected locally", () =>
  fixture(async ({ net, socket, game }) => {
    const unlock = net.unlockWorld("secret");
    const expiresAt = Date.now() + 90000;
    net.receive({
      type: "worldAdminResult",
      req: socket.sent.at(-1).req,
      ok: true,
      message: "OK",
      worldId: "legacy",
      expiresAt,
    });
    assert((await unlock).ok);
    assert.equal(net.adminExpiresAt, expiresAt);
    const before = game.pack.snapshot(),
      edits = { ...game.world.edits };
    const reset = net.resetWorld(-123, "legacy");
    const command = socket.sent.at(-1);
    assert.equal(command.seed, -123);
    assert.equal(command.expectedWorldId, "legacy");
    assert(!Object.hasOwn(command, "password"));
    net.receive({
      type: "worldAdminResult",
      req: command.req,
      ok: false,
      message: "Nie zapisano zmiany",
      worldId: "legacy",
    });
    assert.equal((await reset).ok, false);
    assert.deepEqual(game.pack.snapshot(), before);
    assert.deepEqual(game.world.edits, edits);
    assert(net.connected);
    const sent = socket.sent.length;
    assert.equal((await net.resetWorld(null, "obsolete")).ok, false);
    assert.equal((await net.resetWorld(1.5, "legacy")).ok, false);
    assert.equal(socket.sent.length, sent);
  }));

test("Timeout and close settle admin callbacks without retaining a password or replaying authorization", () =>
  fixture(async ({ net, socket, timers }) => {
    const pending = net.unlockWorld("secret");
    timers.find((t) => t.delay === 20000)!.callback();
    assert.equal((await pending).ok, false);
    assert.equal((net as any).adminRequests.size, 0);
    const second = net.unlockWorld("another-secret");
    net.close();
    assert.equal((await second).ok, false);
    assert.equal(net.adminExpiresAt, 0);
    assert.equal(socket.sent.filter((p) => p.type === "worldAdmin").length, 2);
  }));

test("Confirmed reset discards all old commands and world state; a fresh welcome cannot replay old inventory", () =>
  fixture(async ({ net, socket, game, restoreCalls, pauses }) => {
    let oldCallback = 0;
    net.pending.set("old-mine", {
      command: { type: "mine", req: "old-mine" },
      at: 0,
      callback: () => oldCallback++,
    });
    net.inventoryQueue.push({
      gesture: { type: "click", slot: { area: "slots", index: 0 } },
      chestKey: null,
      furnaceKey: null,
    });
    net.applied.add("old-ack");
    net.inventoryRevision = 12;
    net.chestRevisions.set("old", 4);
    net.furnaceRevisions.set("old", 5);
    const reset = net.resetWorld(91, "legacy");
    assert.equal(game.inventory[22], 19, "Request is not an optimistic wipe");
    net.receive({
      type: "worldReset",
      worldId: "new-world",
      seed: 91,
      message: "Administrator zresetował świat.",
    });
    assert(
      (await reset).ok,
      "Committed reset settles the request even if it arrives before its ACK",
    );
    assert.equal(net.pending.size, 0);
    assert.equal(net.inventoryQueue.length, 0);
    assert.equal(net.applied.size, 0);
    assert.equal(net.chestRevisions.size + net.furnaceRevisions.size, 0);
    assert.equal(net.initialized, false);
    assert.equal(net.connected, false);
    assert.equal(game.velocity.length(), 0);
    assert.deepEqual(game.inventory, {});
    assert.deepEqual(game.world.edits, {});
    assert.equal(pauses.at(-1), "multiplayer");
    assert.equal(socket.closeCalls.length, 1);
    const count = socket.sent.length;
    net.sendProfile(true);
    assert.equal(socket.sent.length, count, "Reset state cannot upload an obsolete profile");
    net.receive({
      type: "result",
      worldId: "legacy",
      req: "old-mine",
      ok: true,
      grant: [[22, 99]],
      health: 20,
      inventoryRevision: 99,
    });
    net.receive({ type: "damage", worldId: "legacy", health: 0 });
    assert.equal(oldCallback, 0);
    assert.equal(game.health, 20);
    net.open();
    const next = Socket.instances.at(-1)!;
    next.onopen!();
    assert.equal(
      next.sent.some((p) => p.type === "join"),
      false,
      "Wait for generation in ready",
    );
    next.message({ type: "ready", worldId: "new-world" });
    const join = next.sent.find((p) => p.type === "join");
    assert.equal(join.protocol, PROTOCOL);
    assert.equal(join.worldId, "new-world");
    assert.equal(join.nick, "Tester");
    assert.equal(join.skin.skin, "skin-kept");
    next.message(welcome());
    assert.equal(restoreCalls.length, 1);
    assert.equal(game.world.seed, 91);
    assert.equal(game.xp, 0);
    assert.deepEqual(game.inventory, {});
    assert.equal(
      next.sent.some((p) => p.type === "command" && p.command.req === "old-mine"),
      false,
    );
    assert(net.connected && net.initialized);
    assert.match(net.worldResetNotice, /zresetował/);
    next.message({
      type: "result",
      worldId: "legacy",
      req: "old-mine",
      ok: true,
      grant: [[22, 99]],
      inventoryRevision: 99,
    });
    assert.deepEqual(game.inventory, {});
  }));

test("A reset missed offline is detected by ready and stale socket messages cannot overwrite the replacement session", () =>
  fixture(({ net, socket, game, restoreCalls }) => {
    net.pending.set("old", { command: { type: "use", req: "old" }, at: 0 });
    net.open();
    const current = Socket.instances.at(-1)!;
    current.message({ type: "ready", worldId: "after-offline-reset" });
    assert.equal(net.pending.size, 0);
    assert.equal(net.initialized, false);
    current.message(welcome("after-offline-reset", -7));
    assert.equal(restoreCalls.length, 1);
    assert.equal(game.world.seed, -7);
    socket.message(welcome("legacy", 24680));
    socket.onclose!();
    assert.equal(net.worldId, "after-offline-reset");
    assert.equal(game.world.seed, -7);
    assert(net.connected);
  }));

test("All gameplay packets carry the current generation and current-world vitals still apply", () =>
  fixture(({ net, socket, game }) => {
    for (const type of ["input", "profile", "command", "chat", "voice", "faceFrame", "join"])
      net.send({ type, worldId: "spoofed-old" });
    assert(socket.sent.every((p) => p.worldId === "legacy"));
    net.receive({ type: "vitals", worldId: "other", health: 1, food: 1 });
    assert.equal(game.health, 20);
    net.receive({ type: "vitals", worldId: "legacy", health: 17, food: 15 });
    assert.equal(game.health, 17);
    assert.equal(game.food, 15);
  }));

test("An ordinary reconnect to the same generation keeps gameplay retries but invalidates admin authorization", () =>
  fixture(async ({ net, socket, game, restoreCalls, timers }) => {
    net.pending.set("ordinary-mine", { command: { type: "mine", req: "ordinary-mine" }, at: 0 });
    const original = game.pack.snapshot();
    const unlock = net.unlockWorld("not-retained");
    net.adminExpiresAt = Date.now() + 90000;
    socket.readyState = 3;
    socket.onclose!();
    assert.equal((await unlock).ok, false);
    assert.equal(net.adminExpiresAt, 0);
    timers.find((timer) => timer.delay === 1000)!.callback();
    const next = Socket.instances.at(-1)!;
    next.message({ type: "ready", worldId: "legacy" });
    assert.equal(net.pending.size, 1);
    const resumed = welcome("legacy", 24680);
    resumed.profile.pack = original;
    next.message(resumed);
    assert.equal(
      restoreCalls.length,
      0,
      "Same-generation reconnect does not start a new character",
    );
    assert.equal(game.inventory[22], 19);
    assert(next.sent.some((p) => p.type === "command" && p.command.req === "ordinary-mine"));
    assert(!next.sent.some((p) => p.type === "worldAdmin"));
    assert.equal(net.worldResetNotice, "");
  }));
