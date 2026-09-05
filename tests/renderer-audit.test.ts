import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import {
  CLOUD_CELL_SIZE,
  CLOUD_FIELD_SIZE,
  createCloudField,
  createWaterMaterial,
  updateCloudField,
} from "../lib/renderer";

function positions(field: ReturnType<typeof createCloudField>) {
  const matrix = new THREE.Matrix4();
  return field.seeds.map((_, i) => {
    field.mesh.getMatrixAt(i, matrix);
    return new THREE.Vector3().setFromMatrixPosition(matrix);
  });
}

function disposeField(field: ReturnType<typeof createCloudField>) {
  field.mesh.dispose();
  field.mesh.geometry.dispose();
  (field.mesh.material as THREE.Material).dispose();
}

test("Cloud density and coverage remain constant far from spawn in every direction", () => {
  const field = createCloudField();
  try {
    assert.equal(field.mesh.count, 360);
    assert(field.mesh instanceof THREE.InstancedMesh);
    for (const [x, z] of [
      [0, 0],
      [219.9, 220.1],
      [-220.1, -219.9],
      [1200, -2600],
      [1000000, -1000000],
    ]) {
      updateCloudField(field, x, z, 125);
      const visible = positions(field);
      assert(visible.every((p) => Math.abs(p.x - x) <= CLOUD_FIELD_SIZE / 2 + 0.1));
      assert(visible.every((p) => Math.abs(p.z - z) <= CLOUD_FIELD_SIZE / 2 + 0.1));
      assert(visible.every((p) => p.y >= 51 && p.y <= 63));
      const nearby = visible.filter(
        (p) => Math.abs(p.x - x) < CLOUD_CELL_SIZE / 2 && Math.abs(p.z - z) < CLOUD_CELL_SIZE / 2,
      );
      assert.equal(nearby.length, 40, `Cloud coverage at ${x},${z}`);
    }
  } finally {
    disposeField(field);
  }
});

test("Crossing a cloud-field boundary only recycles clouds beyond the farthest fog", () => {
  const field = createCloudField();
  try {
    const oldX = field.seeds[0].x + CLOUD_FIELD_SIZE / 2 - 0.01,
      newX = oldX + 0.02;
    updateCloudField(field, oldX, 0, 0);
    const before = positions(field);
    updateCloudField(field, newX, 0, 0);
    const after = positions(field);
    let recycled = 0;
    for (let i = 0; i < before.length; i++) {
      const movement = after[i].distanceTo(before[i]);
      if (movement > 1) {
        recycled++;
        const halfWidth = field.scales[i].x / 2;
        // Maximum setting: (view 6 * 25 + 15) * fog 1.5 = 247.5 blocks.
        assert(Math.abs(before[i].x - oldX) - halfWidth > 247.5);
        assert(Math.abs(after[i].x - newX) - halfWidth > 247.5);
      } else assert.equal(movement, 0, "Nearby clouds must remain fixed in world space");
    }
    assert(recycled > 0, "The test crosses an actual recycling boundary");
  } finally {
    disposeField(field);
  }
});

test("Cloud motion is continuous through ordinary 220-block world boundaries", () => {
  const field = createCloudField();
  try {
    updateCloudField(field, 219.99, 219.99, 0);
    const before = positions(field);
    updateCloudField(field, 220.01, 220.01, 0.016);
    const after = positions(field);
    for (let i = 0; i < before.length; i++) {
      if (Math.hypot(before[i].x - 220, before[i].z - 220) < 247.5)
        assert(after[i].distanceTo(before[i]) < 0.01);
    }
  } finally {
    disposeField(field);
  }
});

test("Water surface is intersectable from underwater as well as from above", () => {
  const texture = new THREE.Texture(),
    material = createWaterMaterial(texture),
    geometry = new THREE.PlaneGeometry(4, 4);
  geometry.rotateX(-Math.PI / 2);
  const surface = new THREE.Mesh(geometry, material);
  surface.updateMatrixWorld();
  try {
    const below = new THREE.Raycaster(new THREE.Vector3(0.3, -2, 0.4), new THREE.Vector3(0, 1, 0)),
      above = new THREE.Raycaster(new THREE.Vector3(0.3, 2, 0.4), new THREE.Vector3(0, -1, 0));
    assert.equal(material.side, THREE.DoubleSide);
    assert.equal(material.depthWrite, false);
    assert(below.intersectObject(surface).length > 0, "The underside must not be culled");
    assert(above.intersectObject(surface).length > 0);
    material.side = THREE.FrontSide;
    assert.equal(below.intersectObject(surface).length, 0, "This reproduces the old culling bug");
  } finally {
    geometry.dispose();
    material.dispose();
    texture.dispose();
  }
});
