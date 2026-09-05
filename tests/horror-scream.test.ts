import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import {
  HorrorScreamBuffer,
  HORROR_SCREAM_DURATION,
  HORROR_SCREAM_START,
  horrorScreamPitch,
  horrorScreamTiming,
  synthesizeHorrorScream,
} from "../lib/horror-scream";
import {
  HorrorPresentation,
  horrorCloseupPose,
  type HorrorPresentationContext,
} from "../lib/horror-presentation";
import type { HorrorEvent } from "../lib/horror-director";

const rms = (samples: Float32Array) =>
  Math.sqrt(samples.reduce((sum, n) => sum + n * n, 0) / samples.length);

test("Original vocal buffer is finite, reproducible, bounded and fades to silence without DC offset", () => {
  for (const rate of [8000, 22050, 48000, Number.NaN]) {
    const { samples, sampleRate } = synthesizeHorrorScream(rate);
    assert.equal(samples.length, Math.ceil(sampleRate * HORROR_SCREAM_DURATION));
    assert(samples.every((sample) => Number.isFinite(sample) && Math.abs(sample) < 0.881));
    assert.equal(samples[0], 0);
    assert(Math.abs(samples.at(-1)!) < 1e-8);
    assert(Math.abs(samples.reduce((sum, n) => sum + n, 0) / samples.length) < 0.005);
    const main = rms(samples.subarray(Math.floor(sampleRate * 0.15), Math.floor(sampleRate * 0.6)));
    assert(main > 0.12 && main < 0.5, `useful but bounded RMS ${main}`);
    assert(rms(samples.subarray(-Math.floor(sampleRate * 0.025))) < main * 0.04);
    assert.deepEqual(samples, synthesizeHorrorScream(rate).samples);
  }
  assert.notDeepEqual(
    synthesizeHorrorScream(8000, 11).samples,
    synthesizeHorrorScream(8000, 12).samples,
  );
});

test("Scream has rising and falling vocal pitch with a crack, and periodic voiced content rather than only noise", () => {
  assert(horrorScreamPitch(0) < 400);
  assert(horrorScreamPitch(0.2) > 650);
  assert(horrorScreamPitch(0.34) < horrorScreamPitch(0.3) - 70);
  assert(horrorScreamPitch(0.86) < 500);
  assert(Number.isFinite(horrorScreamPitch(Number.NaN)));
  const { samples, sampleRate } = synthesizeHorrorScream();
  const start = Math.floor(0.5 * sampleRate),
    expectedPeriod = sampleRate / horrorScreamPitch(0.51);
  let best = -1;
  for (let lag = Math.floor(expectedPeriod) - 3; lag <= Math.ceil(expectedPeriod) + 3; lag++) {
    let xy = 0,
      xx = 0,
      yy = 0;
    for (let i = 0; i < 512; i++) {
      const a = samples[start + i],
        b = samples[start + i + lag];
      xy += a * b;
      xx += a * a;
      yy += b * b;
    }
    best = Math.max(best, xy / Math.sqrt(xx * yy));
  }
  assert(best > 0.45, `glottal periodicity retained after formants: ${best}`);
});

test("Scream starts at the closeup impact; late or expired packets only play the remaining segment", () => {
  const initial = horrorScreamTiming(0, 1.3)!;
  assert.equal(initial.delay, 0.23);
  assert.equal(initial.offset, 0);
  assert(Math.abs(initial.length - 0.9) < 1e-9);
  const late = horrorScreamTiming(0.51, 1.3)!;
  assert.equal(late.delay, 0);
  assert(Math.abs(late.offset - 0.28) < 1e-9);
  assert(Math.abs(late.length - 0.62) < 1e-9);
  assert.equal(horrorScreamTiming(1.14, 1.3), null);
  assert.equal(horrorScreamTiming(0, 0.2), null);
  assert.equal(horrorScreamTiming(Number.NaN, 1.3), null);
  assert.equal(horrorScreamTiming(-1, 1.3), null);
  assert(horrorCloseupPose(HORROR_SCREAM_START).strike > 0.99);
  assert(HORROR_SCREAM_START + HORROR_SCREAM_DURATION < 1.3);
});

function fakeAudio() {
  const nodes: any[] = [],
    buffers: any[] = [];
  const param = () => ({
    value: 0,
    setValueAtTime(value: number) {
      this.value = value;
    },
    setTargetAtTime(value: number) {
      this.value = value;
    },
    linearRampToValueAtTime(value: number) {
      this.value = value;
    },
    exponentialRampToValueAtTime(value: number) {
      this.value = value;
    },
    cancelScheduledValues() {},
  });
  const node = (type = "node") => {
    const value: any = {
      type,
      stopped: false,
      disconnected: false,
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
      start(when = 0, offset = 0, duration?: number) {
        this.startArgs = [when, offset, duration];
      },
      stop(when = 0) {
        this.stopped = true;
        this.stopAt = when;
      },
    };
    nodes.push(value);
    return value;
  };
  const ctx = {
    state: "running",
    currentTime: 10,
    sampleRate: 48000,
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
    createPanner: () => node(),
    createDynamicsCompressor: () => node(),
    createWaveShaper: () => node(),
    createBiquadFilter: () => node(),
    createOscillator: () => node("oscillator"),
    createBufferSource: () => node("buffer"),
    createBuffer: (channels: number, length: number, sampleRate: number) => {
      const samples = new Float32Array(length);
      const buffer = {
        numberOfChannels: channels,
        length,
        sampleRate,
        duration: length / sampleRate,
        getChannelData: () => samples,
      };
      buffers.push(buffer);
      return buffer;
    },
  };
  return { ctx, nodes, buffers };
}
const context: HorrorPresentationContext = {
  enabled: true,
  active: true,
  dimension: "overworld",
  time: 50,
  volume: 0.7,
  jumpscares: true,
  viewerId: "local",
};
const event = (changes: Partial<HorrorEvent> = {}): HorrorEvent => ({
  id: "scream-1",
  kind: "jumpscare",
  reason: "caught",
  p: [900, 5, 900],
  at: 50,
  yaw: 0,
  duration: 1.3,
  intensity: 1,
  seed: 17,
  viewerIds: ["local"],
  dimension: "overworld",
  ...changes,
});
function fixture() {
  const fake = fakeAudio();
  const audio = { ctx: fake.ctx as unknown as AudioContext, enabled: true, volume: 0.8 };
  const camera = new THREE.PerspectiveCamera();
  camera.position.set(12, 16, -7);
  const presentation = new HorrorPresentation(new THREE.Scene(), camera, audio);
  return { ...fake, audio, presentation };
}
const screams = (nodes: any[]) =>
  nodes.filter((n) => n.buffer?.length === Math.ceil(22050 * HORROR_SCREAM_DURATION));

