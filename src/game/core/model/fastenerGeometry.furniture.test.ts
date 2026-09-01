// Pins the fastener-geometry derivations of 2026-08-22→24 (fastener-model-v2 spec, "geometry / wizard split") to the shipped corpus, so the derivers can replace the shaft-on-local-Y frame convention only while they still reproduce the PLAYED values. Three pins, measured on all 83 fasteners across the four furnitures:
//   1. AXIS — vertex PCA parallels the played engageDir on 83/83 (re-confirmed 2026-08-24; includes EKET's stepped cam sleeves).
//   2. HEAD-END CONFIDENCE — the radial-profile head detector abstains on exactly the genuinely headless hardware (BEKVÄM dowels, LACK double-stud bolts, the DALFRED cap, grub-like screw108443) and is confident on the other 71.
//   3. SIGN — on every confident fastener, "engageDir points toward the wide end" matches the played sign with ZERO flips (71/71). Sign via exit-side occupancy was REFUTED (14 confident flips) and must not come back; headless hardware's sign falls to the anchor rule + wizard.
// Truth is applyStructure(parts.gen, STRUCTURE) — the frame-derived value plus the authored overrides (EKET cams/plugs), i.e. what the game actually plays. The width measure is the OUTER envelope percentile per end, never the mean: a mean reads a screwdriver recess as a narrow tip (the 2026-07-23 screw100349 false positive).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { applyStructure } from "./liaisons";
import type { PartDef, PartId } from "@/src/game/core/type";

import { STRUCTURE as LACK_STRUCTURE } from "@/src/game/content/furnitures/LACK/authored";
import { PARTS as LACK_PARTS } from "@/src/game/content/furnitures/LACK/parts.gen";
import { STRUCTURE as BEKVAM_STRUCTURE } from "@/src/game/content/furnitures/BEKVAM/authored";
import { PARTS as BEKVAM_PARTS } from "@/src/game/content/furnitures/BEKVAM/parts.gen";
import { STRUCTURE as DALFRED_STRUCTURE } from "@/src/game/content/furnitures/DALFRED/authored";
import { PARTS as DALFRED_PARTS } from "@/src/game/content/furnitures/DALFRED/parts.gen";
import { STRUCTURE as EKET_STRUCTURE } from "@/src/game/content/furnitures/EKET/authored";
import { PARTS as EKET_PARTS } from "@/src/game/content/furnitures/EKET/parts.gen";
import { COMPOSED } from "@/src/game/content/furnitures/composed";

const FURNITURES = [
  { id: "LACK", parts: LACK_PARTS, structure: LACK_STRUCTURE },
  { id: "BEKVAM", parts: BEKVAM_PARTS, structure: BEKVAM_STRUCTURE },
  { id: "DALFRED", parts: DALFRED_PARTS, structure: DALFRED_STRUCTURE },
  { id: "EKET", parts: EKET_PARTS, structure: EKET_STRUCTURE },
] as const;

/** Measured corpus state 2026-08-24 — a re-export that changes these numbers must re-measure, not weaken the pin. */
const CORPUS_FASTENERS = 83;
const HEADLESS_GROUPS = new Set(["dowel101350", "bolt115980", "cap107675", "screw108443"]);
const HEADLESS_INSTANCES = 12;
/** Cosine floor for axis agreement; measured worst case is far above it (BEKVÄM's real 5° splay ≈ 0.996). */
const AXIS_COS_MIN = 0.9;
/** A head must be ≥15% wider than the tip to count as seen; below this the hardware is treated as headless. Measured margins: confident groups ≥1.28, headless ≤1.11. */
const HEAD_RATIO_MIN = 1.15;
/** PCA vertex-sample cap — determinism and speed; stride sampling, no randomness. */
const PCA_SAMPLE_CAP = 1500;

type V3 = [number, number, number];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = (v: V3): V3 => {
  const l = Math.hypot(v[0], v[1], v[2]);
  return [v[0] / l, v[1] / l, v[2] / l];
};
const rotQ = (q: [number, number, number, number], v: V3): V3 => {
  const [x, y, z, w] = q;
  const tx = 2 * (y * v[2] - z * v[1]), ty = 2 * (z * v[0] - x * v[2]), tz = 2 * (x * v[1] - y * v[0]);
  return [v[0] + w * tx + (y * tz - z * ty), v[1] + w * ty + (z * tx - x * tz), v[2] + w * tz + (x * ty - y * tx)];
};
const quatMul = (a: [number, number, number, number], b: [number, number, number, number]): [number, number, number, number] => [
  a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
  a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
  a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
  a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
];

