import test from "node:test";
import assert from "node:assert/strict";
import { VoiceChat, VoiceActivityGate } from "../lib/voice";

class FakeTrack extends EventTarget {
  stopped = 0;
  readyState = "live";
  stop() {
    this.stopped++;
    this.readyState = "ended";
  }
}
class FakeStream {
  track = new FakeTrack();
  getTracks() {
    return [this.track];
  }
}
class FakeNode {
  gain = { value: 1 };
  connections: unknown[] = [];
  disconnected = 0;
  onaudioprocess:
    | ((event: { inputBuffer: { getChannelData: () => Float32Array } }) => void)
    | null = null;
  buffer: unknown;
  onended: (() => void) | null = null;
  stopped = 0;
  connect(node: unknown) {
    this.connections.push(node);
    return node;
  }
  disconnect() {
    this.disconnected++;
    this.connections = [];
  }
  start() {}
  stop() {
    this.stopped++;
  }
}
class FakeContext {
  static created: FakeContext[] = [];
  state = "running";
  sampleRate = 16000;
  currentTime = 0;
  destination = new FakeNode();
  gains: FakeNode[] = [];
  receivers: FakeNode[] = [];
  closed = 0;
  constructor() {
    FakeContext.created.push(this);
  }
  async resume() {
    this.state = "running";
  }
  async close() {
    this.closed++;
    this.state = "closed";
  }
  createGain() {
    const node = new FakeNode();
    this.gains.push(node);
    return node;
  }
  createMediaStreamSource() {
    return new FakeNode();
  }
  createScriptProcessor() {
    return new FakeNode();
  }
  createBufferSource() {
    const node = new FakeNode();
    this.receivers.push(node);
    return node;
  }
  createBuffer(_channels: number, length: number, rate: number) {
    const samples = new Float32Array(length);
    return { duration: length / rate, getChannelData: () => samples };
  }
}
type Pending = {
  constraints: MediaStreamConstraints;
  resolve: (stream: MediaStream) => void;
  reject: (error: Error) => void;
};
async function environment(
  run: (env: {
    requests: Pending[];
    storage: Map<string, string>;
    create: () => VoiceChat;
    sent: string[];
    setConnected: (value: boolean) => void;
    devices: MediaDeviceInfo[];
    window: EventTarget;
    document: EventTarget & { hidden: boolean };
    media: EventTarget;
    enumerations: () => number;
  }) => Promise<void> | void,
  initial?: unknown,
) {
  const names = ["window", "document", "navigator", "localStorage", "AudioContext"] as const;
  const before = new Map(
    names.map((name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)]),
  );
  const requests: Pending[] = [],
    sent: string[] = [],
    storage = new Map<string, string>();
  if (initial !== undefined) storage.set("blockland.voice", JSON.stringify(initial));
  const devices = [
    { kind: "audioinput", deviceId: "mic-a", label: "Mikrofon USB" },
    { kind: "audioinput", deviceId: "mic-b", label: "" },
    { kind: "audiooutput", deviceId: "speaker", label: "Głośniki" },
  ] as MediaDeviceInfo[];
  let enumerations = 0;
  const media = Object.assign(new EventTarget(), {
    getUserMedia: (constraints: MediaStreamConstraints) =>
      new Promise<MediaStream>((resolve, reject) =>
        requests.push({ constraints, resolve, reject }),
      ),
    enumerateDevices: async () => {
      enumerations++;
      return devices;
    },
  });
  const window = new EventTarget(),
    document = Object.assign(new EventTarget(), { hidden: false });
  FakeContext.created = [];
  let connected = false;
  const voices: VoiceChat[] = [];
  const values = {
    window,
    document,
    navigator: { mediaDevices: media },
    AudioContext: FakeContext,
    localStorage: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
    },
  };
  for (const name of names)
    Object.defineProperty(globalThis, name, {
      configurable: true,
      writable: true,
      value: values[name],
    });
  try {
    await run({
      requests,
      storage,
      sent,
      devices,
      window,
      document,
      media,
      enumerations: () => enumerations,
      setConnected: (value) => {
        connected = value;
      },
      create: () => {
        const voice = new VoiceChat(
          (audio) => sent.push(audio),
          () => connected,
          () => {},
        );
        voices.push(voice);
        return voice;
      },
    });
  } finally {
    for (const voice of voices) voice.close();
    for (const name of names) {
      const descriptor = before.get(name);
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else Reflect.deleteProperty(globalThis, name);
    }
  }
}
const resolve = (request: Pending) => {
  const stream = new FakeStream();
  request.resolve(stream as unknown as MediaStream);
  return stream;
};
const flush = async () => {
  await Promise.resolve();
  await Promise.resolve();
};
const process = (voice: VoiceChat, amplitude = 0.2) => {
  const processor = voice.processor as unknown as FakeNode;
  processor.onaudioprocess?.({
    inputBuffer: { getChannelData: () => new Float32Array(1600).fill(amplitude) },
  });
};

