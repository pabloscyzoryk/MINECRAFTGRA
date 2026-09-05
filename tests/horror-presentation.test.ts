import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import {
  HorrorPresentation,
  horrorEnvelope,
  horrorGain,
  horrorCloseupPose,
  type HorrorPresentationContext,
} from "../lib/horror-presentation";
import type { HorrorEvent } from "../lib/horror-director";
import type { HuntWire } from "../lib/horror-hunt";

const context: HorrorPresentationContext = {
  enabled: true,
  active: true,
  dimension: "overworld",
  time: 12,
  volume: 0.7,
  jumpscares: true,
};
const event = (changes: Partial<HorrorEvent> = {}): HorrorEvent => ({
  id: "guest-1",
  kind: "watcher",
  p: [11, 22, -7],
  at: 10,
  yaw: 1.1,
  duration: 9,
  intensity: 0.6,
  seed: 2468,
  reason: "alone",
  viewerIds: ["p1", "p2"],
  dimension: "overworld",
  ...changes,
});
function presentation() {
  const scene = new THREE.Scene(),
    camera = new THREE.PerspectiveCamera(72, 1, 0.1, 500);
  camera.position.set(3, 25, 7);
  return new HorrorPresentation(scene, camera, { ctx: null, volume: 0.5, enabled: false });
}

test("Guest has articulated mask, jaw and ten long fingers; incidental apparitions stay in place", () => {
  const guest = presentation();
  guest.event(event());
  guest.update(0.016, context);
  assert(guest.group.visible);
  assert.equal(guest.fingers.length, 10);
  assert(guest.head.position.y > 3);
  assert(guest.jaw.children.length > 0);
  assert.equal(guest.group.position.x, 11);
  assert.equal(guest.group.position.z, -7);
  assert.equal(guest.group.rotation.y, 1.1);
  const angle = guest.jaw.rotation.x;
  guest.update(0.016, { ...context, time: 14, player: new THREE.Vector3(800, 10, 800) });
  assert.notEqual(guest.jaw.rotation.x, angle);
  assert.equal(guest.group.position.x, 11);
  assert.equal(guest.group.position.z, -7);
  guest.dispose();
});

test("Two viewers use the same absolute event phase and world position despite arrival delay", () => {
  const a = presentation(),
    b = presentation();
  a.event(event());
  a.update(0.016, { ...context, time: 10.2 });
  a.update(0.016, { ...context, time: 12.5 });
  b.event(event());
  b.update(0.016, { ...context, time: 12.5 });
  assert.deepEqual(a.group.position.toArray(), b.group.position.toArray());
  assert.deepEqual(a.head.rotation.toArray(), b.head.rotation.toArray());
  assert.equal(a.jaw.rotation.x, b.jaw.rotation.x);
  a.dispose();
  b.dispose();
});

test("Pause, dimension changes and disable hide all apparition layers", () => {
  const guest = presentation();
  guest.event(event());
  guest.update(0.016, context);
  assert(guest.group.visible);
  guest.update(1, { ...context, active: false });
  assert(!guest.group.visible && !guest.closeup.visible);
  assert.equal(guest.overlay, 0);
  guest.update(0.016, { ...context, dimension: "end" });
  assert(!guest.group.visible);
  guest.update(0.016, { ...context, enabled: false });
  guest.update(0.016, context);
  assert(!guest.group.visible && !guest.closeup.visible);
  guest.dispose();
});

test("Close encounter is brief and can be disabled without displaying a mask", () => {
  const a = presentation(),
    b = presentation();
  a.event(event({ kind: "jumpscare", duration: 1.3 }));
  b.event(event({ kind: "jumpscare", duration: 1.3 }));
  a.update(0.016, { ...context, time: 10.35 });
  b.update(0.016, { ...context, time: 10.35, jumpscares: false });
  assert(a.closeup.visible);
  assert(!a.group.visible);
  assert(!b.closeup.visible);
  assert(a.closeup.position.distanceTo(new THREE.Vector3(3, 25, 7)) < 1);
  a.update(0.016, { ...context, time: 11.2 });
  assert(a.closeup.visible);
  a.update(0.016, { ...context, time: 11.31 });
  assert(!a.closeup.visible);
  a.dispose();
  b.dispose();
});

