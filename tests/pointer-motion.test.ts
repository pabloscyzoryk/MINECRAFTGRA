import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
import * as THREE from "three";
import { PointerMotion, type MouseMotionSample } from "../lib/pointer-motion";
import { Game } from "../lib/engine";

function stream() {
  const filter = new PointerMotion();
  let now = 100;
  filter.lock(now);
  const move = (x: number, y: number, extra: Partial<MouseMotionSample> = {}, elapsed = 8) => {
    now += elapsed;
    return filter.sample(
      { movementX: x, movementY: y, clientX: 800, clientY: 500, timeStamp: now, ...extra },
      now,
    );
  };
  assert.equal(move(500, -800), null);
  return { filter, move };
}

test("Lock acquisition drops recenter once, then ordinary motion is exactly 1:1", () => {
  const { move } = stream();
  for (const [x, y] of [
    [1, -2],
    [-25, 13],
    [0.5, -0.25],
    [320, 170],
    [0, -900],
  ])
    assert.deepEqual(move(x, y), { x, y });
});

test("Fast turns and sustained fast diagonal movement retain every delta", () => {
  const { move } = stream();
  for (let i = 0; i < 8; i++) assert.deepEqual(move(45, 1), { x: 45, y: 1 });
  assert.deepEqual(move(2400, 70), { x: 2400, y: 70 });
  assert.deepEqual(move(-1800, -400), { x: -1800, y: -400 });
  assert.deepEqual(move(0, 1200), { x: 0, y: 1200 });
});

test("One anomalous vertical packet during a horizontal turn cannot snap pitch", () => {
  const { move } = stream();
  for (let i = 0; i < 8; i++) move(20, 1);
  assert.deepEqual(move(20, -950), { x: 20, y: 0 });
  assert.deepEqual(move(20, 2), { x: 20, y: 2 });
  assert.deepEqual(move(20, -1), { x: 20, y: -1 });
});

test("A confirmed fast diagonal stroke is conserved with at most one packet delay", () => {
  const { move } = stream();
  for (let i = 0; i < 8; i++) move(20, 1);
  const first = move(20, -800)!;
  const second = move(22, -700)!;
  const third = move(20, -500)!;
  assert.equal(first.x + second.x + third.x, 62);
  assert.equal(first.y + second.y + third.y, -2000);
});

test("A coordinate warp under lock is ignored and movement immediately continues", () => {
  const { move } = stream();
  assert.deepEqual(move(30, 2), { x: 30, y: 2 });
  assert.equal(move(20, 1400, { clientX: 800, clientY: 1500 }), null);
  assert.deepEqual(move(25, -4, { clientY: 1500 }), { x: 25, y: -4 });
});

test("Unlock discards pending spikes; stale events cannot contaminate a new lock", () => {
  const { filter, move } = stream();
  for (let i = 0; i < 8; i++) move(20, 1);
  move(20, 950);
  filter.reset();
  assert.equal(move(8, 200), null);
  filter.lock(1000);
  const event = { movementX: 2, movementY: 200, clientX: 800, clientY: 500 };
  assert.equal(filter.sample({ ...event, timeStamp: 990 }, 1010), null);
  assert.equal(filter.sample({ ...event, timeStamp: 1010 }, 1010), null);
  assert.deepEqual(filter.sample({ ...event, movementY: 4, timeStamp: 1018 }, 1018), {
    x: 2,
    y: 4,
  });
});

test("Duplicate lock notifications do not discard real movement", () => {
  const { filter, move } = stream();
  assert.deepEqual(move(15, 2), { x: 15, y: 2 });
  filter.lock(999);
  assert.deepEqual(move(16, 3), { x: 16, y: 3 });
});

test("Touch compatibility events, nonfinite values and old timestamp origins are safe", () => {
  const { move } = stream();
  assert.equal(move(100, 100, { sourceCapabilities: { firesTouchEvents: true } }), null);
  assert.equal(move(NaN, 100), null);
  assert.equal(move(100, Infinity), null);
  assert.deepEqual(move(12, -4, { timeStamp: Date.now() }), { x: 12, y: -4 });
  assert.deepEqual(move(13, -5), { x: 13, y: -5 });
});

test("A delayed packet cannot release an old deferred vertical spike", () => {
  const { move } = stream();
  for (let i = 0; i < 8; i++) move(20, 1);
  assert.deepEqual(move(20, 950), { x: 20, y: 0 });
  assert.deepEqual(move(20, 150, {}, 200), { x: 20, y: 150 });
});

