// The ONE fastener-geometry deriver: shaft axis by vertex PCA, head end by the radial envelope.
// Three callers — read-parts.mts (writes `engageDir`), the analyzer, and the corpus pin test (83/83 axes, 71/71 confident signs).
import type { Vec3 } from "@/src/game/core/type";
import type { GlbMesh } from "./glb";

/** A head must be ≥15% wider than the tip to count as seen (measured: confident groups ≥1.28, headless ≤1.11). */
export const HEAD_RATIO_MIN = 1.15;
/** Deterministic vertex-sample cap; stride sampling, no randomness. */
export const SAMPLE_CAP = 1500;

export interface FastenerGeometry {
  /** Unit principal axis of the shaft, unsigned. */
  axis: Vec3;
  /** Widest-end ratio from the p90 OUTER radial envelope per end — never the mean, or a screwdriver recess reads as a narrow tip. */
  headRatio: number;
  /** Signed engagement, pointing out the head side; null when the hardware is headless (symmetric dowels, double-ended studs) and the sign must come from elsewhere. */
  engage: Vec3 | null;
}

const unit = (v: Vec3): Vec3 | null => {
  const l = Math.hypot(v[0], v[1], v[2]);
  return l < 1e-9 ? null : [v[0] / l, v[1] / l, v[2] / l];
};

export const sampleVerts = (verts: readonly Vec3[], cap = SAMPLE_CAP): readonly Vec3[] =>
  verts.length > cap ? verts.filter((_, i) => i % Math.ceil(verts.length / cap) === 0) : verts;

/** Principal axis by power iteration on the vertex covariance — deterministic seed, unsigned result. */
export function pcaAxis(verts: readonly Vec3[]): { axis: Vec3; centroid: Vec3 } {
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

export function fastenerGeometry(mesh: Pick<GlbMesh, "verts">): FastenerGeometry {
  const sample = sampleVerts(mesh.verts);
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