test("Vanish targets its own event and duplicate packets cannot replay a scare", () => {
  const guest = presentation();
  guest.event(event());
  guest.update(0.016, context);
  guest.event(event({ id: "wrong", kind: "vanish", targetId: "other" }));
  guest.update(0.016, context);
  assert(guest.group.visible);
  guest.event(event({ id: "vanish", kind: "vanish", targetId: "guest-1" }));
  guest.event(event());
  guest.update(0.016, context);
  assert(!guest.group.visible);
  guest.dispose();
});

test("Envelope fades once without flickering; volume is bounded and multiplied by game volume", () => {
  assert.equal(horrorGain(0, 1), 0);
  assert.equal(horrorGain(1, 0), 0);
  assert.equal(horrorGain(10, 5), 0.28);
  assert.equal(horrorGain(Number.NaN, 1), 0);
  assert.equal(horrorGain(0.5, 0.5), 0.07);
  assert.equal(horrorEnvelope(-1, 9), 0);
  assert.equal(horrorEnvelope(0, 9), 0);
  assert.equal(horrorEnvelope(9, 9), 0);
  let previous = 0;
  for (let t = 0; t < 0.65; t += 0.01) {
    const value = horrorEnvelope(t, 9);
    assert(value >= previous && value <= 1);
    previous = value;
  }
});

test("Every procedural geometry and material is disposed once, including shared closeup meshes", () => {
  const guest = presentation();
  const geometries = new Set<THREE.BufferGeometry>(),
    materials = new Set<THREE.Material>();
  for (const group of [guest.group, guest.closeup, guest.distant])
    group.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        geometries.add(o.geometry);
        for (const material of Array.isArray(o.material) ? o.material : [o.material])
          materials.add(material);
      }
    });
  let geometryDisposals = 0,
    materialDisposals = 0,
    textureDisposals = 0;
  guest.distant.material.map!.addEventListener("dispose", () => textureDisposals++);
  for (const geometry of geometries)
    geometry.addEventListener("dispose", () => geometryDisposals++);
  for (const material of materials) material.addEventListener("dispose", () => materialDisposals++);
  guest.dispose();
  guest.dispose();
  assert(geometries.size > 50);
  assert.equal(geometryDisposals, geometries.size);
  assert.equal(materialDisposals, materials.size);
  assert.equal(textureDisposals, 1);
  assert.equal(guest.group.parent, null);
  assert.equal(guest.closeup.parent, null);
  assert.equal(guest.distant.parent, null);
});

function fakeAudio() {
  const nodes: any[] = [];
  const param = () => ({
    value: 0,
    setValueAtTime(n: number) {
      this.value = n;
    },
    setTargetAtTime(n: number) {
      this.value = n;
    },
    linearRampToValueAtTime(n: number) {
      this.value = n;
    },
    exponentialRampToValueAtTime(n: number) {
      this.value = n;
    },
    cancelScheduledValues() {},
  });
  const node = (source = false) => {
    const result = {
      disconnected: false,
      source,
      stopped: false,
      startedAt: -1,
      stoppedAt: -1,
      gain: param(),
      frequency: param(),
      Q: param(),
      threshold: param(),
      knee: param(),
      ratio: param(),
      attack: param(),
      release: param(),
      positionX: param(),
      positionY: param(),
      positionZ: param(),
      connect() {},
      disconnect() {
        this.disconnected = true;
      },
      start(time = 0) {
        this.startedAt = time;
      },
      stop(time = 0) {
        this.stoppedAt = time;
        this.stopped = true;
      },
    };
    nodes.push(result);
    return result;
  };
  const ctx = {
    currentTime: 0,
    sampleRate: 8000,
    state: "running",
    destination: {},
    listener: Object.fromEntries(
      [
        "positionX",
        "positionY",
        "positionZ",
        "forwardX",
        "forwardY",
        "forwardZ",
        "upX",
        "upY",
        "upZ",
      ].map((key) => [key, param()]),
    ),
    createGain: () => node(),
    createDynamicsCompressor: () => node(),
    createWaveShaper: () => node(),
    createPanner: () => node(),
    createBiquadFilter: () => node(),
    createOscillator: () => node(true),
    createBufferSource: () => node(true),
    createBuffer: (_: number, length: number) => ({
      getChannelData: () => new Float32Array(length),
    }),
  };
  return { ctx, nodes };
}