function parseGlb(file: string) {
  const b = fs.readFileSync(file);
  const jsonLen = b.readUInt32LE(12);
  const json = JSON.parse(b.subarray(20, 20 + jsonLen).toString("utf8"));
  const off = 20 + jsonLen;
  return { json, bin: b.subarray(off + 8, off + 8 + b.readUInt32LE(off)) };
}

function readPositions(json: any, bin: Buffer, ai: number): V3[] {
  const acc = json.accessors[ai];
  const bv = json.bufferViews[acc.bufferView];
  const base = (bv.byteOffset ?? 0) + (acc.byteOffset ?? 0);
  const stride = bv.byteStride ?? 12;
  const out: V3[] = [];
  for (let i = 0; i < acc.count; i++) {
    const o = base + i * stride;
    out.push([bin.readFloatLE(o), bin.readFloatLE(o + 4), bin.readFloatLE(o + 8)]);
  }
  return out;
}

/** partId from the mesh-name convention (scripts/NAMING.md): cluster _ group [_ index] [__ joints]. */
function partIdOf(name: string): string {
  const dd = name.indexOf("__");
  const head = dd === -1 ? name : name.slice(0, dd);
  const [, group, i] = head.split("_");
  return i !== undefined && /^\d+$/.test(i) ? `${group}_${Number(i)}` : group;
}

/** World-space vertices per node, composing the scene hierarchy (shipped models are flat, but a parented re-export must not silently shift a pin). */
function worldVerts(json: any, bin: Buffer): Map<string, V3[]> {
  const out = new Map<string, V3[]>();
  const walk = (nis: number[], pt: V3, pr: [number, number, number, number], ps: V3) => {
    for (const ni of nis) {
      const n = json.nodes[ni];
      const t: V3 = n.translation ?? [0, 0, 0];
      const r: [number, number, number, number] = n.rotation ?? [0, 0, 0, 1];
      const s: V3 = n.scale ?? [1, 1, 1];
      const rt = rotQ(pr, [t[0] * ps[0], t[1] * ps[1], t[2] * ps[2]]);
      const wt: V3 = [pt[0] + rt[0], pt[1] + rt[1], pt[2] + rt[2]];
      const wr = quatMul(pr, r);
      const ws: V3 = [ps[0] * s[0], ps[1] * s[1], ps[2] * s[2]];
      if (n.name && n.mesh != null) {
        const verts: V3[] = [];
        for (const prim of json.meshes[n.mesh].primitives) {
          if (prim.attributes.POSITION == null) continue;
          for (const v of readPositions(json, bin, prim.attributes.POSITION)) {
            const q = rotQ(wr, [v[0] * ws[0], v[1] * ws[1], v[2] * ws[2]]);
            verts.push([wt[0] + q[0], wt[1] + q[1], wt[2] + q[2]]);
          }
        }
        if (verts.length) out.set(n.name, verts);
      }
      walk(n.children ?? [], wt, wr, ws);
    }
  };
  walk(json.scenes[json.scene ?? 0].nodes, [0, 0, 0], [0, 0, 0, 1], [1, 1, 1]);
  return out;
}

/** Principal axis by power iteration on the vertex covariance — deterministic seed, unsigned result. */
function pcaAxis(verts: V3[]): { axis: V3; centroid: V3 } {
  const n = verts.length;
  const c: V3 = [0, 0, 0];
  for (const v of verts) { c[0] += v[0] / n; c[1] += v[1] / n; c[2] += v[2] / n; }
  const M = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (const v of verts) {
    const d = [v[0] - c[0], v[1] - c[1], v[2] - c[2]];
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) M[i][j] += d[i] * d[j];
  }
  let u: V3 = [1, 0.3, 0.7];
  for (let k = 0; k < 80; k++) u = norm([dot(M[0] as V3, u), dot(M[1] as V3, u), dot(M[2] as V3, u)]);
  return { axis: u, centroid: c };
}

