import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
import * as THREE from "three";
import { Game } from "../lib/engine";
import { HorrorHunt, type HuntEnvironment } from "../lib/horror-hunt";
import { HorrorDirector, type HorrorEvent } from "../lib/horror-director";
import { InventoryPack } from "../lib/inventory";
import { DEFAULT_SETTINGS } from "../lib/settings";
import { weapon } from "../lib/combat";

function browser(run: () => void) {
  const names = ["window", "document"];
  const old = names.map((name) => Object.getOwnPropertyDescriptor(globalThis, name));
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { matchMedia: () => ({ matches: false }) },
  });
  Object.defineProperty(globalThis, "document", { configurable: true, value: { hidden: false } });
  try {
    run();
  } finally {
    names.forEach((name, i) =>
      old[i]
        ? Object.defineProperty(globalThis, name, old[i]!)
        : Reflect.deleteProperty(globalThis, name),
    );
  }
}
function fixture() {
  const game = Object.create(Game.prototype) as Game;
  const events: HorrorEvent[] = [],
    updates: any[] = [],
    drops: { id: number; n: number }[] = [],
    menus: string[] = [];
  const env: HuntEnvironment = {
    place: (p) => [...p],
    move: (_from, to) => [...to],
    lineClear: () => true,
  };
  const director = new HorrorDirector();
  let trigger = true;
  director.tick = (dt, players) => {
    director.elapsed += dt;
    if (!trigger || !players[0].active) return [];
    trigger = false;
    return [
      {
        id: "old-jumpscare",
        kind: "jumpscare",
        duration: 0.8,
        intensity: 1,
        p: [0, 20, 1],
        at: director.elapsed,
        yaw: 0,
        seed: 123,
        dimension: "overworld",
        viewerIds: ["local"],
        reason: "director",
      },
    ];
  };
  Object.assign(game, {
    started: true,
    active: true,
    preview: false,
    needsCapture: false,
    net: null,
    mode: "survival",
    difficulty: "horror",
    health: 20,
    damageTimer: 0,
    position: new THREE.Vector3(0, 20, 0),
    velocity: new THREE.Vector3(),
    yaw: 0,
    pitch: 0,
    eyeHeight: 1.62,
    perspective: 0,
    camera: new THREE.PerspectiveCamera(),
    clock: 90,
    keys: new Set(),
    settings: { ...DEFAULT_SETTINGS },
    world: {
      dimension: "overworld",
      surface: () => 20,
      solid: (_x: number, y: number) => y < 20,
      get: (_x: number, y: number) => (y < 20 ? 3 : 0),
      biome: () => "plains",
    },
    pack: new InventoryPack(),
    inventory: {},
    hotbar: Array(9).fill(0),
    selected: 0,
    horrorDirector: director,
    horrorHunt: new HorrorHunt(),
    horrorThreat: null,
    horror: {
      event: (e: HorrorEvent) => events.push(e),
      update: (_dt: number, context: any) => updates.push(context),
      clear() {},
    },
    huntEnvironment: () => env,
    drops: { spawn: (id: number, n: number) => drops.push({ id, n }) },
    adventure: { data: { armor: 0 }, tickFurnaces() {} },
    audio: { play() {}, update() {} },
    atmosphere: { tick() {} },
    frames: 0,
    frameClock: 0,
    mobs: [],
    crystals: [],
    dragon: null,
    scene: new THREE.Scene(),
    projectiles: [],
    attackCooldown: 0,
    actionCooldown: 0,
    target: null,
    emit() {},
    notify() {},
    ensure() {},
    burst() {},
    pause(panel: string) {
      menus.push(panel);
      game.active = false;
      game.pauseReason = panel;
    },
  });
  const bind = ts.createSourceFile(
    "engine.ts",
    readFileSync(new URL("../lib/engine.ts", import.meta.url), "utf8"),
    ts.ScriptTarget.Latest,
    true,
  );
  const cls = bind.statements.find(
    (n): n is ts.ClassDeclaration => ts.isClassDeclaration(n) && n.name?.text === "Game",
  )!;
  const field = cls.members.find(
    (n): n is ts.PropertyDeclaration =>
      ts.isPropertyDeclaration(n) && n.name.getText(bind) === "tick",
  )!;
  const code = ts.transpileModule(
    "function bind(){this.tick=" + field.initializer!.getText(bind) + ";}",
    { compilerOptions: { target: ts.ScriptTarget.ES2022 } },
  ).outputText;
  new Function("THREE", code + "; return bind;")(THREE).call(game);
  return { game, events, updates, drops, menus, env };
}
function caught(game: Game) {
  for (let i = 0; i < 1200 && game.horrorThreat?.phase !== "caught"; i++) game.updateHorror(0.05);
  assert.equal(game.horrorThreat?.phase, "caught");
}
function exposed(game: Game) {
  game.updateHorror(0.05);
  const state = game.horrorHunt.hunts.values().next().value!;
  state.p = [0, 20, -2.5];
  state.phase = "vulnerable";
  state.phaseAt = game.horrorHunt.elapsed;
  state.phaseDuration = 2.4;
  game.horrorThreat = game.horrorHunt.view("local")[0];
  return state;
}

