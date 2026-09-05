import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
import * as THREE from "three";
import { Game } from "../lib/engine";
import { DEFAULT_BINDINGS, DEFAULT_SETTINGS, type Action } from "../lib/settings";
import { SkinModel } from "../lib/skin-model";
import { InventoryPack } from "../lib/inventory";
import { cubeGeo, mat } from "../lib/entities";

// Use the actual class-field event handler while avoiding a browser/WebGL constructor.
const source = ts.createSourceFile(
  "engine.ts",
  readFileSync(new URL("../lib/engine.ts", import.meta.url), "utf8"),
  ts.ScriptTarget.Latest,
  true,
);
const gameClass = source.statements.find(
  (node): node is ts.ClassDeclaration => ts.isClassDeclaration(node) && node.name?.text === "Game",
)!;
const keyDown = gameClass.members.find(
  (node): node is ts.PropertyDeclaration =>
    ts.isPropertyDeclaration(node) && node.name.getText(source) === "keyDown",
)!;
assert(keyDown.initializer, "The engine must expose its real keyDown event handler");
const bindCode = ts.transpileModule(
  "function bind(){this.keyDown=" + keyDown.initializer.getText(source) + ";}",
  {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  },
).outputText;
const bindKeys = new Function("DEFAULT_BINDINGS", bindCode + ";return bind;")(DEFAULT_BINDINGS) as (
  this: Game,
) => void;

function keyFixture(reason = "inventory") {
  const game = Object.create(Game.prototype) as Game;
  let resumes = 0;
  const pauses: string[] = [];
  Object.assign(game, {
    active: false,
    started: true,
    preview: false,
    health: 20,
    pauseReason: reason,
    settings: structuredClone(DEFAULT_SETTINGS),
    keys: new Set<string>(),
    resume() {
      resumes++;
      game.active = true;
      game.pauseReason = "";
    },
    pause(panel = "pause") {
      pauses.push(panel);
      game.active = false;
      game.pauseReason = panel;
    },
  });
  bindKeys.call(game);
  function press(
    code: string,
    options: { repeat?: boolean; typing?: "input" | "textarea" | "select" | "editable" } = {},
  ) {
    let prevented = 0;
    let stopped = 0;
    game.keyDown({
      code,
      repeat: !!options.repeat,
      target: {
        matches: () => !!options.typing && options.typing !== "editable",
        closest: () => (options.typing === "editable" ? {} : null),
      },
      preventDefault: () => prevented++,
      stopPropagation: () => stopped++,
    } as unknown as KeyboardEvent);
    return { prevented, stopped };
  }
  return {
    game,
    press,
    pauses,
    get resumes() {
      return resumes;
    },
  };
}

test("E, J, M and H close their own paused panels; E also closes crafting and a chest", () => {
  for (const [reason, code] of [
    ["inventory", "KeyE"],
    ["journal", "KeyJ"],
    ["dimensions", "KeyM"],
    ["help", "KeyH"],
    ["crafting", "KeyE"],
    ["chest", "KeyE"],
  ]) {
    const f = keyFixture(reason);
    const event = f.press(code);
    assert.equal(f.resumes, 1, reason);
    assert.equal(f.game.active, true, reason);
    assert.equal(f.game.pauseReason, "", reason);
    assert.deepEqual(event, { prevented: 1, stopped: 1 });
  }
});

test("Paused panels honor remapped bindings and a missing custom value falls back safely", () => {
  for (const action of ["inventory", "journal", "dimensions", "help"] as Action[]) {
    const f = keyFixture(action);
    f.game.settings.bindings[action] = "KeyI";
    f.press(DEFAULT_BINDINGS[action]);
    assert.equal(f.resumes, 0);
    f.press("KeyI");
    assert.equal(f.resumes, 1);
  }
  const fallback = keyFixture();
  (fallback.game.settings.bindings as Partial<typeof DEFAULT_BINDINGS>).inventory = undefined;
  assert.doesNotThrow(() => fallback.press("KeyE"));
  assert.equal(fallback.resumes, 1);
});

test("Paused hotkeys ignore typing, repeated keys, unrelated panels, the title screen and death", () => {
  for (const typing of ["input", "textarea", "select", "editable"] as const) {
    const f = keyFixture();
    assert.deepEqual(f.press("KeyE", { typing }), { prevented: 0, stopped: 0 });
    f.press("Escape", { typing });
    assert.equal(f.resumes, 0, typing);
  }
  const repeated = keyFixture();
  repeated.press("KeyE", { repeat: true });
  repeated.press("Escape", { repeat: true });
  assert.equal(repeated.resumes, 0);
  const other = keyFixture("help");
  other.press("KeyE");
  assert.equal(other.resumes, 0);
  for (const state of [{ started: false }, { preview: true }, { health: 0 }, { health: -1 }]) {
    const f = keyFixture();
    Object.assign(f.game, state);
    f.press("KeyE");
    f.press("Escape");
    assert.equal(f.resumes, 0, JSON.stringify(state));
  }
});

test("Escape resumes an open panel and pauses active play without a browser pointer-lock event", () => {
  const paused = keyFixture("settings");
  assert.deepEqual(paused.press("Escape"), { prevented: 1, stopped: 1 });
  assert.equal(paused.resumes, 1);
  assert.deepEqual(paused.press("Escape"), { prevented: 1, stopped: 1 });
  assert.deepEqual(paused.pauses, ["pause"]);
  assert.equal(paused.game.active, false);
});

