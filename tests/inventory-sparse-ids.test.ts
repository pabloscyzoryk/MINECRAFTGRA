import test from "node:test";
import assert from "node:assert/strict";
import { InventoryPack, maxStack } from "../lib/inventory";
import { blankChest, chestCounts } from "../lib/chest-slots";
import { applyInventoryGesture, applyCraftResult, validGesture } from "../lib/inventory-gestures";
import { Game } from "../lib/engine";
import { Room } from "../server/room";

for (const id of [170, 172, 180, 182, 133, 134, 140, 131, 132, 149, 162]) {
  test(`Item ${id} supports drag, collect and distribution while preserving its real stack limit`, () => {
    const pack = new InventoryPack(),
      chest = blankChest(),
      limit = maxStack(id);
    pack.slots[0] = { id, n: limit === 1 ? 1 : 7 };
    assert(
      applyInventoryGesture(
        pack,
        {
          type: "move",
          from: { area: "slots", index: 0 },
          to: { area: "chest", index: 3 },
          expected: { ...pack.slots[0] },
        },
        chest,
      ),
    );
    assert.equal(pack.slots[0], null);
    assert.deepEqual(chest[3], { id, n: limit === 1 ? 1 : 7 });
    const state = JSON.stringify([pack.snapshot(), chest]);
    assert.equal(
      applyInventoryGesture(
        pack,
        {
          type: "move",
          from: { area: "chest", index: 3 },
          to: { area: "slots", index: 1 },
          expected: { id, n: limit === 1 ? 2 : 6 },
        },
        chest,
      ),
      false,
    );
    assert.equal(JSON.stringify([pack.snapshot(), chest]), state);
    pack.grid[1] = { id, n: limit === 1 ? 1 : 5 };
    assert(applyInventoryGesture(pack, { type: "collect", id }, chest));
    assert.equal(pack.cursor?.n, limit === 1 ? 1 : 12);
    const before = (pack.counts()[id] ?? 0) + (chestCounts(chest)[id] ?? 0);
    assert(
      applyInventoryGesture(
        pack,
        {
          type: "distribute",
          slots: [
            { area: "slots", index: 9 },
            { area: "slots", index: 10 },
            { area: "slots", index: 11 },
          ],
        },
        chest,
      ),
    );
    assert.equal((pack.counts()[id] ?? 0) + (chestCounts(chest)[id] ?? 0), before);
    assert.equal(pack.slots[9]?.n, limit === 1 ? 1 : 4);
    assert(pack.slots.every((s) => !s || s.n <= maxStack(s.id)));
  });
}

test("Sparse item gaps, air and atlas-only IDs remain rejected by all item-bearing gestures", () => {
  for (const id of [0, 100, 163, 169, 200, 223, 254, 255, -1, Infinity, 170.5]) {
    assert.equal(validGesture({ type: "collect", id }), false, String(id));
    assert.equal(
      validGesture({
        type: "move",
        from: { area: "slots", index: 0 },
        to: { area: "slots", index: 1 },
        expected: { id, n: 1 },
      }),
      false,
      String(id),
    );
    const pack = new InventoryPack();
    pack.cursor = { id, n: 1 };
    assert(
      applyInventoryGesture(pack, { type: "distribute", slots: [{ area: "slots", index: 1 }] }),
    );
    assert.equal(pack.slots[1], null);
  }
});

test("Stair crafting output can be dragged directly with an expected result stack", () => {
  const pack = new InventoryPack();
  pack.size = 3;
  for (const index of [0, 3, 4, 6, 7, 8]) pack.grid[index] = { id: 8, n: 1 };
  assert(applyCraftResult(pack, { to: { area: "slots", index: 10 }, expected: { id: 172, n: 4 } }));
  assert.deepEqual(pack.slots[10], { id: 172, n: 4 });
  assert(pack.grid.every((s) => s === null));
  assert.equal(pack.cursor, null);
});

test("Creative selection fills shaped blocks and resources to their stack limit while tools remain single", () => {
  const g: any = { mode: "creative", pack: new InventoryPack(), selected: 0, commitPack() {} };
  for (const id of [170, 172, 180, 182, 133, 134, 131, 132, 114]) {
    Game.prototype.equip.call(g, id);
    assert.deepEqual(g.pack.slots[0], { id, n: maxStack(id) });
  }
});

test("The authoritative room accepts new block drag and collection without trusting client counts", () => {
  const sent: any[] = [];
  const room = new Room((id, data) => sent.push({ id, data }));
  try {
    room.join("a", "Alicja", undefined);
    const p = room.players.get("a")!,
      pack = new InventoryPack();
    pack.slots[0] = { id: 182, n: 12 };
    pack.slots[10] = { id: 182, n: 3 };
    p.profile.pack = pack.snapshot();
    p.profile.inventory = pack.counts();
    room.command("a", {
      type: "inventoryGesture",
      req: "drag",
      baseRevision: 0,
      chestKey: null,
      gesture: {
        type: "move",
        from: { area: "slots", index: 0 },
        to: { area: "slots", index: 11 },
        expected: { id: 182, n: 12 },
      },
    });
    const moved = sent.find((m) => m.data.req === "drag").data;
    assert.equal(moved.ok, true);
    assert.deepEqual(moved.pack.slots[11], { id: 182, n: 12 });
    room.command("a", {
      type: "inventoryGesture",
      req: "collect",
      baseRevision: moved.inventoryRevision,
      chestKey: null,
      gesture: { type: "collect", id: 182 },
    });
    const collected = sent.find((m) => m.data.req === "collect").data;
    assert.equal(collected.ok, true);
    assert.deepEqual(collected.pack.cursor, { id: 182, n: 15 });
  } finally {
    for (const r of room.regions.values()) for (const m of r.mobs.values()) m.dispose();
  }
});
