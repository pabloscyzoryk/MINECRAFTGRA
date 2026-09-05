import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
import * as THREE from "three";
import { Game } from "../lib/engine";
import { Multiplayer } from "../lib/multiplayer";
import { VoiceChat } from "../lib/voice";
import { SkinModel } from "../lib/skin-model";
import { normalizeDifficulty } from "../lib/difficulty";
import { validNick, MAX_PLAYERS } from "../lib/net-protocol";

function sourceFile(file: string) {
  return ts.createSourceFile(
    file,
    readFileSync(new URL(file, import.meta.url), "utf8"),
    ts.ScriptTarget.Latest,
    true,
    file.endsWith("tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
}
const gameSource = sourceFile("../lib/engine.ts");
const gameClass = gameSource.statements.find(
  (n): n is ts.ClassDeclaration => ts.isClassDeclaration(n) && n.name?.text === "Game",
)!;
function compile(source: string, dependencies: Record<string, unknown> = {}) {
  const script = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React },
  }).outputText;
  return new Function(...Object.keys(dependencies), script)(...Object.values(dependencies));
}

class AudioNodeMock {
  gain = { value: 1 };
  onaudioprocess: ((event: unknown) => void) | null = null;
  connect() {}
  disconnect() {}
  stop() {}
}
class AudioContextMock {
  state = "running";
  sampleRate = 16000;
  destination = new AudioNodeMock();
  async resume() {}
  async close() {
    this.state = "closed";
  }
  createGain() {
    return new AudioNodeMock();
  }
  createMediaStreamSource() {
    return new AudioNodeMock();
  }
  createScriptProcessor() {
    return new AudioNodeMock();
  }
}
async function environment(
  run: (env: {
    microphoneRequests: () => number;
    tracks: { stopped: boolean }[];
  }) => void | Promise<void>,
) {
  const tracks: { stopped: boolean }[] = [];
  let requests = 0;
  const values: Record<string, unknown> = {
    window: new EventTarget(),
    document: Object.assign(new EventTarget(), { hidden: false }),
    localStorage: {
      getItem: (key: string) => (key.endsWith(".nick") ? "Tester" : null),
      setItem() {},
    },
    navigator: {
      mediaDevices: Object.assign(new EventTarget(), {
        async getUserMedia() {
          requests++;
          const track = Object.assign(new EventTarget(), {
            stopped: false,
            stop() {
              this.stopped = true;
            },
          });
          tracks.push(track);
          return { getTracks: () => [track] };
        },
        async enumerateDevices() {
          return [];
        },
      }),
    },
    AudioContext: AudioContextMock,
    location: { href: "https://game.example/", protocol: "https:" },
  };
  const before = new Map(
    Object.keys(values).map((name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)]),
  );
  for (const [name, value] of Object.entries(values))
    Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
  try {
    await run({ microphoneRequests: () => requests, tracks });
  } finally {
    for (const [name, descriptor] of before)
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else Reflect.deleteProperty(globalThis, name);
  }
}
function gameVoice(game: Game) {
  // Exercise the actual Game constructor callbacks without creating WebGL.
  const constructor = gameClass.members.find(ts.isConstructorDeclaration)!;
  const statement = constructor.body!.statements.find((n) =>
    n.getText(gameSource).startsWith("this.voice ="),
  )!;
  const bind = compile("return function(){" + statement.getText(gameSource) + "};", { VoiceChat });
  bind.call(game);
  return game.voice;
}
class MenuClient extends Multiplayer {
  override async connect() {}
  override sendProfile() {}
  override sendInput() {}
}
function renderMenu(game: Game) {
  const source = sourceFile("../components/multiplayer-menu.tsx");
  const declaration = source.statements.find(
    (n): n is ts.FunctionDeclaration =>
      ts.isFunctionDeclaration(n) && n.name?.text === "MultiplayerMenu",
  )!;
  const effects: (() => void | (() => void))[] = [];
  const dependencies: Record<string, unknown> = {
    useState: (initial: unknown) => [typeof initial === "function" ? initial() : initial, () => {}],
    useRef: (current: unknown) => ({ current }),
    useEffect: (effect: () => void | (() => void)) => effects.push(effect),
    useNetwork() {},
    normalizeDifficulty,
    validNick,
    MAX_PLAYERS,
    Multiplayer: MenuClient,
    React: {
      createElement: (type: unknown, props: unknown, ...children: unknown[]) => ({
        type,
        props: { ...(props as object), children },
      }),
    },
  };
  for (const icon of ["Users", "Mic", "MicOff", "MessageSquare", "Shield", "DifficultyPicker"])
    dependencies[icon] = icon;
  const component = compile(
    declaration.getText(source).replace(/^export default /, "") + "; return MultiplayerMenu;",
    dependencies,
  );
  const tree = component({ game, onJoined() {} });
  const cleanups = effects
    .map((effect) => effect())
    .filter((cleanup): cleanup is () => void => typeof cleanup === "function");
  const find = (node: any): any =>
    node &&
    typeof node === "object" &&
    (node.props?.className === "primary-action"
      ? node
      : node.props?.children?.map(find).find(Boolean));
  return {
    join: () => find(tree).props.onClick(),
    unmount: () => cleanups.forEach((cleanup) => cleanup()),
  };
}