test("Spatial audio respects volume, caps concurrent voices and stops/disconnects everything on pause", () => {
  const { ctx, nodes } = fakeAudio();
  const guest = new HorrorPresentation(new THREE.Scene(), new THREE.PerspectiveCamera(), {
    ctx: ctx as unknown as AudioContext,
    enabled: true,
    volume: 0.5,
  });
  for (let i = 0; i < 30; i++) guest.event(event({ id: `knock-${i}`, kind: "knock", at: 12 }));
  guest.update(0.016, context);
  assert.equal(nodes[0].gain.value, horrorGain(0.5, 0.7));
  const sources = nodes.filter((n) => n.source);
  assert(sources.length > 0 && sources.length <= 14);
  assert(nodes.some((n) => n.positionX.value === 11 && n.positionZ.value === -7));
  guest.update(0.016, { ...context, active: false });
  assert.equal(nodes[0].gain.value, 0);
  assert(sources.every((n) => n.stopped && n.disconnected));
  guest.dispose();
  assert(nodes.every((n) => n.disconnected));
});

test("Turning jumpscares off also suppresses the stinger", () => {
  const { ctx, nodes } = fakeAudio();
  const guest = new HorrorPresentation(new THREE.Scene(), new THREE.PerspectiveCamera(), {
    ctx: ctx as unknown as AudioContext,
    enabled: true,
    volume: 1,
  });
  guest.event(event({ kind: "jumpscare", at: 12, duration: 1.1 }));
  guest.update(0.016, { ...context, jumpscares: false });
  assert.equal(nodes.filter((n) => n.source).length, 0);
  guest.dispose();
});

test("Stinger stays beside the camera and its soft limiter bounds every possible output sample", () => {
  const { ctx, nodes } = fakeAudio();
  const camera = new THREE.PerspectiveCamera();
  camera.position.set(30, 20, 50);
  camera.rotation.y = Math.PI / 2;
  const guest = new HorrorPresentation(new THREE.Scene(), camera, {
    ctx: ctx as unknown as AudioContext,
    enabled: true,
    volume: 1,
  });
  guest.event(event({ kind: "jumpscare", at: 12, duration: 1.1, p: [1000, 30, 1000] }));
  guest.update(0.016, { ...context, volume: 1 });
  const curve = nodes.find((node) => node.curve)?.curve as Float32Array;
  assert(curve && curve.length > 1000);
  for (const sample of curve) assert(Math.abs(sample) * horrorGain(1, 1) < 0.183);
  assert(
    nodes.some(
      (n) => n.positionX.value === 30 && n.positionY.value === 20 && n.positionZ.value === 50,
    ),
  );
  assert(Math.abs(ctx.listener.forwardX.value + 1) < 1e-9);
  assert(Math.abs(ctx.listener.forwardZ.value) < 1e-9);
  guest.dispose();
});

test("Clearing a world allows a fresh director to restart its event sequence", () => {
  const guest = presentation();
  guest.event(event());
  guest.update(0.016, context);
  guest.clear();
  guest.event(event());
  guest.update(0.016, context);
  assert(guest.group.visible);
  guest.dispose();
});

const threat = (changes: Partial<HuntWire> = {}): HuntWire => ({
  id: "hunt-1",
  dimension: "overworld",
  p: [6, 10, -9],
  yaw: 0.7,
  phase: "stalk",
  hp: 140,
  maxHp: 140,
  targetId: "p1",
  viewerIds: ["p1", "p2"],
  at: 102,
  phaseAt: 100,
  phaseDuration: 6,
  seed: 821,
  ...changes,
});

