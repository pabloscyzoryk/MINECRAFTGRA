import test from "node:test";
import assert from "node:assert/strict";
import { scryptSync } from "node:crypto";
import { EventEmitter, once } from "node:events";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { WebSocket } from "ws";
import {
  Gateway,
  createGameServer,
  RESET_WORLD,
  PERSIST,
  RENEW,
  RELEASE,
  decodeRedis,
  type Store,
} from "../server/gateway";
import { Room } from "../server/room";
import {
  configuredWorldPassword,
  verifyWorldPassword,
  chooseWorldSeed,
  validWorldSeed,
  WORLD_ADMIN_TTL,
} from "../server/world-admin";
import { PROTOCOL } from "../lib/net-protocol";

const password = "test-only-Żółw-123";
const salt = Buffer.alloc(16, 23);
const hash = `scrypt$${salt.toString("hex")}$${scryptSync(password, salt, 32).toString("hex")}`;
const flush = () => new Promise<void>((resolve) => setImmediate(resolve));

class Database {
  values = new Map<string, string>();
  listeners = new Map<string, Set<(value: string) => void>>();
  operations: string[][] = [];
  publications: { channel: string; value: string }[] = [];
  beforePersist: (() => Promise<void>) | null = null;
  afterPersist: (() => Promise<void>) | null = null;
  rejectReset = false;
  connection(): Store {
    const subscriptions: [string, (value: string) => void][] = [];
    return {
      get: async (key) => {
        this.operations.push([key]);
        return this.values.get(key) ?? null;
      },
      set: async (key, value, options) => {
        this.operations.push([key]);
        if (options?.NX && this.values.has(key)) return null;
        this.values.set(key, value);
        return "OK";
      },
      eval: async (script, { keys, arguments: args }) => {
        this.operations.push(keys);
        if (script === RESET_WORLD) {
          if (this.rejectReset) throw Error("OOM simulated");
          if ((this.values.get(keys[0]) ?? "legacy") !== args[0]) return 0;
          this.values.set(keys[0], args[1]);
          this.values.set(keys[1], args[2]);
          this.values.set(keys[2], args[3]);
          this.values.set(keys[3], "reset:" + args[1]);
          return 1;
        }
        assert([RENEW, RELEASE, PERSIST].includes(script));
        if (script === PERSIST && this.beforePersist) await this.beforePersist();
        if (this.values.get(keys[0]) !== args[0]) return 0;
        if (script === PERSIST) {
          this.values.set(keys[1], args[1]);
          if (this.afterPersist) await this.afterPersist();
        }
        if (script === RELEASE) this.values.delete(keys[0]);
        return 1;
      },
      publish: async (channel, value) => {
        this.operations.push([channel]);
        this.publications.push({ channel, value });
        for (const fn of this.listeners.get(channel) ?? []) queueMicrotask(() => fn(value));
        return this.listeners.get(channel)?.size ?? 0;
      },
      subscribe: async (channel, fn) => {
        this.operations.push([channel]);
        if (!this.listeners.has(channel)) this.listeners.set(channel, new Set());
        this.listeners.get(channel)!.add(fn);
        subscriptions.push([channel, fn]);
      },
      close: async () => {
        for (const [channel, fn] of subscriptions) this.listeners.get(channel)?.delete(fn);
      },
    };
  }
}
function leader(db?: Database) {
  const g = new Gateway({
    local: !db,
    store: db?.connection(),
    namespace: "admin-test",
    resetPasswordHash: hash,
  });
  g.store = g.options.store ?? null;
  g.room = g.makeRoom();
  g.leaseUntil = Infinity;
  if (db) db.values.set(g.lease, g.node);
  return g;
}
function peer(g: Gateway, joined = false) {
  const messages: any[] = [],
    closes: number[] = [];
  const ws = Object.assign(new EventEmitter(), {
    readyState: WebSocket.OPEN,
    bufferedAmount: 0,
    send: (raw: string) => messages.push(JSON.parse(raw)),
    close: (code: number) => {
      closes.push(code);
    },
  });
  const p: any = {
    socket: ws,
    id: "a",
    connection: "connection-a",
    worldId: g.worldId,
    joined,
    adminUntil: 0,
    adminAttempts: 0,
    adminWindow: Date.now(),
    adminBusy: false,
  };
  g.peers.set(ws as any, p);
  return { p, messages, closes };
}
async function unlock(g: Gateway, p: any, req = "unlock") {
  await g.worldAdmin(p, { action: "unlock", req, password });
}
async function reset(g: Gateway, p: any, seed: number | null = 0, expectedWorldId = g.worldId) {
  await g.worldAdmin(p, { action: "reset", req: "reset", seed, expectedWorldId });
}

