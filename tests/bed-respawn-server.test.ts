import test from "node:test";
import assert from "node:assert/strict";
import { Room } from "../server/room";
import { Mob } from "../lib/entities";
import { touchesCactus } from "../lib/cactus-contact";
import { playerBox } from "../lib/block-shapes";

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
  const p = room.players.get("a")!;
  p.active = true;
  p.spawnUntil = p.hurtUntil = 0;
  p.healed = now;
  p.p = [28.5, 50, 30.5];
  const world = room.ensure("overworld", 30, 30);
  for (let x = 25; x <= 45; x++)
    for (let z = 25; z <= 34; z++) {
      world.set(x, 49, z, 3);
      for (let y = 50; y <= 54; y++) world.set(x, y, z, 0);
    }
  world.set(30, 50, 30, 190);
  world.set(30, 50, 29, 194);
  const command = (type: string, data: Record<string, unknown> = {}) => {
    now += 10;
    p.seen = now;
    const req = String(data.req ?? "respawn-" + sequence++);
    room.command("a", { type, ...data, req });
    return [...messages].reverse().find((m) => m.id === "a" && m.data.req === req)!.data;
  };
  return {
    room,
    p,
    world,
    messages,
    command,
    useBed() {
      return command("use", { x: 30, y: 50, z: 29 });
    },
    input(
      at: [number, number, number],
      revision = p.bedRestRevision ?? 0,
      dimension = p.dimension,
    ) {
      room.input("a", {
        p: at,
        dimension,
        active: true,
        yaw: 0,
        pitch: 0,
        bedRestRevision: revision,
      });
    },
    mobDeath() {
      p.p = [40.5, 50, 30.5];
      p.health = 1;
      p.hurtUntil = p.spawnUntil = 0;
      p.healed = now;
      const mob = new Mob("zombie", 42, 30.5, world);
      mob.group.position.set(42, 50, 30.5);
      mob.attackClock = 0.35;
      mob.attackCooldown = 3;
      room.region("overworld").mobs.set("killer", mob);
      now += 50;
      p.seen = now;
      room.tick(0.05);
      assert.equal(p.health, 0, "the actual zombie attack must kill the player");
      assert.equal(messages.filter((m) => m.data.type === "damage").at(-1)!.data.reason, "mob");
    },
    dispose() {
      for (const r of room.regions.values()) for (const m of r.mobs.values()) m.dispose();
    },
  };
}
function safeStanding(room: Room, p: ReturnType<typeof setup>["p"]) {
  const w = room.region(p.dimension).world;
  assert.equal(w.solid(p.p[0], p.p[1] + 0.05, p.p[2]), false);
  assert.equal(w.solid(p.p[0], p.p[1] + 1.7, p.p[2]), false);
  assert.equal(w.solid(p.p[0], p.p[1] - 0.06, p.p[2]), true);
  const box = playerBox({ x: p.p[0], y: p.p[1], z: p.p[2] });
  assert.equal(
    touchesCactus((x, y, z) => w.get(x, y, z), box),
    false,
  );
  for (let x = Math.floor(box[0]); x <= Math.floor(box[3]); x++)
    for (let z = Math.floor(box[2]); z <= Math.floor(box[5]); z++)
      for (let y = Math.floor(box[1]); y <= Math.floor(box[4]); y++)
        assert.ok(![7, 15].includes(w.get(x, y, z)), "no water or lava may overlap the body");
}

test("Use either bed half, leave, walk away and die to a zombie: respawn returns beside that bed", () => {
  const s = setup();
  try {
    assert.equal(s.useBed().ok, true);
    assert.deepEqual(s.p.bedSpawn, [30, 50, 30], "head clicks store the canonical foot");
    s.command("restEnd");
    s.mobDeath();
    const result = s.command("respawn");
    assert.equal(result.ok, true);
    assert.equal(result.dimension, "overworld");
    assert.equal(result.food, 20);
    assert.equal(result.health, 20);
    assert.equal(s.p.bedRest, null);
    assert.ok(Math.hypot(s.p.p[0] - 30, s.p.p[2] - 30) < 5);
    assert.deepEqual(result.p, s.p.p);
    assert.deepEqual(Object.values((s.p.profile.adventure as any).spawn), s.p.p);
    safeStanding(s.room, s.p);
  } finally {
    s.dispose();
  }
});

