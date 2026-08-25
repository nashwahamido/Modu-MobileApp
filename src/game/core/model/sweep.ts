// Structural sweep — the occupancy half of the geometry/wizard split (fastener-model-v2): pure column-envelope math deriving, per structural part and cardinal direction, WHICH parts obstruct its exit corridor within its bounded park travel. Offline (derive-sweep + the structuralSweep pin test) it builds the generated SweepMap; at runtime `pickEntryDir` turns that data into an order-aware travel choice for parts with no authored placeDir — the fix for static placeDir baking exactly one assembly order.
// Method, measured 2026-08-24 over all 33 device-verified placeDirs (14 exit-clear, 18 mate-only, 1 real unmodeled contact found, 0 false orderings): per axis, each part's triangles rasterize into a CELL-sized column grid keeping min/max depth per column (exact for planar triangles, vertices always land so slivers contribute); Q blocks P along a direction iff, in a shared column, Q reaches past P's near face by more than the contact tolerance AND starts within P's travel span — the engine's motion is a park offset eased to zero, so a blocker across the cabinet is no blocker. The mover's footprint is ERODED one cell (fit clearance: pins in bores and panels in grooves are all sub-cell). Known envelope limits: per-column min/max fills holes (sleeve-over-rail contact reads as blocking — which is why partner blockers are excluded from ordering decisions), and only cardinal directions are swept.
import type { PartId, SweepDirKey, SweepMap, Vec3 } from "@/src/game/core/type";

/** 4mm cells: grooves (6-10mm) stay visible, kissing contact stays below tolerance. */
export const SWEEP_CELL_M = 0.004;
/** Cells of along-axis envelope overlap ignored as contact noise (8mm, under any panel thickness). */
export const SWEEP_CONTACT_TOL_CELLS = 2;
/** Travel span when a part authors no parkBackoff — the slide default the engine uses. */
export const SWEEP_DEFAULT_SPAN_M = 0.1;

export const SWEEP_DIRS: readonly { key: SweepDirKey; dir: Vec3; axis: 0 | 1 | 2; sign: 1 | -1 }[] = [
  { key: "+x", dir: [1, 0, 0], axis: 0, sign: 1 }, { key: "-x", dir: [-1, 0, 0], axis: 0, sign: -1 },
  { key: "+y", dir: [0, 1, 0], axis: 1, sign: 1 }, { key: "-y", dir: [0, -1, 0], axis: 1, sign: -1 },
  { key: "+z", dir: [0, 0, 1], axis: 2, sign: 1 }, { key: "-z", dir: [0, 0, -1], axis: 2, sign: -1 },
];

const OPPOSITE: Record<SweepDirKey, SweepDirKey> = { "+x": "-x", "-x": "+x", "+y": "-y", "-y": "+y", "+z": "-z", "-z": "+z" };

type Tri = readonly [Vec3, Vec3, Vec3];
type Columns = Map<number, [number, number]>;

export interface SweepMember {
  partId: PartId;
  tris: readonly Tri[];
  parkBackoff?: number;
}

/** Column envelope along `axis`: packed (u,v) cell → [minW, maxW] in cells. Depth at each covered cell centre comes from the triangle plane (barycentric — exact for planar triangles, and STRICT: a relative slop here inflates big panel triangles by centimetres). Vertices always land so edge-on slivers still contribute. Exported for the analyzer's host-membership ranking (a point inside a part's envelope on all three axes approximates inside-the-solid far better than an AABB, which is what sank the 42% buried-heuristic). */
export function columnsOf(tris: readonly Tri[], axis: 0 | 1 | 2, origin: Vec3, dims: [number, number]): Columns {
  const U = (axis + 1) % 3, V = (axis + 2) % 3;
  const out: Columns = new Map();
  const push = (cu: number, cv: number, w: number) => {
    if (cu < 0 || cv < 0 || cu >= dims[0] || cv >= dims[1]) return;
    const key = cu * dims[1] + cv;
    const e = out.get(key);
    if (!e) out.set(key, [w, w]);
    else { if (w < e[0]) e[0] = w; if (w > e[1]) e[1] = w; }
  };
  for (const [A, B, C] of tris) {
    const au = (A[U] - origin[U]) / SWEEP_CELL_M, av = (A[V] - origin[V]) / SWEEP_CELL_M, aw = (A[axis] - origin[axis]) / SWEEP_CELL_M;
    const bu = (B[U] - origin[U]) / SWEEP_CELL_M, bv = (B[V] - origin[V]) / SWEEP_CELL_M, bw = (B[axis] - origin[axis]) / SWEEP_CELL_M;
    const cu = (C[U] - origin[U]) / SWEEP_CELL_M, cv = (C[V] - origin[V]) / SWEEP_CELL_M, cw = (C[axis] - origin[axis]) / SWEEP_CELL_M;
    push(Math.round(au), Math.round(av), aw); push(Math.round(bu), Math.round(bv), bw); push(Math.round(cu), Math.round(cv), cw);
    const minU = Math.floor(Math.min(au, bu, cu)), maxU = Math.ceil(Math.max(au, bu, cu));
    const minV = Math.floor(Math.min(av, bv, cv)), maxV = Math.ceil(Math.max(av, bv, cv));
    if ((maxU - minU) * (maxV - minV) > 40000) continue;
    const det = (bu - au) * (cv - av) - (cu - au) * (bv - av);
    if (Math.abs(det) < 1e-9) continue;
    for (let iu = minU; iu <= maxU; iu++) {
      for (let iv = minV; iv <= maxV; iv++) {
        const l1 = ((bu - iu) * (cv - iv) - (cu - iu) * (bv - iv)) / det;
        const l2 = ((cu - iu) * (av - iv) - (au - iu) * (cv - iv)) / det;
        const l3 = 1 - l1 - l2;
        if (l1 < 0 || l2 < 0 || l3 < 0) continue;
        push(iu, iv, l1 * aw + l2 * bw + l3 * cw);
      }
    }
  }
  return out;
}

