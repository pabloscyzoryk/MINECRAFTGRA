import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
import * as THREE from "three";
import { WorldRenderer, createCloudField, updateCloudField } from "../lib/renderer";

// Execute the actual renderer class-field callback without constructing a browser/WebGL context.
const source = ts.createSourceFile(
  "renderer.ts",
  readFileSync(new URL("../lib/renderer.ts", import.meta.url), "utf8"),
  ts.ScriptTarget.Latest,
  true,
);
const declaration = source.statements.find(
  (node): node is ts.ClassDeclaration =>
    ts.isClassDeclaration(node) && node.name?.text === "WorldRenderer",
)!;
const animation = declaration.members.find(
  (node): node is ts.PropertyDeclaration =>
    ts.isPropertyDeclaration(node) && node.name.getText(source) === "animate",
)!;
const compiled = ts.transpileModule(
  "function bind(){this.animate=" + animation.initializer!.getText(source) + ";}",
  { compilerOptions: { target: ts.ScriptTarget.ES2022 } },
).outputText;

test("Offscreen menu preview skips simulation/GPU work, keeps its clock/RAF current, and resumes without a time jump", () => {
  let now = 1000,
    queued = 0,
    rendered = 0;
  const frames: number[] = [];
  const bind = new Function(
    "performance",
    "requestAnimationFrame",
    "updateCloudField",
    compiled + ";return bind;",
  )({ now: () => now }, () => ++queued, updateCloudField);
  const renderer = Object.create(WorldRenderer.prototype) as WorldRenderer;
  const field = createCloudField();
  Object.assign(renderer, {
    running: true,
    preview: true,
    previewVisible: false,
    time: 0,
    camera: new THREE.PerspectiveCamera(),
    waterUniform: { value: 0 },
    sky: new THREE.Object3D(),
    cloudField: field,
    onFrame: (dt: number) => frames.push(dt),
    renderScene: () => rendered++,
  });
  bind.call(renderer);
  try {
    const matrixVersion = field.mesh.instanceMatrix.version;
    renderer.animate();
    now = 100000;
    renderer.animate();
    assert.equal(renderer.time, 100);
    assert.equal(queued, 2);
    assert.equal(rendered, 0);
    assert.equal(frames.length, 0);
    assert.equal(field.mesh.instanceMatrix.version, matrixVersion);
    renderer.previewVisible = true;
    now += 16;
    renderer.animate();
    assert.equal(rendered, 1);
    assert(Math.abs(frames[0] - 0.016) < 1e-8);
    renderer.previewVisible = false;
    renderer.preview = false;
    const before = renderer.camera.position.clone();
    now += 16;
    renderer.animate();
    assert.equal(
      rendered,
      2,
      "actual gameplay renders even if the landing hero is outside the viewport",
    );
    assert.equal(frames.length, 2);
    assert.deepEqual(renderer.camera.position, before, "gameplay must not use the menu orbit");
  } finally {
    field.mesh.dispose();
    field.mesh.geometry.dispose();
    (field.mesh.material as THREE.Material).dispose();
  }
});
