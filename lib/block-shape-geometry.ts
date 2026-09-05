import * as THREE from "three";
import { shapeFaces, faceUV } from "./block-shapes";

/** Small transient selection/crack mesh; terrain still uses the existing chunk buckets. */
export function blockShapeGeometry(id: number, inflate = 0) {
  const positions: number[] = [],
    normals: number[] = [],
    uv: number[] = [],
    indices: number[] = [];
  for (const face of shapeFaces(id)) {
    const normal = [0, 0, 0];
    normal[Math.floor(face.face / 2)] = face.face % 2 === 0 ? 1 : -1;
    const base = positions.length / 3;
    for (const point of face.vertices) {
      positions.push(
        point[0] - 0.5 + normal[0] * inflate,
        point[1] - 0.5 + normal[1] * inflate,
        point[2] - 0.5 + normal[2] * inflate,
      );
      normals.push(...normal);
      uv.push(...faceUV(face.face, point));
    }
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  geometry.setIndex(indices);
  return geometry;
}