test("Game-owned voice prepares in the menu but sends only after Join to the current client", () =>
  environment(async ({ microphoneRequests }) => {
    const game = Object.create(Game.prototype) as Game;
    game.net = null;
    const voice = gameVoice(game),
      packets: unknown[] = [];
    try {
      await voice.start();
      await voice.start();
      assert.equal(microphoneRequests(), 1);
      assert(voice.enabled);
      const process = () =>
        voice.processor!.onaudioprocess!({
          inputBuffer: { getChannelData: () => new Float32Array(1600).fill(0.2) },
        } as unknown as AudioProcessingEvent);
      process();
      assert.equal(packets.length, 0);
      assert.equal(voice.transmitting, false);
      const first = new MenuClient(game, "Tester");
      assert.equal(first.voice, voice);
      first.send = (packet) => packets.push(["first", packet]);
      first.connected = true;
      game.net = first;
      process();
      assert.equal((packets[0] as any)[0], "first");
      const next = new MenuClient(game, "Tester");
      next.send = (packet) => packets.push(["next", packet]);
      next.connected = true;
      game.net = next;
      let clearedAudio = 0,
        clearedHorror = 0;
      const clearRemote = voice.clearRemote.bind(voice);
      voice.clearRemote = () => {
        clearedAudio++;
        clearRemote();
      };
      game.horror = {
        clear() {
          clearedHorror++;
        },
      } as any;
      first.close();
      assert.equal(clearedAudio, 0);
      assert.equal(clearedHorror, 0);
      assert(voice.enabled, "Closing a stale owner must not disable the new session's microphone");
      process();
      assert.equal((packets.at(-1) as any)[0], "next");
      next.close();
      assert.equal(clearedAudio, 1);
      assert.equal(clearedHorror, 1);
      next.close();
      assert.equal(clearedAudio, 1, "Repeated teardown cannot affect a later session");
      assert.equal(clearedHorror, 1);
      assert.equal(voice.enabled, false);
      assert.equal(voice.stream, null);
      await voice.start();
      assert(
        voice.enabled,
        "Leaving a session disables capture without permanently closing Game's VoiceChat",
      );
    } finally {
      voice.close();
    }
  }));

test("Backing out of the actual multiplayer menu cancels its pending Join and microphone", () =>
  environment(async ({ tracks }) => {
    const game = Object.create(Game.prototype) as Game;
    game.net = null;
    const voice = gameVoice(game);
    const menu = renderMenu(game);
    try {
      await voice.start();
      assert(voice.enabled, "The menu effect automatically starts the microphone");
      menu.join();
      const pending = game.net!;
      menu.unmount();
      assert(pending.closed);
      assert.equal(game.net, null);
      assert.equal(voice.enabled, false);
      assert(tracks.every((track) => track.stopped));
      assert.doesNotThrow(() => pending.receive({ type: "welcome" }));
      assert.equal(game.net, null, "A late welcome cannot resurrect a cancelled Join");
    } finally {
      voice.close();
    }
  }));

test("Menu cleanup preserves a successfully joined session and cannot close a newer owner", () =>
  environment(async () => {
    const game = Object.create(Game.prototype) as Game;
    game.net = null;
    const voice = gameVoice(game);
    try {
      const menu = renderMenu(game);
      await voice.start();
      menu.join();
      const first = game.net!;
      first.connected = true;
      menu.unmount();
      assert.equal(first.closed, false);
      assert(voice.enabled);
      first.close();
      game.net = null;
      const staleMenu = renderMenu(game);
      await voice.start();
      staleMenu.join();
      const abandoned = game.net!;
      const replacement = new MenuClient(game, "Tester");
      game.net = replacement;
      staleMenu.unmount();
      assert(abandoned.closed);
      assert.equal(game.net, replacement);
      assert.equal(replacement.closed, false);
      assert(voice.enabled);
      replacement.close();
    } finally {
      voice.close();
    }
  }));

