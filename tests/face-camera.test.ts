import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { FaceCamera, faceCrop } from "../lib/face-camera";
import { SkinModel } from "../lib/skin-model";
import { validFaceFrame, FACE_FRAME_MAX_LENGTH, PROTOCOL } from "../lib/net-protocol";
import { Room } from "../server/room";
import { Gateway } from "../server/gateway";
import { Multiplayer } from "../lib/multiplayer";
import { once } from "node:events";
import { readFileSync } from "node:fs";
import { WebSocket } from "ws";
import {
  createGameServer,
  type Store,
  RENEW,
  RELEASE,
  PERSIST,
  decodeRedis,
} from "../server/gateway";

// Bounded JPEG SOF fixture; image-decoder tests use a controlled Image mock.
function jpeg(width = 720, height = 720) {
  return (
    "data:image/jpeg;base64," +
    Buffer.from([
      255,
      216,
      255,
      192,
      0,
      17,
      8,
      height >> 8,
      height & 255,
      width >> 8,
      width & 255,
      3,
      1,
      17,
      0,
      2,
      17,
      1,
      3,
      17,
      1,
      255,
      217,
    ]).toString("base64")
  );
}
class FakeTrack extends EventTarget {
  stops = 0;
  constructor(public deviceId = "camera-1") {
    super();
  }
  stop() {
    this.stops++;
  }
  getSettings() {
    return { deviceId: this.deviceId };
  }
}
function stream(track = new FakeTrack()) {
  return { getTracks: () => [track], getVideoTracks: () => [track] } as unknown as MediaStream;
}
class FakeCanvas {
  width = 0;
  height = 0;
  draws: any[][] = [];
  scales: number[][] = [];
  encodes: any[][] = [];
  context = {
    clearRect() {},
    save() {},
    restore() {},
    translate() {},
    scale: (...values: number[]) => this.scales.push(values),
    drawImage: (...args: any[]) => this.draws.push(args),
  };
  getContext() {
    return this.context;
  }
  toDataURL(...args: any[]) {
    this.encodes.push(args);
    return jpeg();
  }
}
class FakeVideo {
  muted = false;
  autoplay = false;
  playsInline = false;
  srcObject: unknown = null;
  videoWidth = 1280;
  videoHeight = 720;
  readyState = 2;
  async play() {}
  pause() {}
}
function mediaFixture() {
  const originalDocument = Object.getOwnPropertyDescriptor(globalThis, "document"),
    originalNavigator = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  const documentEvents = new EventTarget(),
    deviceEvents = new EventTarget();
  const calls: MediaStreamConstraints[] = [],
    tracks: FakeTrack[] = [];
  const media = {
    async getUserMedia(constraints: MediaStreamConstraints) {
      calls.push(constraints);
      const track = new FakeTrack("camera-" + (tracks.length + 1));
      tracks.push(track);
      return stream(track);
    },
    async enumerateDevices() {
      return [
        { kind: "videoinput", deviceId: "camera-1", label: "Front" },
        { kind: "audioinput", deviceId: "microphone-1", label: "Microphone" },
      ];
    },
    addEventListener: deviceEvents.addEventListener.bind(deviceEvents),
    removeEventListener: deviceEvents.removeEventListener.bind(deviceEvents),
  };
  const document = {
    hidden: false,
    addEventListener: documentEvents.addEventListener.bind(documentEvents),
    removeEventListener: documentEvents.removeEventListener.bind(documentEvents),
    createElement: (type: string) => (type === "video" ? new FakeVideo() : new FakeCanvas()),
  };
  Object.defineProperty(globalThis, "navigator", {
    value: { mediaDevices: media },
    configurable: true,
  });
  Object.defineProperty(globalThis, "document", { value: document, configurable: true });
  const restore = () => {
    for (const [name, descriptor] of [
      ["document", originalDocument],
      ["navigator", originalNavigator],
    ] as const)
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else Reflect.deleteProperty(globalThis, name);
  };
  return {
    document,
    media,
    calls,
    tracks,
    restore,
    hide(hidden: boolean) {
      document.hidden = hidden;
      documentEvents.dispatchEvent(new Event("visibilitychange"));
    },
  };
}