test("Camera-relative eye framing survives portrait, ultrawide, FOV and arbitrary camera pose", () => {
  for (const aspect of [0.45, 0.6, 1, 16 / 9, 2.4]) {
    for (const fov of [50, 72, 100]) {
      const scene = new THREE.Scene(),
        camera = new THREE.PerspectiveCamera(fov, aspect, 0.05, 500);
      camera.position.set(61, 18, -47);
      camera.rotation.set(-0.4, 1.1, 0.13, "YXZ");
      const rotation = camera.quaternion.clone(),
        position = camera.position.clone();
      const guest = new HorrorPresentation(scene, camera, { ctx: null, enabled: false, volume: 0 });
      guest.event(event({ kind: "jumpscare", duration: 1.3 }));
      for (const age of [0.05, 0.34, 0.8, 1.2]) {
        guest.update(0.016, { ...context, time: 10 + age });
        camera.updateMatrixWorld();
        scene.updateMatrixWorld(true);
        for (const name of ["guest-eye-left", "guest-eye-right"]) {
          const point = guest.closeup
            .getObjectByName(name)!
            .getWorldPosition(new THREE.Vector3())
            .project(camera);
          assert(
            Math.abs(point.x) < 0.92 && Math.abs(point.y) < 0.92 && Math.abs(point.z) < 1,
            `eyes within frame: aspect=${aspect}, fov=${fov}, age=${age}, point=${point.toArray()}`,
          );
        }
        if (age >= 0.34) {
          for (const hand of guest.closeHands) {
            const bounds = new THREE.Box3().setFromObject(hand);
            let intersects = false;
            for (const x of [bounds.min.x, bounds.max.x])
              for (const y of [bounds.min.y, bounds.max.y])
                for (const z of [bounds.min.z, bounds.max.z]) {
                  const point = new THREE.Vector3(x, y, z).project(camera);
                  if (Math.abs(point.x) < 1 && Math.abs(point.y) < 1 && Math.abs(point.z) < 1)
                    intersects = true;
                }
            assert(intersects, `fingers enter frame at aspect=${aspect}, fov=${fov}, age=${age}`);
          }
        }
      }
      assert.deepEqual(camera.position, position);
      assert.deepEqual(camera.quaternion.toArray(), rotation.toArray());
      guest.dispose();
    }
  }
});

test("Reduced motion retains mask and jaw but removes the depth strike and most head twist", () => {
  const before = horrorCloseupPose(0.05),
    after = horrorCloseupPose(0.4);
  const stillBefore = horrorCloseupPose(0.05, 16 / 9, 72, true),
    stillAfter = horrorCloseupPose(0.4, 16 / 9, 72, true);
  assert(before.depth - after.depth > 1.8);
  assert(stillBefore.depth - stillAfter.depth < 0.03);
  assert(Math.abs(stillAfter.roll) < Math.abs(after.roll) * 0.25);
  assert(stillAfter.jaw > 0.9);
  assert(
    Object.values(horrorCloseupPose(Number.NaN, Number.NaN, Number.NaN)).every(Number.isFinite),
  );
});

