import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { Room } from "../server/room";
import { Mob } from "../lib/entities";
import { Multiplayer } from "../lib/multiplayer";

function source() {
  const room = new Room(() => {}),
    world = room.region("overworld").world,
    mob = new Mob("enderman", 10, 10, world);
  room.region("overworld").mobs.set("enderman", mob);
  return { room, world, mob };
}

test("Server Enderman frames and saves preserve remaining anger after damage flash has been restored", () => {
  const c = source(),
    restored = new Room(() => {});
  try {
    c.mob.hurt = 0.2;
    assert.equal(c.mob.anger, 30);
    c.mob.anger = 7.25;
    c.mob.angerTarget = "provoker";
    c.mob.eyeContact = 0.125;
    assert.equal(c.room.frame().mobs.overworld![0].anger, 7.25);
    assert.equal(c.room.frame().mobs.overworld![0].angerTarget, "provoker");
    assert.equal(c.room.frame().mobs.overworld![0].eyeContact, 0.125);
    restored.restore(c.room.save());
    const after = restored.region("overworld").mobs.get("enderman")!;
    assert.equal(after.hurt, 0.2);
    assert.equal(after.anger, 7.25, "Restoring hurt must not restart a full aggression timeout");
    assert.equal(after.angerTarget, "provoker");
    assert.equal(after.eyeContact, 0.125);
  } finally {
    c.mob.dispose();
    restored.region("overworld").mobs.get("enderman")?.dispose();
  }
});

test("Legacy saves without anger default to a neutral Enderman even when an old damage flash is present", () => {
  const c = source(),
    restored = new Room(() => {});
  try {
    c.mob.hurt = 0.2;
    const saved = c.room.save();
    for (const region of saved.regions)
      for (const mob of region.mobs) {
        delete mob.anger;
        delete mob.eyeContact;
        delete mob.angerTarget;
      }
    restored.restore(saved);
    assert.equal(restored.region("overworld").mobs.get("enderman")!.anger, 0);
    assert.equal(restored.region("overworld").mobs.get("enderman")!.eyeContact, 0);
    assert.equal(restored.region("overworld").mobs.get("enderman")!.angerTarget, "");
  } finally {
    c.mob.dispose();
    restored.region("overworld").mobs.get("enderman")?.dispose();
  }
});

test("Remote Enderman synchronization applies authoritative anger after hurt and accepts expiry and missing legacy state", () => {
  const c = source(),
    net = Object.create(Multiplayer.prototype) as Multiplayer;
  const game: any = {
    world: c.world,
    scene: new THREE.Scene(),
    position: new THREE.Vector3(10, 20, 10),
    mobs: [],
  };
  Object.assign(net, { game, clock: 90, entities: new Map() });
  try {
    c.mob.hurt = 0.2;
    c.mob.anger = 4;
    c.mob.eyeContact = 0.15;
    net.syncMobs(c.room.frame());
    const remote = net.entities.get("enderman")!;
    assert.equal(remote.anger, 4);
    assert.equal(remote.eyeContact, 0.15);
    assert.equal(remote.group.parent, game.scene);
    c.mob.anger = 0;
    c.mob.hurt = 0.15;
    net.syncMobs(c.room.frame());
    assert.equal(remote.anger, 0);
    const legacyFrame = c.room.frame();
    legacyFrame.mobs.overworld![0].hurt = 0.3;
    delete legacyFrame.mobs.overworld![0].anger;
    delete legacyFrame.mobs.overworld![0].eyeContact;
    net.syncMobs(legacyFrame);
    assert.equal(remote.anger, 0, "Legacy damage flashes do not invent aggression locally");
    assert.equal(remote.eyeContact, 0);
  } finally {
    c.mob.dispose();
    for (const mob of net.entities.values()) mob.dispose();
  }
});

test("Room uses active players' real eye rays, including an observer behind a nearer player looking away", () => {
  const c = source();
  try {
    c.room.populate = () => {};
    c.world.solid = (_x, y) => y < 50;
    c.world.surface = () => 50;
    c.world.get = () => 0;
    c.mob.group.position.set(40, 50, 46);
    c.mob.group.rotation.set(0, 0, 0);
    c.mob.speed = 0;
    c.mob.heading = Math.PI;
    c.mob.timer = 100;
    c.room.join("near", "Blisko", undefined);
    c.room.join("watching", "Patrzy", undefined);
    const near = c.room.players.get("near")!,
      p = c.room.players.get("watching")!;
    Object.assign(near, { p: [42, 50, 44], yaw: Math.PI / 2, pitch: 0, active: true });
    Object.assign(p, { p: [40, 50, 40], active: true });
    for (let i = 0; i < 3; i++) {
      c.mob.head.updateWorldMatrix(true, false);
      const eyes = c.mob.eyes[0].position
        .clone()
        .add(c.mob.eyes[1].position)
        .multiplyScalar(0.5)
        .applyMatrix4(c.mob.head.matrixWorld);
      const direction = eyes
        .sub(new THREE.Vector3(...p.p).add(new THREE.Vector3(0, 1.62, 0)))
        .normalize();
      p.yaw = Math.atan2(-direction.x, -direction.z);
      p.pitch = Math.asin(direction.y);
      c.room.tick(0.1);
    }
    assert.equal(c.mob.anger, 30);
    assert.equal(c.mob.eyeContact, 0.25);
    assert.equal(c.mob.angerTarget, "watching");
  } finally {
    c.mob.dispose();
  }
});

test("Room never treats a menu player's frozen camera as eye contact", () => {
  const c = source();
  try {
    c.room.populate = () => {};
    c.world.solid = () => false;
    c.world.surface = () => 50;
    c.world.get = () => 0;
    c.mob.group.position.set(40, 50, 46);
    c.mob.group.rotation.set(0, 0, 0);
    c.mob.speed = 0;
    c.mob.heading = Math.PI;
    c.mob.timer = 100;
    c.room.join("menu", "Menu", undefined);
    const p = c.room.players.get("menu")!;
    Object.assign(p, { p: [40, 50, 40], active: false });
    for (let i = 0; i < 5; i++) {
      c.mob.head.updateWorldMatrix(true, false);
      const eyes = c.mob.eyes[0].position
        .clone()
        .add(c.mob.eyes[1].position)
        .multiplyScalar(0.5)
        .applyMatrix4(c.mob.head.matrixWorld);
      const origin = new THREE.Vector3(...p.p).add(new THREE.Vector3(0, 1.62, 0));
      const direction = eyes.sub(origin).normalize();
      p.yaw = Math.atan2(-direction.x, -direction.z);
      p.pitch = Math.asin(direction.y);
      assert(c.mob.looksIntoEyes({ origin, direction }, c.world));
      c.room.tick(0.1);
    }
    assert.equal(c.mob.anger, 0);
    assert.equal(c.mob.eyeContact, 0);
  } finally {
    c.mob.dispose();
  }
});