test("Face packets accept bounded JPEG dimensions and reject external images, malformed data and huge decodes", () => {
  assert(validFaceFrame(null));
  assert(validFaceFrame(jpeg()));
  assert(validFaceFrame(jpeg(1024, 1024)));
  for (const value of [
    undefined,
    {},
    "https://example.com/camera.jpg",
    jpeg(65535, 720),
    jpeg(720, 1025),
    jpeg(1, 1),
    "data:image/png;base64," + "A".repeat(50),
    jpeg().slice(0, -4),
    "data:image/jpeg;base64," + "A".repeat(FACE_FRAME_MAX_LENGTH),
  ])
    assert(!validFaceFrame(value));
});

test("Camera constructor and selecting a device never request capture; explicit start requests video only", async () => {
  const f = mediaFixture(),
    frames: (string | null)[] = [],
    camera = new FaceCamera((frame) => frames.push(frame));
  try {
    await camera.setDevice("selected-camera");
    await camera.refreshDevices();
    assert.equal(f.calls.length, 0);
    assert.equal(camera.devices.length, 1);
    assert(await camera.start());
    assert.equal(f.calls.length, 1);
    assert.equal(f.calls[0].audio, false);
    assert.deepEqual((f.calls[0].video as MediaTrackConstraints).deviceId, {
      exact: "selected-camera",
    });
    assert.deepEqual((f.calls[0].video as MediaTrackConstraints).width, { ideal: 1280 });
    assert.deepEqual((f.calls[0].video as MediaTrackConstraints).frameRate, { ideal: 30, max: 30 });
    assert(camera.enabled && !camera.pending);
    assert.equal(camera.video?.muted, true);
    camera.stop();
    assert.equal(f.tracks[0].stops, 1);
    assert.equal(camera.stream, null);
    assert.equal(camera.texture, null);
    assert.equal(frames.at(-1), null);
  } finally {
    camera.dispose();
    f.restore();
  }
});

test("Cancellation while camera permission is pending stops a late stream instead of silently enabling capture", async () => {
  const f = mediaFixture(),
    camera = new FaceCamera(),
    track = new FakeTrack();
  let resolve!: (stream: MediaStream) => void;
  f.media.getUserMedia = () =>
    new Promise<MediaStream>((done) => {
      resolve = done;
    });
  try {
    const pending = camera.start();
    assert(camera.pending);
    camera.stop();
    resolve(stream(track));
    assert.equal(await pending, false);
    assert.equal(track.stops, 1);
    assert.equal(camera.enabled, false);
    assert.equal(camera.stream, null);
  } finally {
    camera.dispose();
    f.restore();
  }
});

test("Changing an enabled camera releases its old tracks and denial leaves an actionable error", async () => {
  const f = mediaFixture(),
    camera = new FaceCamera();
  try {
    await camera.start();
    await camera.setDevice("camera-2");
    assert.equal(f.tracks[0].stops, 1);
    assert.equal(camera.deviceId, "camera-2");
    assert(camera.enabled);
    f.media.getUserMedia = async () => {
      throw new DOMException("Denied", "NotAllowedError");
    };
    assert.equal(await camera.setDevice("camera-3"), false);
    assert.equal(f.tracks[1].stops, 1);
    assert.equal(camera.enabled, false);
    assert.match(camera.error, /zgody/);
  } finally {
    camera.dispose();
    f.restore();
  }
});

