import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { SkinModel } from "../lib/skin-model";
import { Multiplayer } from "../lib/multiplayer";
import { CARDINAL } from "../lib/block-shapes";
import type { BedRest } from "../lib/bed-rest";

function rest(facing = 0): BedRest {
  const [dx, , dz] = CARDINAL[facing];
  return {
    key: "overworld:4,10,5",
    dimension: "overworld",
    foot: [4, 10, 5],
    head: [4 + dx, 10, 5 + dz],
    facing,
    p: [4.5 + dx * 0.5, 10.5625, 5.5 + dz * 0.5],
    yaw: (-facing * Math.PI) / 2,
    elapsed: 0,
    nightSkipped: false,
  };
}
function model() {
  return new SkinModel({
    skin: { width: 64, height: 64 } as HTMLCanvasElement,
    cape: { width: 64, height: 32 } as HTMLCanvasElement,
    capeEnabled: true,
  });
}

test("Rest pose puts the head on the white outer pillow and feet on the red foot in every orientation", () => {
  const avatar = model();
  avatar.setHeldItem(104);
  avatar.setEquipment({ head: 152, chest: 122, legs: 153, feet: 154 });
  for (let facing = 0; facing < 4; facing++) {
    const state = rest(facing),
      direction = new THREE.Vector3(...CARDINAL[facing]);
    avatar.pose(0.8, true, true, 0.4);
    avatar.head.rotation.set(0.6, 0.9, 0.3);
    avatar.setBedRest(state);
    avatar.group.updateMatrixWorld(true);
    const footCenter = new THREE.Vector3(4.5, 10, 5.5);
    const head = avatar.parts.get("head0")!.getWorldPosition(new THREE.Vector3());
    const feet = avatar.group.localToWorld(new THREE.Vector3(0, 0, 0));
    assert.ok(head.clone().sub(footCenter).dot(direction) > 1.1);
    assert.ok(head.clone().sub(footCenter).dot(direction) < 1.5);
    assert.ok(Math.abs(feet.clone().sub(footCenter).dot(direction) + 0.32) < 1e-6);
    const headBounds = new THREE.Box3().setFromObject(avatar.parts.get("head0")!);
    assert.ok(headBounds.min.y > 10.5625, "head must rest above, not through, the mattress");
    for (const plate of avatar.head.children.filter((child) => child.name === "armor-head"))
      assert.ok(
        new THREE.Box3().setFromObject(plate).min.y > 10.5625,
        "helmet back clears the pillow",
      );
    const front = new THREE.Vector3(0, 0, 1).transformDirection(avatar.group.matrixWorld);
    assert.ok(front.y > 0.999, "face looks up while lying on the back");
    for (const name of ["armR", "armL", "legR", "legL"])
      assert.deepEqual(avatar.joints[name].rotation.toArray().slice(0, 3), [0, 0, 0]);
    assert.equal(avatar.grip.visible, false);
    assert.equal(avatar.capePivot.visible, false);
    assert.equal(avatar.group.scale.y, 1);
  }
  avatar.dispose();
});

test("Leaving a bed restores held equipment, cape, skin head and upright F5 transform without allocating new meshes", () => {
  const avatar = model();
  avatar.setHeldItem(104);
  const held = avatar.heldItem.group.children[0];
  avatar.setBedRest(rest(2));
  avatar.pose(0);
  avatar.group.position.set(8, 11, 9);
  avatar.group.rotation.y = 0.7;
  avatar.setBedRest(null);
  assert.deepEqual(avatar.group.position.toArray(), [8, 11, 9]);
  assert.deepEqual(avatar.group.rotation.toArray(), [0, 0.7, 0, "XYZ"]);
  assert.equal(avatar.head.position.z, 0);
  assert.equal(avatar.grip.visible, true);
  assert.equal(avatar.capePivot.visible, true);
  assert.equal(avatar.heldItem.group.children[0], held);
  avatar.dispose();
});

function client() {
  let emits = 0;
  const applications: unknown[] = [],
    sent: any[] = [];
  const game: any = {
    health: 20,
    world: { dimension: "overworld" },
    position: new THREE.Vector3(1, 2, 3),
    velocity: new THREE.Vector3(),
    yaw: 0.5,
    clock: 100,
    rest: null,
    applyRestState(state: BedRest | null, position?: [number, number, number]) {
      applications.push(structuredClone({ state, position }));
      this.rest = state;
      if (position) this.position.fromArray(position);
    },
    endRest(authoritative: boolean) {
      assert.equal(authoritative, true);
      this.rest = null;
    },
    emit() {
      emits++;
    },
    notify() {},
  };
  const net = Object.assign(Object.create(Multiplayer.prototype), {
    game,
    bedRestRevision: -1,
    closed: false,
    connected: true,
    chestBusy: false,
    pending: new Map(),
    applied: new Set(),
    listeners: new Set(),
    inventoryRevision: 0,
    token: "a".repeat(64),
    sequence: 0,
    sendInput() {},
    sendProfile() {},
    send(packet: any) {
      sent.push(packet);
    },
    refreshFurnace() {},
  }) as Multiplayer;
  return { net, game, applications, sent, emits: () => emits };
}

