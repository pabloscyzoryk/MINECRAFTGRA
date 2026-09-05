import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import {
  HorrorPresentation,
  horrorEnvelope,
  horrorGain,
  type HorrorPresentationContext,
} from "../lib/horror-presentation";
import type { HorrorEvent } from "../lib/horror-director";

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

test("Guest has articulated mask, jaw and ten long fingers, with no chasing transform", () => {
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
  a.event(event({ kind: "jumpscare", duration: 1.1 }));
  b.event(event({ kind: "jumpscare", duration: 1.1 }));
  a.update(0.016, { ...context, time: 10.2 });
  b.update(0.016, { ...context, time: 10.2, jumpscares: false });
  assert(a.closeup.visible);
  assert(!a.group.visible);
  assert(!b.closeup.visible);
  assert(a.closeup.position.distanceTo(new THREE.Vector3(3, 25, 7)) < 1);
  a.update(0.016, { ...context, time: 10.95 });
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
  for (const group of [guest.group, guest.closeup])
    group.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        geometries.add(o.geometry);
        for (const material of Array.isArray(o.material) ? o.material : [o.material])
          materials.add(material);
      }
    });
  let geometryDisposals = 0,
    materialDisposals = 0;
  for (const geometry of geometries)
    geometry.addEventListener("dispose", () => geometryDisposals++);
  for (const material of materials) material.addEventListener("dispose", () => materialDisposals++);
  guest.dispose();
  guest.dispose();
  assert(geometries.size > 50);
  assert.equal(geometryDisposals, geometries.size);
  assert.equal(materialDisposals, materials.size);
  assert.equal(guest.group.parent, null);
  assert.equal(guest.closeup.parent, null);
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
      start() {},
      stop() {
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
