// The ANALYZER — proposals only, a human confirms each. Pure (glb.ts, no Node APIs), so a browser portal runs the same code.
// IN: a GLB's meshes, plus an `overlay` re-typing them first (EKET's suspCap).
// OUT: identity for every part, then geometry, role prefill and pairing for the hardware.

import FASTENER_ROLES from "@/src/game/helper-scripts/fastener-roles.json";
import type { FastenerPreload, FastenerRole, Vec3 } from "@/src/game/core/type";
import { fastenerGeometry, type FastenerGeometry } from "./fastenerGeometry";
import { readGlbMeshes, type GlbMesh } from "./glb";

export type { FastenerGeometry } from "./fastenerGeometry";

type RolePrefill = { role: FastenerRole; preload?: FastenerPreload };
const PREFILL_BY_PREFIX = FASTENER_ROLES.prefixes as Record<
  string,
  RolePrefill
>;

// Pairing acceptance distance: true pairs measure ≤ 2.5cm, the nearest false pair 100× that.
const PAIR_MAX_DIST_M = 0.05;

export interface GlbAnalysis {
  // Identity facts. `type` is a PROPOSAL from the prefix and binding; the user decides.
  parts: Record<
    string,
    {
      partId: string;
      group: string;
      cluster: string;
      attached?: string[];
      type: "structural" | "fastener";
      position: Vec3;
    }
  >;
  // Per-fastener measured geometry.
  fasteners: Record<string, FastenerGeometry>;
  // Prefix-derived ROLE per group — an output the wizard shows, never an input here.
  rolePrefill: Record<string, RolePrefill>;
  // Two-piece fittings: extra group → primary group, per instance (28 candidates → 1 true pair on the corpus).
  pairings: {
    extraGroup: string;
    primaryGroup: string;
    byInstance: Record<string, string>;
  }[];
}

export interface AnalyzeHints {
  // Per-part re-typings and bindings.
  overlay?: Record<
    string,
    { type?: "structural" | "fastener"; attached?: string[] }
  >;
}

export const analyzeGlb = (
  bytes: Uint8Array,
  hints: AnalyzeHints = {},
): GlbAnalysis => analyzeMeshes(readGlbMeshes(bytes), hints);

export function analyzeMeshes(
  meshes: readonly GlbMesh[],
  hints: AnalyzeHints = {},
): GlbAnalysis {
  const ov = hints.overlay ?? {};

  const typeOf = (m: GlbMesh): "structural" | "fastener" => {
    const o = ov[m.partId]?.type;
    if (o) return o;
    const prefixed = Object.keys(PREFILL_BY_PREFIX).some((p) =>
      m.group.toLowerCase().startsWith(p),
    );
    return prefixed || m.attached?.length === 2 ? "fastener" : "structural";
  };

  const parts: GlbAnalysis["parts"] = {};
  for (const m of meshes) {
    parts[m.partId] = {
      partId: m.partId,
      group: m.group,
      cluster: m.cluster,
      ...(ov[m.partId]?.attached
        ? { attached: ov[m.partId].attached }
        : m.attached
          ? { attached: m.attached }
          : {}),
      type: typeOf(m),
      position: m.pose.position,
    };
  }

  const fastenerMeshes = meshes.filter(
    (m) => parts[m.partId].type === "fastener",
  );

  const fasteners: GlbAnalysis["fasteners"] = {};
  for (const m of fastenerMeshes) fasteners[m.partId] = fastenerGeometry(m);

  const rolePrefill: GlbAnalysis["rolePrefill"] = {};
  for (const m of fastenerMeshes) {
    if (rolePrefill[m.group]) continue;
    const hit = Object.entries(PREFILL_BY_PREFIX).find(([p]) =>
      m.group.toLowerCase().startsWith(p),
    );
    // A "cap" prefix splits on its binding: one host means it dresses that part, two means it locks their joint.
    rolePrefill[m.group] =
      hit &&
      !(hit[0] === "cap" && (parts[m.partId].attached?.length ?? 0) === 1)
        ? hit[1]
        : { role: hit ? "cap" : "securer" };
  }

  // Pairing: equal-sized groups whose instances match 1:1 by proximity.
  const byGroup = new Map<string, GlbMesh[]>();
  for (const m of fastenerMeshes)
    (byGroup.get(m.group) ?? byGroup.set(m.group, []).get(m.group)!).push(m);
  const pairings: GlbAnalysis["pairings"] = [];
  const groups = [...byGroup.keys()];
  for (const extraGroup of groups) {
    for (const primaryGroup of groups) {
      if (extraGroup === primaryGroup) continue;
      const ex = byGroup.get(extraGroup)!,
        pr = byGroup.get(primaryGroup)!;
      if (ex.length !== pr.length || ex.length < 2) continue;
      // extras name FEWER hosts than their primary (a plug names one panel, its cam two) — orient that way, then match nearest
      const exHosts = ex[0].attached?.length ?? 0,
        prHosts = pr[0].attached?.length ?? 0;
      if (!(exHosts < prHosts)) continue;
      const taken = new Set<string>();
      const byInstance: Record<string, string> = {};
      let ok = true;
      for (const e of ex) {
        let best: GlbMesh | null = null,
          bestD = Infinity;
        for (const p of pr) {
          if (taken.has(p.partId)) continue;
          const d = Math.hypot(
            e.pose.position[0] - p.pose.position[0],
            e.pose.position[1] - p.pose.position[1],
            e.pose.position[2] - p.pose.position[2],
          );
          if (d < bestD) {
            bestD = d;
            best = p;
          }
        }
        if (!best || bestD > PAIR_MAX_DIST_M) {
          ok = false;
          break;
        }
        taken.add(best.partId);
        byInstance[e.partId] = best.partId;
      }
      if (ok) pairings.push({ extraGroup, primaryGroup, byInstance });
    }
  }

  return { parts, fasteners, rolePrefill, pairings };
}
