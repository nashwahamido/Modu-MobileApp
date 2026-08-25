// Regenerates each furniture's sweep.gen.ts — the exit-sweep blocker data (core/model/sweep.ts) derived from the GLB's final poses. Run after any model re-export or STRUCTURE re-typing:
//   npx tsx src/game/helper-scripts/derive-sweep.mts
// Structural parts only, swept per cluster; parkBackoff (via applyStructure) bounds each part's travel span. Output is deterministic (sorted parts, sorted blocker lists), so a diff after regeneration is a real geometry/authoring change. The structuralSweep.furniture.test.ts pin asserts the checked-in files match a fresh computation — a stale file fails there, named.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { applyStructure } from "@/src/game/core/model/liaisons";
import { buildSweepMap, type SweepMember } from "@/src/game/core/model/sweep";
import type { PartDef, PartId, Vec3 } from "@/src/game/core/type";

import { STRUCTURE as LACK_STRUCTURE } from "@/src/game/content/furnitures/LACK/authored";
import { PARTS as LACK_PARTS } from "@/src/game/content/furnitures/LACK/parts.gen";
import { STRUCTURE as BEKVAM_STRUCTURE } from "@/src/game/content/furnitures/BEKVAM/authored";
import { PARTS as BEKVAM_PARTS } from "@/src/game/content/furnitures/BEKVAM/parts.gen";
import { STRUCTURE as DALFRED_STRUCTURE } from "@/src/game/content/furnitures/DALFRED/authored";
import { PARTS as DALFRED_PARTS } from "@/src/game/content/furnitures/DALFRED/parts.gen";
import { STRUCTURE as EKET_STRUCTURE } from "@/src/game/content/furnitures/EKET/authored";
import { PARTS as EKET_PARTS } from "@/src/game/content/furnitures/EKET/parts.gen";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const MODELS = path.join(ROOT, "..", "..", "assets", "models", "furnitures");
const OUT = path.join(ROOT, "..", "content", "furnitures");

type V3 = Vec3;
const rotQ = (q: [number, number, number, number], v: V3): V3 => {
  const [x, y, z, w] = q;
  const tx = 2 * (y * v[2] - z * v[1]), ty = 2 * (z * v[0] - x * v[2]), tz = 2 * (x * v[1] - y * v[0]);
  return [v[0] + w * tx + (y * tz - z * ty), v[1] + w * ty + (z * tx - x * tz), v[2] + w * tz + (x * ty - y * tx)];
};
const quatMul = (a: number[], b: number[]): [number, number, number, number] => [
  a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
  a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
  a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
  a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
];
function readGlb(p: string) {
  const b = fs.readFileSync(p);
  const jsonLen = b.readUInt32LE(12);
  const json = JSON.parse(b.subarray(20, 20 + jsonLen).toString("utf8"));
  const off = 20 + jsonLen;
  return { json, bin: b.subarray(off + 8, off + 8 + b.readUInt32LE(off)) };
}
const COMP: Record<number, number> = { 5121: 1, 5123: 2, 5125: 4, 5126: 4 };
function acc(json: any, bin: Buffer, i: number): any[] {
  const a = json.accessors[i];
  const bv = json.bufferViews[a.bufferView];
  const base = (bv.byteOffset ?? 0) + (a.byteOffset ?? 0);
  const n = ({ SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 } as any)[a.type];
  const cs = COMP[a.componentType];
  const stride = bv.byteStride ?? n * cs;
  const out: any[] = [];
  for (let k = 0; k < a.count; k++) {
    const o = base + k * stride;
    const row: number[] = [];
    for (let c = 0; c < n; c++) {
      const oo = o + c * cs;
      row.push(a.componentType === 5126 ? bin.readFloatLE(oo) : a.componentType === 5125 ? bin.readUInt32LE(oo) : a.componentType === 5123 ? bin.readUInt16LE(oo) : bin.readUInt8(oo));
    }
    out.push(n === 1 ? row[0] : row);
  }
  return out;
}
function partIdOf(name: string): string {
  const dd = name.indexOf("__");
  const head = dd === -1 ? name : name.slice(0, dd);
  const [, group, i] = head.split("_");
  return i !== undefined && /^\d+$/.test(i) ? `${group}_${Number(i)}` : group;
}
function worldTris(json: any, bin: Buffer): Map<string, [V3, V3, V3][]> {
  const out = new Map<string, [V3, V3, V3][]>();
  const walk = (nis: number[], pt: V3, pr: [number, number, number, number], ps: V3) => {
    for (const ni of nis) {
      const n = json.nodes[ni];
      const t: V3 = n.translation ?? [0, 0, 0], r = n.rotation ?? [0, 0, 0, 1], s: V3 = n.scale ?? [1, 1, 1];
      const rt = rotQ(pr, [t[0] * ps[0], t[1] * ps[1], t[2] * ps[2]]);
      const wt: V3 = [pt[0] + rt[0], pt[1] + rt[1], pt[2] + rt[2]];
      const wr = quatMul(pr as any, r), ws: V3 = [ps[0] * s[0], ps[1] * s[1], ps[2] * s[2]];
      if (n.name && n.mesh != null) {
        const tris: [V3, V3, V3][] = [];
        for (const prim of json.meshes[n.mesh].primitives) {
          if (prim.attributes.POSITION == null) continue;
          const pos = (acc(json, bin, prim.attributes.POSITION) as number[][]).map((v) => {
            const q = rotQ(wr, [v[0] * ws[0], v[1] * ws[1], v[2] * ws[2]]);
            return [wt[0] + q[0], wt[1] + q[1], wt[2] + q[2]] as V3;
          });
          const idx = prim.indices != null ? (acc(json, bin, prim.indices) as number[]) : pos.map((_, i) => i);
          for (let k = 0; k + 2 < idx.length; k += 3) tris.push([pos[idx[k]], pos[idx[k + 1]], pos[idx[k + 2]]]);
        }
        if (tris.length) out.set(partIdOf(n.name), tris);
      }
      walk(n.children ?? [], wt, wr, ws);
    }
  };
  walk(json.scenes[json.scene ?? 0].nodes, [0, 0, 0], [0, 0, 0, 1], [1, 1, 1]);
  return out;
}

