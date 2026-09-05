import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { WebSocket } from "ws";
import {
  Gateway,
  PERSIST,
  RELEASE,
  RENEW,
  encodeRedis,
  decodeRedis,
  redisSnapshotByteLimit,
  DEFAULT_REDIS_SNAPSHOT_BYTES,
  MAX_REDIS_JSON_BYTES,
  STORAGE_LIMIT_MESSAGE,
  type Store,
} from "../server/gateway";
import { Room } from "../server/room";

function database() {
  const values = new Map<string, string>(),
    subscriptions = new Map<string, Set<(value: string) => void>>(),
    operations: { type: string; keys: string[] }[] = [],
    publications: { channel: string; value: string }[] = [];
  const store: Store = {
    get: async (key) => {
      operations.push({ type: "get", keys: [key] });
      return values.get(key) ?? null;
    },
    set: async (key, value, options) => {
      operations.push({ type: "set", keys: [key] });
      if (options?.NX && values.has(key)) return null;
      values.set(key, value);
      return "OK";
    },
    eval: async (script, { keys, arguments: args }) => {
      assert(
        [PERSIST, RELEASE, RENEW].includes(script),
        "Only fixed, key-scoped scripts are permitted",
      );
      operations.push({
        type: script === PERSIST ? "persist" : script === RELEASE ? "release" : "renew",
        keys,
      });
      if (values.get(keys[0]) !== args[0]) return 0;
      if (script === PERSIST) values.set(keys[1], args[1]);
      if (script === RELEASE) values.delete(keys[0]);
      return 1;
    },
    publish: async (channel, value) => {
      operations.push({ type: "publish", keys: [channel] });
      publications.push({ channel, value });
      for (const listener of subscriptions.get(channel) ?? []) listener(value);
      return subscriptions.get(channel)?.size ?? 0;
    },
    subscribe: async (channel, listener) => {
      operations.push({ type: "subscribe", keys: [channel] });
      if (!subscriptions.has(channel)) subscriptions.set(channel, new Set());
      subscriptions.get(channel)!.add(listener);
    },
    close: async () => {},
  };
  return { values, store, operations, publications };
}

function leader(db: ReturnType<typeof database>, namespace = "blockland-test") {
  const gateway = new Gateway({
    store: db.store,
    local: false,
    namespace,
    maxSnapshotBytes: 1024 * 1024,
  });
  gateway.store = db.store;
  gateway.room = new Room(() => {});
  gateway.leaseUntil = Date.now() + 6000;
  db.values.set(gateway.lease, gateway.node);
  return gateway;
}

function peer(gateway: Gateway) {
  const messages: any[] = [],
    closed: unknown[][] = [];
  const socket: any = {
    readyState: WebSocket.OPEN,
    bufferedAmount: 0,
    send: (raw: string) => messages.push(JSON.parse(raw)),
    close: (...args: unknown[]) => closed.push(args),
  };
  gateway.peers.set(socket, { id: "a", socket, joined: true } as any);
  return { messages, closed };
}

const oversized = () => ({ version: 1, payload: randomBytes(1024 * 1024).toString("base64") });
const flush = () => new Promise<void>((resolve) => setImmediate(resolve));

test("The Redis snapshot budget defaults to 6 MiB and rejects settings outside the 1–12 MiB range", () => {
  assert.equal(DEFAULT_REDIS_SNAPSHOT_BYTES, 6291456);
  assert.equal(redisSnapshotByteLimit(), DEFAULT_REDIS_SNAPSHOT_BYTES);
  assert.equal(redisSnapshotByteLimit(""), DEFAULT_REDIS_SNAPSHOT_BYTES);
  assert.equal(redisSnapshotByteLimit("1048576"), 1048576);
  assert.equal(redisSnapshotByteLimit(12582912), 12582912);
  for (const invalid of [0, -1, 1048575, 12582913, 1048576.1, NaN, Infinity, "no-limit"])
    assert.throws(() => redisSnapshotByteLimit(invalid), /WORLD_REDIS_MAX_SNAPSHOT_BYTES/);
  assert.throws(() => new Gateway({ namespace: "other:snapshot" }), /WORLD_NAMESPACE/);
});