/** Head detection: p90 OUTER radial envelope of each end's vertices (t<25% / t>75% along the axis); the head is the wider end. */
function headProfile(verts: V3[], axis: V3, centroid: V3) {
  let tmin = Infinity, tmax = -Infinity;
  const ts: number[] = [], rs: number[] = [];
  for (const v of verts) {
    const d: V3 = [v[0] - centroid[0], v[1] - centroid[1], v[2] - centroid[2]];
    const t = dot(d, axis);
    ts.push(t);
    rs.push(Math.sqrt(Math.max(0, dot(d, d) - t * t)));
    if (t < tmin) tmin = t;
    if (t > tmax) tmax = t;
  }
  const len = tmax - tmin;
  const plusEnd: number[] = [], minusEnd: number[] = [];
  for (let i = 0; i < ts.length; i++) {
    const tn = (ts[i] - tmin) / len;
    if (tn > 0.75) plusEnd.push(rs[i]);
    else if (tn < 0.25) minusEnd.push(rs[i]);
  }
  const p90 = (a: number[]) => a.sort((x, y) => x - y)[Math.floor(a.length * 0.9)] ?? 0;
  const wPlus = p90(plusEnd), wMinus = p90(minusEnd);
  const ratio = Math.max(wPlus, wMinus) / Math.max(1e-6, Math.min(wPlus, wMinus));
  const towardHead: V3 = wPlus > wMinus ? axis : [-axis[0], -axis[1], -axis[2]];
  return { ratio, towardHead };
}

test("fastener geometry pins: PCA axis 83/83, head-end abstains only on headless hardware, head-side sign has zero flips", () => {
  let total = 0;
  const axisFails: string[] = [], signFlips: string[] = [];
  const abstains: string[] = [], abstainGroups = new Set<string>();
  for (const f of FURNITURES) {
    const glb = path.join(process.cwd(), "src", "assets", "models", "furnitures", f.id, `${f.id}.glb`);
    const { json, bin } = parseGlb(glb);
    const verts = worldVerts(json, bin);
    const played = applyStructure(f.parts as Record<PartId, PartDef>, COMPOSED[f.id]);
    for (const p of Object.values(played)) {
      if (p.type !== "fastener" || !p.engageDir) continue;
      // Overlay-RE-TYPED hardware (EKET's suspCap, a disc with authored bindings + engageDir) is excluded: these pins measure derivation against GLB-native fastener geometry, and the frame convention never applied to a re-typed mesh.
      if ((f.parts as Record<string, PartDef>)[p.partId]?.type !== "fastener") continue;
      total++;
      const meshName = [...verts.keys()].find((n) => partIdOf(n) === p.partId);
      assert.ok(meshName, `${f.id}/${p.partId}: no GLB mesh matches this fastener`);
      const all = verts.get(meshName!)!;
      const sample = all.length > PCA_SAMPLE_CAP ? all.filter((_, i) => i % Math.ceil(all.length / PCA_SAMPLE_CAP) === 0) : all;
      const truth = norm(p.engageDir as V3);
      const { axis, centroid } = pcaAxis(sample);
      if (Math.abs(dot(axis, truth)) < AXIS_COS_MIN) axisFails.push(`${f.id}/${p.partId} cos=${dot(axis, truth).toFixed(3)}`);
      const { ratio, towardHead } = headProfile(sample, axis, centroid);
      if (ratio < HEAD_RATIO_MIN) {
        abstains.push(p.partId);
        abstainGroups.add(p.group);
      } else if (dot(towardHead, truth) <= 0) {
        signFlips.push(`${f.id}/${p.partId} ratio=${ratio.toFixed(2)}`);
      }
    }
  }
  assert.equal(total, CORPUS_FASTENERS, "corpus size moved — re-measure the pins before touching the constants");
  assert.deepEqual(axisFails, [], "PCA axis no longer parallels the played engageDir");
  assert.deepEqual(signFlips, [], "head-side sign flipped against the played engageDir — the 71/0 pin is broken");
  assert.deepEqual([...abstainGroups].sort(), [...HEADLESS_GROUPS].sort(), "the head detector's abstention set changed — either a mesh changed or the detector regressed");
  assert.equal(abstains.length, HEADLESS_INSTANCES, "headless instance count moved");
});
