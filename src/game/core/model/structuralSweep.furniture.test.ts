// Structural sweep pins (milestones 1+2, 2026-08-24) — the occupancy-sweep ordering analysis against the shipped corpus, now via the shared core/model/sweep.ts math that also produces the generated sweep.gen.ts data.
// Pin 1: the checked-in sweep.gen.ts files match a fresh computation from the GLBs — a model re-export or STRUCTURE re-typing without `npx tsx src/game/helper-scripts/derive-sweep.mts` fails here, named.
// Pin 2, measured over all 33 authored placeDirs: an authored travel direction NEVER has an earlier THIRD-PARTY blocker — every blocker on the reverse of an authored placeDir is either placed later or one of the part's own joint partners (whose contact is what park math and two-phase handle; partners precede by liaison logic anyway, so they carry no ordering information). The one exception is itself a finding, not a failure: DALFRED's supportPin tip rests inside circleDown's bore, a REAL coaxial contact the flat authoring never names — the class of unmodeled liaison a portal wizard should PROPOSE. If a re-export moves these counts, re-measure; do not weaken the pin.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { applyStructure, StructureOverlay } from "./liaisons";
import { buildSweepMap, SWEEP_DIRS, type SweepMember } from "./sweep";
import { composeFurnitureActions, FastenerRule } from "../composition/composeActions";
import { HARDWARE } from "@/src/game/content/hardware";
import type { ClusterDef, ClusterId, DraftAction, PartDef, PartId, SweepMap, Vec3 } from "@/src/game/core/type";

import * as LACK from "@/src/game/content/furnitures/LACK/authored";
import { PARTS as LACK_PARTS } from "@/src/game/content/furnitures/LACK/parts.gen";
import { SWEEP as LACK_SWEEP } from "@/src/game/content/furnitures/LACK/sweep.gen";
import * as BEKVAM from "@/src/game/content/furnitures/BEKVAM/authored";
import { PARTS as BEKVAM_PARTS } from "@/src/game/content/furnitures/BEKVAM/parts.gen";
import { SWEEP as BEKVAM_SWEEP } from "@/src/game/content/furnitures/BEKVAM/sweep.gen";
import * as DALFRED from "@/src/game/content/furnitures/DALFRED/authored";
import { PARTS as DALFRED_PARTS } from "@/src/game/content/furnitures/DALFRED/parts.gen";
import { SWEEP as DALFRED_SWEEP } from "@/src/game/content/furnitures/DALFRED/sweep.gen";
import * as EKET from "@/src/game/content/furnitures/EKET/authored";
import { PARTS as EKET_PARTS } from "@/src/game/content/furnitures/EKET/parts.gen";
import { SWEEP as EKET_SWEEP } from "@/src/game/content/furnitures/EKET/sweep.gen";
import { COMPOSED } from "@/src/game/content/furnitures/composed";

/** Measured corpus state — a changed count means the geometry or the authoring moved: re-measure. */
const SCORED = 33;
const EXIT_CLEAR = 14;
const MATE_ONLY = 18;
/** The known unmodeled contact (see header). */
const KNOWN_UNMODELED = new Map([["supportPin", ["circleDown"]]]);

type V3 = [number, number, number];
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

interface AuthoredExports {
  AUTHORED_ACTIONS: readonly DraftAction[];
  FASTENER_RULES: readonly FastenerRule[];
  STRUCTURE: StructureOverlay;
  CLUSTERS?: Record<ClusterId, ClusterDef>;
}
const CORPUS: [string, AuthoredExports, Record<PartId, PartDef>, SweepMap][] = [
  ["LACK", LACK as AuthoredExports, LACK_PARTS, LACK_SWEEP],
  ["BEKVAM", BEKVAM as AuthoredExports, BEKVAM_PARTS, BEKVAM_SWEEP],
  ["DALFRED", DALFRED as AuthoredExports, DALFRED_PARTS, DALFRED_SWEEP],
  ["EKET", EKET as AuthoredExports, EKET_PARTS, EKET_SWEEP],
];

