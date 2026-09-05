import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { WebSocket } from "ws";
import { createGameServer, type Store, RENEW, RELEASE, PERSIST } from "../server/gateway";
const skin = {
  skin: "data:image/png;base64,aGVsbG8=",
  cape: "data:image/png;base64,aGVsbG8=",
  capeEnabled: false,
};
type Client = {
  ws: WebSocket;
  messages: any[];
  send: (data: any) => void;
  wait: (fn: (m: any) => boolean) => Promise<any>;
};
async function client(port: number, token: string, nick: string): Promise<Client> {
  const ws = new WebSocket("ws://127.0.0.1:" + port + "/api/game");
  const messages: any[] = [];
  ws.on("message", (raw) => messages.push(JSON.parse(raw.toString())));
  await once(ws, "open");
  const send = (data: any) => ws.send(JSON.stringify(data));
  const wait = async (fn: (m: any) => boolean) => {
    const end = Date.now() + 15000;
    while (Date.now() < end) {
      const found = messages.find(fn);
      if (found) return found;
      await new Promise((r) => setTimeout(r, 25));
    }
    throw Error("Message timeout: " + JSON.stringify(messages.slice(-3)));
  };
  await wait((m) => m.type === "ready");
  send({ type: "join", protocol: 1, token, nick, skin });
  return { ws, messages, send, wait };
}
async function start(options: any = { local: true }) {
  const app = createGameServer(options);
  app.server.listen(0, "127.0.0.1");
  await once(app.server, "listening");
  return { ...app, port: (app.server.address() as any).port };
}
async function stop(app: Awaited<ReturnType<typeof start>>, clients: Client[]) {
  for (const c of clients) c.ws.terminate();
  await app.gateway.close();
  app.wss.close();
  await new Promise<void>((r) => app.server.close(() => r()));
}
test("Real WebSocket clients share presence, edits, chat, voice and reconnect state", async () => {
  const app = await start();
  const clients: Client[] = [];
  try {
    const a = await client(app.port, "a".repeat(64), "Alicja");
    clients.push(a);
    const wa = await a.wait((m) => m.type === "welcome");
    const b = await client(app.port, "b".repeat(64), "Bartek");
    clients.push(b);
    await b.wait((m) => m.type === "welcome");
    await a.wait((m) => m.type === "frame" && m.players.length === 2);
    a.send({ type: "chat", text: "Cześć, budujemy razem!" });
    assert.equal((await b.wait((m) => m.type === "chat")).text, "Cześć, budujemy razem!");
    a.send({ type: "voice", audio: Buffer.alloc(3200, 10).toString("base64") });
    const voice = await b.wait((m) => m.type === "voice");
    assert.equal(voice.sender, wa.id);
    assert.equal(Buffer.from(voice.audio, "base64").length, 3200);
    app.gateway.room!.players.get(wa.id)!.profile.inventory = { 8: 7 };
    a.send({ type: "input", p: [30, 50, 30], dimension: "overworld", yaw: 0, pitch: 0, held: 8 });
    b.send({ type: "input", p: [31, 50, 30], dimension: "overworld", yaw: 0, pitch: 0, held: 0 });
    await new Promise((r) => setTimeout(r, 120));
    app.gateway.room!.region("overworld").world.set(30, 50, 28, 3);
    a.send({
      type: "command",
      command: { type: "use", req: "place", x: 30, y: 50, z: 28, place: [30, 51, 28] },
    });
    assert.equal((await a.wait((m) => m.type === "result" && m.req === "place")).ok, true);
    await b.wait(
      (m) =>
        m.type === "frame" &&
        m.changes.some((c: any) => c[1] === 30 && c[2] === 51 && c[3] === 28 && c[4] === 8),
    );
    a.send({ type: "profile", data: { inventory: { 8: 6 }, food: 19, health: 20, xp: 3 } });
    await new Promise((r) => setTimeout(r, 100));
    a.ws.close();
    await once(a.ws, "close");
    const again = await client(app.port, "a".repeat(64), "Alicja");
    clients.push(again);
    const welcome = await again.wait((m) => m.type === "welcome");
    assert.equal(welcome.profile.inventory[8], 6);
    assert.equal(welcome.edits["overworld:30,51,28"], 8);
  } finally {
    await stop(app, clients);
  }
});
class SharedStore {
  values = new Map<string, { v: string; until: number }>();
  listeners = new Map<string, Set<(v: string) => void>>();
  connection(): Store {
    const subscribed: { channel: string; fn: (v: string) => void }[] = [];
    const get = async (k: string) => {
      const v = this.values.get(k);
      if (!v || v.until < Date.now()) {
        this.values.delete(k);
        return null;
      }
      return v.v;
    };
    return {
      get,
      set: async (k, v, o) => {
        if (o?.NX && (await get(k))) return null;
        this.values.set(k, { v, until: o?.PX ? Date.now() + o.PX : Infinity });
        return "OK";
      },
      eval: async (script, { keys, arguments: args }) => {
        if ((await get(keys[0])) !== args[0]) return 0;
        if (script === RENEW) {
          this.values.get(keys[0])!.until = Date.now() + Number(args[1]);
          return 1;
        }
        if (script === RELEASE) {
          this.values.delete(keys[0]);
          return 1;
        }
        if (script === PERSIST) {
          this.values.set(keys[1], { v: args[1], until: Infinity });
          return 1;
        }
        throw Error("Unknown script");
      },
      publish: async (c, v) => {
        for (const fn of this.listeners.get(c) ?? []) queueMicrotask(() => fn(v));
        return this.listeners.get(c)?.size ?? 0;
      },
      subscribe: async (c, fn) => {
        if (!this.listeners.has(c)) this.listeners.set(c, new Set());
        this.listeners.get(c)!.add(fn);
        subscribed.push({ channel: c, fn });
      },
      close: async () => {
        for (const { channel, fn } of subscribed) this.listeners.get(channel)?.delete(fn);
      },
    };
  }
}
test("Separate server instances share a room through pub/sub; leader failover preserves world", async () => {
  const shared = new SharedStore(),
    one = await start({ local: false, store: shared.connection(), namespace: "test" }),
    two = await start({ local: false, store: shared.connection(), namespace: "test" });
  const clients: Client[] = [];
  try {
    const a = await client(one.port, "c".repeat(64), "Celina");
    clients.push(a);
    await a.wait((m) => m.type === "welcome");
    const b = await client(two.port, "d".repeat(64), "Darek");
    clients.push(b);
    await b.wait((m) => m.type === "welcome");
    await b.wait((m) => m.type === "frame" && m.players.length === 2);
    const leader = one.gateway.room ? one : two,
      follower = leader === one ? two : one;
    leader.gateway.room!.region("nether").world.set(19, 30, 19, 12);
    await leader.gateway.persist();
    await leader.gateway.close();
    follower.gateway.nextLease = 0;
    await follower.gateway.step();
    assert(follower.gateway.room);
    assert.equal(follower.gateway.room.save().edits["nether:19,30,19"], 12);
    const old = shared.connection();
    const result = await old.eval(PERSIST, {
      keys: ["test:leader", "test:snapshot"],
      arguments: [leader.gateway.node, "BAD"],
    });
    assert.equal(result, 0);
    assert.notEqual(await old.get("test:snapshot"), "BAD");
  } finally {
    for (const c of clients) c.ws.terminate();
    await Promise.all([stop(one, []), stop(two, [])]);
  }
});
test("Production server refuses multiplayer without Redis configuration", async () => {
  const old = process.env.REDIS_URL;
  delete process.env.REDIS_URL;
  const app = await start({ local: false });
  const ws = new WebSocket("ws://127.0.0.1:" + app.port + "/api/game");
  try {
    const [raw] = await once(ws, "message");
    const data = JSON.parse(raw.toString());
    assert(data.fatal);
    assert.match(data.message, /Redis/);
  } finally {
    ws.terminate();
    await stop(app, []);
    if (old) process.env.REDIS_URL = old;
  }
});