test("Closed clients ignore late voice/welcome packets and a delayed old socket close cannot mute a new session", () =>
  environment(async () => {
    const oldWebSocket = Object.getOwnPropertyDescriptor(globalThis, "WebSocket");
    class Socket {
      static OPEN = 1;
      readyState = 1;
      bufferedAmount = 0;
      onclose: (() => void) | null = null;
      send() {}
      close() {}
    }
    Object.defineProperty(globalThis, "WebSocket", {
      configurable: true,
      writable: true,
      value: Socket,
    });
    const game = Object.create(Game.prototype) as Game;
    game.net = null;
    const voice = gameVoice(game);
    try {
      await voice.start();
      const old = new MenuClient(game, "Tester");
      game.net = old;
      old.open();
      const socket = old.socket as unknown as Socket;
      old.close();
      const next = new MenuClient(game, "Tester");
      next.connected = true;
      game.net = next;
      await voice.start();
      voice.set({ mode: "toggle" });
      voice.latched = true;
      let received = 0;
      voice.receive = () => {
        received++;
      };
      socket.onclose!();
      assert(voice.transmitting);
      old.receive({ type: "voice", sender: "old", audio: "stale" });
      old.receive({ type: "welcome" });
      assert.equal(received, 0);
      assert.equal(game.net, next);
      next.close();
    } finally {
      voice.close();
      if (oldWebSocket) Object.defineProperty(globalThis, "WebSocket", oldWebSocket);
      else Reflect.deleteProperty(globalThis, "WebSocket");
    }
  }));

test("Legacy clients without Game.voice still own and permanently dispose their fallback VoiceChat", () =>
  environment(async () => {
    const game = { difficulty: "normal" } as Game;
    const client = new MenuClient(game, "Tester");
    await client.voice.start();
    assert(client.voice.enabled);
    client.close();
    assert.equal(await client.voice.start(), false);
    assert.equal(client.voice.stream, null);
  }));

test("Game camera updates before paused rendering and survives a skin reload without disposing its texture", () =>
  environment(async () => {
    const tick = gameClass.members.find(
      (n): n is ts.PropertyDeclaration =>
        ts.isPropertyDeclaration(n) && n.name.getText(gameSource) === "tick",
    )!;
    const bind = compile(
      "return function(){this.tick=" + tick.initializer!.getText(gameSource) + ";};",
      { THREE },
    );
    const game = Object.create(Game.prototype) as Game;
    const texture = new THREE.Texture();
    let cameraUpdates = 0,
      textureDisposals = 0;
    texture.addEventListener("dispose", () => {
      textureDisposals++;
    });
    const skin = {
      skin: { width: 64, height: 64 },
      cape: { width: 64, height: 32 },
      capeEnabled: false,
    } as any;
    Object.assign(game, {
      faceCamera: {
        texture,
        update() {
          cameraUpdates++;
        },
      },
      avatar: new SkinModel(skin),
      net: null,
      started: false,
      active: false,
      preview: false,
      frames: 0,
      frameClock: 0,
      audio: { update() {} },
      atmosphere: { tick() {} },
      camera: new THREE.PerspectiveCamera(),
      world: {
        dimension: "overworld",
        biome() {
          return "plains";
        },
      },
      settings: {},
      running: true,
      skinGeneration: 0,
      scene: new THREE.Scene(),
    });
    bind.call(game);
    game.tick(0.02);
    assert.equal(cameraUpdates, 1);
    assert.equal(game.avatar!.faceMaterial.map, texture);
    const method = gameClass.members.find(
      (n): n is ts.MethodDeclaration =>
        ts.isMethodDeclaration(n) && n.name.getText(gameSource) === "reloadSkin",
    )!;
    const reload = compile(
      "return " +
        method.getText(gameSource).replace(/^async reloadSkin/, "async function reloadSkin") +
        ";",
      { readSkin: async () => skin, SkinModel },
    );
    await reload.call(game);
    assert.equal(game.avatar!.faceMaterial.map, texture);
    assert.equal(textureDisposals, 0);
    game.avatar!.dispose();
    assert.equal(textureDisposals, 0, "The camera, not the skin model, owns its live texture");
    texture.dispose();
  }));
