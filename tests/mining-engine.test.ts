import test from "node:test";
import assert from "node:assert/strict";
import { Game } from "../lib/engine";
import { miningDuration } from "../lib/mining";
import { DEFAULT_SETTINGS } from "../lib/settings";
import { readFileSync } from "node:fs";
import ts from "typescript";

function fixture(id: number, held = 0) {
  const g = Object.create(Game.prototype) as Game;
  const drops: { id: number; n: number }[] = [],
    notices: string[] = [];
  let removed = 0,
    special = 0;
  Object.assign(g, {
    hotbar: [held],
    selected: 0,
    mode: "survival",
    settings: { ...DEFAULT_SETTINGS },
    net: null,
    mining: 0,
    mineKey: "",
    mined: 0,
    xp: 0,
    target: { id, x: 3, y: 5, z: 3 },
    attack: () => false,
    world: {
      set() {
        removed++;
      },
    },
    adventure: {
      mineSpecial() {
        special++;
        return false;
      },
    },
    add(id: number, n = 1) {
      drops.push({ id, n });
    },
    notify(s: string) {
      notices.push(s);
    },
    burst() {},
    audio: { play() {} },
    emit() {},
  });
  return {
    g,
    drops,
    notices,
    get removed() {
      return removed;
    },
    get special() {
      return special;
    },
  };
}
test("Instant plants break on a zero-dt click; protected fluids/floor never do", () => {
  const f = fixture(66);
  f.g.mine(0);
  assert.equal(f.removed, 1);
  assert(Number.isFinite(f.g.mining));
  for (const id of [0, 7, 13, 15, 18]) {
    const p = fixture(id);
    p.g.mine(10000);
    assert.equal(p.removed, 0);
  }
  const bedrock = fixture(35, 103);
  bedrock.g.target!.y = 0;
  bedrock.g.mine(10000);
  assert.equal(bedrock.removed, 0);
  const basalt = fixture(35, 103);
  basalt.g.mine(miningDuration(35, 103));
  assert.equal(basalt.removed, 1);
});
test("The actual mouse-down handler harvests an instant plant before the next rendered frame", () => {
  const source = ts.createSourceFile(
    "engine.ts",
    readFileSync(new URL("../lib/engine.ts", import.meta.url), "utf8"),
    ts.ScriptTarget.Latest,
    true,
  );
  const cls = source.statements.find(
    (n): n is ts.ClassDeclaration => ts.isClassDeclaration(n) && n.name?.text === "Game",
  )!;
  const prop = cls.members.find(
    (n): n is ts.PropertyDeclaration =>
      ts.isPropertyDeclaration(n) && n.name.getText(source) === "mouseDown",
  )!;
  const code = ts.transpileModule(
    "function bind(){this.mouseDown=" + prop.initializer!.getText(source) + "}",
    { compilerOptions: { target: ts.ScriptTarget.ES2022 } },
  ).outputText;
  const f = fixture(66);
  Object.assign(f.g, { active: true, canvas: {}, settings: { swapMouse: false } });
  new Function("miningDuration", code + ";return bind;")(miningDuration).call(f.g);
  const old = Object.getOwnPropertyDescriptor(globalThis, "document");
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: { pointerLockElement: f.g.canvas },
  });
  try {
    f.g.mouseDown({ button: 0, preventDefault() {} } as MouseEvent);
    assert.equal(f.removed, 1);
  } finally {
    if (old) Object.defineProperty(globalThis, "document", old);
    else Reflect.deleteProperty(globalThis, "document");
  }
});
test("Changing tools clears accumulated work and supplies one relevant hint per target/tool", () => {
  const f = fixture(12, 0);
  f.g.mine(100);
  assert.equal(f.notices.length, 1);
  assert(f.g.mining > 0);
  f.g.mine(1);
  assert.equal(f.notices.length, 1);
  f.g.hotbar[0] = 103;
  f.g.mine(0);
  assert.equal(f.g.mining, 0);
  assert.equal(f.removed, 0);
  f.g.mine(miningDuration(12, 103));
  assert.equal(f.removed, 1);
  assert.deepEqual(f.drops, [{ id: 12, n: 1 }]);
});
test("Wrong tools can break a hard block slowly but cannot duplicate its drop or XP", () => {
  const f = fixture(12, 0);
  f.g.mine(miningDuration(12, 0));
  assert.equal(f.removed, 1);
  assert.equal(f.g.xp, 0);
  assert.deepEqual(f.drops, []);
  const furnace = fixture(29, 0);
  furnace.g.mine(miningDuration(29, 0));
  assert.equal(furnace.special, 1, "Container contents settle even if its block is unharvestable");
  assert.deepEqual(furnace.drops, []);
});
