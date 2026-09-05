import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
import * as THREE from "three";
import { Game } from "../lib/engine";
import { World } from "../lib/world";
import { FluidSystem } from "../lib/fluid";
import { InventoryPack } from "../lib/inventory";
import { DEFAULT_SETTINGS } from "../lib/settings";

function browser(run: () => void) {
  const names = ["window", "document"] as const;
  const descriptors = names.map((name) => Object.getOwnPropertyDescriptor(globalThis, name));
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { matchMedia: () => ({ matches: false }) },
  });
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: { hidden: false, pointerLockElement: null },
  });
  try {
    run();
  } finally {
    names.forEach((name, i) =>
      descriptors[i]
        ? Object.defineProperty(globalThis, name, descriptors[i]!)
        : Reflect.deleteProperty(globalThis, name),
    );
  }
}
function fixture() {
  const game = Object.create(Game.prototype) as Game;
  const world = new World();
  world.chunk(0, 0);
  for (let x = 5; x <= 11; x++)
    for (let z = 5; z <= 11; z++) {
      world.set(x, 49, z, 3);
      for (let y = 50; y < 70; y++) world.set(x, y, z, 0);
    }
  const requests: any[] = [],
    pack = new InventoryPack();
  let actions = 0,
    saves = 0;
  Object.assign(game, {
    started: true,
    preview: false,
    active: false,
    pauseReason: "chest",
    health: 20,
    food: 20,
    oxygen: 20,
    mode: "survival",
    difficulty: "normal",
    position: new THREE.Vector3(8.5, 55.5, 8.5),
    velocity: new THREE.Vector3(0, -1, 0),
    yaw: 0,
    pitch: 0,
    eyeHeight: 1.62,
    perspective: 0,
    camera: new THREE.PerspectiveCamera(),
    sun: new THREE.DirectionalLight(),
    torch: new THREE.PointLight(),
    world,
    fluid: new FluidSystem(world),
    settings: { ...DEFAULT_SETTINGS },
    pack,
    inventory: {},
    hotbar: Array(9).fill(0),
    selected: 0,
    keys: new Set<string>(),
    sprinting: false,
    grounded: false,
    flying: false,
    fallDistance: 0,
    crouching: false,
    damageTimer: 0,
    damageFlash: 0,
    clock: 90,
    time: 0,
    hungerTimer: 0,
    regenerationTimer: 0,
    frames: 0,
    frameClock: 0,
    meshTimer: 0,
    updateTimer: 0,
    saveTimer: 0,
    swingTime: 0,
    mobs: [],
    avatar: null,
    net: null,
    horror: null,
    horrorThreat: null,
    faceCamera: null,
    adventure: {
      data: { equipment: { head: 0, chest: 0, legs: 0, feet: 0 } },
      tickFurnaces() {},
    },
    atmosphere: { tick() {} },
    audio: { play() {}, update() {} },
    outline: { visible: false },
    cracks: { update() {} },
    ensure() {},
    emit() {},
    notify() {},
    save() {
      saves++;
    },
    onMenu() {},
    mine() {
      actions++;
    },
    interact() {
      actions++;
    },
    returnCraftItems() {},
  });
  // Bind the actual arrow field without constructing a WebGL renderer in Node.
  const source = ts.createSourceFile(
    "engine.ts",
    readFileSync(new URL("../lib/engine.ts", import.meta.url), "utf8"),
    ts.ScriptTarget.Latest,
    true,
  );
  const cls = source.statements.find(
    (n): n is ts.ClassDeclaration => ts.isClassDeclaration(n) && n.name?.text === "Game",
  )!;
  const field = cls.members.find(
    (n): n is ts.PropertyDeclaration =>
      ts.isPropertyDeclaration(n) && n.name.getText(source) === "tick",
  )!;
  const code = ts.transpileModule(
    "function bind(){this.tick=" + field.initializer!.getText(source) + ";}",
    { compilerOptions: { target: ts.ScriptTarget.ES2022 } },
  ).outputText;
  new Function("THREE", code + "; return bind;")(THREE).call(game);
  return { game, world, requests, actions: () => actions, saves: () => saves };
}
const frames = (game: Game, n = 180, dt = 1 / 60) => {
  for (let i = 0; i < n; i++) game.tick(dt);
};

