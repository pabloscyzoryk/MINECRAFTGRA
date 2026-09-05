import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { Game } from "../lib/engine";
import { Multiplayer } from "../lib/multiplayer";
import { BlockParticles } from "../lib/block-particles";
import { miningDuration } from "../lib/mining";

function game(id = 3) {
  const particles = new BlockParticles(new THREE.Scene(), 96, () => 0.5),
    effects: { type: string; args: any[] }[] = [],
    writes: number[][] = [],
    sounds: string[] = [],
    grants: number[][] = [];
  const chip = particles.chip.bind(particles),
    burst = particles.break.bind(particles);
  particles.chip = (...args) => {
    effects.push({ type: "chip", args });
    chip(...args);
  };
  particles.break = (...args) => {
    effects.push({ type: "break", args });
    burst(...args);
  };
  const g: any = {
    target: { id, x: 4, y: 5, z: 6, px: 4, py: 6, pz: 6 },
    hotbar: [101],
    selected: 0,
    mode: "survival",
    settings: { particles: true },
    blockParticles: particles,
    mining: 0,
    mineKey: "",
    mined: 0,
    xp: 0,
    inventory: {},
    actionCooldown: 0,
    world: {
      dimension: "overworld",
      set(...args: number[]) {
        writes.push(args);
        effects.push({ type: "remove", args });
      },
    },
    adventure: { mineSpecial: () => false },
    horrorCaught: () => false,
    attack: () => false,
    add: (...args: number[]) => grants.push(args),
    audio: { play: (sound: string) => sounds.push(sound) },
    syncPack() {},
    notify() {},
    emit() {},
  };
  return {
    g,
    particles,
    effects,
    writes,
    sounds,
    grants,
    mine: (dt: number) => Game.prototype.mine.call(g, dt),
  };
}

function client() {
  const fixture = game(),
    sent: any[] = [],
    net = Object.create(Multiplayer.prototype) as Multiplayer;
  Object.assign(net, {
    game: fixture.g,
    connected: true,
    closed: false,
    chestBusy: false,
    pending: new Map(),
    applied: new Set(),
    inventoryRevision: 0,
    furnaceRefreshKey: null,
    token: "a".repeat(64),
    sequence: 0,
    sendInput() {},
    sendProfile() {},
    send: (message: any) => sent.push(structuredClone(message)),
  });
  fixture.g.net = net;
  return {
    ...fixture,
    net,
    sent,
    ack(ok: boolean) {
      const command = sent.at(-1).command;
      const result = { type: "result", req: command.req, ok, mined: ok };
      net.receive(result);
      return result;
    },
  };
}

test("Game.mine emits chips on the struck face before removal and a final burst after successful solo mining", () => {
  const c = game(),
    duration = miningDuration(3, 101);
  try {
    c.mine(duration * 0.25);
    assert.equal(c.g.mining, 0.25);
    assert.equal(c.particles.count, 3);
    assert.equal(c.writes.length, 0);
    assert.deepEqual(c.effects[0], {
      type: "chip",
      args: [3, { x: 4.5, y: 5.5, z: 6.5 }, { x: 0, y: 1, z: 0 }],
    });
    c.mine(duration * 0.751);
    assert.deepEqual(c.writes, [[4, 5, 6, 0]]);
    assert.deepEqual(
      c.effects.map((e) => e.type),
      ["chip", "chip", "remove", "break"],
    );
    assert.equal(c.particles.count, 31);
    assert.deepEqual(c.grants, [[9, 1]]);
    assert.deepEqual(c.sounds, ["break"]);
    assert.equal(c.g.mined, 1);
  } finally {
    c.particles.dispose();
  }
});

test("Instant plants produce a burst on the first mine call without waiting for a progress frame", () => {
  const c = game(67);
  try {
    assert.equal(miningDuration(67, 101), 0);
    c.mine(0);
    assert.equal(c.g.mined, 1);
    assert.deepEqual(c.writes, [[4, 5, 6, 0]]);
    assert.deepEqual(
      c.effects.map((e) => e.type),
      ["chip", "remove", "break"],
    );
    assert(c.particles.count > 3);
    assert.deepEqual(c.effects.at(-1)?.args, [67, { x: 4.5, y: 5.5, z: 6.5 }]);
  } finally {
    c.particles.dispose();
  }
});

