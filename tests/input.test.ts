import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { Game } from "../lib/engine";
import { SkinModel } from "../lib/skin-model";
import { VoiceChat } from "../lib/voice";
import { InventoryPack } from "../lib/inventory";
import { readFileSync } from "node:fs";
import ts from "typescript";
test("First person wrist points up/out and sleeve points back to the shoulder", () => {
  const arm = SkinModel.prototype.armMesh.call({
    material: new THREE.MeshStandardMaterial(),
  } as SkinModel);
  const wrist = new THREE.Vector3(0, -0.37, 0).applyEuler(arm.rotation),
    shoulder = new THREE.Vector3(0, 0.37, 0).applyEuler(arm.rotation);
  assert(wrist.y > shoulder.y);
  assert(wrist.y > 0.3);
  arm.traverse((o) => {
    if (o instanceof THREE.Mesh) o.geometry.dispose();
  });
});
test("Pointer capture recovers from refusal and ignores a stale pending request", async () => {
  let locked: unknown = null,
    resolve: () => void = () => {},
    emit = 0;
  const oldWindow = globalThis.window,
    oldDocument = globalThis.document;
  Object.assign(globalThis, {
    window: { matchMedia: () => ({ matches: false }) },
    document: {
      get pointerLockElement() {
        return locked;
      },
    },
  });
  try {
    const g = Object.create(Game.prototype) as Game;
    Object.assign(g, {
      active: true,
      lockGeneration: 0,
      lockPending: false,
      needsCapture: false,
      emit: () => emit++,
      canvas: {
        focus() {},
        requestPointerLock: () => Promise.reject(Error("User gesture required")),
      },
    });
    g.capturePointer();
    await new Promise((r) => setTimeout(r, 0));
    assert(g.needsCapture);
    assert(!g.lockPending);
    (g.canvas as any).requestPointerLock = () =>
      new Promise<void>((r) => {
        resolve = r;
      });
    g.capturePointer();
    const generation = g.lockGeneration;
    g.lockGeneration++;
    g.active = false;
    resolve();
    await new Promise((r) => setTimeout(r, 0));
    assert.equal(g.lockGeneration, generation + 1);
    assert.equal(g.active, false);
    g.active = true;
    locked = g.canvas;
    (g.canvas as any).requestPointerLock = () => Promise.resolve();
    g.capturePointer();
    await new Promise((r) => setTimeout(r, 0));
    assert(!g.needsCapture);
    assert(emit > 0);
  } finally {
    Object.assign(globalThis, { window: oldWindow, document: oldDocument });
  }
});
test("Touch-only devices do not require a mouse pointer lock", () => {
  const old = globalThis.window;
  (globalThis as any).window = {
    matchMedia: (query: string) => ({ matches: query === "(pointer: coarse)" }),
  };
  try {
    const g = Object.create(Game.prototype);
    g.active = true;
    g.needsCapture = true;
    g.capturePointer();
    assert.equal(g.needsCapture, false);
  } finally {
    (globalThis as any).window = old;
  }
});
test("A hybrid touchscreen with an available fine pointer acquires mouse lock", async () => {
  const oldWindow = globalThis.window;
  const oldDocument = globalThis.document;
  let attempts = 0;
  let locked: unknown = null;
  Object.assign(globalThis, {
    window: {
      ontouchstart: null,
      matchMedia: (query: string) => ({
        matches: ["(pointer: coarse)", "(any-pointer: fine)"].includes(query),
      }),
    },
    document: {
      get pointerLockElement() {
        return locked;
      },
    },
  });
  try {
    const game = Object.create(Game.prototype) as Game;
    const canvas = {
      focus() {},
      requestPointerLock() {
        attempts++;
        locked = canvas;
        return Promise.resolve();
      },
    };
    Object.assign(game, {
      active: true,
      lockGeneration: 0,
      lockPending: false,
      needsCapture: false,
      canvas,
      emit() {},
    });
    game.capturePointer();
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(attempts, 1);
    assert.equal(game.lockPending, false);
    assert.equal(game.needsCapture, false);
  } finally {
    Object.assign(globalThis, { window: oldWindow, document: oldDocument });
  }
});
test("A second finger cannot steal or end the touch used for looking", () => {
  const game = Object.create(Game.prototype) as Game;
  // Bind the actual event fields without constructing a WebGL renderer.
  const source = ts.createSourceFile(
    "engine.ts",
    readFileSync(new URL("../lib/engine.ts", import.meta.url), "utf8"),
    ts.ScriptTarget.Latest,
    true,
  );
  const cls = source.statements.find(
    (n): n is ts.ClassDeclaration => ts.isClassDeclaration(n) && n.name?.text === "Game",
  )!;
  const fields = cls.members.filter(
    (n): n is ts.PropertyDeclaration =>
      ts.isPropertyDeclaration(n) &&
      ["touchStart", "touchMove", "touchEnd"].includes(n.name.getText(source)),
  );
  const bind =
    "function bind(){" +
    fields
      .map((n) => "this." + n.name.getText(source) + "=" + n.initializer!.getText(source) + ";")
      .join("") +
    "}";
  const code = ts.transpileModule(bind, {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText;
  new Function(code + ";return bind;")().call(game);
  Object.assign(game, {
    active: true,
    touchLook: null,
    yaw: 0,
    pitch: 0,
    settings: { sensitivity: 1, invertY: false },
  });
  const event = (id: number, x: number, y: number) =>
    ({
      preventDefault() {},
      changedTouches: [{ identifier: id, clientX: x, clientY: y }],
      touches: [{ identifier: id, clientX: x, clientY: y }],
    }) as unknown as TouchEvent;
  game.touchStart(event(7, 100, 100));
  game.touchStart(event(8, 250, 100));
  game.touchEnd(event(8, 250, 100));
  assert.equal(game.touchLook?.id, 7);
  game.touchMove(event(7, 120, 90));
  assert.equal(game.yaw, -0.1);
  assert.equal(game.pitch, 0.05);
  game.touchEnd(event(7, 120, 90));
  assert.equal(game.touchLook, null);
});
test("Voice has hold, toggle and always modes; typing and blur never leave hold stuck", () => {
  const oldW = globalThis.window,
    oldD = globalThis.document,
    oldL = globalThis.localStorage;
  Object.assign(globalThis, {
    window: { addEventListener() {}, removeEventListener() {} },
    document: { hidden: false, addEventListener() {}, removeEventListener() {} },
    localStorage: { getItem: () => null, setItem() {} },
  });
  try {
    const v = new VoiceChat(
      () => {},
      () => true,
      () => {},
    );
    v.enabled = true;
    const event = {
      code: "KeyV",
      repeat: false,
      preventDefault() {},
      target: { closest: () => null },
    } as unknown as KeyboardEvent;
    v.down(event);
    assert(v.transmitting);
    v.up(event);
    assert(!v.transmitting);
    v.set({ mode: "toggle" });
    v.down(event);
    assert(v.transmitting);
    v.down(event);
    assert(!v.transmitting);
    v.set({ mode: "always" });
    assert(v.transmitting);
    v.set({ mode: "hold", key: "KeyB" });
    v.down(event);
    assert(!v.transmitting);
    v.down({ ...event, code: "KeyB" } as KeyboardEvent);
    assert(v.transmitting);
    v.blur();
    assert(!v.transmitting);
    v.close();
  } finally {
    Object.assign(globalThis, { window: oldW, document: oldD, localStorage: oldL });
  }
});
test("New game and respawn clear all 36 inventory fields", () => {
  const pack = new InventoryPack();
  pack.slots[5] = { id: 108, n: 1 };
  pack.slots[35] = { id: 111, n: 64 };
  pack.cursor = { id: 8, n: 8 };
  pack.reset();
  assert(pack.slots.every((s) => s === null));
  assert.equal(pack.cursor, null);
  assert.equal(pack.slots.length, 36);
});
