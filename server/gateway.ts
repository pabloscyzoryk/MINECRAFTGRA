import { createServer } from "node:http";
import { createHash, randomUUID } from "node:crypto";
import { WebSocketServer, WebSocket } from "ws";
import { createClient } from "redis";
import { readFile, writeFile, rename } from "node:fs/promises";
import { gzipSync, gunzipSync } from "node:zlib";
import { Room } from "./room";
import {
  WORLD_ADMIN_TTL,
  configuredWorldPassword,
  verifyWorldPassword,
  validWorldSeed,
  chooseWorldSeed,
} from "./world-admin";
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
// One MSET changes the sole snapshot and both fences together. The permanent legacy
// fence also prevents pre-reset server versions from reacquiring the old lease key.
export const RESET_WORLD =
  "if (redis.call('GET',KEYS[1]) or 'legacy')~=ARGV[1] then return 0 end;redis.call('MSET',KEYS[1],ARGV[2],KEYS[2],ARGV[3],KEYS[3],ARGV[4],KEYS[4],'reset:'..ARGV[2]);redis.call('PEXPIRE',KEYS[3],ARGV[5]);return 1";
export const REDIS_CODEC_PREFIX = "MINECRAFTGRA:GZIP1:";
export const DEFAULT_REDIS_SNAPSHOT_BYTES = 6 * 1024 * 1024;
export const MAX_REDIS_JSON_BYTES = 64 * 1024 * 1024;
export const STORAGE_LIMIT_MESSAGE =
  "Świat osiągnął bezpieczny limit zapisu. Sesja została zatrzymana; ostatni potwierdzony zapis jest zachowany. Administrator musi sprawdzić budżet pamięci świata.";
export function redisSnapshotByteLimit(value: unknown = undefined) {
  if (value === undefined || value === "") return DEFAULT_REDIS_SNAPSHOT_BYTES;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1024 * 1024 || n > 12 * 1024 * 1024)
    throw Error("WORLD_REDIS_MAX_SNAPSHOT_BYTES must be an integer from 1048576 to 12582912");
  return n;
}

/** Redis transport only: browser messages and local save files remain ordinary JSON. */
export function encodeRedis(value: unknown, forceCompression = false): string {
  return encodeRedisJson(JSON.stringify(value), forceCompression);
}
function encodeRedisJson(json: string, forceCompression: boolean): string {
  if (!forceCompression && Buffer.byteLength(json) <= 1024) return json;
  const encoded = REDIS_CODEC_PREFIX + gzipSync(json, { level: 1 }).toString("base64");
  return forceCompression || encoded.length < Buffer.byteLength(json) ? encoded : json;
}

