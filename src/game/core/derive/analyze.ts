// The ANALYZER — the portal's derivation pass over an uploaded GLB, per the fastener-model-v2 geometry/wizard split: everything geometry can MEASURE comes out of here as facts and proposals; the wizard asks only the per-group functional questions, with these proposals prefilled. Pure and environment-neutral (feeds on glb.ts, no Node APIs), so the same code runs in the portal's browser, in scripts, and in the corpus pin test that keeps every derivation honest.
// Two-stage by design: `analyzeGlb(bytes)` is the raw pass over convention data alone; `analyzeGlb(bytes, { overlay })` re-runs the state-dependent parts (part types, travel spans, the sweep) with the wizard's answers applied — re-typings and authored fields refine the analysis exactly the way applyStructure refines the runtime's parts.
import FASTENER_KINDS from "@/src/game/core/model/fastener-kinds.json";
import { buildSweepMap, columnsOf, type SweepMember } from "@/src/game/core/model/sweep";
import { SWEEP_CELL_M } from "@/src/game/core/model/sweep";
import type { FastenerKind, SweepMap, Vec3 } from "@/src/game/core/type";
import { readGlbMeshes, type GlbMesh } from "./glb";

const KIND_BY_PREFIX = FASTENER_KINDS.prefixes as Record<string, FastenerKind>;

/** A head must be ≥15% wider than the tip to count as seen (measured margins: confident groups ≥1.28, headless ≤1.11). */
const HEAD_RATIO_MIN = 1.15;
/** Deterministic vertex-sample cap for the per-fastener geometry. */
const SAMPLE_CAP = 1500;
/** Pairing acceptance: every extra instance within this distance of its matched primary (measured true pair ≤ 2.5cm, nearest false pair ≥ 100× apart). */
const PAIR_MAX_DIST_M = 0.05;

export interface FastenerGeometry {
  /** Unit principal axis of the shaft, unsigned (PCA over vertices — 83/83 parallel to played values on the corpus). */
  axis: Vec3;
  /** Widest-end ratio from the p90 OUTER radial envelope per end — never the mean, or a screwdriver recess reads as a narrow tip. */
  headRatio: number;
  /** Signed engagement proposal (points out the head side); null when the hardware is genuinely headless (symmetric dowels, double-ended studs) and the sign must come from the anchor rule + wizard. */
  engage: Vec3 | null;
}

export interface GlbAnalysis {
  /** Extraction — the identity facts, with `type` as the analyzer's PROPOSAL (prefix + two-host binding; the wizard's question 1 decides). */
  parts: Record<string, { partId: string; group: string; cluster: string; attached?: string[]; type: "structural" | "fastener"; position: Vec3 }>;
  /** Per-fastener measured geometry. */
  fasteners: Record<string, FastenerGeometry>;
  /** Prefix-derived kind prefill per fastener group — output of the names, never an input (the wizard shows it, the roles decide). */
  kindPrefill: Record<string, FastenerKind>;
  /** Detected two-piece fittings: extra group → primary group, with per-instance pairing (the `extraOf` home proposal — 28 candidates → the 1 true pair on the corpus). */
  pairings: { extraGroup: string; primaryGroup: string; byInstance: Record<string, string> }[];
  /** Host-membership proposals per fastener instance, best-first: structural parts ranked by how much of the fastener's body sits inside their 3-axis column envelope. Thin-sheet engagements are invisible to this (measured) — proposals, never truth. */
  hostProposals: Record<string, string[]>;
  /** Exit-sweep blocker data per structural part (cluster-scoped) — the ordering half, identical to the shipped sweep.gen when the overlay is supplied. */
  sweep: SweepMap;
}

const unit = (v: Vec3): Vec3 | null => {
  const l = Math.hypot(v[0], v[1], v[2]);
  return l < 1e-9 ? null : [v[0] / l, v[1] / l, v[2] / l];
};

function pcaAxis(verts: readonly Vec3[]): { axis: Vec3; centroid: Vec3 } {
  const n = verts.length;
  const c: [number, number, number] = [0, 0, 0];
  for (const v of verts) { c[0] += v[0] / n; c[1] += v[1] / n; c[2] += v[2] / n; }
  const M = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (const v of verts) {
    const d = [v[0] - c[0], v[1] - c[1], v[2] - c[2]];
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) M[i][j] += d[i] * d[j];
  }
  let u: Vec3 = [1, 0.3, 0.7];
  for (let k = 0; k < 80; k++) u = unit([M[0][0] * u[0] + M[0][1] * u[1] + M[0][2] * u[2], M[1][0] * u[0] + M[1][1] * u[1] + M[1][2] * u[2], M[2][0] * u[0] + M[2][1] * u[1] + M[2][2] * u[2]])!;
  return { axis: u, centroid: c };
}

