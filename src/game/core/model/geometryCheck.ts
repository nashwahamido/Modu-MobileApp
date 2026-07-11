import { vec3Distance } from "@/src/game/core/geometry/math";
import { LiaisonMap, PartDef, PartId, Vec3 } from "@/src/game/core/type";

type Parts = Record<PartId, PartDef>;

const JOINT_SPAN_MAX = 0.9;
const FASTENER_REACH_MAX = 0.8;

const centreOf = (p: PartDef): Vec3 => {
  const [ox, oy, oz] = p.visualCenterOffset ?? [0, 0, 0];
  const [px, py, pz] = p.pose.position;
  return [px + ox, py + oy, pz + oz];
};

/** Diagonal of the AABB over all structural part centres — the model's scale  reference, so the thresholds are resolution-independent. 0 when there are  fewer than two structural parts (nothing to scale against). */
function modelDiagonal(parts: Parts): number {
  const lo: [number, number, number] = [Infinity, Infinity, Infinity];
  const hi: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  let n = 0;
  for (const p of Object.values(parts)) {
    if (p.type !== "structural") continue;
    const c = centreOf(p);
    n++;
    for (let i = 0; i < 3; i++) {
      lo[i] = Math.min(lo[i], c[i]);
      hi[i] = Math.max(hi[i], c[i]);
    }
  }
  return n >= 2 ? Math.hypot(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]) : 0;
}

/** Coarse geometric plausibility warnings for the joint graph. Pure; returns  warning messages (never errors — see the module note on why it can only be  a heuristic). `liaisons` is Γ as built from `parts`. */
export function geometryWarnings(parts: Parts, liaisons: LiaisonMap): string[] {
  const out: string[] = [];
  const diag = modelDiagonal(parts);
  if (diag === 0) return out;

  for (const l of Object.values(liaisons)) {
    const a = parts[l.a];
    const b = parts[l.b];
    if (!a || !b) continue;
    const frac = vec3Distance(centreOf(a), centreOf(b)) / diag;
    if (frac > JOINT_SPAN_MAX) {
      out.push(
        `joint "${l.id}" spans ${(frac * 100) | 0}% of the model — its ends are ` +
          `implausibly far apart; check the fastener's "…_a&b" mesh name or the ` +
          `authored directJoins/slideJoins/screwJoins target`,
      );
    }
  }

  for (const p of Object.values(parts)) {
    if (p.type !== "fastener" || (p.attached?.length ?? 0) < 1) continue;
    for (const t of p.attached!) {
      const tp = parts[t];
      if (!tp) continue;
      const frac = vec3Distance(centreOf(p), centreOf(tp)) / diag;
      if (frac > FASTENER_REACH_MAX) {
        out.push(
          `fastener "${p.partId}" sits ${(frac * 100) | 0}% of the model away from ` +
            `"${t}" which it claims to attach — likely a wrong "…_a&b" mesh name`,
        );
      }
    }
  }

  return out;
}

export { centreOf as partWorldCentre };