test("Hunt uses its own clock, authoritative position and articulated telegraph/stagger poses", () => {
  const guest = presentation();
  const snapshot = threat({ phase: "lungeTell", phaseDuration: 1.1, lungeTo: [90, 80, 70] });
  guest.update(0.016, {
    ...context,
    time: 9000,
    huntTime: 100.8,
    threat: snapshot,
    viewerId: "p1",
  });
  assert(guest.group.visible && !guest.distant.visible);
  assert.deepEqual(guest.group.position.toArray(), snapshot.p);
  assert.equal(guest.group.rotation.y, snapshot.yaw);
  assert(guest.arms.every((arm) => arm.rotation.x < -1));
  assert(guest.forearms.every((elbow) => elbow.rotation.x < -0.3));
  assert(guest.group.scale.y < 0.94);
  guest.group.updateMatrixWorld(true);
  for (let i = 0; i < 2; i++) {
    assert.equal(guest.forearms[i].parent, guest.arms[i]);
    assert.equal(guest.hands[i].parent, guest.forearms[i]);
    const endpoint = guest.forearms[i].localToWorld(
      new THREE.Vector3(i ? 0.035 : -0.035, -0.47, 0.09),
    );
    assert(endpoint.distanceTo(guest.hands[i].getWorldPosition(new THREE.Vector3())) < 1e-9);
  }
  guest.update(0.016, {
    ...context,
    huntTime: 100.2,
    threat: threat({ phase: "lunge", lungeTo: [90, 80, 70] }),
  });
  assert.deepEqual(guest.group.position.toArray(), [6, 10, -9]);
  guest.update(0.016, {
    ...context,
    huntTime: 100.2,
    threat: threat({ phase: "vulnerable", phaseDuration: 2.4, hurt: 0.5 }),
  });
  assert(guest.group.rotation.z < -0.2);
  assert(guest.jaw.rotation.x > 0.3);
  guest.dispose();
});

test("Recovery and incidental watcher cannot hide an active hunt; wrong mode/viewer/dimension hides it", () => {
  const guest = presentation();
  guest.event(event({ p: [0, 0, -30], reason: "passive-watch" }));
  guest.update(0.016, { ...context, threat: threat(), huntTime: 102, viewerId: "p1" });
  assert(guest.group.visible && !guest.distant.visible);
  guest.event(event({ id: "recovery", kind: "recovery" }));
  guest.update(0.016, { ...context, threat: threat(), huntTime: 102, viewerId: "p1" });
  assert(guest.group.visible);
  for (const filter of [
    { viewerId: "normal-user" },
    { dimension: "end" as const },
    { active: false },
    { enabled: false },
  ]) {
    guest.update(0.016, { ...context, threat: threat(), ...filter });
    assert(!guest.group.visible && !guest.closeup.visible && !guest.distant.visible);
  }
  guest.update(0.016, context);
  assert(!guest.group.visible);
  guest.dispose();
});

test("Only the caught target receives closeup/stinger; opted-in witnesses see the world rig", () => {
  for (const viewerId of ["p1", "p2", "normal-user"]) {
    const { ctx, nodes } = fakeAudio();
    const guest = new HorrorPresentation(new THREE.Scene(), new THREE.PerspectiveCamera(), {
      ctx: ctx as unknown as AudioContext,
      enabled: true,
      volume: 1,
    });
    guest.event(event({ kind: "jumpscare", duration: 1.3 }));
    guest.update(0.016, {
      ...context,
      time: 10.35,
      huntTime: 100.35,
      threat: threat({ phase: "caught", phaseDuration: 1.3 }),
      viewerId,
    });
    assert.equal(guest.closeup.visible, viewerId === "p1");
    assert.equal(guest.group.visible, viewerId === "p2");
    assert.equal(nodes.filter((n) => n.source).length > 0, viewerId === "p1");
    guest.dispose();
  }
});

test("Mask has nonuniform procedural stains and cracks while deep eye sockets stay black", () => {
  const guest = presentation();
  let stainedWorld = 0,
    stainedClose = 0;
  for (const [group, close] of [
    [guest.group, false],
    [guest.closeup, true],
  ] as const) {
    group.traverse((node) => {
      if (!(node instanceof THREE.Mesh) || !node.geometry.attributes.color) return;
      const values = node.geometry.attributes.color as THREE.BufferAttribute;
      const red = Array.from({ length: values.count }, (_, i) => values.getX(i));
      assert(Math.max(...red) - Math.min(...red) > 0.45);
      assert((node.material as THREE.MeshBasicMaterial).vertexColors);
      if (close) stainedClose++;
      else stainedWorld++;
    });
    for (const name of ["guest-eye-left", "guest-eye-right"]) {
      const material = (group.getObjectByName(name) as THREE.Mesh)
        .material as THREE.MeshBasicMaterial;
      assert(!material.vertexColors && material.color.r < 0.01);
    }
  }
  assert(stainedWorld > 0 && stainedClose === stainedWorld);
  guest.dispose();
});

