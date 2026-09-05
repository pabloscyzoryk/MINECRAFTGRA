import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { Room } from "../server/room";
import { Gateway } from "../server/gateway";
import { bedRestEye, bedRestPose } from "../lib/bed-rest";
import { InventoryPack } from "../lib/inventory";

function setup() {
  let now = 1000000,
    sequence = 0;
  const messages: { id: string; data: any }[] = [];
  const room = new Room(
    (id, data) => messages.push({ id, data }),
    () => now,
  );
  room.populate = () => {};
  room.tickHorror = () => {};
  room.join("a", "Alicja", undefined);
  room.join("b", "Bartek", undefined);
  const a = room.players.get("a")!,
    b = room.players.get("b")!;
  a.p = [28.5, 50, 30.5];
  b.p = [32.5, 50, 30.5];
  a.active = b.active = true;
  a.spawnUntil = b.spawnUntil = 0;
  a.hurtUntil = b.hurtUntil = 0;
  const world = room.ensure("overworld", 30, 30);
  for (let x = 25; x <= 36; x++)
    for (let z = 24; z <= 36; z++) {
      world.set(x, 49, z, 3);
      for (let y = 50; y <= 54; y++) world.set(x, y, z, 0);
    }
  world.set(30, 50, 30, 190);
  world.set(30, 50, 29, 194);
  room.clock = 400;
  const command = (data: Record<string, unknown>, id = "a") => {
    now += 10;
    room.players.get(id)!.seen = now;
    const req = String(data.req ?? "bed-" + sequence++);
    room.command(id, { ...data, req } as any);
    return [...messages].reverse().find((m) => m.id === id && m.data.req === req)!.data;
  };
  return {
    room,
    a,
    b,
    world,
    messages,
    command,
    lie(id = "a", head = false) {
      return command({ type: "use", x: 30, y: 50, z: head ? 29 : 30 }, id);
    },
    step(dt = 0.1, connected = true) {
      now += dt * 1000;
      if (connected) for (const p of room.players.values()) if (p.seen) p.seen = now;
      room.tick(dt);
    },
    dispose() {
      for (const r of room.regions.values()) for (const m of r.mobs.values()) m.dispose();
    },
  };
}
const standing = (s: ReturnType<typeof setup>, p = s.a) => {
  assert.equal(s.world.solid(p.p[0], p.p[1] + 0.05, p.p[2]), false);
  assert.equal(s.world.solid(p.p[0], p.p[1] + 1.7, p.p[2]), false);
  assert.equal(s.world.solid(p.p[0], p.p[1] - 0.02, p.p[2]), true);
};

test("Both bed halves identify the same occupied bed; lying is public and does not skip night immediately", () => {
  const s = setup();
  try {
    const ack = s.lie();
    assert.equal(ack.ok, true);
    assert.equal(s.room.clock, 400);
    assert.equal(ack.bedRest.key, "overworld:30,50,30");
    assert.deepEqual(s.a.p, ack.bedRest.p);
    assert.equal(s.room.frame().players.find((p) => p.id === "a")!.bedRest?.key, ack.bedRest.key);
    assert.equal(s.lie("b", true).ok, false);
    assert.deepEqual((s.a.profile.adventure as any).spawn, ack.spawn);
    assert.notDeepEqual(Object.values(ack.spawn), s.a.p);
    s.world.set(30, 50, 29, 0);
    assert.equal(s.a.bedRest, null);
    standing(s);
    assert.equal(s.lie("b").ok, false, "an orphan foot is not a complete bed");
  } finally {
    s.dispose();
  }
});

test("One connected sleeper advances the public night after ten seconds even with chat or inventory open and remains lying", () => {
  const s = setup();
  try {
    s.lie();
    s.a.active = false;
    for (let i = 0; i < 99; i++) s.step();
    assert.ok(s.room.clock < 600);
    assert.ok(s.a.bedRest!.elapsed < 10);
    s.step();
    assert.ok(s.room.clock >= 690 && s.room.clock < 691);
    assert.equal(s.a.bedRest!.elapsed, 10);
    assert.equal(s.a.bedRest!.nightSkipped, true);
    assert.equal(s.b.bedRest, undefined, "the other player need not sleep");
    const rev = s.a.bedRestRevision;
    for (let i = 0; i < 20; i++) s.step();
    assert.equal(s.a.bedRestRevision, rev);
    const wake = s.command({ type: "restEnd" });
    assert.equal(wake.ok, true);
    assert.equal(wake.bedRest, null);
    assert.ok(wake.bedRestRevision > rev!);
    standing(s);
    assert.equal(s.lie("b", true).ok, true);
  } finally {
    s.dispose();
  }
});

test("Standing up before ten seconds cancels the timer and repeated old ACKs cannot restore occupancy", () => {
  const s = setup();
  try {
    const begin = s.command({ type: "use", x: 30, y: 50, z: 30, req: "begin" });
    for (let i = 0; i < 60; i++) s.step();
    const wake = s.command({ type: "restEnd", req: "wake" });
    for (let i = 0; i < 60; i++) s.step();
    assert.ok(s.room.clock < 600);
    const replay = s.command({ type: "use", x: 30, y: 50, z: 30, req: "begin" });
    assert.deepEqual(replay, begin);
    assert.equal(s.a.bedRest, null);
    assert.ok(wake.bedRestRevision > replay.bedRestRevision);
  } finally {
    s.dispose();
  }
});

