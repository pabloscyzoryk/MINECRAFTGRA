import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { Mob, MOB_NAMES, cubeGeo, mat, type MobKind } from "../lib/entities";
import type { World } from "../lib/world";

const world = {
  surface: () => 10,
  get: (_x: number, y: number) => (y < 10 ? 3 : 0),
  solid: (_x: number, y: number) => y < 10,
} as unknown as World;
function mob(kind: MobKind) {
  const m = new Mob(kind, 0, 0, world);
  m.elapsed = 1.2;
  m.speed = 0;
  m.attackCooldown = 100;
  return m;
}
const hand = (m: Mob, index: number) => {
  m.group.updateMatrixWorld(true);
  return m.hands[index].getWorldPosition(new THREE.Vector3());
};

test("Both melee hands wind up, strike forward/down at the real contact time and recover at yaw 0 and pi/2", () => {
  for (const kind of ["zombie", "skeleton", "piglin", "enderman"] as const)
    for (const yaw of [0, Math.PI / 2]) {
      const m = mob(kind);
      m.group.rotation.y = yaw;
      m.heading = yaw - Math.PI;
      const forward = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
      m.poseArms(-1);
      const rest = m.hands.map((_, i) => hand(m, i));
      m.poseArms(0.23);
      const raised = m.hands.map((_, i) => hand(m, i));
      m.poseArms(0.31 / 0.65);
      m.hands.forEach((_, i) => {
        const contact = hand(m, i),
          shoulder = m.arms[i].getWorldPosition(new THREE.Vector3());
        assert(
          contact.clone().sub(shoulder).dot(forward) > 0.58,
          `${kind} hand ${i} points toward the target at yaw ${yaw}`,
        );
        assert(contact.y < raised[i].y - 0.3, `${kind} strikes from above downwards`);
        assert(
          contact.clone().sub(raised[i]).dot(forward) > 0.2,
          `${kind} reaches forward from the wind-up`,
        );
      });
      m.poseArms(1);
      m.hands.forEach((_, i) => assert(hand(m, i).distanceTo(rest[i]) < 1e-9));
      m.dispose();
    }
});
test("Actual attack update hits once at 0.31s, after the visible wind-up and before recovery", () => {
  const m = mob("zombie");
  m.heading = Math.PI;
  m.group.rotation.y = 0;
  m.attackClock = 0.65;
  const player = new THREE.Vector3(0, 10, -1.5);
  let hits = 0;
  const step = (dt: number) =>
    m.update(
      dt,
      0,
      player,
      world,
      () => hits++,
      () => {},
      () => {},
    );
  step(0.15);
  const raised = hand(m, 0);
  assert.equal(hits, 0);
  step(0.159);
  assert.equal(hits, 0);
  step(0.002);
  assert.equal(hits, 1);
  const contact = hand(m, 0);
  assert(contact.z < -0.5);
  assert(contact.y < raised.y - 0.2);
  step(0.339);
  assert.equal(hits, 1);
  step(0.01);
  assert(m.attackClock <= 0);
  assert.equal(hits, 1);
  m.dispose();
});
test("A ranged skeleton aims its bow and arrow ahead of its own face while drawing and releasing", () => {
  const m = mob("skeleton");
  m.rangedAttack = true;
  for (const yaw of [0, Math.PI / 2]) {
    m.group.rotation.y = yaw;
    m.poseArms(0.4);
    m.group.updateMatrixWorld(true);
    const tip = m.bow!.localToWorld(new THREE.Vector3(0, 0, -0.8));
    const forward = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
    assert(tip.clone().sub(m.group.position).dot(forward) > 1.25);
    const drawn = m.bowString!.position.z;
    m.poseArms(0.31 / 0.65 + 0.02);
    assert(
      m.bowString!.position.z < drawn - 0.1,
      "The bowstring snaps forward when the shot releases",
    );
  }
  m.dispose();
});
test("Skeleton ribs contain real gaps, slime has a translucent shell, and the tall Enderman has articulated fingers", () => {
  const skeleton = mob("skeleton");
  skeleton.group.updateMatrixWorld(true);
  const ray = new THREE.Raycaster(
    new THREE.Vector3(0.19, 11.14, -2),
    new THREE.Vector3(0, 0, 1),
    0,
    4,
  );
  assert.equal(
    ray.intersectObject(skeleton.group, true).length,
    0,
    "A rib cage has space between its ribs rather than a solid torso",
  );
  const slime = mob("slime");
  let translucent = 0,
    solid = 0;
  slime.group.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      const material = o.material as THREE.MeshStandardMaterial;
      if (material.transparent && material.opacity < 0.5) translucent++;
      else solid++;
    }
  });
  assert(translucent > 0 && solid > 0, "The visible inner core sits inside a separate gel shell");
  const enderman = mob("enderman");
  const bounds = new THREE.Box3().setFromObject(enderman.group);
  assert(bounds.max.y - enderman.group.position.y > 2.9);
  assert.equal(enderman.elbows.length, 2);
  assert(enderman.hands.every((h) => h.children.some((o) => o instanceof THREE.InstancedMesh)));
  [skeleton, slime, enderman].forEach((m) => m.dispose());
});

