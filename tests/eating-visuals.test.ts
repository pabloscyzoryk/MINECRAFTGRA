import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import {
  EAT_DURATION,
  eatingProgress,
  eatingMotion,
  eatingBite,
  validEatingWire,
} from "../lib/eating";
import { SkinModel } from "../lib/skin-model";
import { HeldItemModel } from "../lib/held-item";
import { handSwing } from "../lib/interaction-effects";
import { Multiplayer } from "../lib/multiplayer";
import { InventoryPack } from "../lib/inventory";

function avatar() {
  const model = new SkinModel({
    skin: { width: 64, height: 64 } as HTMLCanvasElement,
    cape: { width: 64, height: 32 } as HTMLCanvasElement,
    capeEnabled: false,
  });
  model.heldItem.dispose();
  model.heldItem = new HeldItemModel(() => new THREE.Texture());
  model.grip.add(model.heldItem.group);
  return model;
}
test("Eating timing is bounded, validates food, and raises/lowers smoothly around five rhythmic bites", () => {
  assert.equal(EAT_DURATION, 1.6);
  assert.equal(eatingProgress(null), -1);
  assert.equal(eatingProgress({ id: 106, elapsed: 0.8 }), 0.5);
  assert.equal(eatingProgress({ id: 107, elapsed: 50 }), 1);
  for (const value of [NaN, Infinity, -0.1, 1.1])
    assert.deepEqual(eatingMotion(value), { blend: 0, bite: 0 });
  assert.equal(eatingMotion(0).blend, 0);
  assert.equal(eatingMotion(1).blend, 0);
  assert.equal(eatingMotion(0.5).blend, 1);
  assert.ok(eatingMotion(0.24).bite > eatingMotion(0.34).bite + 0.5);
  for (const state of [
    null,
    { id: 104, progress: 0.5 },
    { id: 106, progress: NaN },
    { id: 107, progress: 2 },
  ])
    assert.equal(validEatingWire(state), false);
  assert.ok(validEatingWire({ id: 106, progress: 0 }));
  assert.deepEqual(
    [0, 0.21, 0.22, 0.4, 0.58, 0.76, 0.94, 1].map(eatingBite),
    [-1, -1, 0, 1, 2, 3, 4, 4],
  );
});
test("First-person eating lifts real food near the mouth while the shoulder stays below every supported viewport", () => {
  const model = avatar(),
    rig = model.createFirstPersonArm(() => new THREE.Texture());
  rig.setHeldItem(107);
  const fixedShoulder = rig.shoulder.position.clone(),
    idle = new THREE.Vector3();
  for (const fov of [50, 72, 100])
    for (const aspect of [0.55, 1, 16 / 9]) {
      const camera = new THREE.PerspectiveCamera(fov, aspect, 0.06, 500);
      camera.updateMatrixWorld();
      for (let step = 0; step <= 100; step++) {
        rig.pose(handSwing(0.4), 0, fov, aspect, step / 100);
        rig.group.updateMatrixWorld(true);
        assert.ok(rig.shoulder.position.equals(fixedShoulder));
        const wrist = rig.wrist.getWorldPosition(new THREE.Vector3());
        assert.ok(
          wrist.distanceTo(rig.shoulder.localToWorld(new THREE.Vector3(0, -rig.length, 0))) < 1e-9,
        );
        const screen = wrist.clone().project(camera);
        assert.ok(Math.abs(screen.x) < 0.95 && screen.y > -0.95 && screen.y < 0.4);
        for (const mesh of rig.meshes) {
          const vertices = mesh.geometry.attributes.position;
          for (let i = 0; i < vertices.count; i++)
            if (vertices.getY(i) > 0) {
              const cap = mesh.localToWorld(new THREE.Vector3().fromBufferAttribute(vertices, i));
              assert.ok(
                cap.z >= -camera.near || cap.clone().project(camera).y < -1.1,
                "the shoulder cap is outside the near plane or below the visible frame",
              );
            }
        }
        if (step === 0) idle.copy(wrist);
        if (step === 24)
          assert.ok(
            wrist.z > idle.z + 0.1,
            "food comes toward the mouth instead of striking forward",
          );
      }
    }
  rig.dispose();
  model.dispose();
});
test("Third-person bites keep food in front of the mouth, override mining and reset both arm and grip", () => {
  const model = avatar();
  model.setHeldItem(106);
  const food = model.heldItem.group.children[0];
  const bitePositions: THREE.Vector3[] = [];
  for (const progress of [0.2, 0.24, 0.3, 0.34, 0.44, 0.54, 0.64, 0.74, 0.84]) {
    model.pose(1, false, false, 0.4, progress);
    model.group.updateMatrixWorld(true);
    const at = food.getWorldPosition(new THREE.Vector3());
    assert.ok(Math.abs(at.x) < 0.18 && at.y > 1.5 && at.y < 1.8);
    assert.ok(at.z > 0.3 && at.z < 0.7, "food stays outside the face and within biting reach");
    bitePositions.push(at);
  }
  assert.ok(bitePositions[1].distanceTo(bitePositions[3]) > 0.02);
  model.pose(1, false, false, -1, -1);
  assert.deepEqual(model.grip.position.toArray(), [0, -0.625, 0.11]);
  assert.deepEqual(model.grip.rotation.toArray().slice(0, 3), [0.5, 0, 0]);
  assert.ok(
    model.joints.armR.rotation
      .toArray()
      .slice(0, 3)
      .every((angle) => angle === 0),
  );
  model.dispose();
});

