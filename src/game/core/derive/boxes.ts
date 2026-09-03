// World AABB + oriented box per mesh, the `PartBox` the joint-frame and sweep passes reason over. One implementation: derive-structure.mts and the pin tests that recompute it all import this instead of carrying their own GLB walk.
import type { PartBox, Vec3 } from "@/src/game/core/type";
import { rotateByQuat, type GlbMesh } from "./glb";

export function boxOf(m: GlbMesh): PartBox {
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (const v of m.verts) for (let k = 0; k < 3; k++) { if (v[k] < min[k]) min[k] = v[k]; if (v[k] > max[k]) max[k] = v[k]; }
  const { position: t, rotation: q } = m.pose;
  const s = m.scale;
  const lc: Vec3 = [((m.bounds.min[0] + m.bounds.max[0]) / 2) * s[0], ((m.bounds.min[1] + m.bounds.max[1]) / 2) * s[1], ((m.bounds.min[2] + m.bounds.max[2]) / 2) * s[2]];
  const rc = rotateByQuat(q, lc);
  return {
    min, max,
    obb: {
      center: [rc[0] + t[0], rc[1] + t[1], rc[2] + t[2]],
      axes: [rotateByQuat(q, [1, 0, 0]), rotateByQuat(q, [0, 1, 0]), rotateByQuat(q, [0, 0, 1])],
      half: [((m.bounds.max[0] - m.bounds.min[0]) / 2) * s[0], ((m.bounds.max[1] - m.bounds.min[1]) / 2) * s[1], ((m.bounds.max[2] - m.bounds.min[2]) / 2) * s[2]],
    },
  };
}

/** Boxes keyed by mesh NAME (the GLB node name), which is how every consumer looks them up before mapping to part ids. */
export function boxesByName(meshes: readonly GlbMesh[]): Record<string, PartBox> {
  const out: Record<string, PartBox> = {};
  for (const m of meshes) out[m.meshName] = boxOf(m);
  return out;
}