test("sweep.gen.ts files are fresh, and authored travel directions have no earlier third-party blockers", () => {
  let scored = 0, exitClear = 0, mateOnly = 0;
  const unmodeled: string[] = [];
  for (const [id, m, raw, gen] of CORPUS) {
    const parts = applyStructure(raw, COMPOSED[id]);
    const actions = composeFurnitureActions(m.AUTHORED_ACTIONS, m.FASTENER_RULES, parts, HARDWARE, m.CLUSTERS);
    const placeOrder = new Map<string, number>();
    actions.forEach((a, i) => { if (a.type === "placePart" && a.partId) placeOrder.set(a.partId, i); });
    const { json, bin } = readGlb(path.join(process.cwd(), "src", "assets", "models", "furnitures", id, `${id}.glb`));
    const tris = worldTris(json, bin);

    const clusters = new Map<string, { p: PartDef; member: SweepMember }[]>();
    for (const p of Object.values(parts)) {
      if (p.type !== "structural" || !tris.has(p.partId)) continue;
      const member: SweepMember = { partId: p.partId, tris: tris.get(p.partId)! as SweepMember["tris"], ...(p.parkBackoff !== undefined ? { parkBackoff: p.parkBackoff } : {}) };
      (clusters.get(p.cluster as string) ?? clusters.set(p.cluster as string, []).get(p.cluster as string)!).push({ p, member });
    }
    const sweep: SweepMap = {} as SweepMap;
    for (const members of clusters.values()) Object.assign(sweep, buildSweepMap(members.map((x) => x.member)));

    assert.deepEqual(sweep, gen, `${id}: sweep.gen.ts is STALE — regenerate with \`npx tsx src/game/helper-scripts/derive-sweep.mts\``);

    for (const members of clusters.values()) {
      const partnersOf = (p: PartDef): Set<string> => {
        const out = new Set<string>();
        for (const f of ["directJoins", "slideJoins", "screwJoins"] as const) {
          for (const t of p[f] ?? []) out.add(t as string);
          for (const { p: q } of members) if (q[f]?.includes(p.partId)) out.add(q.partId as string);
        }
        return out;
      };
      for (const { p } of members) {
        const pd = p.placeDir as Vec3 | undefined;
        if (!pd) continue;
        scored++;
        const dom = [0, 1, 2].reduce((a, b) => (Math.abs(pd[a]) >= Math.abs(pd[b]) ? a : b)) as 0 | 1 | 2;
        const exit = SWEEP_DIRS.find((c) => c.axis === dom && c.sign === -Math.sign(pd[dom]))!;
        const blockers = sweep[p.partId]?.[exit.key] ?? [];
        const earlier = blockers.filter((b) => (placeOrder.get(b) ?? Infinity) < (placeOrder.get(p.partId) ?? Infinity));
        const partners = partnersOf(p);
        const thirdParty = earlier.filter((b) => !partners.has(b));
        if (earlier.length === 0) exitClear++;
        else if (thirdParty.length === 0) mateOnly++;
        else {
          const known = KNOWN_UNMODELED.get(p.partId as string);
          assert.ok(known && thirdParty.every((b) => known.includes(b)), `${id}/${p.partId}: authored placeDir ${JSON.stringify(pd)} has UNEXPLAINED earlier third-party blockers: ${thirdParty.join(", ")}`);
          unmodeled.push(p.partId as string);
        }
      }
    }
  }
  assert.equal(scored, SCORED, "authored placeDir count moved — re-measure the pins before touching the constants");
  assert.equal(exitClear, EXIT_CLEAR, "exit-clear count moved — geometry or authoring changed, re-measure");
  assert.equal(mateOnly, MATE_ONLY, "mate-only count moved — geometry or authoring changed, re-measure");
  assert.deepEqual(unmodeled.sort(), [...KNOWN_UNMODELED.keys()].sort(), "the known-unmodeled-contact list changed");
});