test("Scream cache reuses a single small mono buffer and releases references across contexts/clear", () => {
  const first = fakeAudio(),
    second = fakeAudio(),
    cache = new HorrorScreamBuffer();
  const buffer = cache.get(first.ctx as unknown as BaseAudioContext);
  assert.equal(buffer, cache.get(first.ctx as unknown as BaseAudioContext));
  assert.equal(first.buffers.length, 1);
  assert.equal(buffer.numberOfChannels, 1);
  assert(buffer.length * 4 < 80000);
  assert.notEqual(buffer, cache.get(second.ctx as unknown as BaseAudioContext));
  cache.clear();
  cache.get(second.ctx as unknown as BaseAudioContext);
  assert.equal(second.buffers.length, 2);
});

test("Real presentation starts one cached vocal source at impact and stops all sources on pause/dispose", () => {
  const f = fixture();
  f.presentation.event(event());
  f.presentation.update(0.016, context);
  const first = screams(f.nodes)[0];
  assert(first);
  assert.equal(first.startArgs[0], 10.23);
  assert.equal(first.startArgs[1], 0);
  assert(Math.abs(first.startArgs[2] - 0.9) < 1e-9);
  assert(first.stopAt < 11.3);
  assert(
    f.nodes.some(
      (node) =>
        node.positionX.value === 12 && node.positionY.value === 16 && node.positionZ.value === -7,
    ),
  );
  f.ctx.currentTime = 12;
  f.presentation.event(event({ id: "scream-2", at: 52 }));
  f.presentation.update(0.016, { ...context, time: 52 });
  const second = screams(f.nodes)[1];
  assert.equal(first.buffer, second.buffer);
  assert(first.disconnected);
  f.presentation.update(0.016, { ...context, active: false });
  assert(
    f.nodes
      .filter((node) => node.startArgs)
      .every((source) => source.stopped && source.disconnected),
  );
  f.presentation.dispose();
  assert(f.nodes.every((node) => node.disconnected));
});

test("Delayed authoritative event starts at its vocal offset without repeating the breath or late sting", () => {
  const f = fixture();
  f.presentation.event(event());
  f.presentation.update(0.016, { ...context, time: 50.51 });
  const source = screams(f.nodes)[0];
  assert.equal(source.startArgs[0], 10);
  assert(Math.abs(source.startArgs[1] - 0.28) < 1e-9);
  assert(Math.abs(source.startArgs[2] - 0.62) < 1e-9);
  assert(!f.nodes.some((node) => node.type === "square"));
  assert(f.nodes.filter((node) => node.startArgs).every((node) => node.stopAt < 10.8));
  f.presentation.dispose();
});

test("Mode, dimension, viewer, mute and jumpscare controls never leave a queued scream audible", () => {
  for (const override of [
    { enabled: false },
    { active: false },
    { volume: 0 },
    { jumpscares: false },
    { viewerId: "other" },
    { dimension: "end" as const },
  ]) {
    const f = fixture();
    f.presentation.event(event());
    f.presentation.update(0.016, { ...context, ...override });
    assert.equal(f.nodes.filter((node) => node.startArgs).length, 0);
    f.presentation.dispose();
  }
  for (const control of ["master", "horror", "jumpscares", "suspended"] as const) {
    const f = fixture();
    f.presentation.event(event());
    f.presentation.update(0.016, context);
    const sources = f.nodes.filter((node) => node.startArgs);
    if (control === "master") f.audio.volume = 0;
    if (control === "suspended") f.ctx.state = "suspended";
    f.presentation.update(0.016, {
      ...context,
      volume: control === "horror" ? 0 : context.volume,
      jumpscares: control !== "jumpscares",
    });
    assert(sources.length > 0 && sources.every((source) => source.stopped && source.disconnected));
    f.presentation.dispose();
  }
});

test("Changing audio context disposes old nodes; reduced motion retains the same bounded vocal effect", () => {
  const f = fixture(),
    replacement = fakeAudio();
  f.presentation.event(event());
  f.presentation.update(0.016, { ...context, reducedMotion: true });
  assert.equal(screams(f.nodes).length, 1);
  f.audio.ctx = replacement.ctx as unknown as AudioContext;
  f.presentation.event(event({ id: "new-context", at: 51 }));
  f.presentation.update(0.016, { ...context, time: 51 });
  assert(f.nodes.every((node) => node.disconnected));
  assert.equal(screams(replacement.nodes).length, 1);
  assert.notEqual(screams(f.nodes)[0].buffer, screams(replacement.nodes)[0].buffer);
  f.presentation.dispose();
  assert(replacement.nodes.every((node) => node.disconnected));
});