test("Oversized mutations cannot overwrite the last acknowledged save or send a success ACK", async () => {
  const db = database(),
    gateway = leader(db),
    player = peer(gateway);
  gateway.room!.join("a", "Alicja", undefined);
  gateway.room!.players.get("a")!.profile.inventory = { 111: 7 };
  assert.equal(await gateway.persist(), true);
  const previous = db.values.get(gateway.snapshot)!;
  db.values.set("other-project:snapshot", "keep-this-data");
  db.values.set("other-project:leader", "unrelated-owner");
  const data = oversized();
  assert(Buffer.byteLength(encodeRedis(data, true)) > gateway.maxSnapshotBytes);
  gateway.room!.save = () => data as any;
  gateway.broadcast({
    type: "delivery",
    id: "a",
    data: { type: "result", req: "too-large", ok: true },
  });
  await flush();
  assert.equal(gateway.storageBlocked, true);
  assert.equal(gateway.room, null);
  assert.equal(gateway.leaseUntil, 0);
  assert.equal(db.values.get(gateway.snapshot), previous);
  assert.equal(db.values.has(gateway.lease), false);
  assert.equal(db.values.get("other-project:snapshot"), "keep-this-data");
  assert.equal(db.values.get("other-project:leader"), "unrelated-owner");
  assert.equal(
    db.publications.filter((p) => decodeRedis(p.value).data?.type === "result").length,
    0,
  );
  assert.deepEqual(player.messages, [
    { type: "error", fatal: true, message: STORAGE_LIMIT_MESSAGE, worldId: "legacy" },
  ]);
  assert.deepEqual(player.closed, [[1013, "World storage limit"]]);
  const count = db.operations.length;
  gateway.forward({ type: "command", id: "a", data: { type: "mine" } });
  gateway.handle({ type: "join", id: "new", data: { nick: "Nowy" } });
  gateway.broadcast({ type: "delivery", id: "a", data: { type: "result", ok: true } });
  await gateway.step();
  assert.equal(await gateway.persist(), false);
  assert.equal(
    db.operations.length,
    count,
    "Blocked gateways make no further writes or publications",
  );
  assert(
    db.operations.every((operation) =>
      operation.keys.every((key) => key.startsWith("blockland-test:")),
    ),
  );
});

test("Storage-limit control stays inside one namespace and the other application can keep saving", async () => {
  const db = database(),
    game = leader(db, "world-a"),
    other = leader(db, "world-b");
  const follower = new Gateway({ local: false, namespace: "world-a", store: db.store });
  follower.store = db.store;
  const localPlayer = peer(follower),
    otherPlayer = peer(other);
  await db.store.subscribe(follower.out, (raw) => follower.route(decodeRedis(raw)));
  await db.store.subscribe(other.out, (raw) => other.route(decodeRedis(raw)));
  const otherLease = db.values.get(other.lease);
  assert.equal(await other.persist(), true);
  const otherSnapshot = db.values.get(other.snapshot);
  game.room!.save = () => oversized() as any;
  assert.equal(await game.persist(), false);
  assert.equal(follower.storageBlocked, true);
  assert.equal(localPlayer.messages[0].message, STORAGE_LIMIT_MESSAGE);
  assert.equal(other.storageBlocked, false);
  assert.equal(otherPlayer.messages.length, 0);
  assert.equal(db.values.get(other.lease), otherLease);
  assert.equal(db.values.get(other.snapshot), otherSnapshot);
  assert.equal(await other.persist(), true);
  assert(db.publications.every((p) => p.channel === "world-a:out"));
});

test("An already running durable write cannot publish its delayed ACK after the storage safety stop", async () => {
  const db = database(),
    gateway = leader(db);
  const originalEval = db.store.eval;
  let commit: () => Promise<void> = async () => {};
  db.store.eval = async (script, options) => {
    if (script !== PERSIST) return originalEval(script, options);
    // Redis has committed, but its reply is still in flight when another mutation hits the cap.
    const committed = await originalEval(script, options);
    return new Promise((resolve) => {
      commit = async () => {
        resolve(committed);
      };
    });
  };
  gateway.broadcast({
    type: "delivery",
    id: "a",
    data: { type: "result", req: "delayed", ok: true },
  });
  await flush();
  const durable = db.values.get(gateway.snapshot);
  gateway.room!.save = () => oversized() as any;
  assert.equal(await gateway.persist(), false);
  await commit();
  await flush();
  assert.equal(db.values.get(gateway.snapshot), durable);
  assert(!db.publications.some((p) => decodeRedis(p.value).data?.req === "delayed"));
});

