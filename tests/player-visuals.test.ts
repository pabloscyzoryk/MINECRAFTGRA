import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import {
  defaultSkin,
  faceRect,
  migrateLegacyDefaultSkin,
  SkinModel,
  type SkinData,
} from "../lib/skin-model";
import { presetSkin, SKIN_PRESETS } from "../lib/skin-presets";
import { handSwing } from "../lib/interaction-effects";
import { HeldItemModel } from "../lib/held-item";

/** Minimal pixel canvas: tests the actual atlas painter without WebGL or a browser. */
class PixelCanvas {
  width = 0;
  height = 0;
  context = new PixelContext(this);
  getContext() {
    this.context.ensure();
    return this.context;
  }
}
class PixelContext {
  data = new Uint8ClampedArray();
  fillStyle = "#000000";
  constructor(public canvas: PixelCanvas) {}
  ensure() {
    if (this.data.length !== this.canvas.width * this.canvas.height * 4)
      this.data = new Uint8ClampedArray(this.canvas.width * this.canvas.height * 4);
  }
  fillRect(x: number, y: number, w: number, h: number) {
    this.ensure();
    const hex = this.fillStyle.slice(1);
    const rgb = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16));
    const alpha = hex.length === 8 ? parseInt(hex.slice(6, 8), 16) / 255 : 1;
    for (let py = y; py < y + h; py++)
      for (let px = x; px < x + w; px++) {
        if (px < 0 || py < 0 || px >= this.canvas.width || py >= this.canvas.height) continue;
        const index = (py * this.canvas.width + px) * 4;
        const oldAlpha = this.data[index + 3] / 255;
        const outAlpha = alpha + oldAlpha * (1 - alpha);
        for (let k = 0; k < 3; k++)
          this.data[index + k] = Math.round(
            (rgb[k] * alpha + this.data[index + k] * oldAlpha * (1 - alpha)) / outAlpha,
          );
        this.data[index + 3] = Math.round(outAlpha * 255);
      }
  }
  clearRect(x: number, y: number, w: number, h: number) {
    for (let py = y; py < y + h; py++)
      for (let px = x; px < x + w; px++)
        this.data.fill(0, (py * this.canvas.width + px) * 4, (py * this.canvas.width + px) * 4 + 4);
  }
  getImageData(x: number, y: number, w: number, h: number) {
    const data = new Uint8ClampedArray(w * h * 4);
    for (let py = 0; py < h; py++)
      for (let px = 0; px < w; px++)
        data.set(
          this.data.slice(
            ((y + py) * this.canvas.width + x + px) * 4,
            ((y + py) * this.canvas.width + x + px) * 4 + 4,
          ),
          (py * w + px) * 4,
        );
    return { data };
  }
  drawImage(other: PixelCanvas) {
    this.data.set(other.getContext().data);
  }
}
function withCanvas(work: () => void) {
  const old = globalThis.document;
  Object.assign(globalThis, {
    document: {
      createElement: (name: string) => {
        assert.equal(name, "canvas");
        return new PixelCanvas();
      },
    },
  });
  try {
    work();
  } finally {
    globalThis.document = old;
  }
}
function pixel(canvas: HTMLCanvasElement, x: number, y: number) {
  return Array.from(canvas.getContext("2d")!.getImageData(x, y, 1, 1).data).slice(0, 3);
}
function rgb(hex: string) {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
}
function dummySkin(): SkinData {
  return {
    skin: { width: 64, height: 64 } as HTMLCanvasElement,
    cape: { width: 64, height: 32 } as HTMLCanvasElement,
    capeEnabled: false,
  };
}

test("Default skin UVs put shirt on the shoulder tops, skin on the neck and hands at the wrist", () =>
  withCanvas(() => {
    const data = defaultSkin();
    assert.deepEqual(faceRect("armR", "top", 0), [44, 16, 4, 4]);
    assert.deepEqual(faceRect("armL", "top", 0), [36, 48, 4, 4]);
    for (const arm of ["armR", "armL"] as const) {
      const [tx, ty, tw, th] = faceRect(arm, "top", 0);
      for (let y = 0; y < th; y++)
        for (let x = 0; x < tw; x++)
          assert.notDeepEqual(pixel(data.skin, tx + x, ty + y), rgb("#bd8c66"));
      assert.deepEqual(pixel(data.skin, tx + 1, ty + 1), rgb("#588b82"));
      const [bx, by] = faceRect(arm, "bottom", 0);
      assert.deepEqual(pixel(data.skin, bx, by), rgb("#bd8c66"));
      const [fx, fy] = faceRect(arm, "front", 0);
      assert.deepEqual(pixel(data.skin, fx + 1, fy + 10), rgb("#bd8c66"));
    }
    const [x, y] = faceRect("body", "top", 0);
    assert.deepEqual(pixel(data.skin, x + 3, y + 1), rgb("#b88663"));
    assert.deepEqual(pixel(data.skin, x + 1, y + 1), rgb("#588b82"));
    const model = new SkinModel(data);
    try {
      const uv = model.parts.get("armR0")!.geometry.attributes.uv;
      assert.equal(Math.floor(uv.getX(8) * 64), 44);
      assert.equal(Math.floor((1 - uv.getY(8)) * 64), 16);
    } finally {
      model.dispose();
    }
  }));

