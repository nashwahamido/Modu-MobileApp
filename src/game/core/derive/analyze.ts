// The ANALYZER: what a GLB's meshes PROPOSE about its hardware — geometry and naming measure, a human decides.
// Three outputs, all something reads: identity, fastener geometry, role prefill + pairing.
// Pure and environment-neutral (glb.ts only, no Node APIs), so extract-structure.mts and a browser upload portal run the same code.
// `overlay` re-types parts before the type-dependent passes, the way applyStructure's re-typings do (EKET's suspCap).
import FASTENER_ROLES from "@/src/game/helper-scripts/fastener-roles.json";
import type { FastenerPreload, FastenerRole, Vec3 } from "@/src/game/core/type";
import { fastenerGeometry, type FastenerGeometry } from "./fastenerGeometry";
import { readGlbMeshes, type GlbMesh } from "./glb";

export type { FastenerGeometry } from "./fastenerGeometry";

type RolePrefill = { role: FastenerRole; preload?: FastenerPreload };
const PREFILL_BY_PREFIX = FASTENER_ROLES.prefixes as Record<string, RolePrefill>;

/** Pairing acceptance distance: measured true pairs sit ≤ 2.5cm apart, the nearest false pair 100× that. */
const PAIR_MAX_DIST_M = 0.05;

export interface GlbAnalysis {
  /** Identity facts, with `type` only a PROPOSAL (prefix + two-host binding) — the wizard's question 1 decides. */
  parts: Record<string, { partId: string; group: string; cluster: string; attached?: string[]; type: "structural" | "fastener"; position: Vec3 }>;
  /** Per-fastener measured geometry. */
  fasteners: Record<string, FastenerGeometry>;
  /** Prefix-derived ROLE prefill per group — an output the wizard shows, never an input to anything here. */
  rolePrefill: Record<string, RolePrefill>;
  /** Detected two-piece fittings: extra group → primary group, per instance (the `extraOf` proposal — 28 candidates → 1 true pair on the corpus). */
  pairings: { extraGroup: string; primaryGroup: string; byInstance: Record<string, string> }[];
}

export interface AnalyzeHints {
  /** Per-part re-typings and bindings, applied before the type-dependent passes. */
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
    // A "cap"-prefixed group splits on its binding: one host means it dresses that part, two means it locks their joint (EKET's suspCap).
    rolePrefill[m.group] =
      hit && !(hit[0] === "cap" && (parts[m.partId].attached?.length ?? 0) === 1) ? hit[1] : { role: hit ? "cap" : "securer" };
  }

  // Pairing detection: equal-sized groups whose instances match 1:1 by proximity. A wizard proposal, never auto-committed.
  const byGroup = new Map<string, GlbMesh[]>();
  for (const m of fastenerMeshes) (byGroup.get(m.group) ?? byGroup.set(m.group, []).get(m.group)!).push(m);
  const pairings: GlbAnalysis["pairings"] = [];
  const groups = [...byGroup.keys()];
  for (const extraGroup of groups) {
    for (const primaryGroup of groups) {
      if (extraGroup === primaryGroup) continue;
      const ex = byGroup.get(extraGroup)!, pr = byGroup.get(primaryGroup)!;
      if (ex.length !== pr.length || ex.length < 2) continue;
      // extras name FEWER hosts than their primary (a plug names one panel, its cam names two) — orient the pair that way, then match by nearest
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
