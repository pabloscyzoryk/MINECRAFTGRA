const fs = require("node:fs"),
  path = require("node:path"),
  assert = require("node:assert/strict");
const project = path.resolve(__dirname, ".."),
  out = path.resolve(__dirname, "../.test-build");
process.env.NODE_PATH = path.join(project, "node_modules");
require("node:module").Module._initPaths();
const ts = require(path.join(project, "node_modules/typescript"));
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, "package.json"), JSON.stringify({ type: "commonjs" }));
for (const file of fs
  .readdirSync(path.join(project, "lib"))
  .filter((f) => /\.tsx?$/.test(f) && f !== "utils.ts")) {
  const source = fs.readFileSync(path.join(project, "lib", file), "utf8");
  fs.writeFileSync(
    path.join(out, file.replace(/\.tsx?$/, ".js")),
    ts.transpileModule(source, {
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.CommonJS,
        esModuleInterop: true,
        jsx: ts.JsxEmit.ReactJSX,
      },
    }).outputText,
  );
}
const { World } = require("../.test-build/world"),
  { FluidSystem } = require("../.test-build/fluid"),
  { Game } = require("../.test-build/engine"),
  { DEFAULT_SETTINGS, DEFAULT_BINDINGS } = require("../.test-build/settings"),
  { RECIPES } = require("../.test-build/blocks"),
  { faceRect, PARTS } = require("../.test-build/skin-model"),
  THREE = require("three");