test("Every generated preset keeps sleeve tops and a skin-colored neck without changing painted user skins", () =>
  withCanvas(() => {
    for (let index = 0; index < SKIN_PRESETS.length; index++) {
      const data = presetSkin(index);
      for (const arm of ["armR", "armL"] as const) {
        const [x, y] = faceRect(arm, "top", 0);
        assert.deepEqual(pixel(data.skin, x + 1, y), rgb(SKIN_PRESETS[index].shirt));
      }
      const [x, y] = faceRect("body", "top", 0);
      assert.deepEqual(pixel(data.skin, x + 3, y + 1), rgb(SKIN_PRESETS[index].skin));
      const before = data.skin.getContext("2d")!.getImageData(0, 0, 64, 64).data;
      assert.equal(migrateLegacyDefaultSkin(data), false);
      assert.deepEqual(data.skin.getContext("2d")!.getImageData(0, 0, 64, 64).data, before);
    }
  }));

function legacyDefaultFixture() {
  const data = defaultSkin();
  const ctx = data.skin.getContext("2d")!;
  const shaded = (rect: [number, number, number, number], color: string) => {
    const [x, y, w, h] = rect;
    ctx.fillStyle = color;
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = "#ffffff0b";
    for (let i = 0; i < w * h; i += 7) ctx.fillRect(x + (i % w), y + Math.floor(i / w), 1, 1);
  };
  for (const arm of ["armR", "armL"] as const) {
    ctx.fillStyle = "#bd8c66";
    ctx.fillRect(...faceRect(arm, "top", 0));
  }
  for (const leg of ["legR", "legL"] as const)
    for (const face of ["top", "bottom"] as const) {
      const rect = faceRect(leg, face, 0);
      shaded(rect, "#314955");
      ctx.fillStyle = "#253137";
      ctx.fillRect(rect[0], rect[1] + rect[3] - 2, rect[2], 2);
    }
  shaded(faceRect("body", "top", 0), "#588b82");
  return data;
}
test("Only the exact old default migrates; one edited pixel blocks migration and the cape is preserved", () =>
  withCanvas(() => {
    const legacy = legacyDefaultFixture();
    const cape = legacy.cape.getContext("2d")!;
    cape.fillStyle = "#ff00ff";
    cape.fillRect(5, 5, 1, 1);
    legacy.capeEnabled = false;
    const oldCape = cape.getImageData(0, 0, 64, 32).data;
    assert.equal(migrateLegacyDefaultSkin(legacy), true);
    assert.deepEqual(
      legacy.skin.getContext("2d")!.getImageData(0, 0, 64, 64).data,
      defaultSkin().skin.getContext("2d")!.getImageData(0, 0, 64, 64).data,
    );
    assert.deepEqual(cape.getImageData(0, 0, 64, 32).data, oldCape);
    assert.equal(legacy.capeEnabled, false);
    const edited = legacyDefaultFixture();
    const ctx = edited.skin.getContext("2d")!;
    ctx.fillStyle = "#ff0000";
    ctx.fillRect(44, 16, 1, 1);
    const before = ctx.getImageData(0, 0, 64, 64).data;
    assert.equal(migrateLegacyDefaultSkin(edited), false);
    assert.deepEqual(ctx.getImageData(0, 0, 64, 64).data, before);
  }));