test("Camera crops square frames, mirrors optionally, limits updates and clears transmission while hidden", async () => {
  const f = mediaFixture(),
    frames: (string | null)[] = [],
    camera = new FaceCamera((frame) => frames.push(frame));
  try {
    await camera.start();
    assert.deepEqual(faceCrop(1280, 720), { x: 280, y: 0, size: 720 });
    camera.update(0);
    assert.equal(frames.filter(Boolean).length, 1);
    const canvas = camera.canvas as unknown as FakeCanvas;
    assert.equal(canvas.width, 720);
    assert.equal(canvas.height, 720);
    assert.deepEqual(canvas.draws[0].slice(1), [280, 0, 720, 720, 0, 0, 720, 720]);
    assert.deepEqual(canvas.encodes[0], ["image/jpeg", 0.9]);
    assert.deepEqual(canvas.scales, [[-1, 1]]);
    camera.update(0);
    camera.update(0.32);
    assert.equal(frames.filter(Boolean).length, 1);
    assert.equal(
      canvas.draws.length,
      2,
      "local texture updates before another network JPEG is due",
    );
    camera.update(0.014);
    assert.equal(frames.filter(Boolean).length, 2);
    const mirroredDraws = canvas.scales.length;
    camera.setMirror(false);
    camera.update(0);
    assert.equal(canvas.scales.length, mirroredDraws);
    f.hide(true);
    assert.equal(frames.at(-1), null);
    assert.equal(camera.latestFrame, null);
    const count = frames.length;
    camera.update(10);
    assert.equal(frames.length, count);
    f.hide(false);
    camera.update(0);
    assert.equal(frames.at(-1), jpeg());
    assert.equal(f.calls.length, 1);
  } finally {
    camera.dispose();
    f.restore();
  }
});

test("A disconnected camera track stops the feature and clears its published image", async () => {
  const f = mediaFixture(),
    frames: (string | null)[] = [],
    camera = new FaceCamera((frame) => frames.push(frame));
  try {
    await camera.start();
    camera.update(0);
    f.tracks[0].dispatchEvent(new Event("ended"));
    assert.equal(camera.enabled, false);
    assert.equal(frames.at(-1), null);
    assert.match(camera.error, /odłączona/);
  } finally {
    camera.dispose();
    f.restore();
  }
});

test("Large HD frames lower JPEG compression quality while keeping the 720-square texture intact", async () => {
  const f = mediaFixture(),
    frames: (string | null)[] = [],
    camera = new FaceCamera((frame) => frames.push(frame));
  try {
    await camera.start();
    const canvas = camera.canvas as unknown as FakeCanvas;
    canvas.toDataURL = (...args: any[]) => {
      canvas.encodes.push(args);
      return args[1] > 0.8 ? "A".repeat(FACE_FRAME_MAX_LENGTH + 1) : jpeg();
    };
    camera.update(0);
    assert.deepEqual(
      canvas.encodes.map((args) => args[1]),
      [0.9, 0.85, 0.8],
    );
    assert.equal(canvas.width, 720);
    assert.equal(canvas.height, 720);
    assert.equal(camera.texture?.magFilter, THREE.LinearFilter);
    assert.equal(frames.at(-1), jpeg());
    assert.equal(camera.error, "");
  } finally {
    camera.dispose();
    f.restore();
  }
});

function model() {
  const canvas = new FakeCanvas() as unknown as HTMLCanvasElement;
  return new SkinModel({ skin: canvas, cape: canvas, capeEnabled: false });
}
test("Camera overlay affects only the front of the animated head and does not own a shared local texture", () => {
  const player = model(),
    texture = new THREE.Texture();
  let disposed = 0;
  texture.addEventListener("dispose", () => disposed++);
  player.setFaceTexture(texture);
  assert.equal(player.faceOverlay.parent, player.head);
  assert(player.faceOverlay.position.z > 8.5 / 32);
  assert.equal(player.faceOverlay.geometry.parameters.width, 0.5);
  assert.equal(player.material.map, player.texture);
  assert(player.faceOverlay.visible);
  player.dispose();
  assert.equal(disposed, 0);
  texture.dispose();
  assert.equal(disposed, 1);
});

test("Remote face decoding ignores stale completions and disposes replaced textures", () => {
  const originalImage = Object.getOwnPropertyDescriptor(globalThis, "Image"),
    images: any[] = [];
  class FakeImage {
    width = 96;
    height = 96;
    src = "";
    onload?: () => void;
    onerror?: () => void;
    constructor() {
      images.push(this);
    }
  }
  Object.defineProperty(globalThis, "Image", { value: FakeImage, configurable: true });
  const player = model();
  try {
    player.setFaceFrame(jpeg());
    player.setFaceFrame(null);
    images[0].onload();
    assert(!player.faceOverlay.visible);
    player.setFaceFrame(jpeg());
    images[1].onload();
    const first = player.faceMaterial.map!;
    let disposed = 0;
    first.addEventListener("dispose", () => disposed++);
    player.setFaceFrame(jpeg());
    images[2].onload();
    assert.equal(disposed, 1);
    assert.notEqual(player.faceMaterial.map, first);
    player.setFaceFrame(jpeg());
    player.dispose();
    images[3].onload();
    assert.equal(player.faceMaterial.map, null);
  } finally {
    player.dispose();
    if (originalImage) Object.defineProperty(globalThis, "Image", originalImage);
    else Reflect.deleteProperty(globalThis, "Image");
  }
});