test("Server pins the sleeping position, suppresses combat flags and actions, while inventory and chat remain available", () => {
  const s = setup();
  try {
    s.lie();
    const position = [...s.a.p];
    s.room.input("a", {
      p: [999, 100, 999],
      dimension: "overworld",
      yaw: 1.2,
      pitch: 0.3,
      active: true,
      moving: true,
      crouch: true,
      swing: true,
      sprinting: true,
      blocking: true,
      held: 0,
    });
    assert.deepEqual(s.a.p, position);
    assert.equal(s.a.yaw, 1.2);
    assert.equal(s.a.pitch, 0.3);
    for (const flag of ["moving", "crouch", "swing", "sprinting", "blocking"] as const)
      assert.equal(s.a[flag], false);
    for (const type of ["mine", "use", "hit", "pvp", "huntHit", "shoot"])
      assert.equal(s.command({ type, x: 30, y: 49, z: 30 }).ok, false);
    const pack = new InventoryPack();
    pack.slots[0] = { id: 8, n: 5 };
    s.a.profile.pack = pack.snapshot();
    s.a.profile.inventory = pack.counts();
    assert.equal(
      s.command({
        type: "inventoryGesture",
        baseRevision: s.a.profile.inventoryRevision,
        chestKey: null,
        gesture: { type: "click", slot: { area: "slots", index: 0 } },
      }).ok,
      true,
    );
    s.room.chatMessage("a", "Odpoczywam");
    assert.equal(s.room.chat.at(-1)?.text, "Odpoczywam");
    assert.ok(s.a.bedRest);
  } finally {
    s.dispose();
  }
});

test("Damage, death, dimension travel and actual gateway disconnect each free the bed", () => {
  for (const action of ["damage", "death", "travel", "leave"]) {
    const s = setup();
    try {
      s.lie();
      if (action === "damage" || action === "death")
        s.room.damage(s.a, action === "death" ? 100 : 2, [0, 0, 0], "environment", "mob");
      if (action === "travel")
        s.room.input("a", { p: [8, 30, 8], dimension: "nether", active: true });
      if (action === "leave") {
        const gateway = Object.create(Gateway.prototype) as Gateway;
        (gateway as any).room = s.room;
        gateway.handle({ type: "leave", id: "a", data: null });
      }
      assert.equal(s.a.bedRest, null, action);
      assert.equal(s.lie("b").ok, true, action);
    } finally {
      s.dispose();
    }
  }
});

test("Save and reconnect restore a standing position rather than an active sleep, and preserve authoritative bed respawn", () => {
  const s = setup(),
    next = new Room(() => {});
  try {
    s.lie();
    for (let i = 0; i < 30; i++) s.step();
    const revision = s.a.bedRestRevision!,
      save = s.room.save();
    const saved = save.players.find((p) => p.id === "a")!;
    assert.equal(saved.bedRest, null);
    assert.ok(saved.bedRestRevision! > revision);
    assert.ok(s.a.bedRest, "saving must not wake the live session");
    next.restore(JSON.parse(JSON.stringify(save)));
    next.join("a", "Alicja", undefined);
    const p = next.players.get("a")!;
    assert.equal(p.bedRest, null);
    assert.notDeepEqual(p.p, s.a.p);
    assert.deepEqual(p.bedSpawn, [30, 50, 30]);
    s.room.profile("a", { adventure: { spawn: { x: 999, y: 100, z: 999 } } });
    assert.notEqual((s.a.profile.adventure as any).spawn.x, 999);
    s.room.damage(s.a, 100, [0, 0, 0], "environment", "mob");
    const respawn = s.command({ type: "respawn" });
    assert.equal(respawn.ok, true);
    assert.equal(respawn.bedRest, null);
    standing(s);
    assert.ok(Math.hypot(s.a.p[0] - 30, s.a.p[2] - 30) < 5);
    s.a.hurtUntil = 0;
    s.room.damage(s.a, 100, [0, 0, 0], "environment", "mob");
    s.world.set(30, 50, 30, 0);
    s.command({ type: "respawn" });
    assert.equal(s.a.p[0], 8.5);
    assert.equal(s.a.p[2], 22.5);
  } finally {
    s.dispose();
    for (const r of next.regions.values()) for (const m of r.mobs.values()) m.dispose();
  }
});

test("Sleeping eyes and PvP torso match the horizontal model rather than a standing hitbox", () => {
  const s = setup();
  try {
    s.lie();
    const rest = s.a.bedRest!;
    assert.deepEqual((s.room as any).playerEye(s.a).toArray(), bedRestEye(rest));
    const pose = bedRestPose(rest),
      body = new THREE.Vector3(...pose.p).add(new THREE.Vector3(0, 0, -1));
    assert.deepEqual((s.room as any).playerBody(s.a).toArray(), body.toArray());
    s.b.p = [30.5, 50, 32];
    const from = new THREE.Vector3(...s.b.p).add(new THREE.Vector3(0, 1.5, 0));
    const dir = body.clone().sub(from).normalize();
    s.b.yaw = Math.atan2(-dir.x, -dir.z);
    s.b.pitch = Math.asin(dir.y);
    assert.equal(s.command({ type: "pvp", target: "a" }, "b").ok, true);
    assert.ok(s.a.health < 20);
    assert.equal(s.a.bedRest, null);
  } finally {
    s.dispose();
  }
});