test("The director's former automatic jumpscare now starts a distant, six-second telegraphed encounter", () =>
  browser(() => {
    const { game, events, updates } = fixture();
    game.updateHorror(0.05);
    assert.equal(events.length, 0);
    assert.equal(game.horrorThreat?.phase, "telegraph");
    assert.equal(game.horrorThreat?.phaseDuration, 6);
    assert(new THREE.Vector3(...game.horrorThreat!.p).distanceTo(game.position) >= 10);
    assert.equal(game.health, 20);
    assert.equal(updates.at(-1).threat.id, game.horrorThreat!.id);
    assert.equal(updates.at(-1).huntTime, game.horrorHunt.elapsed);
    assert.equal(updates.at(-1).time, game.horrorDirector.elapsed);
  }));

test("A completed grab shows one scare then kills after 1.3 seconds and drops each inventory item once", () =>
  browser(() => {
    const { game, events, drops, menus } = fixture();
    game.pack.slots[0] = { id: 8, n: 9 };
    game.pack.grid[0] = { id: 109, n: 2 };
    game.pack.cursor = { id: 113, n: 5 };
    game.commitPack();
    caught(game);
    const id = game.horrorThreat!.id;
    assert.equal(events.filter((e) => e.kind === "jumpscare").length, 1);
    assert.equal(events.at(-1)!.duration, 1.3);
    assert.equal(events.at(-1)!.at, game.horrorDirector.elapsed);
    for (let i = 0; i < 25; i++) game.updateHorror(0.05);
    game.updateHorror(0.049);
    assert.equal(game.health, 20);
    assert.equal(drops.length, 0);
    game.updateHorror(0.001);
    assert.equal(game.health, 0);
    assert.deepEqual(drops, [
      { id: 8, n: 9 },
      { id: 109, n: 2 },
      { id: 113, n: 5 },
    ]);
    assert.deepEqual(game.pack.counts(), {});
    assert(game.hotbar.every((id) => id === 0));
    assert.deepEqual(menus, ["death"]);
    game.killByHorror(id);
    game.finishDeath();
    game.updateHorror(0.1);
    assert.equal(drops.length, 3);
    assert.equal(game.horrorThreat, null);
  }));

test("The real paused game tick cannot cancel a completed grab; creative immunity still applies outside a grab", () =>
  browser(() => {
    const { game, menus, updates } = fixture();
    game.mode = "creative";
    game.damageTimer = 99;
    game.damage(200);
    assert.equal(game.health, 20);
    caught(game);
    game.mode = "survival";
    game.damageTimer = 0;
    game.damage(200);
    assert.equal(game.health, 20, "Ordinary damage cannot skip the final scare");
    game.mode = "creative";
    game.pause("pause");
    for (let i = 0; i < 25; i++) game.tick(0.05);
    assert.equal(
      updates.at(-1).active,
      true,
      "The caught presentation stays visible over a paused panel",
    );
    assert.equal(game.health, 20);
    game.tick(0.05);
    assert.equal(game.health, 0);
    assert.equal(menus.at(-1), "death");
  }));

test("Standard death drops every equipped armor piece once and clears worn slots", () =>
  browser(() => {
    const { game, drops } = fixture();
    game.adventure.data.equipment = { head: 152, chest: 122, legs: 153, feet: 154 };
    game.adventure.data.armor = 122;
    game.health = 0;
    game.finishDeath();
    game.finishDeath();
    assert.deepEqual(drops, [152, 122, 153, 154].map(id => ({ id, n: 1 })));
    assert.deepEqual(game.adventure.data.equipment, { head: 0, chest: 0, legs: 0, feet: 0 });
    assert.equal(game.adventure.data.armor, 0);
  }));

test("An authoritative caught event is accepted during pause while ordinary scares remain gated", () =>
  browser(() => {
    const { game, events } = fixture();
    game.active = false;
    game.needsCapture = true;
    const event = {
      id: "caught",
      kind: "jumpscare",
      p: [0, 20, 0],
      duration: 1.3,
      reason: "caught",
      dimension: "overworld",
      at: 1,
      intensity: 1,
      seed: 1,
      yaw: 0,
      viewerIds: ["local"],
    } as HorrorEvent;
    game.receiveHorror({ ...event, reason: "ordinary" });
    assert.equal(events.length, 0);
    game.receiveHorror(event);
    assert.equal(events.length, 1);
    game.receiveHorror({ ...event, viewerIds: ["another-player"] });
    assert.equal(events.length, 1);
    game.setDifficulty("normal");
    game.receiveHorror(event);
    assert.equal(events.length, 1);
  }));

