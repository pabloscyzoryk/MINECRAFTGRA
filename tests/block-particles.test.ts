import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { BlockParticles } from "../lib/block-particles";
import { BLOCKS } from "../lib/blocks";

const center = new THREE.Vector3(4.5, 3.5, 4.5);
const normal = new THREE.Vector3(0, 1, 0);
function positions(effect: BlockParticles) {
  const result: THREE.Vector3[] = [],
    matrix = new THREE.Matrix4();
  for (const mesh of effect.meshes)
    for (let i = 0; i < mesh.count; i++) {
      mesh.getMatrixAt(i, matrix);
      result.push(new THREE.Vector3().setFromMatrixPosition(matrix));
    }
  return result;
}

test("Mining chips emerge outside the struck face and are throttled while holding mine", () => {
  const effect = new BlockParticles(new THREE.Scene(), 48, () => 0.5);
  for (let i = 0; i < 20; i++) effect.chip(1, center, normal);
  assert.equal(effect.count, 3);
  effect.update(0);
  assert(positions(effect).every((p) => p.y > 4));
  const color = new THREE.Color();
  effect.meshes[0].getColorAt(0, color);
  const top = new THREE.Color(BLOCKS[1].top!).multiplyScalar(0.95);
  for (const channel of ["r", "g", "b"] as const)
    assert(Math.abs(color[channel] - top[channel]) < 0.00001);
  effect.update(0.081);
  effect.chip(1, center, normal);
  assert.equal(effect.count, 6);
  effect.chip(1, center, new THREE.Vector3());
  assert.equal(effect.count, 6);
  effect.dispose();
});

test("Block materials route to textured solid chips, translucent glass shards and luminous fragments", () => {
  const effect = new BlockParticles(new THREE.Scene(), 100, () => 0.5);
  effect.break(3, center);
  effect.break(10, center);
  effect.break(16, center);
  effect.update(0);
  assert.equal(effect.meshes[0].count, 28);
  assert.equal(effect.meshes[1].count, 22);
  assert(effect.meshes[2].count > 0);
  assert(effect.materials[0] instanceof THREE.MeshLambertMaterial);
  assert.equal(effect.materials[1].transparent, true);
  assert(effect.materials[2] instanceof THREE.MeshBasicMaterial);
  const matrix = new THREE.Matrix4(),
    scale = new THREE.Vector3();
  effect.meshes[1].getMatrixAt(0, matrix);
  scale.setFromMatrixScale(matrix);
  assert(scale.z < scale.y / 4, "Glass is a thin shard rather than a full cube");
  assert.equal(effect.texture.image.width, 8);
  effect.dispose();
});

test("Gravity moves fragments and inexpensive terrain collisions keep settled fragments above the ground", () => {
  const effect = new BlockParticles(new THREE.Scene(), 32, () => 0.5);
  effect.break(3, new THREE.Vector3(4.5, 1.2, 4.5));
  effect.update(0);
  const initial = positions(effect)[0].y;
  effect.update(0.1, { solid: (_x, y) => y < 1 });
  assert(positions(effect)[0].y > initial);
  for (let i = 0; i < 8; i++) effect.update(0.1, { solid: (_x, y) => y < 1 });
  assert(positions(effect).every((p) => p.y >= 1));
  for (let i = 0; i < 8; i++) effect.update(0.1);
  assert.equal(effect.count, 0);
  assert(effect.meshes.every((mesh) => !mesh.visible && mesh.count === 0));
  effect.dispose();
});

test("A strict shared particle cap and settings toggle bound mining storms without replacing GPU resources", () => {
  const scene = new THREE.Scene(),
    effect = new BlockParticles(scene, 36),
    geometry = effect.geometry,
    materials = [...effect.materials],
    meshes = [...effect.meshes];
  for (let i = 0; i < 100; i++) effect.break(3, center);
  assert.equal(effect.count, 36);
  effect.update(0.02, undefined, { maxParticles: 12 });
  assert.equal(effect.count, 12);
  assert.equal(
    effect.meshes.reduce((n, mesh) => n + mesh.count, 0),
    12,
  );
  effect.update(0, undefined, { enabled: false });
  effect.break(3, center);
  effect.chip(3, center, normal);
  assert.equal(effect.count, 0);
  effect.update(0, undefined, { enabled: true, maxParticles: 0 });
  effect.break(3, center);
  assert.equal(effect.count, 0);
  effect.update(0, undefined, { enabled: true, maxParticles: 36 });
  effect.break(3, center);
  assert.equal(effect.count, 28);
  assert.equal(effect.geometry, geometry);
  assert.deepEqual(effect.materials, materials);
  assert.deepEqual(effect.meshes, meshes);
  assert.equal(scene.children.length, 3);
  effect.dispose();
});

test("Clear and repeated disposal release all owned shared and per-instance GPU resources exactly once", () => {
  const scene = new THREE.Scene(),
    effect = new BlockParticles(scene, 12),
    disposed: string[] = [];
  effect.geometry.addEventListener("dispose", () => disposed.push("geometry"));
  effect.texture.addEventListener("dispose", () => disposed.push("texture"));
  effect.materials.forEach((material, i) =>
    material.addEventListener("dispose", () => disposed.push("material" + i)),
  );
  effect.meshes.forEach((mesh, i) =>
    mesh.addEventListener("dispose", () => disposed.push("mesh" + i)),
  );
  effect.break(3, center);
  effect.clear();
  assert.equal(effect.count, 0);
  effect.dispose();
  effect.dispose();
  effect.break(3, center);
  effect.update(1);
  assert.equal(disposed.length, 8);
  assert.equal(new Set(disposed).size, 8);
  assert.equal(scene.children.length, 0);
  assert.equal(effect.count, 0);
});