test("Lease release is fenced and never deletes a replacement leader after a storage stop", async () => {
  const db = database(),
    gateway = leader(db);
  const originalEval = db.store.eval;
  db.store.eval = async (script, options) => {
    if (script === RELEASE) db.values.set(gateway.lease, "new-leader");
    return originalEval(script, options);
  };
  gateway.room!.save = () => oversized() as any;
  assert.equal(await gateway.persist(), false);
  assert.equal(db.values.get(gateway.lease), "new-leader");
});

test("A highly compressible 65 MiB JSON cannot be acknowledged if the restart reader cannot decode it", async () => {
  const db = database(),
    gateway = leader(db),
    player = peer(gateway);
  assert.equal(await gateway.persist(), true);
  const previous = db.values.get(gateway.snapshot);
  const data = { version: 1, payload: "x".repeat(MAX_REDIS_JSON_BYTES + 1024 * 1024) };
  const encoded = encodeRedis(data, true);
  assert(
    Buffer.byteLength(encoded) < gateway.maxSnapshotBytes,
    "The compressed-only guard would incorrectly accept this save",
  );
  assert.throws(() => decodeRedis(encoded), { code: "ERR_BUFFER_TOO_LARGE" });
  gateway.room!.save = () => data as any;
  gateway.broadcast({
    type: "delivery",
    id: "a",
    data: { type: "result", req: "too-large-after-unpacking", ok: true },
  });
  await flush();
  assert.equal(gateway.storageBlocked, true);
  assert.equal(gateway.room, null);
  assert.equal(db.values.get(gateway.snapshot), previous);
  assert.equal(
    db.operations.filter((operation) => operation.type === "persist").length,
    1,
    "Only the original readable snapshot may reach Redis PERSIST",
  );
  assert(
    !db.publications.some((p) => decodeRedis(p.value).data?.req === "too-large-after-unpacking"),
  );
  assert.equal(player.messages[0].message, STORAGE_LIMIT_MESSAGE);
  assert.equal(db.values.has(gateway.lease), false);
});

test("Closing after Redis OOM still releases the owned lease and closes connections while preserving the error and save", async () => {
  const db = database(),
    gateway = leader(db),
    player = peer(gateway);
  assert.equal(await gateway.persist(), true);
  const previous = db.values.get(gateway.snapshot),
    originalEval = db.store.eval;
  const failure = new Error("OOM command not allowed when used memory exceeds maxmemory");
  let closed = 0;
  db.store.eval = async (script, options) => {
    if (script === PERSIST) throw failure;
    return originalEval(script, options);
  };
  db.store.close = async () => {
    closed++;
  };
  gateway.timer = setInterval(() => {}, 1000);
  await assert.rejects(gateway.close(), (error) => error === failure);
  assert.equal(closed, 1);
  assert.equal(db.values.has(gateway.lease), false);
  assert.equal(db.values.get(gateway.snapshot), previous);
  assert.equal(gateway.room, null);
  assert.equal(gateway.leaseUntil, 0);
  assert.equal(gateway.timer, null);
  assert.equal(gateway.closed, true);
  assert.deepEqual(player.closed, [[1001]]);
});

test("A release failure cannot prevent closing Redis connections or clearing local authority", async () => {
  const db = database(),
    gateway = leader(db);
  const oom = new Error("OOM"),
    release = new Error("Connection lost during RELEASE"),
    close = new Error("QUIT failed");
  let closeCalls = 0;
  db.store.eval = async (script) => {
    throw script === PERSIST ? oom : release;
  };
  db.store.close = async () => {
    closeCalls++;
    throw close;
  };
  await assert.rejects(
    gateway.close(),
    (error) =>
      error instanceof AggregateError &&
      error.errors.length === 3 &&
      error.errors[0] === oom &&
      error.errors[1] === release &&
      error.errors[2] === close,
  );
  assert.equal(closeCalls, 1);
  assert.equal(gateway.room, null);
  assert.equal(gateway.leaseUntil, 0);
  assert.equal(gateway.closed, true);
});
