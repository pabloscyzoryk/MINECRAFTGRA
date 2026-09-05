import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { Game } from "../lib/engine";
import { InventoryPack } from "../lib/inventory";
import { applyInventoryGesture } from "../lib/inventory-gestures";
import { slotReleaseKind } from "../hooks/slot-gesture-state";

const source = ts.createSourceFile(
  "engine.ts",
  readFileSync(new URL("../lib/engine.ts", import.meta.url), "utf8"),
  ts.ScriptTarget.Latest,
  true,
);
const cls = source.statements.find(
  (n): n is ts.ClassDeclaration => ts.isClassDeclaration(n) && n.name?.text === "Game",
)!;
function compile(text: string, dependencies: Record<string, unknown> = {}) {
  const code = ts.transpileModule(text, {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText;
  return new Function(...Object.keys(dependencies), code)(...Object.values(dependencies));
}
function game() {
  const g = Object.create(Game.prototype) as Game;
  const fields = cls.members.filter(
    (n): n is ts.PropertyDeclaration =>
      ts.isPropertyDeclaration(n) && ["mouseDown", "contextMenu"].includes(n.name.getText(source)),
  );
  const bind = compile(
    "return function(){" +
      fields
        .map((n) => "this." + n.name.getText(source) + "=" + n.initializer!.getText(source) + ";")
        .join("") +
      "};",
  );
  bind.call(g);
  Object.assign(g, {
    active: true,
    canvas: {},
    canvasContextUntil: 0,
    settings: { swapMouse: false },
    interact() {
      g.active = false;
    },
    attack() {},
    capturePointer() {},
  });
  return g;
}
function target(area: "game" | "dialog" | "inventory" | "outside", editable = false) {
  return {
    closest(selector: string) {
      if (selector.startsWith("input")) return editable ? this : null;
      const className =
        area === "game"
          ? ".game-root"
          : area === "dialog"
            ? ".game-dialog"
            : area === "inventory"
              ? ".mc-inventory"
              : ".external-page";
      return selector.includes(className) ? this : null;
    },
  };
}
function context(where: unknown) {
  const e = new Event("contextmenu", { cancelable: true, bubbles: true });
  Object.defineProperty(e, "target", { value: where });
  return e;
}
function rightDown(g: Game) {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "document");
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: { pointerLockElement: g.canvas },
  });
  try {
    g.mouseDown({ button: 2, preventDefault() {} } as MouseEvent);
  } finally {
    if (previous) Object.defineProperty(globalThis, "document", previous);
    else Reflect.deleteProperty(globalThis, "document");
  }
}

test("The same canvas right-click stays suppressed after opening a dialog and being retargeted to its input or body", () => {
  for (const retarget of [target("dialog"), target("dialog", true), target("outside"), null]) {
    const g = game();
    rightDown(g);
    assert.equal(g.active, false, "The interaction opened a paused container");
    const e = context(retarget);
    g.contextMenu(e);
    assert(e.defaultPrevented);
    assert.equal(g.canvasContextUntil, 0, "Origin latch is consumed once");
    const paste = context(target("dialog", true));
    g.contextMenu(paste);
    assert.equal(paste.defaultPrevented, false, "A later intentional input menu must work");
  }
});

test("Paused inventory and dialog surfaces suppress Chrome's menu without stopping event propagation", () => {
  const g = game();
  g.active = false;
  for (const area of ["game", "dialog", "inventory"] as const) {
    const e = context(target(area));
    let stopped = false;
    e.stopPropagation = e.stopImmediatePropagation = () => {
      stopped = true;
    };
    g.contextMenu(e);
    assert(e.defaultPrevented);
    assert.equal(stopped, false);
  }
});

test("Normal paste menus in editable fields and unrelated page areas are preserved", () => {
  const g = game();
  for (const where of [
    target("dialog", true),
    target("game", true),
    target("outside"),
    target("outside", true),
  ]) {
    const e = context(where);
    g.contextMenu(e);
    assert.equal(e.defaultPrevented, false);
  }
  g.canvasContextUntil = performance.now() - 1;
  const expired = context(target("outside", true));
  g.contextMenu(expired);
  assert.equal(
    expired.defaultPrevented,
    false,
    "An unconsumed old click cannot suppress future paste",
  );
  assert.equal(g.canvasContextUntil, 0);
});

test("Right-click used to recapture the canvas is also consumed if Chrome retargets it", () => {
  const g = game();
  const previous = Object.getOwnPropertyDescriptor(globalThis, "document");
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: { pointerLockElement: null },
  });
  let captures = 0;
  g.capturePointer = () => {
    captures++;
  };
  try {
    g.mouseDown({ button: 2, preventDefault() {} } as MouseEvent);
  } finally {
    if (previous) Object.defineProperty(globalThis, "document", previous);
    else Reflect.deleteProperty(globalThis, "document");
  }
  const e = context(target("outside"));
  g.contextMenu(e);
  assert.equal(captures, 1);
  assert(e.defaultPrevented);
});

test("Inventory's actual right-button release still splits a stack after document contextmenu cancellation", () => {
  const g = game();
  g.active = false;
  const pack = new InventoryPack();
  pack.slots[9] = { id: 8, n: 9 };
  const slot = { area: "slots" as const, index: 9 };
  const event = context(target("inventory"));
  g.contextMenu(event);
  assert(event.defaultPrevented);
  const hook = ts.createSourceFile(
    "hook.ts",
    readFileSync(new URL("../hooks/use-slot-gestures.ts", import.meta.url), "utf8"),
    ts.ScriptTarget.Latest,
    true,
  );
  let up: ts.VariableDeclaration | undefined;
  const visit = (node: ts.Node) => {
    if (ts.isVariableDeclaration(node) && node.name.getText(hook) === "up") up = node;
    ts.forEachChild(node, visit);
  };
  visit(hook);
  assert(up?.initializer);
  const press = {
    current: { id: 1, button: 2, slot, mode: "pending", pointerType: "mouse", quick: false } as any,
  };
  const release = compile("return " + up.initializer.getText(hook) + ";", {
    press,
    positionRef: { current: null },
    setPosition() {},
    advance() {},
    targetAt: () => slot,
    slotReleaseKind,
    clicks: { current: { reset() {} } },
    latest: { current: { dispatch: (action: any) => applyInventoryGesture(pack, action) } },
    release() {
      press.current = null;
    },
  });
  release({
    pointerId: 1,
    button: 2,
    pointerType: "mouse",
    clientX: 50,
    clientY: 50,
    cancelable: true,
    preventDefault() {},
  });
  assert.deepEqual(pack.cursor, { id: 8, n: 5 });
  assert.deepEqual(pack.slots[9], { id: 8, n: 4 });
});

test("A single document capture listener is installed and removed with the Game", () => {
  const calls: { method: string; receiver: string; capture: string }[] = [];
  const visit = (node: ts.Node) => {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      ["addEventListener", "removeEventListener"].includes(node.expression.name.text) &&
      ts.isStringLiteral(node.arguments[0]) &&
      node.arguments[0].text === "contextmenu"
    )
      calls.push({
        method: node.expression.name.text,
        receiver: node.expression.expression.getText(source),
        capture: node.arguments[2]?.getText(source) ?? "false",
      });
    ts.forEachChild(node, visit);
  };
  visit(source);
  assert.deepEqual(calls, [
    { method: "addEventListener", receiver: "document", capture: "true" },
    { method: "removeEventListener", receiver: "document", capture: "true" },
  ]);
});
