// Box queries against the INTERSECTION of a part's world-aligned box and its oriented one.
import type { OrientedBox, Vec3 } from "@/src/game/core/type";

// The least a caller hands over: world-aligned bounds, optionally the oriented box they came from and a name for diagnostics.
export interface BoxLike {
  min: Vec3;
  max: Vec3;
  obb?: OrientedBox;
  pid?: string;
}

// World point → the oriented box's frame, where the box is [−half, +half]. Local coordinates stay metric, so t along a ray and distances to faces mean what they mean in world.
function toLocal(o: OrientedBox, p: Vec3): Vec3 {
  const [ax, ay, az] = o.axes;
  const dx = p[0] - o.center[0];
  const dy = p[1] - o.center[1];
  const dz = p[2] - o.center[2];
  return [
    dx * ax[0] + dy * ax[1] + dz * ax[2],
    dx * ay[0] + dy * ay[1] + dz * ay[2],
    dx * az[0] + dy * az[1] + dz * az[2],
  ];
}

function toLocalDir(o: OrientedBox, d: Vec3): Vec3 {
  const [ax, ay, az] = o.axes;
  return [
    d[0] * ax[0] + d[1] * ax[1] + d[2] * ax[2],
    d[0] * ay[0] + d[1] * ay[1] + d[2] * ay[2],
    d[0] * az[0] + d[1] * az[1] + d[2] * az[2],
  ];
}

const neg = (v: Vec3): Vec3 => [-v[0], -v[1], -v[2]];

// The interval over which the ray o + t·d is inside the slab box, or null on a miss.
// `lo`/`hi` start from the caller's bounds, so a segment and an open ray share the routine and a second box can narrow a first's interval.
export function slabInterval(
  o: Vec3,
  d: Vec3,
  min: Vec3,
  max: Vec3,
  lo: number,
  hi: number,
): { lo: number; hi: number } | null {
  for (let k = 0; k < 3; k++) {
    const dk = d[k];
    if (Math.abs(dk) < 1e-9) {
      // Parallel to this slab: the ray either sits inside it for its whole length or misses entirely.
      if (o[k] < min[k] || o[k] > max[k]) return null;
      continue;
    }
    const t0 = (min[k] - o[k]) / dk;
    const t1 = (max[k] - o[k]) / dk;
    const a = Math.min(t0, t1);
    const z = Math.max(t0, t1);
    if (a > lo) lo = a;
    if (z < hi) hi = z;
    if (lo > hi) return null;
  }
  return { lo, hi };
}

// The ray's interval inside the part: its aligned box AND, where it has one, its oriented box. Frame-agnostic in t — the oriented slabs are evaluated in their own frame and narrow the same parameter.
export function rayBoxInterval(
  b: BoxLike,
  o: Vec3,
  d: Vec3,
  lo: number,
  hi: number,
): { lo: number; hi: number } | null {
  const iv = slabInterval(o, d, b.min, b.max, lo, hi);
  if (!iv || !b.obb) return iv;
  const h = b.obb.half;
  return slabInterval(
    toLocal(b.obb, o),
    toLocalDir(b.obb, d),
    neg(h),
    h,
    iv.lo,
    iv.hi,
  );
}

function depthInside(p: Vec3, min: Vec3, max: Vec3): number {
  if (
    p[0] < min[0] ||
    p[0] > max[0] ||
    p[1] < min[1] ||
    p[1] > max[1] ||
    p[2] < min[2] ||
    p[2] > max[2]
  )
    return -1;
  return Math.min(
    p[0] - min[0],
    max[0] - p[0],
    p[1] - min[1],
    max[1] - p[1],
    p[2] - min[2],
    max[2] - p[2],
  );
}

// Distance from `p` to the nearest face of the box intersection, or −1 when outside. A point is inside only if inside BOTH boxes, and its depth is the nearer of the two nearest faces.
export function pointDepthInBox(b: BoxLike, p: Vec3): number {
  const a = depthInside(p, b.min, b.max);
  if (a < 0 || !b.obb) return a;
  const h = b.obb.half;
  const o = depthInside(toLocal(b.obb, p), neg(h), h);
  return o < 0 ? -1 : Math.min(a, o);
}
