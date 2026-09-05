import { createServer } from "node:http";
import { createHash, randomUUID } from "node:crypto";
import { WebSocketServer, WebSocket } from "ws";
import { createClient } from "redis";
import { readFile, writeFile } from "node:fs/promises";
import { gzipSync, gunzipSync } from "node:zlib";
import { Room } from "./room";
import {
  PROTOCOL,
  validNick,
  validSkin,
  validToken,
  validVoice,
  validFaceFrame,
  FACE_FRAME_INTERVAL,
  FACE_ROOM_FRAME_BUDGET,
  type Command,
} from "../lib/net-protocol";
export type Store = {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, options?: { NX?: boolean; PX?: number }): Promise<string | null>;
  eval(script: string, options: { keys: string[]; arguments: string[] }): Promise<unknown>;
  publish(channel: string, value: string): Promise<number>;
  subscribe(channel: string, fn: (value: string) => void): Promise<void>;
  close(): Promise<void>;
};
export const RENEW =
  "if redis.call('GET',KEYS[1])==ARGV[1] then return redis.call('PEXPIRE',KEYS[1],ARGV[2]) else return 0 end";
export const RELEASE =
  "if redis.call('GET',KEYS[1])==ARGV[1] then return redis.call('DEL',KEYS[1]) else return 0 end";
export const PERSIST =
  "if redis.call('GET',KEYS[1])==ARGV[1] then redis.call('SET',KEYS[2],ARGV[2]);return 1 else return 0 end";
export const REDIS_CODEC_PREFIX = "MINECRAFTGRA:GZIP1:";

/** Redis transport only: browser messages and local save files remain ordinary JSON. */
export function encodeRedis(value: unknown, forceCompression = false): string {
  const json = JSON.stringify(value);
  if (!forceCompression && Buffer.byteLength(json) <= 1024) return json;
  const encoded = REDIS_CODEC_PREFIX + gzipSync(json, { level: 1 }).toString("base64");
  return forceCompression || encoded.length < Buffer.byteLength(json) ? encoded : json;
}

export function decodeRedis(value: string): any {
  const json = value.startsWith(REDIS_CODEC_PREFIX)
    ? gunzipSync(Buffer.from(value.slice(REDIS_CODEC_PREFIX.length), "base64"), {
        maxOutputLength: 64 * 1024 * 1024,
      }).toString("utf8")
    : value;
  return JSON.parse(json);
}