function fastenerGeometry(mesh: GlbMesh): FastenerGeometry {
  const sample = mesh.verts.length > SAMPLE_CAP ? mesh.verts.filter((_, i) => i % Math.ceil(mesh.verts.length / SAMPLE_CAP) === 0) : mesh.verts;
  const { axis, centroid } = pcaAxis(sample);
  let tmin = Infinity, tmax = -Infinity;
  const ts: number[] = [], rs: number[] = [];
  for (const v of sample) {
    const d: Vec3 = [v[0] - centroid[0], v[1] - centroid[1], v[2] - centroid[2]];
    const t = d[0] * axis[0] + d[1] * axis[1] + d[2] * axis[2];
    ts.push(t);
    rs.push(Math.sqrt(Math.max(0, d[0] * d[0] + d[1] * d[1] + d[2] * d[2] - t * t)));
    if (t < tmin) tmin = t;
    if (t > tmax) tmax = t;
  }
  const len = tmax - tmin;
  const plus: number[] = [], minus: number[] = [];
  for (let i = 0; i < ts.length; i++) {
    const tn = (ts[i] - tmin) / len;
    if (tn > 0.75) plus.push(rs[i]);
    else if (tn < 0.25) minus.push(rs[i]);
  }
  const p90 = (a: number[]) => a.sort((x, y) => x - y)[Math.floor(a.length * 0.9)] ?? 0;
  const wPlus = p90(plus), wMinus = p90(minus);
  const headRatio = Math.max(wPlus, wMinus) / Math.max(1e-6, Math.min(wPlus, wMinus));
  const engage: Vec3 | null = headRatio < HEAD_RATIO_MIN ? null : wPlus > wMinus ? axis : [-axis[0], -axis[1], -axis[2]];
  return { axis, headRatio, engage };
}

/** Per-part 3-axis column envelopes over a shared frame — inside on all three axes approximates inside-the-solid far better than an AABB (the 42% buried-heuristic's failure). */
function solidEnvelopes(meshes: readonly GlbMesh[]) {
  const origin: [number, number, number] = [Infinity, Infinity, Infinity];
  const top: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (const m of meshes) for (const v of m.verts) for (let i = 0; i < 3; i++) {
    if (v[i] < origin[i]) origin[i] = v[i]; if (v[i] > top[i]) top[i] = v[i];
  }
  for (let i = 0; i < 3; i++) origin[i] -= 2 * SWEEP_CELL_M;
  const dims = ([0, 1, 2] as const).map((axis) => {
    const U = (axis + 1) % 3, V = (axis + 2) % 3;
    return [Math.ceil((top[U] - origin[U]) / SWEEP_CELL_M) + 4, Math.ceil((top[V] - origin[V]) / SWEEP_CELL_M) + 4] as [number, number];
  });
  const env = new Map(meshes.map((m) => [m.partId, ([0, 1, 2] as const).map((axis) => columnsOf(m.tris, axis, origin as Vec3, dims[axis]))]));
  const inside = (partId: string, p: Vec3): boolean => {
    const e = env.get(partId);
    if (!e) return false;
    for (const axis of [0, 1, 2] as const) {
      const U = (axis + 1) % 3, V = (axis + 2) % 3;
      const cu = Math.round((p[U] - origin[U]) / SWEEP_CELL_M), cv = Math.round((p[V] - origin[V]) / SWEEP_CELL_M);
      const col = e[axis].get(cu * dims[axis][1] + cv);
      if (!col) return false;
      const w = (p[axis] - origin[axis]) / SWEEP_CELL_M;
      if (w < col[0] - 1 || w > col[1] + 1) return false;
    }
    return true;
  };
  return inside;
}

export interface AnalyzeHints {
  /** Wizard / authored refinements applied before the state-dependent passes: per-part re-typings, bindings, travel spans. */
  overlay?: Record<string, { type?: "structural" | "fastener"; attached?: string[]; parkBackoff?: number }>;
}