test("Close audio schedules a quiet intake, brief gap and layered impact under the original limiter", () => {
  const { ctx, nodes } = fakeAudio();
  const guest = new HorrorPresentation(new THREE.Scene(), new THREE.PerspectiveCamera(), {
    ctx: ctx as unknown as AudioContext,
    enabled: true,
    volume: 1,
  });
  guest.event(event({ kind: "jumpscare", duration: 1.3, at: 12 }));
  guest.update(0.016, context);
  const sources = nodes.filter((n) => n.source);
  assert.equal(sources.length, 9);
  const whispers = sources.filter((n) => n.startedAt === 0),
    impact = sources.filter((n) => n.startedAt > 0);
  assert.equal(whispers.length, 2);
  assert.equal(impact.length, 7);
  assert(
    Math.max(...whispers.map((n) => n.stoppedAt)) < Math.min(...impact.map((n) => n.startedAt)),
  );
  assert(impact.every((n) => n.startedAt >= 0.21 && n.startedAt <= 0.36));
  assert(sources.some((n) => n.type === "square" && n.startedAt === 0.215));
  assert.equal(nodes[0].gain.value, horrorGain(1, 0.7));
  guest.dispose();
});

test("The creature strikes in under a tenth of a second then recoils without moving the camera", () => {
  assert(horrorCloseupPose(0.13).depth > 2.6);
  assert(horrorCloseupPose(0.22).depth < 0.7);
  const samples = Array.from({ length: 50 }, (_, i) => horrorCloseupPose(0.25 + i * 0.005));
  assert(samples.some((pose) => pose.sway > 0.009) && samples.some((pose) => pose.sway < -0.009));
  for (const pose of samples) {
    assert(Math.abs(pose.sway) <= 0.012 && Math.abs(pose.fingerJolt) <= 0.11);
    assert(pose.jaw >= 0.8 && pose.jaw <= 1.31);
  }
  assert.equal(Math.abs(horrorCloseupPose(1.2).sway), 0);
  assert.equal(Math.abs(horrorCloseupPose(0.3, 1, 72, true).sway), 0);
});

test("Distant passive watcher is one soft, depth-occluded, fogged card without audio or overlay", () => {
  const { ctx, nodes } = fakeAudio();
  const guest = new HorrorPresentation(new THREE.Scene(), new THREE.PerspectiveCamera(), {
    ctx: ctx as unknown as AudioContext,
    enabled: true,
    volume: 1,
  });
  guest.event(
    event({ p: [0, 0, -30], reason: "passive-watch", at: 11, duration: 15, intensity: 0.25 }),
  );
  guest.update(0.016, { ...context, viewerId: "p1" });
  assert(guest.distant.visible && !guest.group.visible && !guest.closeup.visible);
  assert.equal(nodes.filter((n) => n.source).length, 0);
  assert.equal(guest.overlay, 0);
  assert(guest.distant.material.opacity < 0.6);
  assert(
    guest.distant.material.depthTest &&
      !guest.distant.material.depthWrite &&
      guest.distant.material.fog,
  );
  assert.equal(guest.distant.material.map!.magFilter, THREE.LinearFilter);
  const pixels = (guest.distant.material.map!.image as { data: Uint8Array }).data;
  assert(pixels.length <= 64 * 128 * 4);
  const alpha = Array.from(pixels).filter((_, i) => i % 4 === 3);
  assert(
    alpha.some((n) => n === 0) && alpha.some((n) => n > 0 && n < 150) && alpha.some((n) => n > 200),
  );
  guest.update(0.016, { ...context, threat: threat(), huntTime: 102, viewerId: "p1" });
  assert(guest.group.visible && !guest.distant.visible);
  guest.clear();
  assert(!guest.distant.visible);
  guest.dispose();
});