test("A player with no chosen bed respawns at the overworld start, including a death in another dimension", () => {
  for (const dimension of ["overworld", "nether", "end"] as const) {
    const s = setup();
    try {
      s.p.dimension = dimension;
      s.p.p = [140, 25, 160];
      s.p.health = 0;
      const ack = s.command("respawn");
      assert.equal(ack.dimension, "overworld");
      assert.equal(s.p.dimension, "overworld");
      assert.equal(s.p.p[0], 8.5);
      assert.equal(s.p.p[2], 22.5);
      safeStanding(s.room, s.p);
    } finally {
      s.dispose();
    }
  }
});

test("Destroyed beds fall back safely and clear the unusable remembered bed instead of reviving it", () => {
  const s = setup();
  try {
    s.useBed();
    s.command("restEnd");
    s.world.set(30, 50, 29, 0);
    s.mobDeath();
    s.command("respawn");
    assert.equal(s.p.p[0], 8.5);
    assert.equal(s.p.p[2], 22.5);
    assert.equal(s.p.bedSpawn, undefined);
    assert.equal(s.p.bedSpawnPosition, undefined);
    safeStanding(s.room, s.p);
  } finally {
    s.dispose();
  }
});

test("Old movement cannot overwrite respawn position or dimension before or after the client confirms its revision", () => {
  const s = setup();
  try {
    s.useBed();
    s.command("restEnd");
    const oldRevision = s.p.bedRestRevision!;
    s.mobDeath();
    const ack = s.command("respawn");
    s.input([140, 25, 160], oldRevision, "nether");
    assert.deepEqual(s.p.p, ack.p);
    assert.equal(s.p.dimension, "overworld");
    const correction = s.messages.filter((m) => m.data.type === "bedRest").at(-1)!.data;
    assert.deepEqual(correction.p, ack.p);
    assert.equal(correction.dimension, "overworld");
    const walked: [number, number, number] = [ack.p[0] + 0.2, ack.p[1], ack.p[2]];
    s.input(walked, ack.bedRestRevision);
    assert.deepEqual(s.p.p, walked);
    s.input([140, 25, 160], oldRevision, "nether");
    assert.deepEqual(s.p.p, walked, "late old-gateway input cannot roll back a confirmed respawn");
    s.input([140, 25, 160], ack.bedRestRevision + 100, "nether");
    assert.deepEqual(s.p.p, walked, "unissued future revisions do not confirm a teleport");
  } finally {
    s.dispose();
  }
});

test("A saved bed and authoritative respawn revision survive room rotation and forged client profile spawn", () => {
  const s = setup(),
    messages: any[] = [];
  const restored = new Room((_id, data) => messages.push(data), s.room.now);
  try {
    s.useBed();
    s.command("restEnd");
    s.room.profile("a", {
      adventure: { spawn: { x: 999, y: 70, z: 999 }, bedSpawn: [999, 70, 999] },
    });
    s.mobDeath();
    const ack = s.command("respawn");
    restored.restore(JSON.parse(JSON.stringify(s.room.save())));
    restored.join("a", "Alicja", undefined);
    const p = restored.players.get("a")!;
    const welcome = [...messages].reverse().find((m) => m.type === "welcome");
    assert.deepEqual(p.bedSpawn, [30, 50, 30]);
    assert.deepEqual(welcome.player.p, ack.p);
    restored.input("a", {
      p: [40.5, 50, 30.5],
      dimension: "overworld",
      active: true,
      bedRestRevision: ack.bedRestRevision - 1,
    });
    assert.deepEqual(p.p, ack.p);
    p.health = 0;
    restored.command("a", { type: "respawn", req: "after-rotation" });
    assert.ok(Math.hypot(p.p[0] - 30, p.p[2] - 30) < 5);
    assert.deepEqual((p.profile.adventure as any).bedSpawn, [30, 50, 30]);
    safeStanding(restored, p);
  } finally {
    s.dispose();
    for (const r of restored.regions.values()) for (const m of r.mobs.values()) m.dispose();
  }
});

