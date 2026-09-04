// Environment-neutral GLB reading — DataView + TextDecoder only, no Node APIs, so browser bytes and fs buffers both work.
// The analyzer's twin of helper-scripts/read-parts.mts: read-parts is the codegen script for bundled furniture, the portal consumes this.
import type { Quat, Vec3 } from "@/src/game/core/type";

export interface GlbMesh {
  /** Raw node name — the identity convention (scripts/NAMING.md): cluster _ group [_ index] [__ attachedA [& attachedB]]. */
  meshName: string;
  partId: string;
  group: string;
  cluster: string;
  index?: number;
  /** The mesh-name binding — 1 or 2 structural part ids a fastener attaches. The analyzer validates proposals against it, never derives from it alone. */
  attached?: string[];
  pose: { position: Vec3; rotation: Quat };
  /** World scale composed down the hierarchy (shipped models: [1,1,1]). */
  scale: Vec3;
  /** Raw LOCAL bounds of the mesh, unscaled — what read-parts needs for the origin→bounds offsets. */
  bounds: { min: Vec3; max: Vec3 };
  /** World-space vertices, hierarchy composed — shipped models are flat, but a parented export must not shift facts silently. */
  verts: Vec3[];
  /** World-space triangles. */
  tris: [Vec3, Vec3, Vec3][];
}

const rotQ = (q: Quat, v: Vec3): Vec3 => {
  const [x, y, z, w] = q;
  const tx = 2 * (y * v[2] - z * v[1]), ty = 2 * (z * v[0] - x * v[2]), tz = 2 * (x * v[1] - y * v[0]);
  return [v[0] + w * tx + (y * tz - z * ty), v[1] + w * ty + (z * tx - x * tz), v[2] + w * tz + (x * ty - y * tx)];
};
const quatMul = (a: Quat, b: Quat): Quat => [
  a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
  a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
  a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
  a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
];

export function parseMeshName(name: string): { partId: string; group: string; cluster: string; index?: number; attached?: string[] } {
  const dd = name.indexOf("__");
  const head = dd === -1 ? name : name.slice(0, dd);
  const [cluster, group, i, ...rest] = head.split("_");
  const hasIndex = i !== undefined && /^\d+$/.test(i);
  const spec = dd === -1 ? (rest.length ? rest.join("_") : undefined) : name.slice(dd + 2);
  return {
    cluster,
    group,
    ...(hasIndex ? { index: Number(i) } : {}),
    partId: hasIndex ? `${group}_${Number(i)}` : group,
    ...(spec ? { attached: spec.split("&") } : {}),
  };
}

const COMP_SIZE: Record<number, number> = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };

/** Read every named mesh node of a GLB into world space. Accepts the raw bytes of the .glb container. */
export function readGlbMeshes(bytes: Uint8Array): GlbMesh[] {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (dv.getUint32(0, true) !== 0x46546c67) throw new Error("not a GLB container");
  const jsonLen = dv.getUint32(12, true);
  if (dv.getUint32(16, true) !== 0x4e4f534a) throw new Error("GLB chunk 0 is not JSON");
  const json = JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + jsonLen)));
  const off = 20 + jsonLen;
  if (dv.getUint32(off + 4, true) !== 0x004e4942) throw new Error("GLB has no BIN chunk");
  const binStart = bytes.byteOffset + off + 8;
  const bin = new DataView(bytes.buffer, binStart, dv.getUint32(off, true));

  const acc = (i: number): number[] | number[][] => {
    const a = json.accessors[i];
    const bv = json.bufferViews[a.bufferView];
    const base = (bv.byteOffset ?? 0) + (a.byteOffset ?? 0);
    const n = ({ SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 } as Record<string, number>)[a.type];
    const cs = COMP_SIZE[a.componentType];
    const stride = bv.byteStride ?? n * cs;
    const out: (number | number[])[] = [];
    for (let k = 0; k < a.count; k++) {
      const o = base + k * stride;
      const row: number[] = [];
      for (let c = 0; c < n; c++) {
        const oo = o + c * cs;
        row.push(
          a.componentType === 5126 ? bin.getFloat32(oo, true)
          : a.componentType === 5125 ? bin.getUint32(oo, true)
          : a.componentType === 5123 ? bin.getUint16(oo, true)
          : a.componentType === 5121 ? bin.getUint8(oo)
          : bin.getInt16(oo, true),
        );
      }
      out.push(n === 1 ? row[0] : row);
    }
    return out as number[] | number[][];
  };

  const out: GlbMesh[] = [];
  const walk = (nis: number[], pt: Vec3, pr: Quat, ps: Vec3): void => {
    for (const ni of nis) {
      const node = json.nodes[ni];
      if (node.matrix) throw new Error(`node ${node.name} uses a matrix transform — export with TRS`);
      const t: Vec3 = node.translation ?? [0, 0, 0];
      const r: Quat = node.rotation ?? [0, 0, 0, 1];
      const s: Vec3 = node.scale ?? [1, 1, 1];
      const rt = rotQ(pr, [t[0] * ps[0], t[1] * ps[1], t[2] * ps[2]]);
      const wt: Vec3 = [pt[0] + rt[0], pt[1] + rt[1], pt[2] + rt[2]];
      const wr = quatMul(pr, r);
      const ws: Vec3 = [ps[0] * s[0], ps[1] * s[1], ps[2] * s[2]];
      if (node.name && node.mesh != null) {
        const verts: Vec3[] = [];
        const tris: [Vec3, Vec3, Vec3][] = [];
        const min: [number, number, number] = [Infinity, Infinity, Infinity];
        const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
        for (const prim of json.meshes[node.mesh].primitives) {
          if (prim.attributes.POSITION == null) continue;
          const pos = (acc(prim.attributes.POSITION) as number[][]).map((v) => {
            for (let k = 0; k < 3; k++) { if (v[k] < min[k]) min[k] = v[k]; if (v[k] > max[k]) max[k] = v[k]; }
            const q = rotQ(wr, [v[0] * ws[0], v[1] * ws[1], v[2] * ws[2]]);
            return [wt[0] + q[0], wt[1] + q[1], wt[2] + q[2]] as Vec3;
          });
          for (const p of pos) verts.push(p);
          const idx = prim.indices != null ? (acc(prim.indices) as number[]) : pos.map((_, i) => i);
          for (let k = 0; k + 2 < idx.length; k += 3) tris.push([pos[idx[k]], pos[idx[k + 1]], pos[idx[k + 2]]]);
        }
        if (tris.length) out.push({ meshName: node.name, ...parseMeshName(node.name), pose: { position: wt, rotation: wr }, scale: ws, bounds: { min, max }, verts, tris });
      }
      walk(node.children ?? [], wt, wr, ws);
    }
  };
  walk(json.scenes[json.scene ?? 0].nodes, [0, 0, 0], [0, 0, 0, 1], [1, 1, 1]);
  return out;
}

/** Rotate a vector by an xyzw quaternion. */
export const rotateByQuat = rotQ;
