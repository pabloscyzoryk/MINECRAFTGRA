import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { WorldRenderer } from "../lib/renderer";
import { World, HEIGHT } from "../lib/world";

test("Meshing retains directional and overhead shading without repeated global block reads", () => {
  const world = new World(),
    data = new Uint8Array(16 * 16 * HEIGHT);
  data[5 + 5 * 16 + 5 * 256] = 3;
  data[5 + 5 * 16 + 7 * 256] = 3;
  const chunk = { cx: 0, cz: 0, data, dirty: true };
  let reads = 0;
  world.get = () => {
    reads++;
    return 0;
  };
  const renderer = Object.create(WorldRenderer.prototype) as WorldRenderer;
  Object.assign(renderer, {
    world,
    scene: new THREE.Scene(),
    meshes: new Map(),
    materials: [new THREE.MeshBasicMaterial()],
  });
  renderer.rebuild(chunk);
  const group = renderer.meshes.get("0,0")!;
  const mesh = group.children[0] as THREE.Mesh;
  const colors = mesh.geometry.getAttribute("color");
  const positions = mesh.geometry.getAttribute("position");
  const normals = mesh.geometry.getAttribute("normal");
  assert.equal(
    reads,
    0,
    "Interior neighbor and overhead data are available directly in this chunk",
  );
  assert.equal(positions.count, 48);
  assert.equal(mesh.geometry.index!.count, 72);
  for (let i = 0; i < positions.count; i++) {
    const normal = [normals.getX(i), normals.getY(i), normals.getZ(i)];
    const shade =
      normal[0] === 1
        ? 0.83
        : normal[0] === -1
          ? 0.68
          : normal[1] === 1
            ? 1
            : normal[1] === -1
              ? 0.5
              : normal[2] === 1
                ? 0.89
                : 0.73;
    assert(Math.abs(colors.getX(i) - shade * (i < 24 ? 0.97 : 1)) < 1e-6);
  }
  assert.equal(mesh.matrixAutoUpdate, false);
  assert.equal(group.matrixAutoUpdate, false);
  group.updateMatrixWorld(true);
  assert.deepEqual(mesh.matrixWorld.elements, new THREE.Matrix4().elements);
  renderer.disposeGroup(group);
});
