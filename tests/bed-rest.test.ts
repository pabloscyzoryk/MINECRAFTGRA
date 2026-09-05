import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
import * as THREE from "three";
import { World } from "../lib/world";
import { placeBed } from "../lib/bed";
import {
  resolveBedRest,
  bedRestValid,
  advanceBedRest,
  bedRestExit,
  bedRestEye,
  isBedNight,
  type BedRest,
} from "../lib/bed-rest";
import { Game } from "../lib/engine";
import { Adventure } from "../lib/adventure";
import { DEFAULT_SETTINGS, DEFAULT_BINDINGS } from "../lib/settings";
import { SkinModel } from "../lib/skin-model";

function fixture(yaw = 0) {
  const world = new World();
  world.chunk(1, 1);
  for (let x = 19; x <= 27; x++)
    for (let z = 19; z <= 27; z++) {
      world.set(x, 49, z, 3);
      for (let y = 50; y <= 56; y++) world.set(x, y, z, 0);
    }
  assert(placeBed(world, [23, 50, 23], yaw));
  const game = Object.create(Game.prototype) as Game,
    notices: string[] = [];
  Object.assign(game, {
    world,
    position: new THREE.Vector3(25.5, 50, 23.5),
    velocity: new THREE.Vector3(),
    rest: null,
    health: 20,
    mode: "survival",
    difficulty: "normal",
    horrorThreat: null,
    yaw: 0,
    pitch: 0,
    eyeHeight: 1.62,
    active: true,
    started: true,
    preview: false,
    pauseReason: "",
    needsCapture: false,
    clock: 400,
    perspective: 0,
    time: 0,
    keys: new Set(),
    hotbar: [3],
    selected: 0,
    settings: { ...DEFAULT_SETTINGS, bindings: { ...DEFAULT_BINDINGS } },
    camera: new THREE.PerspectiveCamera(),
    sun: new THREE.DirectionalLight(),
    torch: new THREE.PointLight(),
    hand: new THREE.Group(),
    audio: { play() {} },
    notify(s: string) {
      notices.push(s);
    },
    emit() {},
    save() {},
    ensure() {},
    actionCooldown: 0,
  });
  game.adventure = new Adventure(game);
  const src = ts.createSourceFile(
    "engine.ts",
    readFileSync(new URL("../lib/engine.ts", import.meta.url), "utf8"),
    ts.ScriptTarget.Latest,
    true,
  );
  const cls = src.statements.find(
    (n) => ts.isClassDeclaration(n) && n.name?.text === "Game",
  ) as ts.ClassDeclaration;
  const field = cls.members.find(
    (n) => n.name?.getText(src) === "keyDown",
  ) as ts.PropertyDeclaration;
  const js = ts.transpileModule("return (" + field.initializer!.getText(src) + ");", {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText;
  game.keyDown = new Function("DEFAULT_BINDINGS", js).call(game, DEFAULT_BINDINGS);
  return { world, game, notices };
}
function browser(run: (doc: { hidden: boolean }) => void) {
  const old = Object.getOwnPropertyDescriptor(globalThis, "document"),
    doc = { hidden: false };
  Object.defineProperty(globalThis, "document", { configurable: true, value: doc });
  try {
    run(doc);
  } finally {
    if (old) Object.defineProperty(globalThis, "document", old);
    else Reflect.deleteProperty(globalThis, "document");
  }
}
const key = (code: string, target: any = {}) =>
  ({ code, target, repeat: false, preventDefault() {}, stopPropagation() {} }) as KeyboardEvent;

test("Both bed halves resolve one horizontal resting position in all rotations and require an intact head", () => {
  for (const yaw of [0, -Math.PI / 2, Math.PI, Math.PI / 2]) {
    const { world } = fixture(yaw),
      a = resolveBedRest(world, 23, 50, 23)!;
    const b = resolveBedRest(world, ...a.head)!;
    assert.equal(a.key, b.key);
    assert.deepEqual(a.p, b.p);
    assert.equal(a.p[1], 50.5625);
    assert.equal(bedRestEye(a)[1], 50.91);
    assert(bedRestValid(world, a));
    world.set(...a.head, 0);
    assert(!bedRestValid(world, a));
    assert.equal(resolveBedRest(world, ...a.foot), null);
  }
});
test("Exactly ten uninterrupted seconds can skip a night once, and lying during daytime is allowed", () => {
  const { world } = fixture(),
    rest = resolveBedRest(world, 23, 50, 23)!;
  assert(!advanceBedRest(rest, 9.99, 400).skipped);
  assert.equal(rest.elapsed, 9.99);
  const result = advanceBedRest(rest, 0.01, 400);
  assert(result.skipped);
  assert.equal(result.clock, 690);
  assert.equal(rest.elapsed, 10);
  assert(rest.nightSkipped);
  assert(!advanceBedRest(rest, 20, 1000).skipped);
  const day = resolveBedRest(world, 23, 50, 23)!;
  assert(!advanceBedRest(day, 10, 348).skipped);
  assert(!day.nightSkipped);
  assert(!isBedNight(348));
  assert(advanceBedRest(day, 0.01, 348.01).skipped);
});
test("Actual SP body stays in bed without movement, mining or jumping; eye and F5 camera can turn", () =>
  browser(() => {
    const { game } = fixture();
    assert(game.adventure.bed(23, 50, 23));
    const position = game.position.clone();
    game.keys.add("KeyW");
    game.keys.add("Space");
    game.velocity.set(4, 8, -3);
    for (let i = 0; i < 30; i++) game.move(0.03);
    assert.deepEqual(game.position.toArray(), position.toArray());
    assert.equal(game.velocity.length(), 0);
    const edits = { ...game.world.edits };
    assert.equal(game.attack(), false);
    game.mine(10);
    game.interact();
    game.shoot();
    assert.deepEqual(game.world.edits, edits);
    game.yaw = 0.7;
    game.pitch = 0.3;
    game.keyDown(key("F5"));
    assert.equal(game.perspective, 1);
    game.move(0.03);
    assert.deepEqual(game.playerEyeRay().origin.toArray(), bedRestEye(game.rest!));
    assert.equal(game.yaw, 0.7);
    assert.equal(game.pitch, 0.3);
    assert(game.camera.position.distanceTo(game.playerEyeRay().origin) > 1);
    assert.equal(game.hand.visible, false);
  }));

test("Both lying F5 cameras orbit above the mattress and outside the real player mesh in every bed direction and pitch", () =>
  browser(() => {
    for (const yaw of [0, -Math.PI / 2, -Math.PI, -Math.PI * 1.5]) {
      const { game } = fixture(yaw);
      const avatar = new SkinModel({
        skin: { width: 64, height: 64 } as HTMLCanvasElement,
        cape: { width: 64, height: 32 } as HTMLCanvasElement,
        capeEnabled: true,
      });
      game.avatar = avatar;
      try {
        assert(game.beginRest(23, 50, 23));
        assert(
          game.camera.getWorldDirection(new THREE.Vector3()).y > 0.5,
          "The original first-person skyward resting view is preserved",
        );
        const eye = game.playerEyeRay().origin.clone();
        for (const perspective of [1, 2])
          for (const pitch of [-1.54, 0, 0.65, 1.54]) {
            game.perspective = perspective;
            game.pitch = pitch;
            game.updateRestView();
            avatar.group.updateMatrixWorld(true);
            const body = new THREE.Box3();
            avatar.group.traverseVisible((object) => {
              if (object instanceof THREE.Mesh) body.union(new THREE.Box3().setFromObject(object));
            });
            const camera = game.camera.position;
            assert(camera.y > 51.2, "Rear F5 must never invert the FP sky ray below the pillow");
            assert(
              body.distanceToPoint(camera) > 0.3,
              "The near plane stays outside head/body geometry",
            );
            assert(!game.world.solid(camera.x, camera.y, camera.z));
            const focus = new THREE.Vector3(game.rest!.p[0], 50.95, game.rest!.p[2]);
            assert(
              game.camera
                .getWorldDirection(new THREE.Vector3())
                .dot(focus.clone().sub(camera).normalize()) > 0.99999,
            );
            const horizontal = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
            assert(
              (perspective === 1 ? -1 : 1) * camera.clone().sub(focus).dot(horizontal) > 1,
              "The front and rear views retain opposite horizontal sides",
            );
            assert.deepEqual(game.playerEyeRay().origin.toArray(), eye.toArray());
          }
        game.perspective = 0;
        game.updateRestView();
        assert.deepEqual(game.camera.position.toArray(), eye.toArray());
        assert.equal(avatar.group.visible, false);
      } finally {
        avatar.dispose();
      }
    }
  }));

test("Rest camera respects an adjacent wall and low ceiling, using an elevated fallback instead of entering the pillow", () =>
  browser(() => {
    const { game, world } = fixture();
    assert(game.beginRest(23, 50, 23));
    for (let x = 19; x <= 27; x++) for (let z = 19; z <= 27; z++) world.set(x, 52, z, 3);
    for (let x = 22; x <= 24; x++) for (let y = 50; y <= 52; y++) world.set(x, y, 24, 3);
    game.perspective = 1;
    game.updateRestView();
    const p = game.camera.position;
    assert(p.y > 51.25 && p.y + 0.1 < 52.000001);
    assert(p.z + 0.1 < 24);
    assert(!world.solid(p.x, p.y, p.z));
    assert(p.distanceTo(game.playerEyeRay().origin) > 0.8);
  }));
test("Escape and hidden tabs stop the rest clock; inventory/chat panels continue it; Shift exits even in a panel", () =>
  browser((doc) => {
    const { game } = fixture();
    game.beginRest(23, 50, 23);
    game.updateRest(4);
    assert.equal(game.rest?.elapsed, 4);
    game.active = false;
    game.pauseReason = "pause";
    game.updateRest(20);
    assert.equal(game.rest?.elapsed, 4);
    game.pauseReason = "inventory";
    game.updateRest(2);
    assert.equal(game.rest?.elapsed, 6);
    game.pauseReason = "chat";
    game.updateRest(1);
    assert.equal(game.rest?.elapsed, 7);
    doc.hidden = true;
    game.updateRest(10);
    assert.equal(game.rest?.elapsed, 7);
    doc.hidden = false;
    game.settings.bindings.sneak = "KeyC";
    game.keyDown(key("KeyC", { matches: () => true }));
    assert(game.rest, "Typing in an input must not wake the player");
    game.keyDown(key("KeyC"));
    assert.equal(game.rest, null);
    assert(!game.collision(game.position));
    assert.equal(game.velocity.length(), 0);
    game.active = true;
    game.beginRest(23, 50, 23);
    assert.equal(
      (game.rest as BedRest | null)?.elapsed,
      0,
      "Leaving resets the next uninterrupted interval",
    );
  }));
test("A frozen night becomes a persistent morning after ten seconds without forcing the player to stand", () =>
  browser(() => {
    const { game } = fixture();
    game.settings.dayCycle = false;
    game.settings.timeOfDay = 70;
    game.clock = 420;
    game.beginRest(23, 50, 23);
    game.updateRest(10);
    assert(game.rest?.nightSkipped);
    assert.equal(game.settings.timeOfDay, 15);
    game.clock = Math.floor(game.clock / 600) * 600 + game.settings.timeOfDay * 6;
    assert(!isBedNight(game.clock));
    assert(game.rest);
    assert.equal(game.rest.elapsed, 10);
  }));
test("Ten real seconds remain ten at 10 FPS despite the 45ms physics cap, with no hidden-tab or pause catch-up", () =>
  browser((doc) => {
    const { game, notices } = fixture();
    game.settings.bindings.sneak = "KeyC";
    game.beginRest(23, 50, 23);
    game.resetRestFrame(0);
    for (let i = 1; i <= 50; i++) game.updateRest(0.045, i * 100);
    assert(Math.abs(game.rest!.elapsed - 5) < 1e-8);
    assert(!game.rest!.nightSkipped);
    game.active = false;
    game.pauseReason = "pause";
    game.updateRest(0.045, 15000);
    assert(Math.abs(game.rest!.elapsed - 5) < 1e-8);
    game.active = true;
    doc.hidden = true;
    game.updateRest(0.045, 30000);
    doc.hidden = false;
    game.resetRestFrame(100000); // The visibilitychange listener resets the monotonic baseline on return.
    for (let i = 1; i <= 49; i++) game.updateRest(0.045, 100000 + i * 100);
    assert(!game.rest!.nightSkipped);
    game.updateRest(0.045, 105000);
    assert.equal(game.rest!.elapsed, 10);
    assert(game.rest!.nightSkipped);
    assert(notices[0].includes("C: wstań"));
    assert(notices.at(-1)!.includes("C, aby wstać"));
  }));
test("Destroying either half cancels rest and finds supported clearance instead of leaving a floating player", () =>
  browser(() => {
    const { game, world } = fixture();
    game.beginRest(23, 50, 23);
    const rest = game.rest!;
    const exit = bedRestExit(world, rest)!;
    assert(exit);
    world.set(...rest.head, 0);
    game.updateRest(0.05);
    assert.equal(game.rest, null);
    assert(!game.collision(game.position));
    assert(world.solid(game.position.x, game.position.y - 0.01, game.position.z));
  }));
test("Rest exit rejects water, lava and low ceilings and can use another supported side", () => {
  const { world } = fixture(),
    rest = resolveBedRest(world, 23, 50, 23)!;
  const a = bedRestExit(world, rest)!;
  world.set(Math.floor(a[0]), 50, Math.floor(a[2]), 7);
  const b = bedRestExit(world, rest)!;
  assert.notDeepEqual(a, b);
  world.set(Math.floor(b[0]), 51, Math.floor(b[2]), 3);
  const c = bedRestExit(world, rest)!;
  assert.notDeepEqual(b, c);
  assert.equal(world.get(c[0], c[1], c[2]), 0);
  assert(world.solid(c[0], c[1] - 0.01, c[2]));
});
test("Authoritative rest updates preserve camera angles and server end state never sends a second leave command", () =>
  browser(() => {
    const { game, world } = fixture();
    const state = resolveBedRest(world, 23, 50, 23)!;
    let requests = 0;
    game.net = {
      endRest() {
        requests++;
      },
    } as any;
    game.applyRestState(state);
    game.yaw = 0.9;
    game.pitch = -0.1;
    game.applyRestState({ ...state, elapsed: 6 });
    assert.equal(game.yaw, 0.9);
    assert.equal(game.pitch, -0.1);
    assert.equal(game.rest?.elapsed, 6);
    game.endRest();
    assert.equal(requests, 1);
    assert(game.rest, "Keep the pose until the server supplies a safe exit");
    game.applyRestState(null, [25.5, 50, 23.5]);
    assert.equal(requests, 1);
    assert.equal(game.rest, null);
    assert.deepEqual(game.position.toArray(), [25.5, 50, 23.5]);
    game.applyRestState(null, [24.5, 50, 23.5]);
    assert.deepEqual(
      game.position.toArray(),
      [24.5, 50, 23.5],
      "Respawn ACK still applies when no rest was active",
    );
    assert.equal(
      game.beginRest(23, 50, 23),
      false,
      "Online rest cannot start locally before server approval",
    );
  }));
test("SP bed clicks take priority over held tools, repeated requests keep the same interval, and death clears the resting pose", () =>
  browser(() => {
    const { game } = fixture();
    game.hotbar = [123];
    game.target = { x: 23, y: 50, z: 23, px: 23, py: 51, pz: 23, id: 190, distance: 2 };
    game.interact();
    assert(game.rest);
    game.updateRest(3);
    game.beginRest(23, 50, 23);
    assert.equal(game.rest.elapsed, 3);
    Object.assign(game, {
      health: 0,
      deathHandled: false,
      inventory: {},
      pack: { reset() {} },
      drops: { spawn() {} },
      syncPack() {},
      resetHorrorHunt() {},
      pause(reason: string) {
        assert.equal(reason, "death");
      },
    });
    game.finishDeath();
    assert.equal(game.rest, null);
    assert.equal((game as any).deathHandled, true);
    assert(!game.collision(game.position));
  }));