test("Authoritative bed revisions reject a delayed use ACK after Shift; identical frames update only the timer", () => {
  const c = client(),
    state = rest();
  c.net.receive({ type: "bedRest", state, revision: 4, p: state.p, yaw: state.yaw, clock: 210 });
  assert.equal(c.game.rest.key, state.key);
  assert.equal(c.game.clock, 210);
  c.game.yaw = 1.1;
  c.net.applyBedRest({ ...state, elapsed: 7 }, 4, state.p, 0);
  assert.equal(c.game.rest.elapsed, 7);
  assert.equal(c.game.yaw, 1.1, "a repeated snapshot cannot reset the player's look");
  assert.equal(c.applications.length, 1);
  c.net.receive({ type: "bedRest", state: null, revision: 5, p: [7, 10, 8], yaw: 0.3 });
  c.net.receive({
    type: "result",
    req: "old-use",
    ok: false,
    bedRest: state,
    bedRestRevision: 4,
    p: state.p,
    yaw: 0,
  });
  assert.equal(c.game.rest, null);
  assert.deepEqual(c.game.position.toArray(), [7, 10, 8]);
  c.game.position.set(8, 10, 8);
  c.net.applyBedRest(null, 5, [7, 10, 8], 0.3);
  assert.deepEqual(c.game.position.toArray(), [8, 10, 8], "standing frames do not undo movement");
  assert.equal(c.applications.length, 2);
  assert.equal(c.emits(), 2);
});

test("Shift exit bypasses a busy inventory queue, is idempotent in flight, and disconnect clears local rest", () => {
  const c = client();
  c.game.rest = rest();
  c.net.chestBusy = true;
  assert.ok(c.net.endRest());
  assert.equal(c.net.endRest(), "");
  assert.equal(c.sent.filter((p) => p.type === "command").length, 1);
  assert.equal(c.sent[0].command.type, "restEnd");
  c.net.clearBedRest();
  assert.equal(c.game.rest, null);
  assert.equal(c.net.endRest(), "");
});

test("Using a bed with a bow, food or shield stays authoritative instead of falling back to local sleep", () => {
  const c = client();
  Object.assign(c.game, {
    selected: 0,
    inventory: {},
    target: {
      id: 194,
      x: 4,
      y: 10,
      z: 4,
      px: 4,
      py: 11,
      pz: 4,
    },
  });
  for (const id of [0, 105, 106, 107, 126]) {
    c.game.hotbar = [id];
    assert.equal(c.net.interact(), true);
    assert.equal(c.game.rest, null, "only the accepted server state may lay down the player");
    assert.equal(c.sent.at(-1).command.type, "use");
  }
  assert.equal(c.sent.length, 5);
});

test("Rest packets cannot put a dead player or a different dimension back into a bed", () => {
  const c = client();
  c.game.health = 0;
  c.net.applyBedRest(rest(), 1);
  c.game.health = 20;
  c.game.world.dimension = "end";
  c.net.applyBedRest(rest(), 2);
  assert.equal(c.game.rest, null);
  assert.equal(c.applications.length, 0);
});

test("Night skip with an unchanged rest revision updates daylight without resetting the look or replaying an old clock", () => {
  const c = client(),
    state = rest();
  c.net.applyBedRest(state, 2, state.p, 0, 450);
  c.game.yaw = 0.75;
  c.net.receive({
    type: "bedRest",
    state: { ...state, elapsed: 10, nightSkipped: true },
    revision: 2,
    p: state.p,
    yaw: 0,
    clock: 690,
  });
  assert.equal(c.game.clock, 690);
  assert.equal(c.net.clock, 690);
  assert.equal(c.game.yaw, 0.75);
  assert.equal(c.game.rest.nightSkipped, true);
  c.net.applyBedRest(state, 2, state.p, 0, 450);
  assert.equal(c.game.clock, 690);
  assert.equal(c.game.rest.elapsed, 10);
  assert.equal(c.game.rest.nightSkipped, true);
  assert.equal(c.applications.length, 1);
});

test("Actual multiplayer presentation keeps remote sleepers aligned and restores the upright label and weapon", () => {
  const c = client(),
    avatar = model(),
    label = new THREE.Sprite();
  avatar.setHeldItem(104);
  avatar.group.add(label);
  const state = rest(1);
  const remote: any = {
    model: avatar,
    label,
    position: new THREE.Vector3(...state.p),
    swingTime: 0.2,
    wire: {
      dimension: "overworld",
      health: 20,
      yaw: 2,
      pitch: 0.7,
      moving: true,
      crouch: true,
      bedRest: state,
    },
  };
  Object.assign(c.net, {
    remotes: new Map([["friend", remote]]),
    entities: new Map(),
    clock: 100,
    horrorClock: 0,
    networkClock: 0,
    profileClock: 0,
    uiClock: 0,
    flushInventory() {},
  });
  c.net.tick(1 / 60);
  avatar.group.updateMatrixWorld(true);
  assert.equal(avatar.group.rotation.x, -Math.PI / 2);
  assert.equal(avatar.group.rotation.y, state.yaw);
  assert.equal(avatar.grip.visible, false);
  assert.equal(avatar.joints.armR.rotation.x, 0);
  const tag = label.getWorldPosition(new THREE.Vector3());
  assert.ok(
    tag.y > state.p[1] + 0.9,
    "remote nickname is above the mattress, not beside the pillow",
  );
  remote.wire.bedRest = null;
  remote.wire.moving = remote.wire.crouch = false;
  c.net.tick(1 / 60);
  assert.equal(avatar.group.rotation.x, 0);
  assert.equal(avatar.grip.visible, true);
  assert.deepEqual(label.position.toArray(), [0, 2.3, 0]);
  label.material.dispose();
  avatar.dispose();
});