async function redisStore(url: string): Promise<Store> {
  const command = createClient({
    url,
    socket: { connectTimeout: 6000, reconnectStrategy: (retries) => Math.min(250 * retries, 2000) },
  });
  const sub = command.duplicate();
  command.on("error", () => {});
  sub.on("error", () => {});
  await Promise.all([command.connect(), sub.connect()]);
  return {
    get: (k) => command.get(k),
    set: (k, v, o) => command.set(k, v, o),
    eval: (s, o) => command.eval(s, o),
    publish: (c, v) => command.publish(c, v),
    subscribe: (c, fn) => sub.subscribe(c, fn),
    close: async () => {
      await Promise.allSettled([command.quit(), sub.quit()]);
    },
  };
}
type Packet = { type: string; id: string; data?: any; node?: string; connection?: string };
type Peer = {
  id: string;
  nick: string;
  socket: WebSocket;
  connection: string;
  count: number;
  bytes: number;
  reset: number;
  voice: number;
  face: number;
  faceActive: boolean;
  joined: boolean;
};
export class Gateway {
  node = randomUUID();
  room: Room | null = null;
  store: Store | null = null;
  peers = new Map<WebSocket, Peer>();
  timer: ReturnType<typeof setInterval> | null = null;
  leaseUntil = 0;
  nextLease = 0;
  nextPersist = 0;
  lastTick = 0;
  busy = false;
  starting: Promise<void> | null = null;
  closed = false;
  local: boolean;
  namespace: string;
  out: string;
  incoming: string;
  lease: string;
  snapshot: string;
  cameraPlayers = 1;
  cameraPublishing = false;
  cameraForwarding = false;
  constructor(
    public options: { store?: Store; local?: boolean; namespace?: string; file?: string } = {},
  ) {
    this.local = options.local ?? !process.env.VERCEL;
    this.namespace = options.namespace ?? process.env.WORLD_NAMESPACE ?? "minecraftgra-v1";
    if (!/^[a-zA-Z0-9_-]{1,80}$/.test(this.namespace)) throw Error("Invalid WORLD_NAMESPACE");
    this.out = this.namespace + ":out";
    this.incoming = this.namespace + ":in";
    this.lease = this.namespace + ":leader";
    this.snapshot = this.namespace + ":snapshot";
  }
  async init() {
    if (this.starting) return this.starting;
    this.starting = this.start();
    return this.starting;
  }
  async start() {
    this.closed = false;
    if (this.options.store) this.store = this.options.store;
    else if (process.env.REDIS_URL) this.store = await redisStore(process.env.REDIS_URL);
    else if (!this.local) throw Error("SETUP_REDIS");
    if (this.store) {
      await this.store.subscribe(this.out, (v) => {
        try {
          this.route(decodeRedis(v));
        } catch {}
      });
      await this.store.subscribe(this.incoming, (v) => {
        if (this.room && Date.now() < this.leaseUntil)
          try {
            this.handle(decodeRedis(v));
          } catch {}
      });
    } else {
      this.room = this.makeRoom();
      if (this.options.file)
        try {
          this.room.restore(JSON.parse(await readFile(this.options.file, "utf8")));
        } catch {}
      this.leaseUntil = Infinity;
    }
    this.lastTick = Date.now();
    this.timer = setInterval(() => void this.step(), 50);
    await this.step();
  }
  makeRoom() {
    return new Room((id, data) => this.broadcast({ type: "delivery", id, data }));
  }
  async step() {
    if (this.busy || this.closed) return;
    this.busy = true;
    try {
      const now = Date.now();
      if (this.store && now >= this.nextLease) {
        this.nextLease = now + 2000;
        if (this.room) {
          const ok = await this.store.eval(RENEW, {
            keys: [this.lease],
            arguments: [this.node, "8000"],
          });
          if (ok) this.leaseUntil = Date.now() + 6000;
          else {
            this.room = null;
            this.leaseUntil = 0;
          }
        } else if (await this.store.set(this.lease, this.node, { NX: true, PX: 8000 })) {
          const raw = await this.store.get(this.snapshot);
          this.room = this.makeRoom();
          if (raw) this.room.restore(decodeRedis(raw));
          this.leaseUntil = Date.now() + 6000;
          this.nextPersist = 0;
          this.broadcast({ type: "delivery", id: "*", data: { type: "resync" } });
        }
      }
      if (this.room && now < this.leaseUntil) {
        const dt = Math.min(0.1, Math.max(0.001, (now - this.lastTick) / 1000));
        this.room.tick(dt);
        if (this.room.tickId % 2 === 0)
          this.broadcast({ type: "delivery", id: "*", data: this.room.frame() });
        if (now >= this.nextPersist) {
          this.nextPersist = now + 2000;
          await this.persist();
        }
      }
      this.lastTick = now;
    } catch {
      this.leaseUntil = 0;
      for (const p of this.peers.values())
        this.send(p.socket, {
          type: "error",
          message: "Połączenie z zapisem świata przerwane. Trwa ponawianie…",
        });
    } finally {
      this.busy = false;
    }
  }
  async persist() {
    if (!this.room) return false;
    const data = this.room.save();
    if (this.store)
      return (
        (await this.store.eval(PERSIST, {
          keys: [this.lease, this.snapshot],
          arguments: [this.node, encodeRedis(data, true)],
        })) === 1
      );
    if (this.options.file) await writeFile(this.options.file, JSON.stringify(data), "utf8");
    return true;
  }
  broadcast(packet: Packet) {
    const publish = () => {
      const camera =
        packet.type === "delivery" &&
        packet.data?.type === "faceFrame" &&
        packet.data.frame !== null;
      if (camera && this.cameraPublishing) return;
      if (this.store) {
        if (camera) this.cameraPublishing = true;
        void this.store
          .publish(this.out, encodeRedis(packet))
          .catch(() => {})
          .finally(() => {
            if (camera) this.cameraPublishing = false;
          });
      } else this.route(packet);
    };
    if (
      packet.type === "delivery" &&
      packet.data?.type === "result" &&
      packet.data.ok &&
      this.store
    ) {
      // Acknowledgements for accepted changes follow the durable, lease-fenced write.
      void this.persist()
        .then((saved) => {
          if (saved) publish();
        })
        .catch(() => {});
    } else publish();
  }
  route(packet: Packet) {
    if (packet.type === "delivery" && packet.data?.type === "frame")
      this.cameraPlayers = Math.max(1, Math.min(16, packet.data.players?.length ?? 1));
    if (packet.type === "connection") {
      for (const p of this.peers.values())
        if (p.id === packet.id && p.connection !== packet.connection) {
          this.send(p.socket, {
            type: "error",
            fatal: true,
            message: "Ten profil połączył się w innej karcie.",
          });
          p.socket.close(4001, "Profile connected elsewhere");
        }
      return;
    }
    for (const p of this.peers.values())
      if (p.joined && (packet.id === "*" || p.id === packet.id)) {
        if (packet.type === "voice" && p.id !== packet.id && packet.data?.sender !== p.id)
          this.send(p.socket, { type: "voice", ...packet.data });
        else if (packet.type === "delivery") {
          let data = packet.data;
          if (data.type === "faceFrame") {
            if (data.sender === p.id) continue;
            if (
              data.viewers?.includes(p.id) &&
              (data.frame === null || (p.socket.bufferedAmount ?? 0) <= 64000)
            )
              this.send(p.socket, { type: "faceFrame", sender: data.sender, frame: data.frame });
            else if (data.cleared?.includes(p.id))
              this.send(p.socket, { type: "faceFrame", sender: data.sender, frame: null });
            continue;
          }
          if (data.type === "frame") {
            const self = data.players.find((q: any) => q.id === p.id),
              dimension = self?.dimension ?? "overworld";
            data = {
              ...data,
              mobs: { [dimension]: data.mobs[dimension] },
              drops: data.drops.filter((d: any) => d.dimension === dimension),
              shots: data.shots.filter((s: any) => s.dimension === dimension),
              dragon: dimension === "end" ? data.dragon : null,
            };
          }
          this.send(p.socket, data);
        }
      }
  }
  forward(packet: Packet) {
    if (this.closed) return;
    if (!this.store || (this.room && Date.now() < this.leaseUntil)) this.handle(packet);
    else {
      const camera = packet.type === "faceFrame" && packet.data !== null;
      if (camera && this.cameraForwarding) return;
      if (camera) this.cameraForwarding = true;
      void this.store
        .publish(this.incoming, encodeRedis(packet))
        .catch(() => {})
        .finally(() => {
          if (camera) this.cameraForwarding = false;
        });
    }
  }
  handle(packet: Packet) {
    const room = this.room;
    if (!room) return;
    const { id, data } = packet;
    if (packet.type === "join") {
      room.join(id, data.nick, data.skin, data.difficulty);
      const p = room.players.get(id);
      if (p) {
        this.broadcast({
          type: "delivery",
          id: "*",
          data: { type: "appearance", id, nick: p.nick, skin: p.skin },
        });
        for (const q of room.players.values())
          if (q.id !== id && Date.now() - q.seen < 12000)
            this.broadcast({
              type: "delivery",
              id,
              data: { type: "appearance", id: q.id, nick: q.nick, skin: q.skin },
            });
      }
    } else if (packet.type === "input") room.input(id, data);
    else if (packet.type === "faceFrame") room.faceFrame(id, data);
    else if (packet.type === "command") room.command(id, data as Command);
    else if (packet.type === "profile") room.profile(id, data);
    else if (packet.type === "chat") room.chatMessage(id, data);
    else if (packet.type === "leave") {
      room.clearFace(id);
      room.horrorHunt.reset(id);
      room.broadcastHunts();
      const p = room.players.get(id);
      if (p) p.seen = 0;
    }
  }
  send(ws: WebSocket, data: unknown) {
    if (ws.readyState === WebSocket.OPEN) {
      if (ws.bufferedAmount > 2_000_000) {
        ws.close(1013, "Slow connection");
        return;
      }
      ws.send(JSON.stringify(data));
    }
  }
  async accept(ws: WebSocket) {
    try {
      await this.init();
    } catch (e) {
      this.send(ws, {
        type: "error",
        fatal: true,
        message: String(e).includes("SETUP_REDIS")
          ? "Serwer wymaga podłączenia Redis w panelu Vercela. Instrukcja jest w folderze gry."
          : "Nie można połączyć się z bazą świata. Sprawdź konfigurację serwera.",
      });
      ws.close(1011);
      return;
    }
    const peer: Peer = {
      id: "",
      nick: "",
      socket: ws,
      connection: randomUUID(),
      count: 0,
      bytes: 0,
      reset: Date.now(),
      voice: 0,
      face: 0,
      faceActive: false,
      joined: false,
    };
    this.peers.set(ws, peer);
    const timeout = setTimeout(() => {
      if (!peer.joined) ws.close(1008, "Join required");
    }, 10000);
    const rotate = setTimeout(() => ws.close(1012, "Reconnect"), 270000);
    ws.on("message", (raw, isBinary) => {
      if (isBinary) return ws.close(1003);
      const now = Date.now();
      if (now - peer.reset > 1000) {
        peer.count = 0;
        peer.bytes = 0;
        peer.reset = now;
      }
      peer.count++;
      peer.bytes +=
        raw instanceof ArrayBuffer
          ? raw.byteLength
          : Array.isArray(raw)
            ? raw.reduce((n, b) => n + b.length, 0)
            : raw.length;
      if (peer.count > 65 || peer.bytes > 1800000) return ws.close(1008, "Rate limit");
      let m: any;
      try {
        m = JSON.parse(raw.toString());
      } catch {
        return ws.close(1007);
      }
      if (!m || typeof m !== "object") return;
      if (m.type === "ping") return this.send(ws, { type: "pong", time: m.time });
      if (m.type === "join") {
        if (m.protocol !== PROTOCOL) {
          this.send(ws, {
            type: "error",
            fatal: true,
            message: "Ta wersja gry jest nieaktualna. Odśwież stronę lub pobierz nowe GRA.html.",
          });
          return ws.close(1008);
        }
        if (!validToken(m.token) || !validNick(m.nick) || !validSkin(m.skin)) {
          this.send(ws, {
            type: "error",
            fatal: true,
            message: "Nieprawidłowy nick, profil lub wersja gry.",
          });
          return ws.close(1008);
        }
        const id = createHash("sha256").update(m.token).digest("hex").slice(0, 24);
        if (peer.joined && peer.id !== id) return ws.close(1008);
        peer.id = id;
        peer.nick = m.nick;
        peer.joined = true;
        clearTimeout(timeout);
        this.broadcast({ type: "connection", id, connection: peer.connection });
        this.forward({
          type: "join",
          id,
          data: { nick: m.nick, skin: m.skin, difficulty: m.difficulty },
        });
        return;
      }
      if (!peer.joined) return;
      if (m.type === "faceFrame") {
        const interval = Math.max(
          FACE_FRAME_INTERVAL * 1000,
          (this.cameraPlayers * 1000) / FACE_ROOM_FRAME_BUDGET,
        );
        if (
          validFaceFrame(m.frame) &&
          (m.frame === null ? peer.faceActive : now - peer.face + 1 >= interval)
        ) {
          peer.faceActive = m.frame !== null;
          if (peer.faceActive) peer.face = now;
          this.forward({ type: "faceFrame", id: peer.id, data: m.frame });
        }
        return;
      }
      if (m.type === "voice") {
        if (validVoice(m.audio) && now - peer.voice >= 70) {
          peer.voice = now;
          this.broadcast({ type: "voice", id: "*", data: { sender: peer.id, audio: m.audio } });
        }
        return;
      }
      if (m.type === "input") this.forward({ type: "input", id: peer.id, data: m });
      else if (m.type === "chat") this.forward({ type: "chat", id: peer.id, data: m.text });
      else if (m.type === "profile") this.forward({ type: "profile", id: peer.id, data: m.data });
      else if (m.type === "command" && m.command && typeof m.command === "object")
        this.forward({ type: "command", id: peer.id, data: m.command });
    });
    ws.on("close", () => {
      clearTimeout(timeout);
      clearTimeout(rotate);
      this.peers.delete(ws);
      if (peer.id) this.forward({ type: "leave", id: peer.id });
    });
    ws.on("error", () => {});
    this.send(ws, { type: "ready" });
  }
  async close() {
    this.closed = true;
    if (this.timer) clearInterval(this.timer);
    for (const p of this.peers.values()) p.socket.close(1001);
    await this.persist();
    if (this.store) {
      await this.store.eval(RELEASE, { keys: [this.lease], arguments: [this.node] });
      await this.store.close();
    }
    this.room = null;
  }
}
export function createGameServer(options: ConstructorParameters<typeof Gateway>[0] = {}) {
  const gateway = new Gateway(options);
  const server = createServer((req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Content-Type", "application/json");
    res.end(
      JSON.stringify({
        name: "Wspólny świat",
        protocol: PROTOCOL,
        configured: !!(process.env.REDIS_URL || options.store || gateway.local),
        players: gateway.room
          ? [...gateway.room.players.values()].filter((p) => Date.now() - p.seen < 12000).length
          : 0,
        voice: true,
      }),
    );
  });
  const wss = new WebSocketServer({
    noServer: true,
    maxPayload: 450000,
    perMessageDeflate: { threshold: 1024 },
  });
  server.on("upgrade", (req, socket, head) => {
    const origin = req.headers.origin;
    if (origin) {
      try {
        const host = new URL(origin).host;
        if (host !== req.headers.host) {
          socket.write("HTTP/1.1 403 Forbidden\r\n\r\n");
          socket.destroy();
          return;
        }
      } catch {
        socket.destroy();
        return;
      }
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      void gateway.accept(ws);
    });
  });
  return { server, gateway, wss };
}
