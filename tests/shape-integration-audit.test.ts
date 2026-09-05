import test from "node:test";
import assert from "node:assert/strict";
import { World } from "../lib/world";
import { FluidSystem } from "../lib/fluid";
import { Room } from "../server/room";

test("Water above every slab/stair state still spreads and restores a source without replacing the supporting shapes", () => {
  for (const support of [
    3, 170, 171, 180, 181, 172, 173, 174, 175, 176, 177, 178, 179, 182, 183, 184, 185, 186, 187,
    188, 189, 198, 199,
  ]) {
    const world = new World(),
      fluid = new FluidSystem(world);
    world.chunk(1, 1);
    for (let x = 28; x <= 31; x++)
      for (let z = 28; z <= 31; z++) {
        world.set(x, 49, z, support);
        for (let y = 50; y <= 52; y++) world.set(x, y, z, 0);
      }
    world.set(29, 50, 29, 7);
    fluid.update(30, 50, 29);
    assert.equal(world.get(30, 50, 29), 7, `Source must spread over support ${support}`);
    assert.equal(fluid.level(30, 50, 29), 1);
    assert.equal(world.get(30, 49, 29), support, "Water never deletes a partial supporting block");
    world.set(31, 50, 29, 7);
    fluid.update(30, 50, 29);
    assert.equal(fluid.level(30, 50, 29), 0, `Renewable source over support ${support}`);
  }
});
test("Server rejects missing shape hit data before changing the world or consuming another slab", () => {
  let now = 1000000;
  const messages: any[] = [];
  const room = new Room(
    (_id, data) => messages.push(data),
    () => now,
  );
  room.join("shape-audit", "Audyt", undefined);
  const p = room.players.get("shape-audit")!;
  p.p = [30.5, 50, 32.5];
  p.held = 170;
  p.profile.inventory = { 170: 4 };
  const world = room.ensure("overworld", 30, 30);
  world.set(30, 50, 30, 170);
  for (const [i, extra] of [
    {},
    { normal: [0, 1, 0] },
    { point: [30.5, 50.5, 30.5] },
    { point: ["x", 50.5, 30.5], normal: [0, 1, 0] },
  ].entries()) {
    now += 10000;
    room.command("shape-audit", {
      type: "use",
      req: "missing-shape-hit-" + i,
      x: 30,
      y: 50,
      z: 30,
      place: [30, 51, 30],
      ...extra,
    });
    assert.equal(messages.at(-1)?.ok, false);
    assert.equal(world.get(30, 50, 30), 170);
    assert.equal((p.profile.inventory as Record<number, number>)[170], 4);
  }
});