function client() {
  const sent: any[] = [];
  const game: any = {
    active: true,
    eating: { id: 106, elapsed: 0 },
    held: true,
    hotbar: [106],
    selected: 0,
    eatingHeld() {
      return this.held;
    },
    applyEatingState(state: any) {
      if (!state) this.eating = null;
      else
        this.eating = {
          id: state.id,
          elapsed: Math.max(this.eating?.elapsed ?? 0, state.progress * EAT_DURATION),
        };
    },
    notify() {},
  };
  const net = Object.assign(Object.create(Multiplayer.prototype), {
    game,
    connected: true,
    closed: false,
    eatGeneration: 0,
    eatSession: null,
    eatStartReq: null,
    eatFinishReq: null,
    eatRetryAt: 0,
    pending: new Map(),
    sequence: 0,
    token: "a".repeat(64),
    sendInput() {},
    sendProfile() {},
    send(packet: any) {
      sent.push(packet);
    },
    listeners: new Set(),
  }) as Multiplayer;
  const ack = (req: string, data: any) => {
    const pending = net.pending.get(req);
    net.pending.delete(req);
    pending?.callback?.(data);
  };
  return { net, game, sent, ack };
}
test("Releasing before a delayed start ACK cancels its known session and cannot restart consumption", () => {
  const c = client(),
    req = c.net.startEating();
  c.game.held = false;
  c.net.cancelEating();
  assert.deepEqual(c.sent.at(-1).command.session, req);
  assert.equal(c.game.eating, null);
  c.ack(req, { ok: true, eating: { id: 106, progress: 0 }, eatSession: req });
  assert.equal(c.game.eating, null);
  assert.equal(c.net.eatSession, null);
});
test("A finish intent waits for the current start ACK and never rewinds optimistic visual progress", () => {
  const c = client(),
    req = c.net.startEating();
  c.game.eating.elapsed = 1.6;
  assert.equal(c.net.finishEating(), "");
  c.ack(req, { ok: true, eating: { id: 106, progress: 0.1 }, eatSession: req });
  assert.equal(c.game.eating.elapsed, 1.6);
  assert.equal(c.sent.at(-1).command.type, "eatFinish");
  assert.equal(c.sent.at(-1).command.session, req);
  c.ack(c.sent.at(-1).command.req, { ok: true, eaten: 106, eating: null });
  assert.equal(c.game.eating, null);
});
test("An old server cancellation cannot interrupt a newly started food session", () => {
  const c = client(),
    old = c.net.startEating();
  c.net.cancelEating();
  c.game.eating = { id: 106, elapsed: 0 };
  const current = c.net.startEating();
  c.net.receive({ type: "eating", state: null, session: old });
  assert.equal(c.net.eatStartReq, current);
  assert.notEqual(c.game.eating, null);
  c.net.receive({ type: "eating", state: null, session: current });
  assert.equal(c.game.eating, null);
});