test("Admin hash uses decoded salt, constant-length UTF-8 limits, and strict int32 seeds including zero", async () => {
  assert(configuredWorldPassword(hash));
  assert.equal(await verifyWorldPassword(password, hash), true);
  for (const wrong of ["", "wrong", "é".repeat(65), null, {}])
    assert.equal(await verifyWorldPassword(wrong, hash), false);
  for (const invalid of [undefined, "", "scrypt$bad$hash", hash + "0"])
    assert.equal(configuredWorldPassword(invalid), false);
  for (const seed of [null, 0, -2147483648, 2147483647]) {
    assert(validWorldSeed(seed));
    assert(Number.isInteger(chooseWorldSeed(seed)));
  }
  for (const seed of [undefined, "0", 0.5, NaN, Infinity, -2147483649, 2147483648])
    assert.equal(validWorldSeed(seed), false);
  assert.equal(chooseWorldSeed(0), 0);
});

test("Reset requires a configured password, a socket-bound unexpired unlock and the expected generation", async () => {
  const g = leader(),
    a = peer(g),
    b = peer(g);
  try {
    await reset(g, a.p);
    assert.equal(a.messages.at(-1).ok, false);
    g.options.resetPasswordHash = "";
    await unlock(g, a.p);
    assert.match(a.messages.at(-1).message, /skonfigurowany/);
    g.options.resetPasswordHash = hash;
    await g.worldAdmin(a.p, { action: "unlock", req: "wrong", password: "incorrect" });
    assert.equal(a.p.adminUntil, 0);
    await unlock(g, a.p);
    assert.equal(a.messages.at(-1).ok, true);
    assert(a.p.adminUntil <= Date.now() + WORLD_ADMIN_TTL);
    await reset(g, b.p);
    assert.equal(b.messages.at(-1).ok, false);
    await reset(g, a.p, 0, "wrong-generation");
    assert.equal(a.messages.at(-1).ok, false);
    await reset(g, a.p, 1.5);
    assert.equal(a.messages.at(-1).ok, false);
    a.p.adminUntil = Date.now() - 1;
    await reset(g, a.p);
    assert.equal(a.messages.at(-1).ok, false);
    assert.equal(g.worldId, "legacy");
  } finally {
    await g.close();
  }
});

test("Password attempts are bounded per socket and are never stored or relayed", async () => {
  const db = new Database(),
    g = leader(db),
    a = peer(g);
  try {
    for (let n = 0; n < 5; n++)
      await g.worldAdmin(a.p, { action: "unlock", req: "bad" + n, password: "wrong" });
    assert.match(a.messages.at(-1).message, /wiele prób/);
    assert.equal(a.p.adminUntil, 0);
    assert.equal(JSON.stringify([...db.values, ...db.publications]).includes("wrong"), false);
    assert.equal(JSON.stringify(g.room!.save()).includes(password), false);
  } finally {
    await g.close();
  }
});

test("A durable reset replaces every world system, changes all dimension seeds and leaves co-tenant data untouched", async () => {
  const db = new Database(),
    g = leader(db),
    a = peer(g, true);
  db.values.set("other-project:snapshot", "do not touch");
  db.values.set("other-project:leader", "owner");
  try {
    const old = g.room!;
    old.join("a", "Alicja", undefined);
    old.players.get("a")!.profile.inventory = { 111: 64 };
    old.storage.chest = { 8: 12 };
    old.chat.push({ nick: "Alicja", text: "old chat", time: 1 });
    old.drops.push({ id: 8, n: 2, dimension: "overworld", p: [1, 2, 3], v: [0, 0, 0] } as any);
    old.won = true;
    old.region("nether").world.set(1, 15, 1, 16);
    await g.persist();
    await unlock(g, a.p);
    await reset(g, a.p, 0);
    const saved = decodeRedis(db.values.get(g.snapshot)!);
    assert.equal(saved.seed, 0);
    assert.notEqual(saved.worldId, "legacy");
    assert.deepEqual(saved.players, []);
    assert.deepEqual(saved.edits, {});
    assert.deepEqual(saved.storage, {});
    assert.deepEqual(saved.furnaces, {});
    assert.deepEqual(saved.chat, []);
    assert.deepEqual(saved.drops, []);
    assert.equal(saved.won, false);
    assert.equal(saved.clock, 90);
    for (const r of g.room!.regions.values()) assert.equal(r.world.seed, 0);
    assert.equal(db.values.get(g.legacyLease), "reset:" + saved.worldId);
    assert.equal(db.values.get(g.lease), g.node);
    const resultIndex = a.messages.findIndex(
      (m) => m.type === "worldAdminResult" && m.req === "reset",
    );
    const resetIndex = a.messages.findIndex((m) => m.type === "worldReset");
    assert(resultIndex >= 0 && resetIndex > resultIndex);
    assert.equal(a.messages[resultIndex].ok, true);
    assert.deepEqual(a.closes, [1012]);
    assert.equal(a.p.joined, false);
    assert.equal(db.values.get("other-project:snapshot"), "do not touch");
    assert.equal(db.values.get("other-project:leader"), "owner");
    assert(db.operations.flat().every((key) => key.startsWith("admin-test:")));
    assert.equal(
      [...db.values.keys()].filter(
        (key) => key.startsWith("admin-test:") && key.includes("snapshot"),
      ).length,
      1,
    );
    const restored = new Room(() => {});
    restored.restore(saved);
    assert.equal(restored.worldId, g.worldId);
    assert.equal(restored.seed, 0);
    for (const r of restored.regions.values()) assert.equal(r.world.seed, 0);
  } finally {
    await g.close();
  }
});