function roomFixture() {
  let now = 100000;
  const messages: any[] = [],
    room = new Room(
      (id, data) => messages.push({ id, data }),
      () => now,
    );
  for (const [id, nick] of [
    ["a", "Alicja"],
    ["b", "Bartek"],
    ["c", "Celina"],
    ["d", "Darek"],
  ]) {
    room.join(id, nick, undefined);
    room.players.get(id)!.p = [0, 50, 0];
  }
  room.players.get("b")!.p = [5, 50, 0];
  room.players.get("c")!.p = [61, 50, 0];
  room.players.get("d")!.dimension = "nether";
  const faces = () => messages.filter((m) => m.data.type === "faceFrame");
  return {
    room,
    faces,
    advance(ms: number) {
      now += ms;
    },
  };
}
test("Room camera relay selects nearby players in one dimension without persisting frames", () => {
  const s = roomFixture();
  s.room.faceFrame("a", jpeg());
  assert.deepEqual(s.faces()[0].data.viewers, ["b"]);
  assert.equal(s.faces()[0].data.frame, jpeg());
  assert(!JSON.stringify(s.room.save()).includes(jpeg()));
  assert(!Object.hasOwn(s.room.save(), "facePeers"));
  s.advance(100);
  s.room.faceFrame("a", jpeg());
  assert.equal(s.faces().length, 1);
  s.advance(234);
  s.room.players.get("b")!.p = [70, 50, 0];
  s.room.faceFrame("a", jpeg());
  assert.deepEqual(s.faces()[1].data.cleared, ["b"]);
  assert.equal(s.faces()[1].data.frame, null);
});

test("Camera disable, leaving and timeout clear remote images without restoring them from snapshots", () => {
  for (const action of ["disable", "leave", "timeout"] as const) {
    const s = roomFixture();
    s.room.faceFrame("a", jpeg());
    if (action === "disable") s.room.faceFrame("a", null);
    else if (action === "leave") s.room.clearFace("a");
    else {
      s.advance(3001);
      s.room.pruneFaces();
    }
    assert.equal(s.faces().at(-1).data.frame, null);
    assert.equal(s.room.facePeers.size, 0);
  }
  const s = roomFixture();
  s.room.faceFrame("a", jpeg());
  s.room.restore(JSON.parse(JSON.stringify(s.room.save())));
  assert.equal(s.room.facePeers.size, 0);
});

test("Gateway removes recipient metadata and sends frames only to authorized viewers", () => {
  const gateway = new Gateway({ local: true }),
    delivered: { to: string; data: any }[] = [];
  for (const id of ["a", "b", "c", "d"]) {
    const socket = { id } as any;
    gateway.peers.set(socket, { id, joined: true, socket } as any);
  }
  gateway.send = (socket: any, data) => {
    delivered.push({ to: socket.id, data });
  };
  gateway.route({
    type: "delivery",
    id: "*",
    data: { type: "faceFrame", sender: "a", frame: jpeg(), viewers: ["b"], cleared: ["c"] },
  });
  assert.deepEqual(delivered, [
    { to: "b", data: { type: "faceFrame", sender: "a", frame: jpeg() } },
    { to: "c", data: { type: "faceFrame", sender: "a", frame: null } },
  ]);
});