export function decodeRedis(value: string): any {
  const json = value.startsWith(REDIS_CODEC_PREFIX)
    ? gunzipSync(Buffer.from(value.slice(REDIS_CODEC_PREFIX.length), "base64"), {
        maxOutputLength: MAX_REDIS_JSON_BYTES,
      }).toString("utf8")
    : value;
  if (Buffer.byteLength(json) > MAX_REDIS_JSON_BYTES)
    throw RangeError("Redis JSON exceeds the decompressed size limit");
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
type Packet = {
  type: string;
  id: string;
  data?: any;
  node?: string;
  connection?: string;
  worldId?: string;
};
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
  worldId: string;
  adminUntil: number;
  adminAttempts: number;
  adminWindow: number;
  adminBusy: boolean;
  clearJoinTimeout?: () => void;
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
  storageBlocked = false;
  worldId = "legacy";
  seed = 24680;
  resetting = false;
  adminAttempts = 0;
  adminWindow = 0;
  localWrites: Promise<unknown> = Promise.resolve();
  maxSnapshotBytes: number;
  local: boolean;
  namespace: string;
  out: string;
  incoming: string;
  lease: string;
  snapshot: string;
  generation: string;
  legacyLease: string;
  cameraPlayers = 1;
  cameraPublishing = false;
  cameraForwarding = false;
  constructor(
    public options: {
      store?: Store;
      local?: boolean;
      namespace?: string;
      file?: string;
      maxSnapshotBytes?: number;
      resetPasswordHash?: string;
    } = {},
  ) {
    this.local = options.local ?? !process.env.VERCEL;
    this.maxSnapshotBytes = redisSnapshotByteLimit(
      options.maxSnapshotBytes ?? process.env.WORLD_REDIS_MAX_SNAPSHOT_BYTES,
    );
    this.namespace = options.namespace ?? process.env.WORLD_NAMESPACE ?? "minecraftgra-v1";
    if (!/^[a-zA-Z0-9_-]{1,80}$/.test(this.namespace)) throw Error("Invalid WORLD_NAMESPACE");
    this.out = this.namespace + ":out";
    this.incoming = this.namespace + ":in";
    this.lease = this.namespace + ":leader";
    this.legacyLease = this.lease;
    this.snapshot = this.namespace + ":snapshot";
    this.generation = this.namespace + ":world-id";
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
      await this.refreshGeneration(false);
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
      this.worldId = this.room.worldId;
      this.seed = this.room.seed;
      this.leaseUntil = Infinity;
    }
    if (this.storageBlocked) return;
    this.lastTick = Date.now();
    this.timer = setInterval(() => void this.step(), 50);
    await this.step();
  }
  makeRoom(seed = this.seed, worldId = this.worldId) {
    const room = new Room(
      (id, data) => this.broadcast({ type: "delivery", id, data, worldId: room.worldId }),
      undefined,
      seed,
      worldId,
    );
    return room;
  }
  private currentGeneration(packet: Packet) {
    return (packet.worldId ?? "legacy") === (this.worldId ?? "legacy");
  }
  private notifyWorldReset() {
    for (const p of this.peers.values()) {
      p.adminUntil = 0;
      if (p.worldId === this.worldId) continue;
      this.send(p.socket, {
        type: "worldReset",
        seed: this.seed,
        worldId: this.worldId,
        message: "Wspólny świat został zresetowany. Trwa łączenie z nowym światem…",
      });
      p.joined = false;
      p.socket.close(1012, "World reset");
    }
  }
  /** Refresh only at startup/lease maintenance, never per input or frame. */
  async refreshGeneration(notify = true) {
    if (!this.store || this.resetting) return;
    const before = this.worldId;
    const generation = (await this.store.get(this.generation)) ?? "legacy";
    if (this.resetting || this.worldId !== before) return;
    if (generation === this.worldId && this.starting && this.lastTick) return;
    const raw = await this.store.get(this.snapshot);
    if (this.resetting || this.worldId !== before) return;
    const snapshot = raw ? decodeRedis(raw) : null;
    // A reset between the two reads must never pair a new save with an old lease.
    if ((snapshot?.worldId ?? "legacy") !== generation) {
      this.leaseUntil = 0;
      return;
    }
    this.seed = Number.isInteger(snapshot?.seed) ? snapshot.seed : 24680;
    if (generation !== this.worldId) {
      this.worldId = generation;
      this.room = null;
      this.leaseUntil = 0;
      this.nextLease = 0;
      this.storageBlocked = false;
      if (notify) this.notifyWorldReset();
    }
    this.lease = generation === "legacy" ? this.legacyLease : this.namespace + ":leader-v2";
  }
  private localWrite(json: string) {
    if (!this.options.file) return Promise.resolve();
    const file = this.options.file;
    const write = this.localWrites
      .catch(() => {})
      .then(async () => {
        // This is a replace-in-progress file, not a backup; only one save is retained.
        const temporary = file + ".writing";
        await writeFile(temporary, json, "utf8");
        await rename(temporary, file);
      });
    this.localWrites = write;
    return write;
  }
  async step() {
    if (this.busy || this.closed || this.storageBlocked || this.resetting) return;
    this.busy = true;
    const epoch = this.node,
      initialWorldId = this.worldId;
    try {
      const now = Date.now();
      if (this.store && now >= this.nextLease) {
        await this.refreshGeneration();
        if (this.resetting || this.closed) return;
        const generation = this.worldId,
          token = this.node,
          lease = this.lease;
        const current = () =>
          !this.resetting && !this.closed && generation === this.worldId && token === this.node;
        this.nextLease = now + 2000;
        if (this.room) {
          const ok = await this.store.eval(RENEW, {
            keys: [lease],
            arguments: [token, "8000"],
          });
          if (!current()) return;
          if (ok) this.leaseUntil = Date.now() + 6000;
          else {
            this.room = null;
            this.leaseUntil = 0;
          }
        } else if (await this.store.set(lease, token, { NX: true, PX: 8000 })) {
          if (!current()) return;
          const raw = await this.store.get(this.snapshot);
          if (!current()) return;
          const data = raw ? decodeRedis(raw) : null;
          if ((data?.worldId ?? "legacy") !== generation) {
            await this.store.eval(RELEASE, { keys: [lease], arguments: [token] });
            return;
          }
          this.room = this.makeRoom();
          if (data) this.room.restore(data);
          this.seed = this.room.seed;
          this.leaseUntil = Date.now() + 6000;
          this.nextPersist = 0;
          this.broadcast({ type: "delivery", id: "*", data: { type: "resync" } });
        }
      }
      if (this.storageBlocked) {
        this.room = null;
        this.leaseUntil = 0;
        if (this.store)
          await this.store.eval(RELEASE, { keys: [this.lease], arguments: [this.node] });
        return;
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
      if (epoch !== this.node || initialWorldId !== this.worldId || this.resetting) return;
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
    if (!this.room || this.storageBlocked || this.resetting) return false;
    const room = this.room,
      token = this.node,
      lease = this.lease,
      worldId = this.worldId;
    const current = () =>
      room === this.room &&
      token === this.node &&
      worldId === this.worldId &&
      !this.storageBlocked &&
      !this.resetting;
    const data = room.save();
    if (this.store) {
      const json = JSON.stringify(data);
      // A small gzip stream can expand beyond the reader's limit; never acknowledge that save.
      const encoded =
        Buffer.byteLength(json) > MAX_REDIS_JSON_BYTES ? null : encodeRedisJson(json, true);
      if (encoded === null || Buffer.byteLength(encoded) > this.maxSnapshotBytes) {
        this.suspendStorage();
        // The control packet reaches only this world's gateways; the last snapshot is untouched.
        await Promise.allSettled([
          this.store.publish(this.out, encodeRedis({ type: "storageLimit", id: "*", worldId })),
          this.store.eval(RELEASE, { keys: [lease], arguments: [token] }),
        ]);
        return false;
      }
      const saved = await this.store.eval(PERSIST, {
        keys: [lease, this.snapshot],
        arguments: [token, encoded],
      });
      return saved === 1 && current();
    }
    await this.localWrite(JSON.stringify(data));
    return current();
  }
  private suspendStorage() {
    if (this.storageBlocked) return;
    this.storageBlocked = true;
    this.room = null;
    this.leaseUntil = 0;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    for (const p of this.peers.values()) {
      this.send(p.socket, { type: "error", fatal: true, message: STORAGE_LIMIT_MESSAGE });
      p.socket.close(1013, "World storage limit");
    }
  }
  broadcast(packet: Packet) {
    packet.worldId ??= this.worldId ?? "legacy";
    if (this.storageBlocked || this.resetting || !this.currentGeneration(packet)) return;
    const publish = () => {
      if (this.storageBlocked || this.resetting || !this.currentGeneration(packet)) return;
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
    if (packet.type === "worldReset") {
      if (!this.currentGeneration(packet)) void this.refreshGeneration().catch(() => {});
      return;
    }
    if (!this.currentGeneration(packet) || this.resetting) return;
    if (packet.type === "storageLimit") {
      this.suspendStorage();
      return;
    }
    if (this.storageBlocked) return;
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
    packet.worldId ??= this.worldId ?? "legacy";
    if (this.closed || this.storageBlocked || this.resetting || !this.currentGeneration(packet))
      return;
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
    if (this.storageBlocked || this.resetting || !this.currentGeneration(packet)) return;
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
      if (p) {
        room.endBedRest(p);
        room.cancelEating(p);
        p.usingFood = false;
        p.seen = 0;
      }
    }
  }
  send(ws: WebSocket, data: unknown) {
    if (ws.readyState === WebSocket.OPEN) {
      if (ws.bufferedAmount > 2_000_000) {
        ws.close(1013, "Slow connection");
        return;
      }
      ws.send(
        JSON.stringify({
          ...(data as object),
          worldId: (data as any)?.worldId ?? this.worldId ?? "legacy",
        }),
      );
    }
  }
  async worldAdmin(peer: Peer, message: any) {
    if (typeof message.req !== "string" || !/^[\w:-]{1,100}$/.test(message.req)) return;
    const reply = (ok: boolean, text: string) =>
      this.send(peer.socket, {
        type: "worldAdminResult",
        req: message.req,
        ok,
        message: text,
        seed: this.seed,
        worldId: this.worldId,
        expiresAt: peer.adminUntil,
      });
    if (this.closed || peer.adminBusy || this.resetting) {
      reply(false, "Operacja już trwa. Poczekaj na jej zakończenie.");
      return;
    }
    peer.adminBusy = true;
    try {
      if (message.action === "unlock") {
        const now = Date.now();
        if (now - peer.adminWindow >= 60000) {
          peer.adminWindow = now;
          peer.adminAttempts = 0;
        }
        if (now - this.adminWindow >= 60000) {
          this.adminWindow = now;
          this.adminAttempts = 0;
        }
        if (++peer.adminAttempts > 4 || ++this.adminAttempts > 30) {
          reply(false, "Zbyt wiele prób. Spróbuj ponownie za minutę.");
          return;
        }
        const hash = this.options.resetPasswordHash ?? process.env.WORLD_RESET_PASSWORD_HASH;
        if (!configuredWorldPassword(hash)) {
          reply(false, "Reset świata nie jest skonfigurowany na serwerze.");
          return;
        }
        const valid = await verifyWorldPassword(message.password, hash);
        if (!valid) {
          peer.adminUntil = 0;
          reply(false, "Nieprawidłowe hasło.");
          return;
        }
        await this.refreshGeneration();
        if (
          this.closed ||
          peer.worldId !== this.worldId ||
          peer.socket.readyState !== WebSocket.OPEN
        )
          return;
        peer.adminUntil = Date.now() + WORLD_ADMIN_TTL;
        peer.clearJoinTimeout?.();
        reply(true, "Panel resetu odblokowany na 90 sekund.");
        return;
      }
      if (message.action !== "reset") {
        reply(false, "Nieznana operacja.");
        return;
      }
      if (!peer.adminUntil || Date.now() >= peer.adminUntil) {
        peer.adminUntil = 0;
        reply(false, "Autoryzacja wygasła. Wpisz hasło ponownie.");
        return;
      }
      if (message.expectedWorldId !== this.worldId || peer.worldId !== this.worldId) {
        reply(false, "Świat został już zmieniony. Otwórz panel ponownie.");
        return;
      }
      if (!validWorldSeed(message.seed)) {
        reply(
          false,
          "Seed musi być liczbą całkowitą od −2147483648 do 2147483647 albo pustym wyborem losowym.",
        );
        return;
      }
      this.resetting = true;
      peer.adminUntil = 0;
      const expected = this.worldId,
        worldId = randomUUID(),
        token = randomUUID();
      const seed = chooseWorldSeed(message.seed),
        fresh = this.makeRoom(seed, worldId);
      const json = JSON.stringify(fresh.save());
      if (this.store) {
        const encoded = encodeRedisJson(json, true);
        if (
          Buffer.byteLength(json) > MAX_REDIS_JSON_BYTES ||
          Buffer.byteLength(encoded) > this.maxSnapshotBytes
        )
          throw Error("Fresh world exceeds storage limit");
        const ok = await this.store.eval(RESET_WORLD, {
          keys: [this.generation, this.snapshot, this.namespace + ":leader-v2", this.legacyLease],
          arguments: [expected, worldId, encoded, token, "8000"],
        });
        if (ok !== 1) {
          this.resetting = false;
          await this.refreshGeneration();
          reply(false, "Świat został już zmieniony. Otwórz panel ponownie.");
          return;
        }
      } else await this.localWrite(json);
      this.worldId = worldId;
      this.seed = seed;
      this.node = token;
      this.lease = this.store ? this.namespace + ":leader-v2" : this.lease;
      this.room = fresh;
      this.storageBlocked = false;
      this.leaseUntil = this.store ? Date.now() + 6000 : Infinity;
      this.nextLease = Date.now() + 2000;
      this.nextPersist = Date.now() + 2000;
      this.lastTick = Date.now();
      this.resetting = false;
      if (!this.timer && !this.closed) this.timer = setInterval(() => void this.step(), 50);
      // The requester gets the durable result before any socket is retired.
      reply(true, "Nowy wspólny świat został trwale zapisany. Poprzedni świat usunięto.");
      this.notifyWorldReset();
      if (this.store)
        await this.store
          .publish(this.out, encodeRedis({ type: "worldReset", id: "*", worldId, data: { seed } }))
          .catch(() => {});
    } catch {
      if (this.resetting) {
        // A connection failure may hide a completed Lua reset. Never resume the old room.
        this.room = null;
        this.leaseUntil = 0;
        this.nextLease = 0;
      }
      reply(
        false,
        "Nie udało się potwierdzić zapisu resetu. Odśwież połączenie przed ponowieniem.",
      );
    } finally {
      this.resetting = false;
      peer.adminBusy = false;
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
      worldId: this.worldId,
      adminUntil: 0,
      adminAttempts: 0,
      adminWindow: Date.now(),
      adminBusy: false,
    };
    this.peers.set(ws, peer);
    const timeout = setTimeout(() => {
      if (!peer.joined) ws.close(1008, "Join required");
    }, 10000);
    peer.clearJoinTimeout = () => clearTimeout(timeout);
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
      if (m.type === "worldAdmin") {
        void this.worldAdmin(peer, m);
        return;
      }
      if (this.storageBlocked) {
        this.send(ws, { type: "error", fatal: true, message: STORAGE_LIMIT_MESSAGE });
        return ws.close(1013, "World storage limit");
      }
      if (m.type === "join" && m.protocol !== PROTOCOL) {
        this.send(ws, {
          type: "error",
          fatal: true,
          message: "Ta wersja gry jest nieaktualna. Odśwież stronę lub pobierz nowe GRA.html.",
        });
        return ws.close(1008);
      }
      if (
        this.resetting ||
        peer.worldId !== this.worldId ||
        (m.worldId ?? "legacy") !== this.worldId
      )
        return;
      if (m.type === "join") {
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
      if (peer.id && peer.joined)
        this.forward({ type: "leave", id: peer.id, worldId: peer.worldId });
    });
    ws.on("error", () => {});
    this.send(ws, { type: "ready", seed: this.seed, worldId: this.worldId });
  }
  async close() {
    this.closed = true;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    for (const p of this.peers.values()) p.socket.close(1001);
    const errors: unknown[] = [];
    try {
      await this.persist();
    } catch (error) {
      errors.push(error);
    } finally {
      if (this.store) {
        try {
          await this.store.eval(RELEASE, { keys: [this.lease], arguments: [this.node] });
        } catch (error) {
          errors.push(error);
        }
        try {
          await this.store.close();
        } catch (error) {
          errors.push(error);
        }
      }
      this.room = null;
      this.leaseUntil = 0;
    }
    if (errors.length === 1) throw errors[0];
    if (errors.length > 1) throw new AggregateError(errors, "Gateway cleanup failed");
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