test("Paused multiplayer targets still update their caught presentation and both server clocks", () =>
  browser(() => {
    const { game, updates } = fixture();
    caught(game);
    const elapsed = game.horrorHunt.elapsed;
    game.net = {
      id: "local",
      connected: true,
      horrorClock: 10,
      huntClock: 20,
      tick(dt: number) {
        this.horrorClock += dt;
        this.huntClock += dt;
      },
    } as any;
    game.pause("inventory");
    game.tick(0.1);
    assert.equal(updates.at(-1).active, true);
    assert.equal(updates.at(-1).time, 10.1);
    assert.equal(updates.at(-1).huntTime, 20.1);
    assert.equal(
      game.horrorHunt.elapsed,
      elapsed,
      "The MP client cannot also advance the solo Hunt",
    );
  }));

test("A multiplayer witness is neither frozen nor immune or forced into the caught overlay", () =>
  browser(() => {
    const { game, updates, events } = fixture();
    caught(game);
    const damageRequests: any[] = [];
    game.net = {
      id: "witness",
      connected: true,
      horrorClock: 10,
      huntClock: 20,
      request: (request: any) => damageRequests.push(request),
    } as any;
    assert.equal(game.horrorCaught(), false);
    game.damage(2, "lava");
    assert.equal(
      damageRequests.length,
      1,
      "A witness can report damage; only the caught target is immune",
    );
    assert.equal(game.health, 20, "Online damage waits for authoritative health");
    game.active = false;
    game.updateHorror(0.1);
    assert.equal(updates.at(-1).active, false);
    assert.equal(updates.at(-1).viewerId, "witness");
    const count = events.length;
    game.receiveHorror({ ...events.at(-1)!, reason: "caught", viewerIds: ["local"] });
    assert.equal(events.length, count);
  }));

test("Ending Horror opt-in cancels a pending catch and cannot execute its old death later", () =>
  browser(() => {
    const { game, drops } = fixture();
    caught(game);
    const id = game.horrorThreat!.id;
    game.setDifficulty("normal");
    assert.equal(game.horrorThreat, null);
    assert.equal(game.horrorHunt.view("local").length, 0);
    game.killByHorror(id);
    for (let i = 0; i < 40; i++) game.updateHorror(0.05);
    assert.equal(game.health, 20);
    assert.equal(drops.length, 0);
  }));

test("Melee uses weapon damage, cooldown, eye aiming and the nearest target in all F5 views", () =>
  browser(() => {
    for (const perspective of [0, 1, 2]) {
      const { game } = fixture();
      const state = exposed(game);
      game.perspective = perspective;
      game.camera.rotation.y = perspective === 2 ? Math.PI : 0;
      game.hotbar[0] = 104;
      assert(game.attack());
      assert(Math.abs(state.hp - (140 - weapon(104).damage * 1.45)) < 1e-8);
      assert.equal(game.attackCooldown, weapon(104).cooldown);
      const hp = state.hp;
      assert.equal(game.attack(), false);
      assert.equal(state.hp, hp);
    }
    const { game } = fixture();
    const state = exposed(game);
    const crystal = { mesh: new THREE.Group(), alive: true, index: 0 };
    crystal.mesh.position.set(0, 21.62, -1.3);
    game.crystals.push(crystal);
    let crystalHits = 0;
    game.destroyCrystal = () => {
      crystalHits++;
    };
    assert(game.attack());
    assert.equal(crystalHits, 1);
    assert.equal(
      state.hp,
      140,
      "A nearer mob/crystal must absorb the hit instead of the Guest behind it",
    );
  }));

test("A real arrow hits the vulnerable Guest and is consumed; a solid wall blocks it", () =>
  browser(() => {
    for (const blocked of [false, true]) {
      const { game } = fixture();
      const state = exposed(game);
      game.inventory[113] = 1;
      if (blocked) game.world.solid = (_x, y, z) => y < 20 || (z < -0.9 && z > -1.2);
      game.shoot();
      assert.equal(game.inventory[113], 0);
      for (let i = 0; i < 20 && game.projectiles.length; i++) game.updateProjectiles(0.02);
      assert.equal(game.projectiles.length, 0);
      assert.equal(state.hp, blocked ? 140 : 111);
    }
  }));

test("Single-player Hunt never starts outside Horror and stops at the server-authority boundary", () =>
  browser(() => {
    for (const kind of ["normal", "server"] as const) {
      const { game } = fixture();
      if (kind === "normal") game.difficulty = "normal";
      else game.net = { connected: true, horrorClock: 77, huntClock: 88 } as any;
      game.horrorHunt.start = () => {
        throw new Error("Local hunt must not run");
      };
      game.updateHorror(0.1);
      assert.equal(game.horrorThreat, null);
      assert.equal(game.horrorHunt.elapsed, 0);
    }
  }));
