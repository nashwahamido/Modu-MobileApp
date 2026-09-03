// The ANALYZER — what a GLB's meshes PROPOSE about its hardware, per the fastener-model-v2 geometry/wizard split: everything geometry and naming can measure comes out as facts and proposals, and a human decides. Its consumer here is helper-scripts/extract-structure.mts, which drafts a furniture's FASTENERS map from it; the same pure, environment-neutral code (feeds on glb.ts, no Node APIs) is what an upload portal would run in the browser. Shrunk 2026-09-02 to the three outputs something reads — identity, fastener geometry, role prefill + pairing; the host-envelope proposals and the in-analyzer sweep went with the portal, which has its own repo (derive-sweep.mts is the sweep's one home here).
// `analyzeMeshes(meshes, { overlay })` applies a re-typing overlay before the type-dependent passes, exactly the way applyStructure's re-typings refine the runtime's parts (EKET's suspCap).
import FASTENER_ROLES from "@/src/game/helper-scripts/fastener-roles.json";
import type { FastenerPreload, FastenerRole, Vec3 } from "@/src/game/core/type";
import { fastenerGeometry, type FastenerGeometry } from "./fastenerGeometry";
import { readGlbMeshes, type GlbMesh } from "./glb";

export type { FastenerGeometry } from "./fastenerGeometry";

type RolePrefill = { role: FastenerRole; preload?: FastenerPreload };
const PREFILL_BY_PREFIX = FASTENER_ROLES.prefixes as Record<string, RolePrefill>;

/** Pairing acceptance: every extra instance within this distance of its matched primary (measured true pair ≤ 2.5cm, nearest false pair ≥ 100× apart). */
const PAIR_MAX_DIST_M = 0.05;

export interface GlbAnalysis {
  /** Extraction — the identity facts, with `type` as the analyzer's PROPOSAL (prefix + two-host binding; the wizard's question 1 decides). */
  parts: Record<string, { partId: string; group: string; cluster: string; attached?: string[]; type: "structural" | "fastener"; position: Vec3 }>;
  /** Per-fastener measured geometry. */
  fasteners: Record<string, FastenerGeometry>;
  /** Prefix-derived ROLE prefill per fastener group — output of the names, never an input: the wizard shows it and the human's answer decides. Was `kindPrefill` (a FastenerKind) until the enum retired 2026-09-01; it now proposes the same shape the def is written in, so the wizard's answer needs no translation. */
  rolePrefill: Record<string, RolePrefill>;
  /** Detected two-piece fittings: extra group → primary group, with per-instance pairing (the `extraOf` home proposal — 28 candidates → the 1 true pair on the corpus). */
  pairings: { extraGroup: string; primaryGroup: string; byInstance: Record<string, string> }[];
}

export interface AnalyzeHints {
  /** Authored refinements applied before the type-dependent passes: per-part re-typings and bindings. */
  overlay?: Record<string, { type?: "structural" | "fastener"; attached?: string[] }>;
}

export const analyzeGlb = (bytes: Uint8Array, hints: AnalyzeHints = {}): GlbAnalysis => analyzeMeshes(readGlbMeshes(bytes), hints);

export function analyzeMeshes(meshes: readonly GlbMesh[], hints: AnalyzeHints = {}): GlbAnalysis {
  const ov = hints.overlay ?? {};

  const typeOf = (m: GlbMesh): "structural" | "fastener" => {
    const o = ov[m.partId]?.type;
    if (o) return o;
    const prefixed = Object.keys(PREFILL_BY_PREFIX).some((p) => m.group.toLowerCase().startsWith(p));
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

  const fasteners: GlbAnalysis["fasteners"] = {};
  for (const m of fastenerMeshes) fasteners[m.partId] = fastenerGeometry(m);

  const rolePrefill: GlbAnalysis["rolePrefill"] = {};
  for (const m of fastenerMeshes) {
    if (rolePrefill[m.group]) continue;
    const hit = Object.entries(PREFILL_BY_PREFIX).find(([p]) => m.group.toLowerCase().startsWith(p));
    // A "cap"-prefixed group splits on its binding: one named host means it dresses that part, two means it locks their joint (EKET's suspCap).
    rolePrefill[m.group] =
      hit && !(hit[0] === "cap" && (parts[m.partId].attached?.length ?? 0) === 1) ? hit[1] : { role: hit ? "cap" : "securer" };
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

  return { parts, fasteners, rolePrefill, pairings };
}
