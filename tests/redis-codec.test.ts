import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdir, readFile, unlink } from "node:fs/promises";
import { resolve } from "node:path";
import {
  Gateway,
  PERSIST,
  RELEASE,
  RENEW,
  REDIS_CODEC_PREFIX,
  encodeRedis,
  decodeRedis,
  type Store,
} from "../server/gateway";
import { Room } from "../server/room";

function memoryStore() {
  const values = new Map<string, string>(),
    publications: { channel: string; value: string }[] = [];
  const store: Store = {
    get: async (key) => values.get(key) ?? null,
    set: async (key, value, options) => {
      if (options?.NX && values.has(key)) return null;
      values.set(key, value);
      return "OK";
    },
    eval: async (script, { keys, arguments: args }) => {
      if (values.get(keys[0]) !== args[0]) return 0;
      if (script === PERSIST) values.set(keys[1], args[1]);
      else if (script === RELEASE) values.delete(keys[0]);
      else if (script !== RENEW) throw Error("Unexpected script");
      return 1;
    },
    publish: async (channel, value) => {
      publications.push({ channel, value });
      return 1;
    },
    subscribe: async () => {},
    close: async () => {},
  };
  return { store, values, publications };
}

test("Redis codec round-trips Unicode snapshots and reads older plain JSON", () => {
  const snapshot = {
    version: 1,
    players: [{ nick: "Zażółć_ęś", inventory: { 8: 64 } }],
    slots: Array.from({ length: 100 }, () => [null, { id: 8, n: 64 }, null]),
  };
  const compressed = encodeRedis(snapshot, true);
  assert(compressed.startsWith(REDIS_CODEC_PREFIX));
  assert(compressed.length < Buffer.byteLength(JSON.stringify(snapshot)) / 2);
  assert.deepEqual(decodeRedis(compressed), snapshot);
  assert.deepEqual(decodeRedis(JSON.stringify(snapshot)), snapshot);
});

test("Small pubsub messages remain JSON and large messages never grow after compression", () => {
  const small = { type: "input", id: "a", data: { p: [1, 2, 3] } },
    repeated = { type: "frame", rows: Array(300).fill({ kind: "sheep", p: [1, 2, 3] }) },
    noisy = { type: "voice", data: randomBytes(6000).toString("base64") };
  assert.equal(encodeRedis(small), JSON.stringify(small));
  assert(encodeRedis(repeated).startsWith(REDIS_CODEC_PREFIX));
  for (const message of [repeated, noisy]) {
    const encoded = encodeRedis(message);
    assert(Buffer.byteLength(encoded) <= Buffer.byteLength(JSON.stringify(message)));
    assert.deepEqual(decodeRedis(encoded), message);
  }
  assert.throws(() => decodeRedis(REDIS_CODEC_PREFIX + "not-gzip"));
});

test("A local leader handles input once without a Redis publish; expired leaders forward instead", async () => {
  const { store, publications } = memoryStore(),
    gateway = new Gateway({ local: false, store }),
    handled: unknown[] = [],
    packet = { type: "input", id: "a", data: { p: [1, 2, 3] } };
  gateway.store = store;
  gateway.room = new Room(() => {});
  gateway.leaseUntil = Date.now() + 5000;
  gateway.handle = (message) => {
    handled.push(message);
  };
  gateway.forward(packet);
  assert.deepEqual(handled, [packet]);
  assert.equal(publications.length, 0);
  gateway.leaseUntil = 0;
  gateway.forward(packet);
  assert.equal(handled.length, 1);
  assert.equal(publications.length, 1);
  assert.equal(publications[0].channel, gateway.incoming);
  assert.deepEqual(decodeRedis(publications[0].value), packet);
  gateway.closed = true;
  gateway.forward(packet);
  assert.equal(publications.length, 1);
});

for (const compressed of [false, true])
  test(`Gateway restores a ${compressed ? "compressed" : "legacy JSON"} snapshot and persists compressed data`, async () => {
    const { store, values } = memoryStore(),
      gateway = new Gateway({ local: false, store, namespace: "codec-test" }),
      source = new Room(() => {});
    source.region("end").world.set(3, 20, 4, 16);
    values.set(
      gateway.snapshot,
      compressed ? encodeRedis(source.save(), true) : JSON.stringify(source.save()),
    );
    gateway.store = store;
    await gateway.step();
    assert(gateway.room);
    assert.equal(gateway.room.save().edits["end:3,20,4"], 16);
    assert(values.get(gateway.snapshot)!.startsWith(REDIS_CODEC_PREFIX));
    assert.equal(decodeRedis(values.get(gateway.snapshot)!).edits["end:3,20,4"], 16);
    await gateway.close();
  });

test("Durable acknowledgement waits for the compressed, lease-fenced snapshot write", async () => {
  const { store, publications } = memoryStore(),
    gateway = new Gateway({ local: false, store });
  gateway.store = store;
  gateway.room = new Room(() => {});
  let commit: (value: number) => void = () => {},
    saved = "";
  store.eval = async (script, options) => {
    assert.equal(script, PERSIST);
    assert.equal(options.arguments[0], gateway.node);
    saved = options.arguments[1];
    return new Promise<number>((resolveCommit) => {
      commit = resolveCommit;
    });
  };
  const packet = { type: "delivery", id: "a", data: { type: "result", req: "durable", ok: true } };
  gateway.broadcast(packet);
  assert(saved.startsWith(REDIS_CODEC_PREFIX));
  assert.equal(decodeRedis(saved).version, 1);
  assert.equal(publications.length, 0);
  commit(1);
  await new Promise((done) => setImmediate(done));
  assert.equal(publications.length, 1);
  assert.deepEqual(decodeRedis(publications[0].value), packet);
  gateway.broadcast({ ...packet, data: { ...packet.data, req: "lease-lost" } });
  commit(0);
  await new Promise((done) => setImmediate(done));
  assert.equal(publications.length, 1, "No successful ACK may escape after losing the lease");
});

test("Local file saves stay plain JSON instead of adopting the Redis codec", async () => {
  const directory = resolve(".test-build");
  await mkdir(directory, { recursive: true });
  const file = resolve(directory, `redis-local-${randomUUID()}.json`),
    gateway = new Gateway({ local: true, file });
  gateway.room = new Room(() => {});
  try {
    assert.equal(await gateway.persist(), true);
    const raw = await readFile(file, "utf8");
    assert(raw.startsWith("{"));
    assert.equal(JSON.parse(raw).version, 1);
  } finally {
    await unlink(file);
  }
});