test("Voice defaults to always without opening hardware, migrates v1 once, and preserves v2 choices", async () => {
  await environment(async (env) => {
    const voice = env.create();
    assert.equal(voice.mode, "always");
    assert.equal(voice.threshold, 0);
    assert.equal(voice.monitor, false);
    assert.equal(env.requests.length, 0);
    voice.set({ mode: "hold", key: "KeyB" });
    assert.equal(JSON.parse(env.storage.get("blockland.voice")!).version, 2);
    assert.equal(env.create().mode, "hold");
  });
  await environment(
    (env) => {
      const voice = env.create();
      assert.equal(voice.mode, "always");
      assert.equal(voice.key, "KeyB");
    },
    { mode: "hold", key: "KeyB" },
  );
  await environment((env) => assert.equal(env.create().mode, "toggle"), {
    version: 2,
    mode: "toggle",
  });
});

test("start is idempotent during permission and capture; no frames leave before a server connection", async () => {
  await environment(async (env) => {
    const voice = env.create(),
      first = voice.start(),
      second = voice.start();
    assert.equal(first, second);
    assert.equal(env.requests.length, 1);
    assert(voice.requesting);
    const stream = resolve(env.requests[0]);
    assert.equal(await first, true);
    assert(voice.enabled);
    assert.equal(voice.requesting, false);
    await voice.start();
    assert.equal(env.requests.length, 1);
    assert.equal(stream.track.stopped, 0);
    process(voice);
    assert.equal(env.sent.length, 0);
    env.setConnected(true);
    process(voice);
    assert.equal(env.sent.length, 1);
    assert.equal(Buffer.from(env.sent[0], "base64").length, 3200);
    assert(voice.level > 0.19 && voice.level < 0.21);
  });
});

test("disable and close stop a late permission result without creating or reviving audio nodes", async () => {
  for (const action of ["disable", "close"] as const)
    await environment(async (env) => {
      const voice = env.create(),
        pending = voice.start();
      voice[action]();
      const stream = resolve(env.requests[0]);
      assert.equal(await pending, false);
      assert.equal(stream.track.stopped, 1);
      assert.equal(voice.enabled, false);
      assert.equal(voice.stream, null);
      assert.equal(FakeContext.created.length, 0);
      if (action === "close") {
        assert.equal(await voice.start(), false);
        assert.equal(env.requests.length, 1);
      }
    });
});

test("Device selection restarts once and an older pending device cannot replace the final choice", async () => {
  await environment(async (env) => {
    const voice = env.create(),
      initial = voice.start(),
      firstStream = resolve(env.requests[0]);
    await initial;
    const oldProcessor = voice.processor as unknown as FakeNode,
      oldCallback = oldProcessor.onaudioprocess!;
    voice.set({
      deviceId: "mic-b",
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
    });
    assert.equal(firstStream.track.stopped, 1);
    assert.equal(oldProcessor.onaudioprocess, null);
    assert.deepEqual(env.requests[1].constraints.audio, {
      deviceId: { exact: "mic-b" },
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
      channelCount: 1,
    });
    voice.set({ deviceId: "mic-c" });
    const stale = resolve(env.requests[1]);
    await flush();
    assert.equal(stale.track.stopped, 1);
    assert.equal(voice.stream, null);
    const latest = resolve(env.requests[2]);
    await flush();
    assert.equal(voice.stream, latest);
    assert(voice.enabled);
    env.setConnected(true);
    oldCallback({ inputBuffer: { getChannelData: () => new Float32Array(1600).fill(1) } });
    assert.equal(env.sent.length, 0, "a detached callback cannot send old device samples");
    process(voice);
    assert.equal(env.sent.length, 1);
  });
});

