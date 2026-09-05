import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { Multiplayer } from "../lib/multiplayer";
import { weapon } from "../lib/combat";

const threat = () => ({
  id: "guest-1",
  dimension: "overworld",
  p: [0, 0, -2.5],
  yaw: 0,
  hp: 130,
  maxHp: 140,
  targetId: "me",
  viewerIds: ["me"],
  phase: "vulnerable",
  at: 10,
  phaseAt: 9,
  phaseDuration: 2,
  seed: 1,
});
function fixture() {
  const requests: any[] = [];
  const game: any = {
    difficulty: "horror",
    world: { dimension: "overworld" },
    horrorThreat: null,
    horror: { clear() {} },
    emit() {},
    hotbar: [108],
    selected: 0,
    target: null,
    mobs: [],
    crystals: [],
    dragon: null,
    playerEyeRay: () => new THREE.Ray(new THREE.Vector3(0, 1.62, 0), new THREE.Vector3(0, 0, -1)),
  };
  const net = Object.assign(Object.create(Multiplayer.prototype), {
    game,
    id: "me",
    closed: false,
    remotes: new Map(),
    request: (command: any) => requests.push(command),
  }) as Multiplayer;
  return { game, net, requests };
}
test("Only eligible Horror viewers accept hunt updates in their dimension", () => {
  const { game, net } = fixture();
  net.receive({ type: "horrorHunt", hunt: threat(), clock: 10 });
  assert.equal(game.horrorThreat.id, "guest-1");
  assert.equal(net.huntClock, 10);
  for (const bad of [
    { ...threat(), p: [NaN, 0, 0] },
    { ...threat(), viewerIds: ["other"] },
    { ...threat(), dimension: "nether" },
    { ...threat(), phase: "bogus" },
  ]) {
    net.receive({ type: "horrorHunt", hunt: bad, clock: 11 });
    assert.equal(game.horrorThreat, null);
  }
  game.difficulty = "normal";
  net.receive({ type: "horrorHunt", hunt: threat(), clock: 12 });
  assert.equal(game.horrorThreat, null);
});
test("Melee chooses a visible Guest and retains the selected weapon cooldown", () => {
  const { game, net, requests } = fixture();
  game.horrorThreat = threat();
  assert.equal(net.attack(), true);
  assert.deepEqual(requests, [{ type: "huntHit", target: "guest-1" }]);
  assert.equal(game.attackCooldown, weapon(108).cooldown);
});
test("A solid foreground target, defeated Guest or regular difficulty cannot produce hunt attacks", () => {
  for (const condition of ["wall", "banished", "normal"]) {
    const { game, net, requests } = fixture();
    game.horrorThreat = threat();
    if (condition === "wall") game.target = { distance: 0.2 };
    if (condition === "banished") game.horrorThreat.phase = "banished";
    if (condition === "normal") game.difficulty = "normal";
    assert.equal(net.attack(), false);
    assert.equal(requests.length, 0);
  }
});
test("Server reset clears the hunt without keeping the previous target alive in the UI", () => {
  const { game, net } = fixture();
  game.horrorThreat = threat();
  net.receive({ type: "horrorReset" });
  assert.equal(game.horrorThreat, null);
});