const CORPUS = [
  ["LACK", LACK_PARTS, LACK_STRUCTURE],
  ["BEKVAM", BEKVAM_PARTS, BEKVAM_STRUCTURE],
  ["DALFRED", DALFRED_PARTS, DALFRED_STRUCTURE],
  ["EKET", EKET_PARTS, EKET_STRUCTURE],
] as const;

for (const [id, raw, structure] of CORPUS) {
  const parts = applyStructure(raw as Record<PartId, PartDef>, structure);
  const { json, bin } = readGlb(path.join(MODELS, id, `${id}.glb`));
  const tris = worldTris(json, bin);
  const clusters = new Map<string, SweepMember[]>();
  for (const p of Object.values(parts)) {
    if (p.type !== "structural" || !tris.has(p.partId)) continue;
    const m: SweepMember = { partId: p.partId, tris: tris.get(p.partId)!, ...(p.parkBackoff !== undefined ? { parkBackoff: p.parkBackoff } : {}) };
    (clusters.get(p.cluster as string) ?? clusters.set(p.cluster as string, []).get(p.cluster as string)!).push(m);
  }
  const sweep: Record<string, unknown> = {};
  for (const members of clusters.values()) Object.assign(sweep, buildSweepMap(members));
  const body = Object.keys(sweep).sort().map((pid) => `  ${JSON.stringify(pid)}: ${JSON.stringify(sweep[pid])},`).join("\n");
  const out = path.join(OUT, id, "sweep.gen.ts");
  fs.writeFileSync(
    out,
    `// GENERATED by src/game/helper-scripts/derive-sweep.mts — do not edit by hand.
// Exit-sweep blockers per structural part per cardinal direction (see core/model/sweep.ts). Regenerate after any model re-export or STRUCTURE re-typing; the structuralSweep pin test fails, named, when this file is stale.
import type { SweepMap } from "@/src/game/core/type";

export const SWEEP = {
${body}
} as SweepMap;
`,
  );
  console.log(`${id}: wrote ${Object.keys(sweep).length} swept parts → ${out}`);
}