test("Device discovery lists only inputs and never asks for permission or restarts capture", async () => {
  await environment(async (env) => {
    const voice = env.create();
    await voice.refreshDevices();
    assert.deepEqual(voice.devices, [
      { deviceId: "mic-a", label: "Mikrofon USB" },
      { deviceId: "mic-b", label: "Mikrofon 2" },
    ]);
    voice.set({ deviceId: "mic-b" });
    env.media.dispatchEvent(new Event("devicechange"));
    await flush();
    assert.equal(env.requests.length, 0);
  });
});

test("Permission refusal is clear and does not trigger automatic retries", async () => {
  await environment(async (env) => {
    const voice = env.create(),
      pending = voice.start();
    env.requests[0].reject(Object.assign(new Error("denied"), { name: "NotAllowedError" }));
    assert.equal(await pending, false);
    assert.match(voice.error, /Nie udzielono dostępu/);
    assert.equal(voice.enabled, false);
    assert.equal(voice.requesting, false);
    await voice.refreshDevices();
    voice.set({ volume: 0.4 });
    await flush();
    assert.equal(env.requests.length, 1);
    const retry = voice.start();
    resolve(env.requests[1]);
    assert.equal(await retry, true);
    assert.equal(voice.error, "");
  });
});

test("Missing and busy devices have distinct recoverable errors", async () => {
  for (const [name, message] of [
    ["NotFoundError", /niedostępny/],
    ["NotReadableError", /zablokowane/],
  ] as const)
    await environment(async (env) => {
      const voice = env.create(),
        pending = voice.start();
      env.requests[0].reject(Object.assign(new Error("device"), { name }));
      assert.equal(await pending, false);
      assert.match(voice.error, message);
      assert.equal(voice.stream, null);
    });
});

test("Local test captures a meter without sending and monitoring requires explicit opt-in", async () => {
  await environment(async (env) => {
    env.setConnected(true);
    const voice = env.create(),
      pending = voice.startTest(),
      stream = resolve(env.requests[0]);
    await pending;
    assert(voice.testing);
    assert.equal(voice.enabled, false);
    assert.equal(voice.monitorGain!.gain.value, 0);
    process(voice, 0.4);
    assert(voice.level > 0.39);
    assert.equal(env.sent.length, 0);
    voice.setMonitor(true);
    assert.equal(voice.monitorGain!.gain.value, 0.35);
    env.document.hidden = true;
    env.document.dispatchEvent(new Event("visibilitychange"));
    assert.equal(voice.monitorGain!.gain.value, 0);
    env.document.hidden = false;
    env.document.dispatchEvent(new Event("visibilitychange"));
    assert.equal(voice.monitorGain!.gain.value, 0.35);
    voice.stopTest();
    assert.equal(voice.monitor, false);
    assert.equal(stream.track.stopped, 1);
    assert.equal(voice.testing, false);
  });
});

test("Ending a local meter test preserves active multiplayer capture and clears monitor playback", async () => {
  await environment(async (env) => {
    const voice = env.create(),
      pending = voice.start(),
      stream = resolve(env.requests[0]);
    await pending;
    await voice.startTest();
    voice.setMonitor(true);
    voice.stopTest();
    assert.equal(env.requests.length, 1);
    assert.equal(stream.track.stopped, 0);
    assert(voice.enabled);
    assert.equal(voice.monitor, false);
    assert.equal(voice.monitorGain!.gain.value, 0);
  });
});