test("The complete first-person swing keeps the shoulder cap below the frame and the wrist attached", () => {
  const model = new SkinModel(dummySkin());
  const rig = model.createFirstPersonArm();
  const fixedShoulder = rig.shoulder.position.clone();
  try {
    for (const fov of [50, 72, 100])
      for (const aspect of [0.55, 1, 16 / 9]) {
        const camera = new THREE.PerspectiveCamera(fov, aspect, 0.06, 500);
        camera.updateMatrixWorld();
        for (let step = 0; step <= 100; step++) {
          rig.pose(handSwing(step / 100), Math.sin(step) * 0.008, fov, aspect);
          rig.group.updateMatrixWorld(true);
          assert(
            rig.shoulder.position.equals(fixedShoulder),
            "The swing must not translate the shoulder",
          );
          const wrist = rig.wrist.getWorldPosition(new THREE.Vector3());
          const end = rig.shoulder.localToWorld(new THREE.Vector3(0, -rig.length, 0));
          assert(wrist.distanceTo(end) < 1e-9, "The grip and arm endpoint remain coincident");
          const projected = wrist.clone().project(camera);
          assert(
            Math.abs(projected.x) < 0.95 && projected.y > -0.95 && projected.y < 0.4,
            "The hand stays in view at all supported FOVs/aspects",
          );
          for (const mesh of rig.meshes) {
            const positions = mesh.geometry.attributes.position;
            for (let i = 0; i < positions.count; i++)
              if (positions.getY(i) > 0) {
                const cap = mesh
                  .localToWorld(new THREE.Vector3().fromBufferAttribute(positions, i))
                  .project(camera);
                assert(cap.y < -1.1, "No exposed upper cap can make the arm look detached");
              }
          }
        }
      }
    const wristAt = (progress: number) => {
      rig.pose(handSwing(progress));
      rig.group.updateMatrixWorld(true);
      return rig.wrist.getWorldPosition(new THREE.Vector3());
    };
    const idle = wristAt(0),
      raised = wristAt(0.2),
      strike = wristAt(0.65),
      rest = wristAt(1);
    assert(strike.y < raised.y - 0.15);
    assert(strike.z < idle.z - 0.08);
    assert(rest.distanceTo(idle) < 1e-9);
  } finally {
    rig.dispose();
    model.dispose();
  }
});

test("Third-person held equipment follows the same wrist through walking, crouching and attack", () => {
  const model = new SkinModel(dummySkin());
  try {
    model.setHeldItem(104);
    assert.equal(model.heldItem.group.parent, model.grip);
    assert.equal(model.grip.parent, model.joints.armR);
    const before = model.heldItem.group.children[0];
    model.setHeldItem(104);
    assert.equal(
      model.heldItem.group.children[0],
      before,
      "Unchanged held ids do not rebuild GPU geometry",
    );
    const rest = model.grip.getWorldPosition(new THREE.Vector3());
    for (const progress of [0, 0.22, 0.45, 0.7, 1]) {
      model.pose(0.12, true, true, progress);
      model.group.updateMatrixWorld(true);
      const actual = model.heldItem.group.getWorldPosition(new THREE.Vector3());
      const expected = model.joints.armR.localToWorld(new THREE.Vector3(0, -10 / 16, 0.11));
      assert(actual.distanceTo(expected) < 1e-9);
    }
    model.pose(0, false, false, 0.22);
    model.group.updateMatrixWorld(true);
    assert(
      model.grip.getWorldPosition(new THREE.Vector3()).distanceTo(rest) > 0.5,
      "A visible held item participates in the third-person swing",
    );
    model.setHeldItem(0);
    assert.equal(model.heldItem.group.children.length, 0);
    assert.equal(model.heldItem.group.visible, false);
  } finally {
    model.dispose();
  }
});

test("Held weapon and block models have volume; sprite and replacement resources are disposed once", () => {
  let textureDisposals = 0;
  const held = new HeldItemModel(() => {
    const texture = new THREE.Texture();
    texture.addEventListener("dispose", () => textureDisposals++);
    return texture;
  });
  for (const id of [1, 101, 102, 103, 104, 105, 108, 118, 126, 127, 128, 129, 130]) {
    held.set(id);
    const bounds = new THREE.Box3().setFromObject(held.group).getSize(new THREE.Vector3());
    assert(
      bounds.x > 0.04 && bounds.y > 0.1 && bounds.z > 0.025,
      "Equipment has visible volume: " + id,
    );
  }
  held.set(111);
  const sprite = held.group.children[0] as THREE.Mesh;
  let geometryDisposals = 0;
  sprite.geometry.addEventListener("dispose", () => geometryDisposals++);
  held.set(104);
  assert.equal(textureDisposals, 1);
  assert.equal(geometryDisposals, 1);
  held.dispose();
  held.dispose();
  assert.equal(textureDisposals, 1);
  assert.equal(geometryDisposals, 1);
});