test("The drawing hand reaches the nock at arrow height and both string endpoints stay anchored", () => {
  const m = mob("skeleton");
  m.rangedAttack = true;
  for (const yaw of [0, Math.PI / 2])
    for (const progress of [-1, 0, 0.15, 0.23, 0.4, 0.45, 0.6, 0.9, 1]) {
      m.group.rotation.y = yaw;
      m.poseArms(progress);
      m.group.updateMatrixWorld(true);
      const nock = m.bowString!.getWorldPosition(new THREE.Vector3());
      if (progress >= 0.23 && progress <= 0.45) {
        const drawHand = hand(m, 1);
        assert(
          drawHand.distanceTo(nock) < 0.025,
          `The hand reaches the string at ${progress}: ${drawHand.distanceTo(nock)}`,
        );
        assert(Math.abs(drawHand.y - nock.y) < 0.005, "The hand is level with the nocked arrow");
        assert(m.bowArrow!.getWorldPosition(new THREE.Vector3()).distanceTo(nock) < 1e-9);
      }
      for (const [i, string] of m.bowStrings.entries()) {
        const tip = m.bow!.localToWorld(new THREE.Vector3(0, (i ? 1 : -1) * 0.47, -0.17));
        assert(string.localToWorld(new THREE.Vector3(0, -0.5, 0)).distanceTo(tip) < 1e-9);
        assert(string.localToWorld(new THREE.Vector3(0, 0.5, 0)).distanceTo(nock) < 1e-9);
      }
    }
  m.poseArms(-1);
  const rest = hand(m, 1);
  m.poseArms(0.4);
  m.poseArms(1);
  assert(
    hand(m, 1).distanceTo(rest) < 1e-9,
    "The release animation recovers to the idle hand pose",
  );
  m.dispose();
});

test("The Piglin's cleaver stays above the feet during idle and a walking arm swing", () => {
  const m = mob("piglin"),
    sword = m.group.getObjectByName("golden-cleaver")!;
  for (const gait of [0, Math.PI / 2, Math.PI, Math.PI * 1.5]) {
    m.walkBlend = 1;
    m.gait = gait;
    m.poseArms(-1);
    m.group.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(sword);
    assert(bounds.min.y > m.group.position.y + 0.025, "The blade must not intersect the ground");
  }
  m.dispose();
});
test("Ghast tentacle tips lag their roots and Blaze rods orbit in three separated tiers", () => {
  const ghast = mob("ghast"),
    blaze = mob("blaze"),
    far = new THREE.Vector3(999, 10, 999);
  for (const m of [ghast, blaze])
    m.update(
      0.1,
      0,
      far,
      world,
      () => {},
      () => {},
      () => {},
    );
  assert.equal(ghast.tendrils.length, 9);
  assert(
    ghast.tendrils.some((tip, i) => Math.abs(tip.rotation.x - ghast.legs[i].rotation.x) > 0.1),
  );
  assert.equal(blaze.legs.length, 12);
  assert(
    Math.max(...blaze.legs.map((r) => r.position.y)) -
      Math.min(...blaze.legs.map((r) => r.position.y)) >
      0.8,
  );
  ghast.dispose();
  blaze.dispose();
});
test("All rigs share geometry, keep their details finite through every animation and release instance resources once", () => {
  let geometryDisposals = 0;
  const onDispose = () => geometryDisposals++;
  cubeGeo.addEventListener("dispose", onDispose);
  try {
    for (const kind of Object.keys(MOB_NAMES) as MobKind[]) {
      const m = mob(kind),
        materials = new Set<THREE.Material>();
      let meshes = 0,
        instanceCount = 0,
        instanceDisposals = 0;
      m.group.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          meshes++;
          assert.equal(o.geometry, cubeGeo);
          materials.add(o.material as THREE.Material);
        }
        if (o instanceof THREE.InstancedMesh) {
          assert.equal(
            o.castShadow,
            false,
            "Tiny surface details do not multiply shadow draw calls",
          );
          assert.equal(o.receiveShadow, true);
          instanceCount++;
          o.addEventListener("dispose", () => instanceDisposals++);
        }
      });
      assert.equal(
        materials.size,
        m.skinMaterials.length,
        "Per-mob materials are shared across all meshes of the same color",
      );
      assert(meshes < 80, `${kind} keeps a bounded number of draw calls`);
      for (const attackClock of [0.65, 0.5, 0.34, 0.2, 0]) {
        m.attackClock = attackClock;
        m.update(
          0.01,
          0,
          new THREE.Vector3(999, 10, 999),
          world,
          () => {},
          () => {},
          () => {},
        );
        m.group.updateMatrixWorld(true);
        m.group.traverse((o) => assert(o.matrixWorld.elements.every(Number.isFinite), kind));
      }
      m.hurt = 0.5;
      m.update(
        0.01,
        0,
        new THREE.Vector3(999, 10, 999),
        world,
        () => {},
        () => {},
        () => {},
      );
      m.die();
      m.update(
        1.4,
        0,
        new THREE.Vector3(),
        world,
        () => {},
        () => {},
        () => {},
      );
      assert.equal(m.group.visible, false);
      m.dispose();
      m.dispose();
      assert.equal(instanceDisposals, instanceCount);
      assert.equal(m.skinMaterials.length, 0);
    }
    assert.equal(geometryDisposals, 0, "Disposing one mob never frees the shared cube geometry");
    assert.equal(
      mat("#698255").emissiveIntensity,
      0,
      "Hurt and death never mutate the shared material cache",
    );
  } finally {
    cubeGeo.removeEventListener("dispose", onDispose);
  }
});
