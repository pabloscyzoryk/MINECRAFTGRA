import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { Game } from "../lib/engine";
import { Multiplayer } from "../lib/multiplayer";
import { SkinModel, type SkinData } from "../lib/skin-model";

function player() {
  const game = Object.create(Game.prototype) as Game;
  Object.assign(game, {
    position: new THREE.Vector3(0.5, 4, 0.5),
    eyeHeight: 1.62,
    yaw: 0,
    pitch: 0,
    camera: new THREE.PerspectiveCamera(),
    perspective: 0,
    hotbar: [104],
    selected: 0,
    mode: "creative",
    inventory: { 113: 3 },
    attackCooldown: 0,
    actionCooldown: 0,
    net: null,
    target: null,
    mobs: [],
    crystals: [],
    projectiles: [],
    dragon: null,
    scene: new THREE.Scene(),
    audio: { play() {} },
    emit() {},
    notify() {},
    world: {
      dimension: "overworld",
      get(x: number, y: number, z: number) {
        return Math.floor(x) === 0 && Math.floor(y) === 5 && [-2, 2].includes(Math.floor(z))
          ? 1
          : 0;
      },
    },
  });
  return game;
}
function perspective(game: Game, value: number) {
  game.perspective = value;
  game.camera.position
    .copy(game.position)
    .add(new THREE.Vector3(0, game.eyeHeight, value === 1 ? 4 : value === 2 ? -4 : 0));
  game.camera.rotation.set(game.pitch, game.yaw + (value === 2 ? Math.PI : 0), 0, "YXZ");
}

test("Block selection uses the same player eye ray in all three F5 views", () => {
  const game = player();
  const targets = [];
  for (const view of [0, 1, 2]) {
    perspective(game, view);
    const target = game.raycast();
    assert(target);
    assert.equal(target.z, -2, "Front camera must not reverse gameplay aiming");
    targets.push(target);
  }
  assert.deepEqual(targets[0], targets[1]);
  assert.deepEqual(targets[1], targets[2]);
});

test("Player eye height and look angles define aiming even with an unrelated display camera", () => {
  const game = player();
  for (const eyeHeight of [1.3, 1.62])
    for (const pitch of [-1.1, 0, 0.8]) {
      game.eyeHeight = eyeHeight;
      game.pitch = pitch;
      game.yaw = 0.87;
      game.camera.position.set(500, 500, 500);
      const actual = game.playerEyeRay();
      const expected = new THREE.Vector3(0, 0, -1).applyEuler(
        new THREE.Euler(pitch, game.yaw, 0, "YXZ"),
      );
      assert(actual.direction.distanceTo(expected) < 1e-12);
      assert(
        actual.origin.distanceTo(game.position.clone().add(new THREE.Vector3(0, eyeHeight, 0))) <
          1e-12,
      );
    }
});

test("Single-player melee reaches the same target in front and behind-camera views", () => {
  const game = player();
  const crystal = { mesh: new THREE.Group(), alive: true, index: 0 };
  crystal.mesh.position.copy(game.playerEyeRay().at(2.5, new THREE.Vector3()));
  game.crystals = [crystal];
  let hits = 0;
  game.destroyCrystal = () => {
    hits++;
  };
  for (const view of [0, 1, 2]) {
    perspective(game, view);
    game.attackCooldown = 0;
    assert(game.attack());
  }
  assert.equal(hits, 3);
  game.attackCooldown = 0;
  game.target = { x: 0, y: 5, z: -1, px: 0, py: 5, pz: 0, id: 1, distance: 0.5 };
  assert.equal(game.attack(), false, "A nearer selected block still occludes the target");
});

test("Local arrows originate at the player's bow and fly along the same direction in F5", () => {
  const game = player();
  game.yaw = 0.35;
  game.pitch = 0.27;
  const expected = game.playerEyeRay();
  for (const view of [0, 1, 2]) {
    perspective(game, view);
    game.shoot();
    const arrow = game.projectiles.at(-1)!;
    assert(arrow.mesh.position.distanceTo(expected.at(0.6, new THREE.Vector3())) < 1e-12);
    assert(arrow.velocity.clone().normalize().distanceTo(expected.direction) < 1e-12);
    assert(
      new THREE.Vector3(0, 0, -1)
        .applyQuaternion(arrow.mesh.quaternion)
        .distanceTo(expected.direction) < 1e-12,
    );
  }
});

test("Multiplayer target picking and shooting agree with server yaw in all F5 views", () => {
  const game = player();
  const net = Object.create(Multiplayer.prototype) as Multiplayer;
  const group = new THREE.Group();
  group.position.copy(game.playerEyeRay().at(2.6, new THREE.Vector3())).y -= 1;
  const commands: any[] = [];
  Object.assign(net, {
    game,
    remotes: new Map([["other", { model: { group }, wire: { dimension: "overworld" } }]]),
    request: (command: unknown) => commands.push(command),
  });
  for (const view of [0, 1, 2]) {
    perspective(game, view);
    assert(net.attack());
    assert.deepEqual(commands.at(-1), { type: "pvp", target: "other" });
    net.shoot();
    assert.deepEqual(commands.at(-1).direction, game.playerEyeRay().direction.toArray());
  }
});

test("Remote head pitch points toward the same look direction as the local player", () => {
  const model = new SkinModel({
    skin: { width: 64, height: 64 },
    cape: { width: 64, height: 32 },
    capeEnabled: false,
  } as SkinData);
  const net = Object.create(Multiplayer.prototype) as Multiplayer;
  const wire = {
    dimension: "overworld",
    p: [0, 0, 0],
    yaw: 0,
    pitch: 0.6,
    moving: false,
    crouch: false,
  };
  Object.assign(net, {
    game: { world: { dimension: "overworld" } },
    closed: false,
    connected: false,
    flushInventory() {},
    clock: 0,
    horrorClock: 0,
    networkClock: 0,
    profileClock: 0,
    uiClock: 0,
    remotes: new Map([
      [
        "other",
        {
          model,
          wire,
          position: new THREE.Vector3(),
          label: { visible: true, position: new THREE.Vector3() },
        },
      ],
    ]),
    entities: new Map(),
    lastFrame: null,
  });
  try {
    model.group.rotation.y = Math.PI;
    net.tick(0.016);
    model.group.updateMatrixWorld(true);
    const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(
      model.head.getWorldQuaternion(new THREE.Quaternion()),
    );
    const expected = new THREE.Vector3(0, Math.sin(wire.pitch), -Math.cos(wire.pitch));
    assert(forward.distanceTo(expected) < 1e-12);
  } finally {
    model.dispose();
  }
});