test("First join and respawn avoid lava, water, cactus and a blocked column at the default start without editing terrain", () => {
  for (const hazard of [15, 7, 41, 3]) {
    const s = setup();
    try {
      const w = s.room.ensure("overworld", 8, 22),
        y = Math.floor(w.surface(8.5, 22.5));
      if (hazard === 3) for (let height = 0; height < 72; height++) w.set(8, height, 22, 3);
      else w.set(8, y + (hazard === 41 ? 0 : 1), 22, hazard);
      const edits = JSON.stringify(w.edits);
      s.p.health = 0;
      const ack = s.command("respawn");
      assert.equal(ack.ok, true);
      safeStanding(s.room, s.p);
      if (hazard !== 3)
        assert.notDeepEqual(
          [s.p.p[0], s.p.p[2]],
          [8.5, 22.5],
          "the hazardous start column is skipped",
        );
      else
        assert.notDeepEqual(
          s.p.p,
          [8.5, 71, 22.5],
          "a blocked body needs a clear height or another column",
        );
      assert.ok(Math.hypot(s.p.p[0] - 8.5, s.p.p[2] - 22.5) <= 32);
      s.room.join("new", "NowyGracz", undefined);
      const newcomer = s.room.players.get("new")!;
      assert.ok(newcomer);
      safeStanding(s.room, newcomer);
      assert.deepEqual(newcomer.p, s.p.p, "first join and respawn use the same safe starting rule");
      assert.equal(
        JSON.stringify(w.edits),
        edits,
        "finding a place never changes the player's blocks",
      );
    } finally {
      s.dispose();
    }
  }
});

test("Safe fallback position and its newer revision survive save, reconnect and old movement", () => {
  const s = setup(),
    restored = new Room(() => {}, s.room.now);
  try {
    const w = s.room.ensure("overworld", 8, 22);
    w.set(8, 16, 22, 15);
    s.p.health = 0;
    const ack = s.command("respawn");
    assert.equal(ack.ok, true);
    safeStanding(s.room, s.p);
    restored.restore(JSON.parse(JSON.stringify(s.room.save())));
    restored.join("a", "Alicja", undefined);
    const p = restored.players.get("a")!;
    assert.deepEqual(p.p, ack.p);
    restored.input("a", {
      p: [8.5, 15, 22.5],
      dimension: "overworld",
      bedRestRevision: ack.bedRestRevision - 1,
    });
    assert.deepEqual(p.p, ack.p);
    safeStanding(restored, p);
  } finally {
    s.dispose();
    for (const r of restored.regions.values()) for (const m of r.mobs.values()) m.dispose();
  }
});

test("No safe starting point rejects respawn before changing health or inventory and refuses a new player", () => {
  const s = setup();
  try {
    const w = s.room.region("overworld").world;
    w.get = () => 15;
    w.surface = () => 15;
    s.p.health = 0;
    s.p.profile.food = 3;
    const before = {
      p: [...s.p.p],
      profile: structuredClone(s.p.profile),
      revision: s.p.bedRestRevision,
    };
    const ack = s.command("respawn");
    assert.equal(ack.ok, false);
    assert.match(ack.message, /bezpiecznego miejsca/);
    assert.equal(s.p.health, 0);
    assert.deepEqual(s.p.p, before.p);
    assert.deepEqual(s.p.profile, before.profile);
    assert.equal(s.p.bedRestRevision, before.revision);
    s.room.join("new", "NowyGracz", undefined);
    assert.equal(s.room.players.has("new"), false);
    const error = s.messages.filter((m) => m.id === "new").at(-1)!.data;
    assert.equal(error.type, "error");
    assert.equal(error.fatal, true);
    assert.match(error.message, /bezpiecznego miejsca/);
  } finally {
    s.dispose();
  }
});