for (const phase of ["beforePersist", "afterPersist"] as const)
  test(`Reset fences a ${phase} delayed write and suppresses its delayed success ACK`, async () => {
    const db = new Database(),
      g = leader(db),
      a = peer(g, true);
    try {
      const old = g.room!,
        oldToken = g.node,
        oldLease = g.lease;
      let release = () => {};
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      db[phase] = () => gate;
      old.send("a", { type: "result", req: "old-mutation", ok: true });
      await flush();
      await unlock(g, a.p);
      await reset(g, a.p, 123);
      const fresh = db.values.get(g.snapshot);
      db[phase] = null;
      release();
      await flush();
      await flush();
      old.send("a", { type: "result", req: "old-callback", ok: true });
      g.handle({ type: "join", id: "stale", worldId: "legacy", data: { nick: "Old" } });
      g.handle({ type: "profile", id: "a", worldId: "legacy", data: { inventory: { 111: 64 } } });
      g.route({
        type: "delivery",
        id: "a",
        worldId: "legacy",
        data: { type: "result", ok: true, req: "old-outbox" },
      });
      assert.equal(g.room!.players.size, 0);
      assert.equal(db.values.get(g.snapshot), fresh);
      assert.equal(
        a.messages.some((m) => m.req?.startsWith("old-")),
        false,
      );
      assert.equal(
        db.publications.some((p) => decodeRedis(p.value).data?.req?.startsWith("old-")),
        false,
      );
      assert.equal(
        await g.store!.eval(PERSIST, {
          keys: [oldLease, g.snapshot],
          arguments: [oldToken, "old-data"],
        }),
        0,
      );
      assert.equal(await g.store!.set(oldLease, oldToken, { NX: true, PX: 8000 }), null);
    } finally {
      await g.close();
    }
  });

test("Reset write failure preserves the last snapshot and cannot produce a successful reset result", async () => {
  const db = new Database(),
    g = leader(db),
    a = peer(g);
  try {
    await g.persist();
    const original = db.values.get(g.snapshot);
    await unlock(g, a.p);
    db.rejectReset = true;
    await reset(g, a.p, null);
    assert.equal(a.messages.at(-1).ok, false);
    assert.equal(db.values.get(g.snapshot), original);
    assert.equal(db.values.has(g.generation), false);
    assert.equal(
      a.messages.some((m) => m.type === "worldReset"),
      false,
    );
    assert.equal(g.room, null);
  } finally {
    await g.close();
  }
});

test("Concurrent authorized resets use compare-and-swap and cannot replace the winner a second time", async () => {
  const db = new Database(),
    one = leader(db);
  const two = new Gateway({
    store: db.connection(),
    local: false,
    namespace: "admin-test",
    resetPasswordHash: hash,
  });
  two.store = two.options.store!;
  const a = peer(one),
    b = peer(two);
  try {
    await one.persist();
    await Promise.all([unlock(one, a.p), unlock(two, b.p)]);
    await Promise.all([reset(one, a.p, 7, "legacy"), reset(two, b.p, 9, "legacy")]);
    const results = [...a.messages, ...b.messages].filter(
      (m) => m.type === "worldAdminResult" && m.req === "reset",
    );
    assert.equal(results.filter((m) => m.ok).length, 1);
    assert.equal(results.filter((m) => !m.ok).length, 1);
    const saved = decodeRedis(db.values.get(one.snapshot)!);
    assert.equal(saved.worldId, results.find((m) => m.ok)!.worldId);
    assert.equal(saved.seed, results.find((m) => m.ok)!.seed);
    assert.deepEqual(saved.players, []);
  } finally {
    await one.close();
    await two.close();
  }
});