/** Blocked-by sets for every member of ONE cluster (a drawer's build space is the drawer, not the cabinet it ends up inside). Deterministic: parts and blocker lists come out sorted, so the generated files are stable. Only non-empty lists are emitted — a missing key means the corridor is clear. */
export function buildSweepMap(members: readonly SweepMember[]): SweepMap {
  const origin: [number, number, number] = [Infinity, Infinity, Infinity], top: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (const m of members) for (const t of m.tris) for (const v of t) for (let i = 0; i < 3; i++) {
    if (v[i] < origin[i]) origin[i] = v[i]; if (v[i] > top[i]) top[i] = v[i];
  }
  for (let i = 0; i < 3; i++) origin[i] -= 2 * SWEEP_CELL_M;
  const dimsByAxis = ([0, 1, 2] as const).map((axis) => {
    const U = (axis + 1) % 3, V = (axis + 2) % 3;
    return [Math.ceil((top[U] - origin[U]) / SWEEP_CELL_M) + 4, Math.ceil((top[V] - origin[V]) / SWEEP_CELL_M) + 4] as [number, number];
  });
  const env = new Map<PartId, Columns[]>();
  const eroded = new Map<PartId, Columns[]>();
  for (const m of members) {
    const e = ([0, 1, 2] as const).map((axis) => columnsOf(m.tris, axis, origin, dimsByAxis[axis]));
    env.set(m.partId, e);
    // MOVER SHRINK: a column survives erosion only with all four orthogonal neighbours present, so boundary strips (groove engagement, pin rims) leave the collision test while the body stays. A sliver that erodes to nothing keeps its full footprint rather than becoming a ghost.
    eroded.set(m.partId, e.map((cols, axis) => {
      const D = dimsByAxis[axis][1];
      const out: Columns = new Map();
      for (const [key, v] of cols) if (cols.has(key - D) && cols.has(key + D) && cols.has(key - 1) && cols.has(key + 1)) out.set(key, v);
      return out.size ? out : cols;
    }));
  }
  const sweep: SweepMap = {} as SweepMap;
  for (const P of [...members].sort((a, b) => (a.partId as string).localeCompare(b.partId as string))) {
    const span = (P.parkBackoff ?? SWEEP_DEFAULT_SPAN_M) / SWEEP_CELL_M + SWEEP_CONTACT_TOL_CELLS;
    const entry: Partial<Record<SweepDirKey, PartId[]>> = {};
    for (const { key, axis, sign } of SWEEP_DIRS) {
      const blockers: PartId[] = [];
      const pe = eroded.get(P.partId)![axis];
      for (const Q of members) {
        if (Q.partId === P.partId) continue;
        const qe = env.get(Q.partId)![axis];
        const [small, big] = pe.size < qe.size ? [pe, qe] : [qe, pe];
        for (const [k, sEnv] of small) {
          const bEnv = big.get(k);
          if (!bEnv) continue;
          const [pMin, pMax] = small === pe ? sEnv : bEnv;
          const [qMin, qMax] = small === pe ? bEnv : sEnv;
          const hit = sign === 1
            ? qMax > pMin + SWEEP_CONTACT_TOL_CELLS && qMin < pMax + span
            : qMin < pMax - SWEEP_CONTACT_TOL_CELLS && qMax > pMin - span;
          if (hit) { blockers.push(Q.partId); break; }
        }
      }
      if (blockers.length) entry[key] = blockers.sort((a, b) => (a as string).localeCompare(b as string));
    }
    if (Object.keys(entry).length) sweep[P.partId] = entry;
  }
  return sweep;
}