test("Opening each item panel mid-fall lands normally, keeps fall damage, and ignores movement or attack input", () =>
  browser(() => {
    for (const panel of ["chest", "furnace", "inventory", "crafting", "chat"]) {
      const s = fixture(),
        g = s.game;
      g.active = true;
      g.pause(panel);
      assert.equal(g.velocity.y, -1, "Opening a cursor panel must not erase vertical momentum");
      g.keys = new Set(["KeyW", "Space", "ShiftLeft"]);
      g.sprinting = true;
      g.leftDown = g.rightDown = true;
      frames(g);
      assert(g.grounded, panel);
      assert(Math.abs(g.position.y - 50) < 0.00002, panel);
      assert.equal(g.position.x, 8.5);
      assert.equal(g.position.z, 8.5);
      assert.equal(g.health, 17, "The five-and-a-half-block fall is still dangerous");
      assert.equal(s.actions(), 0);
      assert.equal(g.pauseReason, panel);
      assert.equal(g.active, false);
      assert.equal(g.fallDistance, 0);
    }
  }));
test("An upward jump keeps its arc while the inventory is open and cannot become a held-space hover", () =>
  browser(() => {
    const { game: g } = fixture();
    g.pauseReason = "inventory";
    g.position.y = 50.5;
    g.velocity.y = 6;
    g.keys.add("Space");
    g.tick(1 / 60);
    assert(g.position.y > 50.5);
    assert(g.velocity.y < 6 && g.velocity.y > 0);
    frames(g);
    assert(g.grounded);
    assert(Math.abs(g.position.y - 50) < 0.00002);
    assert.equal(g.health, 20);
  }));
test("Water buoyancy and oxygen continue in a chest panel and lava contact can damage again after cooldown", () =>
  browser(() => {
    const { game: g, world: w } = fixture();
    for (let y = 50; y <= 58; y++) w.set(8, y, 8, 7);
    g.position.y = 56;
    g.velocity.y = 0;
    frames(g, 120);
    assert(g.position.y < 56 && g.position.y >= 50);
    assert(g.velocity.y >= -3);
    assert(g.oxygen < 18);
    const lava = fixture();
    for (let y = 45; y <= 56; y++) lava.world.set(8, y, 8, 15);
    lava.world.set(8, 44, 8, 3);
    lava.game.position.y = 55.5;
    lava.game.velocity.y = 0;
    frames(lava.game, 70);
    assert.equal(lava.game.health, 12, "Open containers do not freeze hazard cooldowns");
  }));
test("Solo pause menus stay paused, while multiplayer pause panels keep falling and send one raw landing report", () =>
  browser(() => {
    for (const panel of ["pause", "settings", "atlas", "dimensions", "help"]) {
      const { game: g } = fixture();
      g.pauseReason = panel;
      frames(g, 30);
      assert.equal(g.position.y, 55.5);
    }
    const s = fixture(),
      g = s.game,
      positions: number[] = [];
    g.pauseReason = "pause";
    g.net = {
      connected: true,
      tick() {
        positions.push(g.position.y);
      },
      request(message: any) {
        s.requests.push(message);
      },
    } as any;
    frames(g);
    assert(g.grounded);
    assert(positions.some((y) => y < 55));
    assert.deepEqual(s.requests, [{ type: "environmentDamage", amount: 3, reason: "fall" }]);
    assert.equal(g.health, 20, "Only the multiplayer server can change the health total");
  }));
test("Preview, death, hidden tabs and a caught Horror sequence never acquire panel movement", () =>
  browser(() => {
    for (const stop of ["preview", "death", "hidden", "not-started", "caught"]) {
      const { game: g } = fixture();
      if (stop === "preview") g.preview = true;
      if (stop === "death") {
        g.health = 0;
        g.pauseReason = "death";
      }
      if (stop === "hidden") Object.assign(document, { hidden: true });
      if (stop === "not-started") g.started = false;
      if (stop === "caught") {
        g.horrorCaught = () => true;
        g.updateHorror = () => {};
      }
      frames(g, 20);
      assert.equal(g.position.y, 55.5, stop);
      Object.assign(document, { hidden: false });
    }
  }));