test("Local reset serializes pending file writes, retains plain JSON and loads the new seed after restart", async () => {
  const directory = await mkdtemp(join(tmpdir(), "blockland-reset-"));
  const file = join(directory, "world.json");
  const g = new Gateway({ local: true, file, resetPasswordHash: hash });
  try {
    await g.init();
    const a = peer(g);
    g.room!.storage.old = { 8: 4 };
    const previous = g.persist();
    await unlock(g, a.p);
    await reset(g, a.p, -2147483648);
    await previous;
    const saved = JSON.parse(await readFile(file, "utf8"));
    assert.equal(saved.seed, -2147483648);
    assert.deepEqual(saved.storage, {});
    await g.close();
    const restored = new Gateway({ local: true, file });
    await restored.init();
    assert.equal(restored.seed, saved.seed);
    assert.equal(restored.worldId, saved.worldId);
    await restored.close();
  } finally {
    if (!g.closed) await g.close();
    // mkdtemp returns an explicitly bounded test directory under the OS temp root.
    assert(directory.startsWith(join(tmpdir(), "blockland-reset-")));
    await rm(directory, { recursive: true, force: true });
  }
});

test("Two real WebSocket gateways reset once, close old sessions, and restore the new generation after failover", async () => {
  const db = new Database();
  const apps = [0, 1].map(() =>
    createGameServer({
      local: false,
      store: db.connection(),
      namespace: "admin-test",
      resetPasswordHash: hash,
    }),
  );
  const clients: WebSocket[] = [];
  async function connect(app: (typeof apps)[number], token: string, joined = true) {
    const ws = new WebSocket("ws://127.0.0.1:" + (app.server.address() as any).port);
    clients.push(ws);
    const messages: any[] = [];
    ws.on("message", (raw) => messages.push(JSON.parse(raw.toString())));
    const wait = async (fn: (m: any) => boolean) => {
      for (let n = 0; n < 400; n++) {
        const message = messages.find(fn);
        if (message) return message;
        await new Promise((r) => setTimeout(r, 10));
      }
      throw Error("Admin WS timeout " + JSON.stringify(messages.slice(-2)));
    };
    const ready = await wait((m) => m.type === "ready");
    const send = (message: any) => ws.send(JSON.stringify({ worldId: ready.worldId, ...message }));
    if (joined) {
      send({
        type: "join",
        protocol: PROTOCOL,
        token,
        nick: "Tester_" + token[0],
        skin: {
          skin: "data:image/png;base64,aGVsbG8=",
          cape: "data:image/png;base64,aGVsbG8=",
          capeEnabled: false,
        },
      });
      await wait((m) => m.type === "welcome");
    }
    return { ws, messages, wait, send, ready };
  }
  try {
    for (const app of apps) {
      app.server.listen(0, "127.0.0.1");
      await once(app.server, "listening");
    }
    const a = await connect(apps[0], "a".repeat(64));
    const b = await connect(apps[1], "b".repeat(64));
    await b.wait((m) => m.type === "frame" && m.players.length === 2);
    const oldLeader = apps.find((app) => app.gateway.room)!.gateway;
    oldLeader.room!.storage.old = { 8: 16 };
    await oldLeader.persist();
    b.send({ type: "worldAdmin", action: "unlock", req: "unlock", password });
    assert.equal((await b.wait((m) => m.req === "unlock")).ok, true);
    b.send({
      type: "worldAdmin",
      action: "reset",
      req: "reset",
      seed: 0,
      expectedWorldId: b.ready.worldId,
    });
    const result = await b.wait((m) => m.req === "reset");
    assert.equal(result.ok, true);
    await a.wait((m) => m.type === "worldReset");
    await b.wait((m) => m.type === "worldReset");
    assert.notEqual(result.worldId, "legacy");
    const obsolete = await connect(apps[0], "z".repeat(64), false);
    obsolete.ws.send(
      JSON.stringify({ type: "join", protocol: PROTOCOL - 1, token: "z".repeat(64), nick: "Old" }),
    );
    const oldError = await obsolete.wait((m) => m.type === "error");
    assert.equal(oldError.fatal, true);
    assert.match(oldError.message, /nieaktualna/);
    const again = await connect(apps[0], "a".repeat(64));
    const welcome = await again.wait((m) => m.type === "welcome");
    assert.equal(welcome.worldId, result.worldId);
    assert.equal(welcome.seed, 0);
    assert.deepEqual(welcome.profile.inventory ?? {}, {});
    const currentLeader = apps.find((app) => app.gateway.room)!.gateway;
    const follower = apps.find((app) => app.gateway !== currentLeader)!.gateway;
    await currentLeader.close();
    follower.nextLease = 0;
    await follower.step();
    assert.equal(follower.room?.worldId, result.worldId);
    assert.equal(follower.room?.seed, 0);
    assert.deepEqual(follower.room?.storage, {});
    assert.equal(db.values.get(follower.legacyLease), "reset:" + result.worldId);
    assert(db.publications.every((p) => !p.value.includes(password)));
  } finally {
    clients.forEach((ws) => ws.terminate());
    for (const app of apps) {
      if (!app.gateway.closed) await app.gateway.close();
      app.wss.close();
      await new Promise<void>((resolve) => app.server.close(() => resolve()));
    }
  }
});