/** Order-aware travel choice for a part with NO authored placeDir, as a CORRECTNESS OVERRIDE of the caller's heuristic: if the heuristic's own corridor is viable in the current placed state, the heuristic direction is returned UNCHANGED (byte-for-byte — the data only vetoes, it never re-derives a working answer); only when that corridor holds a placed third-party blocker does the best viable cardinal replace it, and when nothing is viable the heuristic stands (there is nothing better to offer). An entry travel `t` is viable when every already-placed blocker of the reverse corridor `-t` is one of the part's own joint partners — partner contact is park-math territory and carries no ordering information. */
const entryViable = (
  dirs: SweepMap[PartId],
  key: SweepDirKey,
  placed: (id: PartId) => boolean,
  partners: ReadonlySet<PartId>,
): boolean => (dirs[OPPOSITE[key]] ?? []).every((b) => !placed(b) || partners.has(b));

/** Is entering along `dir` (dominant cardinal) order-viable in the current placed state? Exported for cross-axis candidates (a press part whose placed-mate configuration demands a different approach axis) so they can be vetoed by the same corridor rule before replacing an authored value. */
export function entryDirViable(
  dirs: SweepMap[PartId] | undefined,
  dir: Vec3,
  placed: (id: PartId) => boolean,
  partners: ReadonlySet<PartId>,
): boolean {
  if (!dirs) return true;
  const dom = [0, 1, 2].reduce((a, b) => (Math.abs(dir[a]) >= Math.abs(dir[b]) ? a : b)) as 0 | 1 | 2;
  const sign = (Math.sign(dir[dom]) || 1) as 1 | -1;
  const c = SWEEP_DIRS.find((s) => s.axis === dom && s.sign === sign)!;
  return entryViable(dirs, c.key, placed, partners);
}

/** Order-adaptive SIGN for an authored placeDir: the authored value stays the axis (a groove's axis is not derivable — the device-proven lesson) and the preferred sign, and only flips to its negation when the authored corridor holds an already-placed third-party blocker AND the opposite sign is order-viable. Authored-order builds return the authored vector byte-identical; the reverse legal order (EKET's back panel after a bottom-first close, reachable in free mode through the symmetric gates) gets the motion the static value could never say. Anything else — no data, both blocked, both clear — keeps the authored value. */
export function adaptSignedDir(
  dirs: SweepMap[PartId] | undefined,
  placed: (id: PartId) => boolean,
  partners: ReadonlySet<PartId>,
  authored: Vec3,
): Vec3 {
  if (!dirs) return authored;
  const dom = [0, 1, 2].reduce((a, b) => (Math.abs(authored[a]) >= Math.abs(authored[b]) ? a : b)) as 0 | 1 | 2;
  const sign = (Math.sign(authored[dom]) || 1) as 1 | -1;
  const along = SWEEP_DIRS.find((c) => c.axis === dom && c.sign === sign)!;
  if (entryViable(dirs, along.key, placed, partners)) return authored;
  if (!entryViable(dirs, OPPOSITE[along.key], placed, partners)) return authored;
  return [-authored[0] || 0, -authored[1] || 0, -authored[2] || 0];
}

export function pickEntryDir(
  dirs: SweepMap[PartId] | undefined,
  placed: (id: PartId) => boolean,
  partners: ReadonlySet<PartId>,
  heuristic: Vec3,
): Vec3 {
  if (!dirs) return heuristic;
  const viable = SWEEP_DIRS.filter(({ key }) => entryViable(dirs, key, placed, partners));
  if (viable.length === 0 || viable.length === SWEEP_DIRS.length) return heuristic;
  const dom = [0, 1, 2].reduce((a, b) => (Math.abs(heuristic[a]) >= Math.abs(heuristic[b]) ? a : b)) as 0 | 1 | 2;
  const hSign = Math.sign(heuristic[dom]) || 1;
  if (viable.some(({ axis, sign }) => axis === dom && sign === hSign)) return heuristic;
  let best = viable[0];
  let bestDot = -Infinity;
  for (const c of viable) {
    const d = c.dir[0] * heuristic[0] + c.dir[1] * heuristic[1] + c.dir[2] * heuristic[2];
    if (d > bestDot) { bestDot = d; best = c; }
  }
  return best.dir;
}