test("Unmineable targets, foundation and attacks do not create block particles", () => {
  const c = game();
  try {
    for (const id of [0, 7, 13, 15, 18]) {
      c.g.target.id = id;
      c.mine(1000);
    }
    c.g.target.id = 3;
    c.g.target.y = 0;
    c.mine(1000);
    c.g.target.y = 5;
    c.g.attack = () => true;
    c.mine(1000);
    assert.equal(c.particles.count, 0);
    assert.equal(c.effects.length, 0);
    assert.equal(c.writes.length, 0);
  } finally {
    c.particles.dispose();
  }
});

test("Particles disabled in game settings preserve mining and drops without invoking either emitter", () => {
  const c = game();
  try {
    c.g.settings.particles = false;
    c.mine(miningDuration(3, 101) + 0.01);
    assert.equal(c.particles.count, 0);
    assert.deepEqual(
      c.effects.map((e) => e.type),
      ["remove"],
    );
    assert.deepEqual(c.grants, [[9, 1]]);
    assert.equal(c.g.mined, 1);
  } finally {
    c.particles.dispose();
  }
});

test("Online Game.mine shows immediate chips but waits for its authoritative ACK before its final burst", () => {
  const c = client();
  try {
    c.mine(miningDuration(3, 101) + 0.01);
    assert.equal(c.writes.length, 0, "Online removal is authoritative, not a local world edit");
    assert.equal(c.g.mined, 0);
    assert.equal(c.particles.count, 3);
    assert.deepEqual(
      c.effects.map((e) => e.type),
      ["chip"],
    );
    assert.equal(c.sent.length, 1);
    const result = c.ack(true);
    assert.equal(c.particles.count, 31);
    assert.equal(c.g.mined, 1);
    assert.deepEqual(c.sounds, ["break"]);
    c.net.receive(result);
    assert.equal(c.particles.count, 31, "Retry of the same result must not duplicate particles");
    assert.equal(c.g.mined, 1);
    assert.deepEqual(c.sounds, ["break"]);
  } finally {
    c.particles.dispose();
  }
});

test("Multiplayer.mine captures the requested block and suppresses additional pending requests", () => {
  const c = client();
  try {
    c.net.mine(c.g.target);
    assert.equal(c.particles.count, 0);
    Object.assign(c.g.target, { id: 5, x: 44, y: 55, z: 66 });
    c.net.mine(c.g.target);
    assert.equal(c.sent.length, 1);
    c.ack(true);
    assert.deepEqual(c.effects, [
      {
        type: "break",
        args: [3, { x: 4.5, y: 5.5, z: 6.5 }],
      },
    ]);
    assert.equal(c.particles.count, 28);
    c.net.mine(c.g.target);
    assert.equal(c.sent.length, 2, "The next block may be mined once the previous ACK arrives");
  } finally {
    c.particles.dispose();
  }
});

test("Rejected mining, a changed dimension and a closed session cannot emit a success burst", () => {
  for (const scenario of ["rejected", "dimension", "closed"]) {
    const c = client();
    try {
      c.net.mine(c.g.target);
      if (scenario === "dimension") c.g.world.dimension = "nether";
      if (scenario === "closed") c.net.closed = true;
      c.ack(scenario !== "rejected");
      assert.equal(c.particles.count, 0, scenario);
      assert.equal(c.effects.length, 0, scenario);
      assert.equal(c.sounds.length, 0, scenario);
    } finally {
      c.particles.dispose();
    }
  }
});

test("The current particle setting is respected when an in-flight mining ACK arrives", () => {
  const c = client();
  try {
    c.net.mine(c.g.target);
    c.g.settings.particles = false;
    c.ack(true);
    assert.equal(c.particles.count, 0);
    assert.equal(c.effects.length, 0);
    assert.equal(c.g.mined, 1);
    assert.deepEqual(c.sounds, ["break"]);
  } finally {
    c.particles.dispose();
  }
});