export function analyzeGlb(bytes: Uint8Array, hints: AnalyzeHints = {}): GlbAnalysis {
  const meshes = readGlbMeshes(bytes);
  const ov = hints.overlay ?? {};

  const typeOf = (m: GlbMesh): "structural" | "fastener" => {
    const o = ov[m.partId]?.type;
    if (o) return o;
    const prefixed = Object.keys(KIND_BY_PREFIX).some((p) => m.group.toLowerCase().startsWith(p));
    return prefixed || m.attached?.length === 2 ? "fastener" : "structural";
  };

  const parts: GlbAnalysis["parts"] = {};
  for (const m of meshes) {
    parts[m.partId] = {
      partId: m.partId, group: m.group, cluster: m.cluster,
      ...(ov[m.partId]?.attached ? { attached: ov[m.partId].attached } : m.attached ? { attached: m.attached } : {}),
      type: typeOf(m),
      position: m.pose.position,
    };
  }

  const fastenerMeshes = meshes.filter((m) => parts[m.partId].type === "fastener");
  const structuralMeshes = meshes.filter((m) => parts[m.partId].type === "structural");

  const fasteners: GlbAnalysis["fasteners"] = {};
  for (const m of fastenerMeshes) fasteners[m.partId] = fastenerGeometry(m);

  const kindPrefill: GlbAnalysis["kindPrefill"] = {};
  for (const m of fastenerMeshes) {
    if (kindPrefill[m.group]) continue;
    const hit = Object.entries(KIND_BY_PREFIX).find(([p]) => m.group.toLowerCase().startsWith(p));
    kindPrefill[m.group] = hit ? hit[1] : "secured";
  }

  // Pairing detection: two fastener groups with equal instance counts whose instances match 1:1 by proximity — the `extraOf` proposal. The one-confirm wizard step; never auto-committed.
  const byGroup = new Map<string, GlbMesh[]>();
  for (const m of fastenerMeshes) (byGroup.get(m.group) ?? byGroup.set(m.group, []).get(m.group)!).push(m);
  const pairings: GlbAnalysis["pairings"] = [];
  const groups = [...byGroup.keys()];
  for (const extraGroup of groups) {
    for (const primaryGroup of groups) {
      if (extraGroup === primaryGroup) continue;
      const ex = byGroup.get(extraGroup)!, pr = byGroup.get(primaryGroup)!;
      if (ex.length !== pr.length || ex.length < 2) continue;
      // extras have FEWER mesh-declared hosts than their primary (a plug names one panel, its cam names two) — orient the pair that way and match by nearest
      const exHosts = ex[0].attached?.length ?? 0, prHosts = pr[0].attached?.length ?? 0;
      if (!(exHosts < prHosts)) continue;
      const taken = new Set<string>();
      const byInstance: Record<string, string> = {};
      let ok = true;
      for (const e of ex) {
        let best: GlbMesh | null = null, bestD = Infinity;
        for (const p of pr) {
          if (taken.has(p.partId)) continue;
          const d = Math.hypot(e.pose.position[0] - p.pose.position[0], e.pose.position[1] - p.pose.position[1], e.pose.position[2] - p.pose.position[2]);
          if (d < bestD) { bestD = d; best = p; }
        }
        if (!best || bestD > PAIR_MAX_DIST_M) { ok = false; break; }
        taken.add(best.partId);
        byInstance[e.partId] = best.partId;
      }
      if (ok) pairings.push({ extraGroup, primaryGroup, byInstance });
    }
  }

  // Host proposals: structural parts ranked by the fraction of the fastener's sampled vertices inside their solid envelope, same cluster only.
  const insideSolid = solidEnvelopes(structuralMeshes);
  const hostProposals: GlbAnalysis["hostProposals"] = {};
  for (const m of fastenerMeshes) {
    const sample = m.verts.length > 300 ? m.verts.filter((_, i) => i % Math.ceil(m.verts.length / 300) === 0) : m.verts;
    const scores: [string, number][] = [];
    for (const s of structuralMeshes) {
      if (s.cluster !== m.cluster) continue;
      let hit = 0;
      for (const p of sample) if (insideSolid(s.partId, p)) hit++;
      if (hit > 0) scores.push([s.partId, hit / sample.length]);
    }
    scores.sort((a, b) => b[1] - a[1]);
    hostProposals[m.partId] = scores.slice(0, 3).map(([id]) => id);
  }

  // The ordering half: exit-sweep blockers per structural part, cluster-scoped, spans refined by the overlay's parkBackoff.
  const clusters = new Map<string, SweepMember[]>();
  for (const m of structuralMeshes) {
    const member: SweepMember = { partId: m.partId as SweepMember["partId"], tris: m.tris, ...(ov[m.partId]?.parkBackoff !== undefined ? { parkBackoff: ov[m.partId].parkBackoff } : {}) };
    (clusters.get(m.cluster) ?? clusters.set(m.cluster, []).get(m.cluster)!).push(member);
  }
  const sweep: SweepMap = {} as SweepMap;
  for (const members of clusters.values()) Object.assign(sweep, buildSweepMap(members));

  return { parts, fasteners, kindPrefill, pairings, hostProposals, sweep };
}
