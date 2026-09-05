import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
import * as THREE from "three";
import { Game } from "../lib/engine";
import { Multiplayer } from "../lib/multiplayer";
import { InventoryPack } from "../lib/inventory";
import { DEFAULT_SETTINGS, DEFAULT_BINDINGS } from "../lib/settings";
import { EAT_DURATION } from "../lib/eating";

const source = ts.createSourceFile(
  "engine.ts",
  readFileSync(new URL("../lib/engine.ts", import.meta.url), "utf8"),
  ts.ScriptTarget.Latest,
  true,
);
const gameClass = source.statements.find(
  (n) => ts.isClassDeclaration(n) && n.name?.text === "Game",
) as ts.ClassDeclaration;
function bindHandler(game: Game, name: string) {
  const field = gameClass.members.find(
    (n) => n.name?.getText(source) === name,
  ) as ts.PropertyDeclaration;
  const code = ts.transpileModule("return (" + field.initializer!.getText(source) + ");", {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText;
  (game as any)[name] = new Function("DEFAULT_BINDINGS", code).call(game, DEFAULT_BINDINGS);
}
function fixture(
  run: (f: ReturnType<typeof create>, clock: (ms: number) => void, doc: any) => void,
) {
  const names = ["document", "performance"] as const;
  const previous = names.map((name) => Object.getOwnPropertyDescriptor(globalThis, name));
  let now = 10000;
  const doc = {
    hidden: false,
    pointerLockElement: null as unknown,
    exitPointerLock() {
      this.pointerLockElement = null;
    },
  };
  Object.defineProperty(globalThis, "document", { configurable: true, value: doc });
  Object.defineProperty(globalThis, "performance", {
    configurable: true,
    value: { now: () => now },
  });
  try {
    const f = create();
    doc.pointerLockElement = f.game.canvas;
    run(f, (ms) => (now = 10000 + ms), doc);
  } finally {
    names.forEach((name, i) =>
      previous[i]
        ? Object.defineProperty(globalThis, name, previous[i]!)
        : Reflect.deleteProperty(globalThis, name),
    );
  }
}
function create() {
  const game = Object.create(Game.prototype) as Game,
    pack = new InventoryPack();
  pack.slots[0] = { id: 106, n: 6 };
  pack.slots[1] = { id: 106, n: 2 };
  const sounds: string[] = [],
    crumbs: { id: number; origin: THREE.Vector3 }[] = [];
  Object.assign(game, {
    active: true,
    started: true,
    preview: false,
    pauseReason: "",
    health: 8,
    food: 0,
    mode: "survival",
    rest: null,
    horrorThreat: null,
    net: null,
    needsCapture: false,
    eating: null,
    eatKeyDown: false,
    rightDown: false,
    leftDown: false,
    selected: 0,
    pack,
    inventory: pack.counts(),
    hotbar: pack.slots.slice(0, 9).map((s) => s?.id ?? 0),
    settings: { ...DEFAULT_SETTINGS, bindings: { ...DEFAULT_BINDINGS } },
    camera: new THREE.PerspectiveCamera(),
    perspective: 0,
    avatar: null,
    position: new THREE.Vector3(0, 50, 0),
    velocity: new THREE.Vector3(),
    canvas: {},
    keys: new Set<string>(),
    actionCooldown: 0,
    target: null,
    audio: {
      play(name: string) {
        sounds.push(name);
      },
    },
    blockParticles: {
      crumbs(id: number, origin: THREE.Vector3) {
        crumbs.push({ id, origin });
      },
    },
    cracks: { update() {} },
    outline: { visible: false },
    drops: { spawn() {} },
    emit(this: Game) {
      this.syncPack();
    },
    save() {},
    onMenu() {},
  });
  for (const name of ["mouseDown", "mouseUp", "keyDown", "keyUp", "restVisibility"])
    bindHandler(game, name);
  return { game, sounds, crumbs };
}
const mouse = (button = 2) => ({ button, preventDefault() {} }) as MouseEvent;
const key = (code: string, repeat = false) =>
  ({ code, repeat, target: {}, preventDefault() {}, stopPropagation() {} }) as KeyboardEvent;

test("Real right mouse use needs 1.6 wall-clock seconds even at 10 FPS, consumes once, adds six hunger and no health", () =>
  fixture(({ game: g, crumbs, sounds }, clock) => {
    g.mouseDown(mouse());
    assert(g.eating);
    for (let t = 100; t <= 1500; t += 100) {
      clock(t);
      g.updateEating();
    }
    assert.equal(g.inventory[106], 8);
    assert.equal(g.food, 0);
    assert.equal(g.health, 8);
    clock(1599);
    g.updateEating();
    assert.equal(g.inventory[106], 8);
    clock(1600);
    g.updateEating();
    assert.equal(g.inventory[106], 7);
    assert.equal(g.pack.counts()[106], 7);
    assert.equal(g.food, 6);
    assert.equal(g.health, 8);
    assert.equal(g.eating, null);
    assert.equal(crumbs.length, 5);
    assert.equal(sounds.filter((s) => s === "eat").length, 5);
    clock(1700);
    g.updateEating();
    assert.equal(g.inventory[106], 7, "No second consumption without a newly started action");
  }));

test("Releasing PPM or changing even to another slot with the same food cancels all progress", () => {
  for (const cancel of ["release", "slot", "replace"])
    fixture(({ game: g }, clock) => {
      g.mouseDown(mouse());
      clock(900);
      g.updateEating();
      if (cancel === "release") g.mouseUp();
      else if (cancel === "slot") g.select(1);
      else g.hotbar[0] = 107;
      clock(3000);
      g.updateEating();
      assert.equal(g.eating, null);
      assert.equal(g.inventory[106], 8);
      assert.equal(g.food, 0);
    });
});

test("Escape and hidden-tab lifecycle stop eating immediately and never catch up after returning", () => {
  for (const reason of ["escape", "hidden"])
    fixture(({ game: g }, clock, doc) => {
      g.mouseDown(mouse());
      clock(900);
      g.updateEating();
      if (reason === "escape") g.keyDown(key("Escape"));
      else {
        doc.hidden = true;
        g.restVisibility();
      }
      assert.equal(g.eating, null);
      clock(30000);
      g.updateEating();
      doc.hidden = false;
      g.restVisibility();
      g.updateEating();
      assert.equal(g.inventory[106], 8);
      assert.equal(g.food, 0);
    });
});

test("Death, lying in bed, pointer loss and attack cancel before the final bite can consume food", () => {
  for (const reason of ["death", "rest", "pointer", "attack"])
    fixture(({ game: g }, clock) => {
      g.mouseDown(mouse());
      clock(1500);
      g.updateEating();
      if (reason === "death") g.health = 0;
      else if (reason === "rest") g.rest = {} as any;
      else if (reason === "pointer") g.needsCapture = true;
      else g.leftDown = true;
      clock(1700);
      g.updateEating();
      assert.equal(g.eating, null, reason);
      assert.equal(g.food, 0, reason);
      assert.equal(g.inventory[106], 8, reason);
    });
});

test("Holding PPM consumes subsequent portions through normal repeated interact until hunger is full", () =>
  fixture(({ game: g }, clock) => {
    g.mouseDown(mouse());
    for (let t = 100; t <= 10000; t += 100) {
      clock(t);
      g.updateEating();
      // Game.tick calls the same held-use interaction after advancing the current action.
      if (g.rightDown) g.interact();
    }
    assert.equal(g.food, 20);
    assert.equal(
      g.inventory[106],
      4,
      "Four six-point portions reach twenty; a fifth is never consumed",
    );
    assert.equal(g.eating, null);
    assert.equal(g.health, 8);
  }));

test("R is a held action, obeys remapped bindings, ignores keyboard repeat and cancels on key-up", () => {
  for (const code of ["KeyR", "KeyV"])
    fixture(({ game: g }, clock) => {
      g.settings.bindings.eat = code;
      g.keyDown(key(code));
      clock(800);
      g.updateEating();
      const start = g.eating;
      g.keyDown(key(code, true));
      assert.equal(g.eating, start);
      g.keyUp(key(code));
      assert.equal(g.eating, null);
      clock(2000);
      g.updateEating();
      assert.equal(g.inventory[106], 8);
      g.keyDown(key(code));
      for (let t = 2100; t <= 6000; t += 100) {
        clock(t);
        g.updateEating();
      }
      assert.equal(g.food, 12, "A held key starts its next portion without another keydown event");
      g.keyUp(key(code));
    });
});

test("Full hunger, an empty stack and a nonfood item cannot start or consume; particle settings only hide crumbs", () => {
  for (const reason of ["full", "empty", "nonfood"])
    fixture(({ game: g }, clock) => {
      if (reason === "full") g.food = 20;
      else if (reason === "empty") g.inventory[106] = 0;
      else g.hotbar[0] = 3;
      const count = g.inventory[106],
        food = g.food;
      g.mouseDown(mouse());
      clock(2000);
      g.updateEating();
      assert.equal(g.eating, null);
      assert.equal(g.inventory[106], count);
      assert.equal(g.food, food);
    });
  fixture(({ game: g, crumbs, sounds }, clock) => {
    g.settings.particles = false;
    g.mouseDown(mouse());
    for (let t = 100; t <= 1600; t += 100) {
      clock(t);
      g.updateEating();
    }
    assert.equal(crumbs.length, 0);
    assert.equal(sounds.filter((s) => s === "eat").length, 5);
    assert.equal(g.food, 6);
  });
});

test("Real Game and Multiplayer retry an early finish after its server delay without consuming locally or resetting progress", () =>
  fixture(({ game: g }, clock) => {
    const requests: { command: any; callback?: (data: any) => void; req: string }[] = [];
    const net = Object.assign(Object.create(Multiplayer.prototype), {
      game: g,
      connected: true,
      closed: false,
      eatGeneration: 0,
      eatSession: null,
      eatStartReq: null,
      eatFinishReq: null,
      eatRetryAt: 0,
      request(command: any, callback?: (data: any) => void) {
        const req = "eat-" + requests.length;
        requests.push({ command, callback, req });
        return req;
      },
    }) as Multiplayer;
    g.net = net;
    g.rightDown = true;
    g.beginEating();
    requests[0].callback!({
      ok: true,
      eating: { id: 106, progress: 0 },
      eatSession: requests[0].req,
    });
    clock(1600);
    g.updateEating();
    assert.equal(requests[1].command.type, "eatFinish");
    requests[1].callback!({
      ok: false,
      eating: { id: 106, progress: 0.9 },
      eatSession: requests[0].req,
      retryAfterMs: 160,
    });
    assert(g.eating!.elapsed >= EAT_DURATION);
    assert.equal(g.food, 0);
    assert.equal(g.inventory[106], 8);
    clock(1759);
    g.updateEating();
    assert.equal(requests.length, 2);
    clock(1760);
    g.updateEating();
    assert.equal(requests.length, 3);
    assert.equal(requests[2].command.session, requests[0].req);
    clock(1800);
    g.updateEating();
    assert.equal(requests.length, 3, "Only one finish may be outstanding");
    requests[2].callback!({ ok: true, eating: null });
    assert.equal(g.eating, null);
    assert.equal(g.food, 0, "The authoritative inventory/hunger ACK path owns the result");
  }));