function bindHandlers(game: Game) {
  const text = readFileSync(new URL("../lib/engine.ts", import.meta.url), "utf8");
  const source = ts.createSourceFile("engine.ts", text, ts.ScriptTarget.Latest, true);
  const cls = source.statements.find(
    (n): n is ts.ClassDeclaration => ts.isClassDeclaration(n) && n.name?.text === "Game",
  )!;
  const names = ["mouseMove", "mouseDown", "pointerLock"];
  const fields = cls.members.filter(
    (n): n is ts.PropertyDeclaration =>
      ts.isPropertyDeclaration(n) && names.includes(n.name.getText(source)),
  );
  const script =
    "function bind(){" +
    fields
      .map((n) => "this." + n.name.getText(source) + "=" + n.initializer!.getText(source) + ";")
      .join("") +
    "}";
  const compiled = ts.transpileModule(script, {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText;
  new Function("PointerMotion", compiled + "; return bind;")(PointerMotion).call(game);
  return source;
}

test("Actual game handlers recover after Escape without recapture attack or camera jump", async () => {
  const oldDocument = globalThis.document;
  const oldWindow = globalThis.window;
  let locked: unknown = null;
  let attacks = 0,
    captures = 0;
  const game = Object.create(Game.prototype) as Game;
  bindHandlers(game);
  const canvas = {
    focus() {},
    requestPointerLock() {
      captures++;
      return Promise.resolve();
    },
  };
  Object.assign(globalThis, {
    window: { matchMedia: () => ({ matches: false }) },
    document: {
      get pointerLockElement() {
        return locked;
      },
    },
  });
  Object.assign(game, {
    active: true,
    canvas,
    pointerMotion: new PointerMotion(),
    lockPending: false,
    captureSince: -1000,
    lockGeneration: 0,
    needsCapture: false,
    yaw: 0,
    pitch: 0,
    position: new THREE.Vector3(0, 4, 0),
    eyeHeight: 1.62,
    camera: new THREE.PerspectiveCamera(),
    settings: { sensitivity: 1, invertY: false, swapMouse: false },
    emit() {},
    attack() {
      attacks++;
    },
    pause() {
      game.active = false;
      game.pointerMotion.reset();
    },
  });
  const move = (x: number, y: number) =>
    game.mouseMove({
      movementX: x,
      movementY: y,
      clientX: 500,
      clientY: 300,
      timeStamp: 0,
    } as MouseEvent);
  try {
    locked = canvas;
    game.pointerLock();
    move(300, 1200);
    move(40, 10);
    assert.equal(game.yaw, -40 * 0.0022);
    assert.equal(game.pitch, -10 * 0.0022);
    const before = { yaw: game.yaw, pitch: game.pitch };
    locked = null;
    game.pointerLock();
    assert.equal(game.active, false);
    move(500, 1000);
    assert.equal(game.pitch, before.pitch);
    game.active = true;
    game.mouseDown({ button: 0, preventDefault() {} } as MouseEvent);
    assert.equal(captures, 1);
    assert.equal(attacks, 0, "The recapture click must not also strike");
    locked = canvas;
    game.pointerLock();
    move(-700, -1800);
    assert.equal(game.pitch, before.pitch);
    move(20, -5);
    assert.equal(game.yaw, before.yaw - 20 * 0.0022);
    assert.equal(game.pitch, before.pitch + 5 * 0.0022);
    game.mouseDown({ button: 0, preventDefault() {} } as MouseEvent);
    assert.equal(attacks, 1);
    game.horrorThreat = { phase: "caught", targetId: "local" } as any;
    const caughtAngles = { yaw: game.yaw, pitch: game.pitch };
    move(200, -400);
    game.mouseDown({ button: 0, preventDefault() {} } as MouseEvent);
    assert.deepEqual({ yaw: game.yaw, pitch: game.pitch }, caughtAngles);
    assert.equal(attacks, 1, "Caught target cannot strike or change the locked camera");
    game.horrorThreat = null;
    move(3, -2);
    assert.equal(game.yaw, caughtAngles.yaw - 3 * 0.0022);
    assert.equal(game.pitch, caughtAngles.pitch + 2 * 0.0022);
    const expected = game.playerEyeRay().direction.clone();
    for (const view of [0, 1, 2]) {
      game.perspective = view;
      game.camera.rotation.y = view === 2 ? Math.PI : 0;
      assert(game.playerEyeRay().direction.distanceTo(expected) < 1e-12);
    }
    await new Promise((resolve) => setTimeout(resolve, 0));
  } finally {
    Object.assign(globalThis, { document: oldDocument, window: oldWindow });
  }
});

test("Game registers one relative mouse stream and never adds pointermove rotation", () => {
  const game = Object.create(Game.prototype) as Game;
  const source = bindHandlers(game);
  const registrations: string[] = [];
  const visit = (n: ts.Node) => {
    if (
      ts.isCallExpression(n) &&
      ts.isPropertyAccessExpression(n.expression) &&
      n.expression.name.text === "addEventListener" &&
      ts.isStringLiteral(n.arguments[0])
    )
      registrations.push(n.arguments[0].text);
    ts.forEachChild(n, visit);
  };
  visit(source);
  assert.equal(registrations.filter((name) => name === "mousemove").length, 1);
  assert.equal(registrations.filter((name) => name === "pointermove").length, 0);
});