test("Client receives camera textures without changing skins and publishes only rate-limited valid frames", () => {
  const net = Object.create(Multiplayer.prototype) as Multiplayer,
    shown: (string | null)[] = [],
    sent: any[] = [];
  Object.assign(net, {
    game: {},
    id: "self",
    connected: true,
    initialized: true,
    closed: false,
    faceFrames: new Map(),
    faceLastSent: -Infinity,
    remotes: new Map([
      [
        "other",
        {
          model: {
            setFaceFrame(frame: string | null) {
              shown.push(frame);
            },
          },
        },
      ],
    ]),
    send(data: any) {
      sent.push(data);
    },
  });
  net.receive({ type: "faceFrame", sender: "other", frame: jpeg() });
  assert.deepEqual(shown, [jpeg()]);
  net.sendFaceFrame(jpeg());
  net.sendFaceFrame(jpeg());
  assert.equal(sent.length, 1);
  net.sendFaceFrame(null);
  assert.equal(sent.at(-1).frame, null);
  net.clearRemoteFaces();
  assert.equal(shown.at(-1), null);
  assert.equal(net.faceFrames.size, 0);
  net.faceLastSent = -Infinity;
  net.socket = { bufferedAmount: 64000 } as WebSocket as unknown as globalThis.WebSocket;
  const count = sent.length;
  net.sendFaceFrame(jpeg());
  assert.equal(
    sent.length,
    count,
    "a late camera frame is dropped instead of queued behind gameplay",
  );
});

class CameraBus {
  values = new Map<string, { value: string; until: number }>();
  listeners = new Map<string, Set<(value: string) => void>>();
  published: { channel: string; value: string }[] = [];
  connection(): Store {
    const subscriptions: { channel: string; fn: (value: string) => void }[] = [];
    const get = async (key: string) => {
      const value = this.values.get(key);
      return value && value.until > Date.now() ? value.value : null;
    };
    return {
      get,
      set: async (key, value, options) => {
        if (options?.NX && (await get(key))) return null;
        this.values.set(key, { value, until: options?.PX ? Date.now() + options.PX : Infinity });
        return "OK";
      },
      eval: async (script, { keys, arguments: args }) => {
        if ((await get(keys[0])) !== args[0]) return 0;
        if (script === RENEW) this.values.get(keys[0])!.until = Date.now() + Number(args[1]);
        else if (script === RELEASE) this.values.delete(keys[0]);
        else if (script === PERSIST) this.values.set(keys[1], { value: args[1], until: Infinity });
        else throw Error("Unexpected Redis operation");
        return 1;
      },
      publish: async (channel, value) => {
        this.published.push({ channel, value });
        for (const listener of this.listeners.get(channel) ?? [])
          queueMicrotask(() => listener(value));
        return this.listeners.get(channel)?.size ?? 0;
      },
      subscribe: async (channel, fn) => {
        if (!this.listeners.has(channel)) this.listeners.set(channel, new Set());
        this.listeners.get(channel)!.add(fn);
        subscriptions.push({ channel, fn });
      },
      close: async () => {
        for (const { channel, fn } of subscriptions) this.listeners.get(channel)?.delete(fn);
      },
    };
  }
}
async function cameraClient(port: number, token: string, nick: string) {
  const ws = new WebSocket("ws://127.0.0.1:" + port + "/api/game"),
    messages: any[] = [];
  ws.on("message", (data) => messages.push(JSON.parse(data.toString())));
  await once(ws, "open");
  const wait = async (predicate: (message: any) => boolean) => {
    const deadline = Date.now() + 8000;
    while (Date.now() < deadline) {
      const found = messages.find(predicate);
      if (found) return found;
      await new Promise((resolve) => setTimeout(resolve, 15));
    }
    throw Error("Camera message timeout");
  };
  const send = (value: unknown) => ws.send(JSON.stringify(value));
  await wait((message) => message.type === "ready");
  send({
    type: "join",
    protocol: PROTOCOL,
    token,
    nick,
    skin: {
      skin: "data:image/png;base64,aGVsbG8=",
      cape: "data:image/png;base64,aGVsbG8=",
      capeEnabled: false,
    },
  });
  const welcome = await wait((message) => message.type === "welcome");
  return { ws, messages, send, wait, id: welcome.id };
}