test("Third-person attack raises the wrist, strikes forward and downward, then restores the pose", () => {
  const skin = new SkinModel({
    skin: { width: 64, height: 64 } as HTMLCanvasElement,
    cape: { width: 64, height: 32 } as HTMLCanvasElement,
    capeEnabled: false,
  });
  const wrist = () => {
    skin.group.updateMatrixWorld(true);
    return skin.joints.armR.localToWorld(new THREE.Vector3(0, -11 / 16, 0));
  };
  try {
    skin.pose(0);
    const idle = wrist();
    skin.pose(0, false, false, 0.22);
    const raised = wrist();
    skin.pose(0, false, false, 0.45);
    const striking = wrist();
    assert(raised.y > idle.y + 0.6, "Wind-up raises the arm above its idle position");
    assert(striking.z > idle.z + 0.35, "Strike extends into the model forward direction");
    assert(striking.y < raised.y - 0.4, "Strike moves from above downwards");
    assert(Math.abs(skin.joints.body.rotation.y) > 0.05, "Torso participates in the swing");
    skin.pose(0, false, false, 1);
    assert(wrist().distanceTo(idle) < 1e-8, "Recovery reaches the neutral arm position");
    skin.pose(0, false, false, 0.4);
    skin.pose(0);
    assert(wrist().distanceTo(idle) < 1e-8);
    assert(Math.abs(skin.joints.armR.rotation.x) < 1e-8);
    assert.equal(skin.joints.armR.rotation.y, 0);
    assert.equal(skin.joints.armR.rotation.z, 0);
    assert.equal(skin.joints.body.rotation.y, 0);
  } finally {
    skin.dispose();
  }
});

test("Crystal cleanup releases line GPU resources once and preserves shared entity cubes", () => {
  const game = Object.create(Game.prototype) as Game;
  const scene = new THREE.Scene();
  const group = new THREE.Group();
  const sharedMaterial = mat("#c5a7ef", true);
  const sharedCube = new THREE.Mesh(cubeGeo, sharedMaterial);
  const otherCube = new THREE.Mesh(cubeGeo, sharedMaterial);
  group.add(sharedCube);
  scene.add(group, otherCube);
  const lineGeometry = new THREE.EdgesGeometry(cubeGeo);
  const materials = [new THREE.LineBasicMaterial(), new THREE.LineBasicMaterial()];
  const cage = new THREE.LineSegments(lineGeometry, materials);
  const nested = new THREE.Group();
  nested.add(cage);
  group.add(nested);
  const light = new THREE.PointLight();
  group.add(light);
  const counts = {
    line: 0,
    material0: 0,
    material1: 0,
    light: 0,
    sharedGeometry: 0,
    sharedMaterial: 0,
  };
  lineGeometry.addEventListener("dispose", () => counts.line++);
  materials.forEach((material, index) =>
    material.addEventListener("dispose", () => {
      if (index) counts.material1++;
      else counts.material0++;
    }),
  );
  const geometryDispose = () => counts.sharedGeometry++;
  const materialDispose = () => counts.sharedMaterial++;
  cubeGeo.addEventListener("dispose", geometryDispose);
  sharedMaterial.addEventListener("dispose", materialDispose);
  const disposeLight = light.dispose;
  light.dispose = () => {
    counts.light++;
    disposeLight.call(light);
  };
  try {
    const crystal = { mesh: group, index: 2, alive: true };
    game.releaseCrystal(crystal);
    game.releaseCrystal(crystal);
    assert.equal(crystal.alive, false);
    assert.equal(group.parent, null);
    assert.equal(group.children.length, 0);
    assert.equal(otherCube.parent, scene);
    assert.deepEqual(counts, {
      line: 1,
      material0: 1,
      material1: 1,
      light: 1,
      sharedGeometry: 0,
      sharedMaterial: 0,
    });
  } finally {
    cubeGeo.removeEventListener("dispose", geometryDispose);
    sharedMaterial.removeEventListener("dispose", materialDispose);
  }
});

test("Closing online crafting delegates settlement and leaves local slots untouched until acknowledged", () => {
  const game = Object.create(Game.prototype) as Game;
  const pack = new InventoryPack();
  pack.size = 3;
  pack.grid[0] = { id: 8, n: 4 };
  pack.cursor = { id: 111, n: 2 };
  const before = structuredClone({
    slots: pack.slots,
    grid: pack.grid,
    cursor: pack.cursor,
    size: pack.size,
  });
  const requested: number[] = [];
  Object.assign(game, {
    pack,
    net: { settleInventory: (size: number) => requested.push(size) },
    inventory: pack.counts(),
    hotbar: Array(9).fill(0),
    drops: { spawn: () => assert.fail("The client must not spawn a duplicate inventory overflow") },
  });
  game.returnCraftItems(3);
  game.returnCraftItems();
  assert.deepEqual(requested, [3, 2]);
  assert.deepEqual(
    { slots: pack.slots, grid: pack.grid, cursor: pack.cursor, size: pack.size },
    before,
  );
});