test("Gain and receive volume update live without a new media permission request", async () => {
  await environment(async (env) => {
    const voice = env.create(),
      pending = voice.start();
    resolve(env.requests[0]);
    await pending;
    voice.receive("friend", Buffer.alloc(3200).toString("base64"));
    voice.set({ inputGain: 1.7, volume: 0.25 });
    assert.equal(voice.input!.gain.value, 1.7);
    assert.equal(voice.speakers.get("friend")!.gain.value, 0.25);
    assert.equal(env.requests.length, 1);
    voice.set({ inputGain: 99, threshold: -1, volume: Number.NaN });
    assert.equal(voice.inputGain, 3);
    assert.equal(voice.threshold, 0);
    assert.equal(voice.volume, 0.25);
  });
});

test("Activation threshold and hangover reject silence while preserving short speech gaps", () => {
  const gate = new VoiceActivityGate();
  assert.equal(gate.update(0.01, 0.1, 0, 250), false);
  assert.equal(gate.update(0.11, 0.1, 100, 250), true);
  assert.equal(gate.update(0.01, 0.1, 300, 250), true);
  assert.equal(gate.update(0.01, 0.1, 351, 250), false);
  assert.equal(gate.update(0, 0, 1000, 250), true);
  gate.reset();
  assert.equal(gate.update(0, 0.1, 1001, 250), false);
});

test("Threshold applies to packets; hold mode still requires its key even above the threshold", async () => {
  await environment(async (env) => {
    env.setConnected(true);
    const voice = env.create(),
      pending = voice.start();
    resolve(env.requests[0]);
    await pending;
    voice.set({ threshold: 0.1, hangoverMs: 0 });
    process(voice, 0.01);
    assert.equal(env.sent.length, 0);
    process(voice, 0.2);
    assert.equal(env.sent.length, 1);
    voice.set({ mode: "hold", threshold: 0.1 });
    process(voice, 0.2);
    assert.equal(env.sent.length, 1);
    voice.pressed = true;
    process(voice, 0.2);
    assert.equal(env.sent.length, 2);
    env.document.hidden = true;
    process(voice, 0.2);
    assert.equal(env.sent.length, 2);
  });
});

test("Unplugging input stops tracks and close disconnects receivers, nodes and listeners", async () => {
  await environment(async (env) => {
    const voice = env.create(),
      pending = voice.start(),
      stream = resolve(env.requests[0]);
    await pending;
    stream.track.dispatchEvent(new Event("ended"));
    assert.equal(voice.enabled, false);
    assert.equal(stream.track.stopped, 1);
    assert.match(voice.error, /odłączony/);
    await voice.playback();
    voice.receive("friend", Buffer.alloc(3200).toString("base64"));
    const context = FakeContext.created[0],
      receiver = context.receivers[0];
    voice.close();
    voice.close();
    assert.equal(context.closed, 1);
    assert.equal(receiver.stopped, 1);
    assert.equal(voice.context, null);
    const deviceCalls = env.enumerations();
    env.media.dispatchEvent(new Event("devicechange"));
    await flush();
    assert.equal(env.requests.length, 1);
    assert.equal(env.enumerations(), deviceCalls, "close removes the hardware change listener");
  });
});

test("Leaving one server clears scheduled speakers without closing the shared audio context", async () => {
  await environment(async (env) => {
    const voice = env.create();
    await voice.playback();
    voice.receive("old-friend", Buffer.alloc(3200).toString("base64"));
    const context = FakeContext.created[0],
      receiver = context.receivers[0],
      gain = voice.speakers.get("old-friend") as unknown as FakeNode;
    voice.clearRemote();
    assert.equal(receiver.stopped, 1);
    assert.equal(gain.disconnected, 1);
    assert.equal(voice.remote.size, 0);
    assert.equal(voice.speakers.size, 0);
    assert.equal(context.closed, 0);
    voice.receive("new-friend", Buffer.alloc(3200).toString("base64"));
    assert.equal(voice.speakers.size, 1);
    assert(voice.remote.has("new-friend"));
    voice.close();
    assert.equal(context.closed, 1);
  });
});

test("A suspended audio context is not presented as transmitting", async () => {
  await environment(async (env) => {
    env.setConnected(true);
    const voice = env.create(),
      pending = voice.start();
    resolve(env.requests[0]);
    await pending;
    const context = FakeContext.created[0];
    context.state = "suspended";
    assert.equal(voice.transmitting, false);
    await voice.playback();
    assert.equal(voice.transmitting, true);
  });
});