test("Two real WebSocket clients relay HD camera packets across two Redis-connected gateways without saving images", async () => {
  const bus = new CameraBus(),
    apps = [0, 1].map(() =>
      createGameServer({
        local: false,
        store: bus.connection(),
        namespace: "camera-hd-test",
      }),
    );
  const clients: Awaited<ReturnType<typeof cameraClient>>[] = [];
  try {
    for (const app of apps) {
      app.server.listen(0, "127.0.0.1");
      await once(app.server, "listening");
    }
    const a = await cameraClient((apps[0].server.address() as any).port, "e".repeat(64), "Ewelina");
    clients.push(a);
    const b = await cameraClient(
      (apps[1].server.address() as any).port,
      "f".repeat(64),
      "Franciszek",
    );
    clients.push(b);
    // Real decodable HD fixture; no camera or personal media was captured.
    const large =
      "data:image/jpeg;base64," +
      readFileSync(new URL("./fixtures/face-camera-720.jpg", import.meta.url)).toString("base64");
    assert(large.length > 150000 && validFaceFrame(large));
    b.send({ type: "faceFrame", sender: a.id, frame: large });
    const received = await a.wait(
      (message) => message.type === "faceFrame" && message.frame === large,
    );
    assert.equal(received.sender, b.id, "sender identity is bound to the authenticated socket");
    assert.equal(received.viewers, undefined);
    assert(!b.messages.some((message) => message.type === "faceFrame" && message.sender === b.id));
    assert(
      bus.published.some(
        ({ channel, value }) => channel.endsWith(":in") && decodeRedis(value).type === "faceFrame",
      ),
    );
    assert(
      bus.published.some(
        ({ channel, value }) =>
          channel.endsWith(":out") && decodeRedis(value).data?.type === "faceFrame",
      ),
    );
    b.send({ type: "faceFrame", frame: jpeg(65535, 65535) });
    b.send({ type: "faceFrame", frame: jpeg(640, 640) }); // too soon: dropped before Redis
    b.send({ type: "ping", time: 87654 });
    await b.wait((message) => message.type === "pong" && message.time === 87654);
    assert.equal(
      bus.published.filter(
        ({ channel, value }) => channel.endsWith(":in") && decodeRedis(value).type === "faceFrame",
      ).length,
      1,
    );
    const leader = apps.find((app) => app.gateway.room)!.gateway;
    await leader.persist();
    const saved = decodeRedis(bus.values.get("camera-hd-test:snapshot")!.value);
    assert(!JSON.stringify(saved).includes(large));
    assert.equal(saved.facePeers, undefined);
    b.ws.close();
    await a.wait(
      (message) =>
        message.type === "faceFrame" && message.sender === b.id && message.frame === null,
    );
    assert.equal(leader.room!.facePeers.size, 0);
  } finally {
    for (const client of clients) client.ws.terminate();
    for (const app of apps) {
      await app.gateway.close();
      app.wss.close();
      await new Promise<void>((resolve) => app.server.close(() => resolve()));
    }
  }
});

test("Redis and viewer backpressure drop stale HD frames while allowing an immediate clear", async () => {
  const gateway = new Gateway({ local: true }),
    values: any[] = [];
  let finish!: (n: number) => void;
  gateway.store = {
    publish: (_channel: string, value: string) => {
      values.push(decodeRedis(value));
      return new Promise<number>((resolve) => {
        finish = resolve;
      });
    },
  } as Store;
  const packet = {
    type: "delivery",
    id: "*",
    data: { type: "faceFrame", sender: "a", frame: jpeg(), viewers: ["b"] },
  };
  gateway.broadcast(packet);
  gateway.broadcast(packet);
  assert.equal(values.length, 1);
  finish(1);
  await new Promise((resolve) => setImmediate(resolve));
  gateway.broadcast(packet);
  assert.equal(values.length, 2);
  finish(1);
  const delivered: any[] = [],
    socket = { bufferedAmount: 100000 } as any;
  gateway.peers.set(socket, { id: "b", joined: true, socket } as any);
  gateway.send = (_socket, data) => {
    delivered.push(data);
  };
  gateway.route(packet);
  assert.equal(delivered.length, 0);
  gateway.route({ ...packet, data: { ...packet.data, frame: null } });
  assert.equal(delivered[0].frame, null);
});
