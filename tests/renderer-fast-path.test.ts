import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
import * as THREE from "three";
import { WorldRenderer } from "../lib/renderer";
import { World, HEIGHT } from "../lib/world";
import { BLOCKS } from "../lib/blocks";
import { SHAPES, shapeFaces, exposedFace, faceUV, blockTexture } from "../lib/block-shapes";
import { bedFaceTile, bedFaceUV } from "../lib/bed-texture";
import { CHEST_FACE_TILES } from "../lib/chest-texture";
import { appendCactusSpines } from "../lib/cactus-mesh";

test("Opaque/air fast paths produce the exact same packed geometry as unconditional shape clipping, including transparent neighbours and every shape state", () => {
  const source = ts.createSourceFile(
    "renderer.ts",
    readFileSync(new URL("../lib/renderer.ts", import.meta.url), "utf8"),
    ts.ScriptTarget.Latest,
    true,
  );
  const cls = source.statements.find(
    (n) => ts.isClassDeclaration(n) && n.name?.text === "WorldRenderer",
  ) as ts.ClassDeclaration;
  const faces = source.statements.find(
    (n) =>
      ts.isVariableStatement(n) &&
      n.declarationList.declarations.some((d) => d.name.getText(source) === "faces"),
  )!;
  const method = cls.members.find((n) => n.name?.getText(source) === "rebuild")!;
  let reference = method.getText(source);
  // Use the established general clipping route as the oracle, only disabling the new shortcuts.
  const hidden = /const occluder\s*=[\s\S]*?\n\s*let tile\s*=/;
  assert(hidden.test(reference));
  reference = reference.replace(
    hidden,
    `const occluder=next===id||(BLOCKS[next]?.solid&&!BLOCKS[next]?.transparent)?next:0;
    for(const visible of exposedFace(sourceFace,occluder)) {
      let tile =`,
  );
  const texture = /if\s*\(!shape\s*&&\s*!clipped\)\s*\{[\s\S]*?\}\s*else\s*\{([\s\S]*?)\n\s*\}/;
  assert(texture.test(reference));
  reference = reference.replace(texture, "$1");
  const code = ts.transpileModule(
    faces.getText(source) + "\nreturn (" + reference.replace(/^rebuild/, "function") + ");",
    { compilerOptions: { target: ts.ScriptTarget.ES2022 } },
  ).outputText;
  const rebuild = new Function(
    "THREE",
    "BLOCKS",
    "HEIGHT",
    "fullCubeFaces",
    "SHAPES",
    "shapeFaces",
    "exposedFace",
    "blockTexture",
    "faceUV",
    "bedFaceTile",
    "bedFaceUV",
    "CHEST_FACE_TILES",
    "appendCactusSpines",
    code,
  )(
    THREE,
    BLOCKS,
    HEIGHT,
    shapeFaces(1),
    SHAPES,
    shapeFaces,
    exposedFace,
    blockTexture,
    faceUV,
    bedFaceTile,
    bedFaceUV,
    CHEST_FACE_TILES,
    appendCactusSpines,
  );
  const world = new World(),
    data = new Uint8Array(16 * 16 * HEIGHT),
    ids = [3, 6, 7, 10, 61, 62, 1, 5, ...Object.keys(SHAPES).map(Number)];
  let index = 0;
  for (const id of ids)
    for (const neighbor of [0, 3, 6, 7, 10, 170, 171, 182, 186, 190, 194, 198]) {
      const y = 2 + Math.floor(index / 49) * 3,
        z = 1 + (Math.floor(index / 7) % 7) * 2,
        x = 1 + (index % 7) * 2;
      data[x + z * 16 + y * 256] = id;
      data[x + 1 + z * 16 + y * 256] = neighbor;
      index++;
    }
  const renderer = Object.create(WorldRenderer.prototype) as WorldRenderer;
  world.get = (x, y, z) =>
    x >= 0 && x < 16 && z >= 0 && z < 16 && y >= 0 && y < HEIGHT
      ? data[Math.floor(x) + Math.floor(z) * 16 + Math.floor(y) * 256]
      : 0;
  const materials = Array.from({ length: 5 }, () => new THREE.MeshBasicMaterial());
  Object.assign(renderer, { world, scene: new THREE.Scene(), meshes: new Map(), materials });
  const snapshot = () =>
    renderer.meshes.get("0,0")!.children.map((o) => {
      const mesh = o as THREE.Mesh;
      return {
        material: materials.indexOf(mesh.material as THREE.MeshBasicMaterial),
        attributes: Object.fromEntries(
          Object.entries(mesh.geometry.attributes).map(([key, value]) => [
            key,
            Array.from(value.array),
          ]),
        ),
        index: Array.from(mesh.geometry.index!.array),
      };
    });
  const chunk = { cx: 0, cz: 0, data, dirty: true };
  rebuild.call(renderer, chunk);
  const expected = snapshot();
  renderer.rebuild(chunk);
  assert.deepEqual(snapshot(), expected);
  renderer.disposeGroup(renderer.meshes.get("0,0")!);
  materials.forEach((m) => m.dispose());
});
