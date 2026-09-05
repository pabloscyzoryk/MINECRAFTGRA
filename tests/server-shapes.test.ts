import test from "node:test";
import assert from "node:assert/strict";
import { Room } from "../server/room";

function setup(held: number) {
  let now = 1000000,
    seq = 0;
  const messages: any[] = [];
  const room = new Room(
    (_id, data) => messages.push(data),
    () => now,
  );
  room.join("builder", "Budowniczy", undefined);
  const p = room.players.get("builder")!;
  p.p = [30.5, 50, 32.5];
  p.yaw = 0;
  p.held = held;
  p.profile.inventory = { [held]: 12 };
  const world = room.ensure("overworld", 30, 30);
  for (let x = 28; x <= 33; x++)
    for (let z = 28; z <= 33; z++) {
      world.set(x, 49, z, 3);
      world.set(x, 50, z, 0);
      world.set(x, 51, z, 0);
    }
  return {
    room,
    p,
    world,
    command(c: any) {
      now += 10000;
      room.command("builder", { req: "shape-" + seq++, ...c });
      return messages.at(-1);
    },
  };
}
test("Multiplayer places both halves of a bed and awards only one item when either half is mined", () => {
  const s = setup(62);
  const result = s.command({
    type: "use",
    x: 30,
    y: 49,
    z: 30,
    place: [30, 50, 30],
    point: [30.5, 50, 30.5],
    normal: [0, 1, 0],
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.cost, [[62, 1]]);
  assert.equal(s.world.get(30, 50, 30), 190);
  assert.equal(s.world.get(30, 50, 29), 194);
  s.p.held = 0;
  const broken = s.command({ type: "mine", x: 30, y: 50, z: 29, expected: 194 });
  assert.equal(broken.ok, true);
  assert.deepEqual(broken.grant, [[62, 1]]);
  assert.equal(s.world.get(30, 50, 30), 0);
  assert.equal(s.world.get(30, 50, 29), 0);
  assert.equal(s.command({ type: "mine", x: 30, y: 50, z: 30, expected: 190 }).ok, false);
});
test("Bed placement is atomic when its distant half is occupied by another player", () => {
  const s = setup(62);
  s.room.join("guest", "Gosc", undefined);
  s.room.players.get("guest")!.p = [30.5, 50, 29.5];
  const result = s.command({ type: "use", x: 30, y: 49, z: 30, place: [30, 50, 30] });
  assert.equal(result.ok, false);
  assert.equal(s.world.get(30, 50, 30), 0);
  assert.equal(s.world.get(30, 50, 29), 0);
});
test("Multiplayer joins two slabs into one full block and respects top-half placement", () => {
  const s = setup(170);
  s.world.set(30, 50, 30, 170);
  const merged = s.command({
    type: "use",
    x: 30,
    y: 50,
    z: 30,
    place: [30, 51, 30],
    point: [30.5, 50.5, 30.5],
    normal: [0, 1, 0],
  });
  assert.equal(merged.ok, true);
  assert.equal(s.world.get(30, 50, 30), 198);
  s.world.set(31, 51, 30, 3);
  const upper = s.command({
    type: "use",
    x: 31,
    y: 51,
    z: 30,
    place: [31, 50, 30],
    point: [31.5, 51, 30.5],
    normal: [0, -1, 0],
  });
  assert.equal(upper.ok, true);
  assert.equal(s.world.get(31, 50, 30), 171);
});
test("A client cannot manufacture a slab merge using an interior or invalid face", () => {
  const s = setup(170);
  s.world.set(30, 50, 30, 170);
  for (const point of [
    [30.5, 50.25, 30.5],
    [30.5, 51.5, 30.5],
  ]) {
    assert.equal(
      s.command({ type: "use", x: 30, y: 50, z: 30, place: [30, 51, 30], point, normal: [0, 1, 0] })
        .ok,
      false,
    );
    assert.equal(s.world.get(30, 50, 30), 170);
  }
});