test("Actual remote pose interpolates authoritative food progress and stops on the next empty state", () => {
  const c = client(),
    model = avatar();
  model.setHeldItem(106);
  const wire: any = {
    id: "friend",
    nick: "Alicja",
    dimension: "overworld",
    p: [0, 0, 0],
    yaw: 0,
    pitch: 0,
    health: 20,
    held: 106,
    eating: { id: 106, progress: 0.1 },
  };
  const remote: any = { model, wire, position: new THREE.Vector3(), label: new THREE.Sprite() };
  const crumbs: { id: number; origin: THREE.Vector3 }[] = [];
  Object.assign(c.game, {
    world: { dimension: "overworld" },
    spawnEatingCrumbs(id: number, origin: THREE.Vector3) {
      crumbs.push({ id, origin });
    },
  });
  Object.assign(c.net, {
    id: "self",
    remotes: new Map([["friend", remote]]),
    players: [{ ...wire, eating: { id: 106, progress: 0.25 } }],
    entities: new Map(),
    clock: 0,
    horrorClock: 0,
    profileClock: 0,
    networkClock: 0,
    uiClock: 0,
    refreshFurnace() {},
    flushInventory() {},
  });
  c.net.syncPlayers();
  c.net.tick(0.16);
  assert.ok(Math.abs(remote.eatProgress - 0.35) < 1e-9);
  model.group.updateMatrixWorld(true);
  assert.ok(model.heldItem.group.children[0].getWorldPosition(new THREE.Vector3()).y > 1.5);
  c.net.players = [{ ...wire, eating: null }];
  c.net.syncPlayers();
  c.net.tick(0.016);
  assert.equal(remote.eatProgress, -1);
  assert.ok(model.joints.armR.rotation.x === 0);
  c.net.players = [{ ...wire, eating: { id: 106, progress: 0.65 } }];
  c.net.syncPlayers();
  c.net.tick(0.001);
  assert.equal(crumbs.length, 0, "joining a late food snapshot does not replay earlier bites");
  c.net.tick(0.18);
  assert.equal(crumbs.length, 1);
  assert.ok(crumbs[0].origin.y > 1.5);
  c.net.players = [{ ...wire, eating: { id: 106, progress: 0 } }];
  c.net.syncPlayers();
  for (let i = 0; i < 160; i++) c.net.tick(0.01);
  assert.equal(crumbs.length, 6, "a new bite cycle emits exactly five pooled crumb bursts");
  remote.label.material.dispose();
  model.dispose();
});

test("An early finish retries only after the server delay without restarting the food action", () => {
  const c = client(),
    start = c.net.startEating();
  c.ack(start, { ok: true, eating: { id: 106, progress: 0 }, eatSession: start });
  c.game.eating.elapsed = 1.6;
  const finish = c.net.finishEating();
  c.ack(finish, {
    ok: false,
    eating: { id: 106, progress: 0.9 },
    eatSession: start,
    retryAfterMs: 160,
  });
  assert.equal(c.game.eating.elapsed, 1.6);
  assert.equal(c.net.eatSession, start);
  assert.equal(c.net.finishEating(), "");
  c.net.eatRetryAt = 0;
  assert.ok(c.net.finishEating());
  assert.equal(c.sent.at(-1).command.session, start);
});

test("A delayed consumed-food ACK cannot rewind hunger or resurrect an older pack", () => {
  const c = client(),
    pack = new InventoryPack();
  pack.slots[0] = { id: 106, n: 1 };
  Object.assign(c.game, { food: 18, pack, inventory: pack.counts(), emit() {}, syncPack() {} });
  Object.assign(c.net, { inventoryRevision: 8, applied: new Set(), refreshFurnace() {} });
  c.net.receive({
    type: "result",
    req: "old-eat",
    ok: true,
    inventoryRevision: 7,
    food: 12,
    eaten: 106,
    pack: { slots: [{ id: 106, n: 2 }] },
  });
  assert.equal(c.game.food, 18);
  assert.equal(c.game.pack.slots[0].n, 1);
  c.net.receive({ type: "result", req: "new-eat", ok: true, inventoryRevision: 9, food: 20 });
  assert.equal(c.game.food, 20);
});