let passed = 0;
globalThis.window = { matchMedia: () => ({ matches: false }) };
function test(name, fn) {
  fn();
  console.log("PASS " + name);
  passed++;
}
function waterWorld() {
  const w = new World(24680);
  for (let cx = -1; cx <= 2; cx++) for (let cz = -1; cz <= 2; cz++) w.chunk(cx, cz);
  for (let x = -4; x <= 24; x++) for (let z = -4; z <= 24; z++) w.set(x, 50, z, 3);
  const f = new FluidSystem(w);
  return { w, f };
}
function settle(f) {
  for (let i = 0; i < 180 && f.queue.size; i++) f.step(5000);
  assert.equal(f.queue.size, 0, "fluid should settle");
}
test("Deterministic chunks and seed variation", () => {
  const a = new World(42),
    b = new World(42),
    c = new World(43);
  assert.deepEqual(a.chunk(3, 2).data, b.chunk(3, 2).data);
  assert.notDeepEqual(a.chunk(3, 2).data, c.chunk(3, 2).data);
});
test("All three dimensions contain reachable portal structures", () => {
  const w = new World();
  for (const [d, x, z, id] of [
    ["overworld", 20, -15, 18],
    ["nether", 0, 5, 13],
    ["nether", 17, 6, 18],
  ]) {
    w.switch(d);
    w.chunk(Math.floor(x / 16), Math.floor(z / 16));
    const y = w.height(x, z) + 2;
    assert.equal(w.get(x, y, z), id, d + " portal");
  }
  w.switch("end");
  w.chunk(0, 0);
  assert.equal(w.get(0, 19, 0), 18);
});
test("Source spreads seven cells with diminishing water levels", () => {
  const { w, f } = waterWorld();
  w.set(8, 51, 8, 7);
  settle(f);
  assert.equal(f.level(8, 51, 8), 0);
  for (let n = 1; n <= 7; n++) assert.equal(f.level(8 + n, 51, 8), n);
  assert.equal(w.get(16, 51, 8), 0);
});
test("Waterfalls descend and spread when they reach the floor", () => {
  const { w, f } = waterWorld();
  w.set(8, 55, 8, 7);
  settle(f);
  for (let y = 51; y < 55; y++) assert.equal(f.level(8, y, 8), 8);
  assert.equal(f.level(9, 51, 8), 1);
  assert.equal(w.get(9, 54, 8), 0);
});
test("Flow drains completely after its only source is removed", () => {
  const { w, f } = waterWorld();
  w.set(8, 51, 8, 7);
  settle(f);
  w.set(8, 51, 8, 0);
  settle(f);
  for (let x = 0; x < 17; x++)
    for (let z = 0; z < 17; z++) assert.notEqual(w.get(x, 51, z), 7, `water remains at ${x},${z}`);
});
test("Placed blocks obstruct water; removing them restores flow", () => {
  const { w, f } = waterWorld();
  w.set(8, 51, 8, 7);
  settle(f);
  w.set(9, 51, 8, 3);
  settle(f);
  assert.equal(w.get(9, 51, 8), 3);
  w.set(9, 51, 8, 0);
  settle(f);
  assert.equal(f.level(9, 51, 8), 1);
});
test("Two sources create a renewable source and water cools lava", () => {
  const { w, f } = waterWorld();
  w.set(8, 51, 8, 7);
  w.set(10, 51, 8, 7);
  w.set(8, 51, 9, 15);
  settle(f);
  assert.equal(f.level(9, 51, 8), 0);
  assert.equal(w.get(8, 51, 9), 12);
});
function stubGame(w = new World()) {
  const g = Object.create(Game.prototype);
  Object.assign(g, {
    world: w,
    mobs: [],
    scene: new THREE.Scene(),
    settings: { ...DEFAULT_SETTINGS, bindings: { ...DEFAULT_BINDINGS } },
    keys: new Set(),
    mode: "survival",
    active: true,
    started: true,
    health: 20,
    food: 20,
    xp: 0,
    inventory: { 8: 2 },
    hotbar: [8, 9, 1, 2, 3, 4, 5, 6, 7],
    selected: 0,
    audio: { play() {}, enable() {} },
    emit() {
      this.syncPack();
    },
    notify() {},
    position: new THREE.Vector3(8.5, 51, 8.5),
    velocity: new THREE.Vector3(),
    camera: new THREE.PerspectiveCamera(),
    sun: new THREE.DirectionalLight(),
    torch: new THREE.PointLight(),
    avatar: null,
    perspective: 0,
    grounded: true,
    flying: false,
    crouching: false,
    sprinting: false,
    lastForward: -1000,
    lastSpace: -1000,
    yaw: 0,
    pitch: 0,
    clock: 90,
    stepTimer: 0,
    hungerTimer: 0,
    eyeHeight: 1.62,
    oxygen: 20,
    wasInWater: false,
    damageTimer: 0,
    damage(n) {
      this.health -= n;
    },
  });
  g.pack = new (require("../.test-build/inventory").InventoryPack)();
  g.scene = new THREE.Scene();
  g.hand = new THREE.Group();
  g.drops = new (require("../.test-build/interaction-effects").DroppedItems)(g);
  g.pack.reconcile(g.inventory);
  g.adventure = new (require("../.test-build/adventure").Adventure)(g);
  g.mined = 0;
  g.placed = 0;
  g.visited = ["overworld"];
  g.fluid = new FluidSystem(w);
  const source = ts.createSourceFile(
    "engine.ts",
    fs.readFileSync(path.join(project, "lib/engine.ts"), "utf8"),
    ts.ScriptTarget.Latest,
    true,
  );
  const cls = source.statements.find((n) => ts.isClassDeclaration(n) && n.name.text === "Game");
  const fields = cls.members.filter(
    (n) => ts.isPropertyDeclaration(n) && ["keyDown", "keyUp"].includes(n.name.getText(source)),
  );
  const body =
    "function bind(){" +
    fields
      .map((n) => "this." + n.name.getText(source) + "=" + n.initializer.getText(source) + ";")
      .join("") +
    "}";
  const code = ts.transpileModule(body, {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText;
  new Function(code + ";return bind;")().call(g);
  return g;
}
const event = (code) => ({
  code,
  repeat: false,
  preventDefault() {},
  target: { matches: () => false },
});
test("Double forward starts sprint, release stops it, Shift crouches", () => {
  const g = stubGame();
  g.keyDown(event("KeyW"));
  assert.equal(g.sprinting, false);
  g.keyUp(event("KeyW"));
  g.keyDown(event("KeyW"));
  assert.equal(g.sprinting, true);
  g.keyUp(event("KeyW"));
  assert.equal(g.sprinting, false);
  g.keyDown(event("ShiftLeft"));
  assert(g.keys.has("ShiftLeft"));
  g.keyUp(event("ShiftLeft"));
  assert(!g.keys.has("ShiftLeft"));
});
test("Custom movement bindings replace the original key", () => {
  const g = stubGame();
  g.settings.bindings.forward = "KeyZ";
  g.keyDown(event("KeyW"));
  assert(!g.keys.has("KeyW"));
  g.keyDown(event("KeyZ"));
  assert(g.keys.has("KeyW"));
  g.keyUp(event("KeyZ"));
  assert(!g.keys.has("KeyW"));
});
test("Crafting consumes exact inputs and rejects missing ingredients", () => {
  const g = stubGame(),
    index = RECIPES.findIndex((r) => r.out === 112 && r.need[0][0] === 8);
  assert.equal(g.craft(index), true);
  assert.equal(g.inventory[8] ?? 0, 0);
  assert.equal(g.inventory[112], 4);
  assert.equal(g.craft(index), false);
  assert.equal(g.inventory[112], 4);
});
test("Player collides with walls and remains on the floor", () => {
  const { w } = waterWorld();
  for (let x = 5; x < 12; x++) {
    w.set(x, 51, 6, 3);
    w.set(x, 52, 6, 3);
  }
  const g = stubGame(w);
  g.keys.add("KeyW");
  for (let i = 0; i < 180; i++) g.move(1 / 60);
  assert(g.position.z >= 7.28);
  assert(Math.abs(g.position.y - 51) < 0.03);
});
test("Crouching prevents walking off a block edge", () => {
  const w = new World();
  for (let cx = 0; cx < 2; cx++) for (let cz = 0; cz < 2; cz++) w.chunk(cx, cz);
  w.set(8, 50, 8, 3);
  const g = stubGame(w);
  g.keys.add("ShiftLeft");
  g.keys.add("KeyW");
  for (let i = 0; i < 120; i++) g.move(1 / 60);
  assert(g.position.z >= 8);
  assert(Math.abs(g.position.y - 51) < 0.03);
});
test("Swimming upward works and oxygen falls under water", () => {
  const { w } = waterWorld();
  for (let x = 7; x <= 9; x++)
    for (let z = 7; z <= 9; z++) for (let y = 51; y <= 56; y++) w.set(x, y, z, 7);
  const g = stubGame(w);
  g.keys.add("Space");
  for (let i = 0; i < 60; i++) g.move(1 / 60);
  assert(g.position.y > 53);
  assert(g.oxygen < 20);
});
test("Both skin layers and all cape faces fit their texture atlases", () => {
  for (const part of [...Object.keys(PARTS), "cape"])
    for (let layer = 0; layer < 2; layer++)
      for (const face of ["front", "back", "right", "left", "top", "bottom"]) {
        const [x, y, w, h] = faceRect(part, face, layer);
        assert(x >= 0 && x + w <= 64);
        assert(y >= 0 && y + h <= (part === "cape" ? 32 : 64));
      }
});
test("Shallow streams do not count air above their surface as water", () => {
  const { w, f } = waterWorld();
  w.set(8, 51, 8, 7);
  settle(f);
  assert(w.waterAt(15.5, 51.1, 8.5));
  assert(!w.waterAt(15.5, 51.5, 8.5));
});
test("Bucket takes a source and places water with correct inventory exchange", () => {
  const { w, f } = waterWorld();
  w.set(8, 51, 8, 7);
  const g = stubGame(w);
  g.fluid = f;
  g.inventory = { 114: 1 };
  g.hotbar[0] = 114;
  g.target = { x: 8, y: 51, z: 8, px: 8, py: 52, pz: 8, id: 7 };
  g.actionCooldown = 0;
  g.interact();
  assert.equal(w.get(8, 51, 8), 0);
  assert.equal(g.hotbar[0], 115);
  assert.equal(g.inventory[114] ?? 0, 0);
  assert.equal(g.inventory[115], 1);
  g.actionCooldown = 0;
  g.target = { x: 10, y: 50, z: 8, px: 10, py: 51, pz: 8, id: 3 };
  g.interact();
  assert.equal(w.get(10, 51, 8), 7);
  assert.equal(g.hotbar[0], 114);
  assert.equal(g.inventory[115] ?? 0, 0);
  assert.equal(g.inventory[114], 1);
});
test("Dragon crystals heal; zero crystals stop healing; victory is reachable", () => {
  const { Dragon } = require("../.test-build/entities");
  const d = new Dragon();
  d.hp = 100;
  d.update(1, 2, new THREE.Vector3(), () => {});
  assert(d.hp > 100);
  const hp = d.hp;
  d.update(1, 0, new THREE.Vector3(), () => {});
  assert.equal(d.hp, hp);
  const g = stubGame();
  g.dragon = d;
  g.won = false;
  g.burst = () => {};
  g.save = () => {};
  g.hitDragon(400);
  assert(g.won);
  assert.equal(g.dragon.hp, 0);
  assert.equal(g.xp, 500);
});
test("All fourteen biomes are reachable and contain a generated treasure chest", () => {
  const { BIOMES, findBiome } = require("../.test-build/biomes");
  const w = new World();
  for (const b of BIOMES) {
    const r = findBiome(b.id, w.seed, 0, 0);
    assert(r);
    assert.equal(w.biomeInfo(r.x, r.z).id, b.id);
    let chest = false;
    for (let cx = Math.floor((r.x - 16) / 16); cx <= Math.floor((r.x + 16) / 16); cx++)
      for (let cz = Math.floor((r.z - 16) / 16); cz <= Math.floor((r.z + 16) / 16); cz++)
        if (w.chunk(cx, cz).data.includes(61)) chest = true;
    assert(chest, b.name + " missing chest");
  }
});
test("Chests generate loot once and transfer stacks in both directions", () => {
  const g = stubGame();
  g.pause = () => {};
  g.world.chunk(0, 0);
  g.adventure.openChest(34, 18, -32);
  const d = g.adventure.data;
  assert.equal(d.opened, 1);
  const count = g.adventure.snapshot().chest[116];
  g.adventure.transfer(116, false);
  assert.equal(g.inventory[116], count);
  g.adventure.transfer(116, true);
  assert.equal(g.inventory[116], undefined);
  g.adventure.openChest(34, 18, -32);
  assert.equal(d.opened, 1);
  assert.equal(g.adventure.snapshot().chest[116], count);
  g.world.set(8, 51, 8, 61);
  g.adventure.openChest(8, 51, 8);
  assert.deepEqual(g.adventure.snapshot().chest, {});
});
test("Irrigated wheat grows in two stages and harvest returns seeds and food", () => {
  const { w } = waterWorld(),
    g = stubGame(w);
  g.inventory[116] = 1;
  w.set(8, 50, 8, 63);
  w.set(9, 50, 8, 7);
  g.adventure.plant(8, 51, 8);
  assert.equal(w.get(8, 51, 8), 64);
  for (let i = 0; i < 31; i++) g.adventure.tick(1);
  assert.equal(w.get(8, 51, 8), 65);
  for (let i = 0; i < 31; i++) g.adventure.tick(1);
  assert.equal(w.get(8, 51, 8), 66);
  g.adventure.mineSpecial(66, 8, 51, 8);
  assert.equal(g.inventory[117], 2);
  assert.equal(g.inventory[116], 3);
  assert.equal(g.adventure.data.harvested, 1);
});
test("Water washes away plants while retaining a stable flowing level", () => {
  const { w, f } = waterWorld();
  w.set(9, 51, 8, 68);
  w.set(8, 51, 8, 7);
  settle(f);
  assert.equal(w.get(9, 51, 8), 7);
  assert.equal(f.level(9, 51, 8), 1);
});
test("Mob attacks have a wind-up and death remains visible until fade finishes", () => {
  const { Mob } = require("../.test-build/entities");
  const { w } = waterWorld();
  const m = new Mob("zombie", 8.5, 8.5, w);
  let damage = 0;
  const p = new THREE.Vector3(8.5, 51, 7.3);
  m.update(
    0.1,
    0,
    p,
    w,
    (n) => (damage += n),
    () => {},
    () => {},
  );
  assert.equal(damage, 0);
  assert.equal(m.state, "attack");
  for (let i = 0; i < 5; i++)
    m.update(
      0.1,
      0,
      p,
      w,
      (n) => (damage += n),
      () => {},
      () => {},
    );
  assert(damage > 0);
  m.die();
  assert(m.group.visible);
  m.update(
    0.2,
    0,
    p,
    w,
    () => {},
    () => {},
    () => {},
  );
  assert(m.group.rotation.z > 0.1);
  assert(m.group.visible);
  for (let i = 0; i < 15; i++)
    m.update(
      0.1,
      0,
      p,
      w,
      () => {},
      () => {},
      () => {},
    );
  assert(!m.group.visible);
  m.dispose();
});
test("Every mob rig animates with finite transforms, including fox, frog and bee", () => {
  const { Mob, MOB_NAMES } = require("../.test-build/entities");
  const { w } = waterWorld();
  for (const kind of Object.keys(MOB_NAMES)) {
    const m = new Mob(kind, 8, 8, w);
    for (let i = 0; i < 180; i++)
      m.update(
        1 / 60,
        0,
        new THREE.Vector3(999, 60, 999),
        w,
        () => {},
        () => {},
        () => {},
      );
    m.group.traverse((o) => {
      assert(o.position.toArray().every(Number.isFinite));
      assert(o.scale.toArray().every(Number.isFinite));
      assert(o.rotation.toArray().slice(0, 3).every(Number.isFinite));
    });
    assert(m.skinMaterials.length > 0);
    m.dispose();
  }
});
test("Export retains a complete JSON snapshot when localStorage is unavailable", () => {
  const g = stubGame();
  global.localStorage = {
    setItem() {
      throw Error("disabled");
    },
  };
  g.save(false);
  assert(g.lastSaveJson.length > 10);
  const data = JSON.parse(g.lastSaveJson);
  assert.equal(data.adventure.harvested, 0);
  assert.equal(data.mode, "survival");
});
test("Every new block produces finite mesh vertices and valid atlas coordinates", () => {
  const { WorldRenderer } = require("../.test-build/renderer"),
    { BLOCKS } = require("../.test-build/blocks");
  const w = new World(),
    c = w.chunk(20, 20);
  c.data.fill(0);
  for (let id = 1; id < BLOCKS.length; id++)
    c.data[(id % 8) * 2 + Math.floor(id / 8) * 2 * 16 + 40 * 256] = id;
  const r = Object.create(WorldRenderer.prototype);
  Object.assign(r, {
    world: w,
    meshes: new Map(),
    scene: new THREE.Scene(),
    materials: Array.from({ length: 5 }, () => new THREE.MeshStandardMaterial()),
  });
  r.rebuild(c);
  let vertices = 0;
  r.scene.traverse((o) => {
    if (o.isMesh) {
      vertices += o.geometry.attributes.position.count;
      assert([...o.geometry.attributes.position.array].every(Number.isFinite));
      assert([...o.geometry.attributes.uv.array].every((n) => n >= 0 && n <= 1));
    }
  });
  assert(vertices > 86 * 8);
});
const { InventoryPack, GRID_RECIPES } = require("../.test-build/inventory");
test("Hotbar stacks can move into empty backpack cells and leave an empty hand", () => {
  const g = stubGame();
  g.moveSlot("slots", 0, "slots", 15);
  assert.equal(g.hotbar[0], 0);
  assert.equal(g.pack.slots[0], null);
  assert.deepEqual(g.pack.slots[15], { id: 8, n: 2 });
  assert.equal(g.inventory[8], 2);
  g.moveSlot("slots", 15, "slots", 7);
  assert.equal(g.pack.slots[15], null);
  assert.equal(g.hotbar[7], 8);
  g.select(0);
  assert.equal(g.hotbar[g.selected], 0);
});
test("Right click splits stacks and deposits one item without duplication", () => {
  const p = new InventoryPack();
  p.insert(8, 13);
  p.click("slots", 0, true);
  assert.deepEqual(p.cursor, { id: 8, n: 7 });
  assert.equal(p.slots[0].n, 6);
  p.click("slots", 14, true);
  assert.deepEqual(p.slots[14], { id: 8, n: 1 });
  assert.equal(p.cursor.n, 6);
  p.click("slots", 0);
  assert.equal(p.slots[0].n, 12);
  assert.equal(p.cursor, null);
  assert.equal(p.counts()[8], 13);
});
test("Shift click transfers between backpack and hotbar while respecting full stacks", () => {
  const p = new InventoryPack();
  p.slots[0] = { id: 8, n: 61 };
  p.slots[9] = { id: 8, n: 12 };
  p.click("slots", 9, false, true);
  assert.equal(p.slots[0].n, 64);
  assert.equal(p.slots[1].n, 9);
  assert.equal(p.slots[9], null);
  assert.equal(p.counts()[8], 73);
});
test("2 by 2 crafting produces planks and workbenches; a pickaxe needs a table", () => {
  const p = new InventoryPack();
  p.grid[3] = { id: 5, n: 2 };
  assert.equal(p.recipe().out, 8);
  p.takeResult();
  assert.equal(p.cursor.n, 4);
  assert.equal(p.grid[3].n, 1);
  p.clearGrid();
  p.grid = [
    { id: 8, n: 1 },
    { id: 44, n: 1 },
    { id: 51, n: 1 },
    { id: 86, n: 1 },
    null,
    null,
    null,
    null,
    null,
  ];
  assert.equal(p.recipe().out, 28);
  assert(p.takeResult());
  assert.equal(p.cursor.id, 28);
  p.clearGrid();
  p.insert(112, 2);
  p.insert(8, 3);
  const pick = GRID_RECIPES.findIndex((r) => r.out === 101);
  assert.equal(p.fillRecipe(pick), false);
  p.size = 3;
  assert(p.fillRecipe(pick));
  assert.equal(p.recipe().out, 101);
  p.takeResult(false, true);
  assert.equal(p.counts()[101], 1);
  assert.equal(p.counts()[112] ?? 0, 0);
});
test("Invalid recipe placement consumes nothing; closing crafting returns ingredients", () => {
  const p = new InventoryPack();
  p.grid[0] = { id: 8, n: 9 };
  p.grid[1] = { id: 112, n: 4 };
  const before = p.counts();
  assert.equal(p.recipe(), null);
  assert.equal(p.takeResult(), false);
  assert.deepEqual(p.counts(), before);
  assert.deepEqual(p.clearGrid(), []);
  assert.deepEqual(p.counts(), before);
  assert(p.grid.every((s) => s === null));
});
test("Inventory save roundtrip preserves exact cells, cursor and crafting grid", () => {
  const p = new InventoryPack();
  p.slots[35] = { id: 111, n: 4 };
  p.grid[0] = { id: 5, n: 3 };
  p.cursor = { id: 9, n: 17 };
  const data = JSON.parse(JSON.stringify(p.snapshot())),
    other = new InventoryPack();
  other.restore(data);
  assert.deepEqual(other.snapshot(), data);
});
test("New survival worlds start empty; creative worlds also start with empty slots", () => {
  const g = stubGame();
  g.clearDynamic = () => {};
  g.dimensionChanged = () => {};
  g.spawnMobs = () => {};
  g.resume = () => {};
  g.start("survival", false, 42);
  assert.deepEqual(g.inventory, {});
  assert(g.hotbar.every((id) => id === 0));
  assert(g.pack.slots.every((s) => s === null));
  g.start("creative", false, 42);
  assert.deepEqual(g.inventory, {});
});
test("Q drops one item, Ctrl Q drops the remaining stack, and an empty slot stays empty", () => {
  const { w } = waterWorld(),
    g = stubGame(w);
  g.keyDown(event("KeyQ"));
  assert.equal(g.inventory[8], 1);
  assert.equal(g.drops.items.length, 1);
  assert.equal(g.drops.items[0].n, 1);
  g.keyDown({ ...event("KeyQ"), ctrlKey: true });
  assert.equal(g.inventory[8] ?? 0, 0);
  assert.equal(g.hotbar[0], 0);
  assert.equal(g.drops.items.length, 2);
  g.keyDown(event("KeyQ"));
  assert.equal(g.drops.items.length, 2);
  for (let i = 0; i < 160; i++) g.drops.tick(1 / 60);
  assert(g.drops.items.length > 0);
  const drop = g.drops.items[0];
  assert(drop.mesh.position.y >= 51);
  g.position.copy(drop.mesh.position).add(new THREE.Vector3(0, -0.7, 0));
  g.drops.tick(0.1);
  assert(g.inventory[8] > 0);
});
test("F5 cycles first person, third person behind, third person in front, first person", () => {
  const { w } = waterWorld(),
    g = stubGame(w);
  for (const expected of [1, 2, 0]) {
    g.keyDown(event("F5"));
    assert.equal(g.perspective, expected);
  }
  g.perspective = 1;
  g.move(1 / 60);
  assert(g.camera.position.z > g.position.z);
  g.perspective = 2;
  g.move(1 / 60);
  assert(g.camera.position.z < g.position.z);
  assert(g.camera.getWorldDirection(new THREE.Vector3()).z > 0);
});
test("Nether ruins are near spawn, inactive, and require both repair and ignition", () => {
  const { ignitePortal } = require("../.test-build/portals"),
    w = new World();
  const r = w.ruinLocation();
  assert(Math.hypot(r.x - 8.5, r.z - 22.5) < 32);
  for (let cx = Math.floor((r.x - 12) / 16); cx <= Math.floor((r.x + 12) / 16); cx++)
    for (let cz = Math.floor((r.z - 12) / 16); cz <= Math.floor((r.z + 12) / 16); cz++)
      w.chunk(cx, cz);
  let obsidian = 0;
  for (let a = 0; a < 4; a++)
    for (let b = 0; b < 5; b++) {
      const id = w.get(r.x + a, r.y + b, r.z);
      assert.notEqual(id, 13);
      if (id === 12) obsidian++;
    }
  assert(obsidian >= 8 && obsidian < 14);
  assert.equal(ignitePortal(w, r.x, r.y, r.z), false);
  for (let a = 0; a < 4; a++)
    for (let b = 0; b < 5; b++)
      if (a === 0 || a === 3 || b === 0 || b === 4) w.set(r.x + a, r.y + b, r.z, 12);
  assert(ignitePortal(w, r.x, r.y, r.z));
  assert.equal(w.get(r.x + 1, r.y + 1, r.z), 13);
  w.chunk(-2, 0);
  assert.notEqual(w.get(-18, w.height(-18, 10) + 2, 10), 13);
});
test("The hand strikes forward and downward from its raised pose", () => {
  const { handSwing } = require("../.test-build/interaction-effects");
  const point = (t) => {
    const p = handSwing(t);
    return new THREE.Vector3(0.38, -0.12, -0.7)
      .applyEuler(new THREE.Euler(p.rx, 0, p.rz))
      .add(new THREE.Vector3(p.x, p.y, p.z));
  };
  const raised = point(0.2),
    strike = point(0.65),
    rest = point(1);
  assert(strike.y < raised.y - 0.3);
  assert(strike.z < rest.z - 0.1);
  assert(raised.y > rest.y);
  assert.deepEqual(handSwing(1), { x: -0, y: -0, z: -0, rx: -0, rz: 0 });
});
console.log(`\n${passed} gameplay checks passed.`);
