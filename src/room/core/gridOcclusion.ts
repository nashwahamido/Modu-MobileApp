// Which parts of a projected grid line are hidden behind furniture — pure screen-space geometry, no camera and no React. The grid is SVG drawn OVER the Filament view (see ../scene/GridOverlay), so it has no depth buffer to test against and occlusion has to be computed. The cheapest honest approximation is the one the picker already trusts: every piece is a box (floorPlacementBox / topPlacementBox in ./grid, raycast by pickBoxAt in ../input/picking), its eight corners project to eight screen points, and the convex hull of those points is the silhouette that hides whatever is behind it. A box standing on the floor projects to a hull covering its own footprint and the floor BEHIND it, never the floor in front — the near edge of its base is the hull's near boundary. So clipping the grid against these hulls dims exactly the lines a piece stands on or in front of, which is what makes the grid read as lying on the floor rather than painted on the lens. The silhouette is a box, not the model, so it over-covers a piece with thin legs. That is the same over-estimate long-press picking has always made, and here it costs an alpha rather than a wrong piece.

export type Pt = { x: number; y: number };

// (a - o) x (b - o): positive when o -> a -> b turns one way, negative the other, zero when collinear. Which way is which depends on the handedness of the space, so every caller below derives the sign it needs rather than assuming one.
function cross(o: Pt, a: Pt, b: Pt): number {
  return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
}

// Andrew's monotone chain. Eight points in and at most eight out, so the sort is free; degenerate input (a box seen exactly edge-on, every corner collinear) yields fewer than three points and is returned as an empty hull, which the clip below reads as "hides nothing".
export function convexHull(points: readonly Pt[]): Pt[] {
  if (points.length < 3) return [];
  const sorted = [...points].sort((a, b) => (a.x === b.x ? a.y - b.y : a.x - b.x));
  const chain = (src: readonly Pt[]): Pt[] => {
    const out: Pt[] = [];
    for (const p of src) {
      while (out.length >= 2 && cross(out[out.length - 2], out[out.length - 1], p) <= 0) out.pop();
      out.push(p);
    }
    // The last point of each chain is the first of the other, so it is dropped here and contributed once.
    out.pop();
    return out;
  };
  const hull = [...chain(sorted), ...chain([...sorted].reverse())];
  return hull.length >= 3 ? hull : [];
}

// Twice the signed area — only its SIGN is used, to learn which side of an edge the hull's interior is on.
function windingSign(hull: readonly Pt[]): number {
  let sum = 0;
  for (let i = 0; i < hull.length; i += 1) {
    const p = hull[i];
    const q = hull[(i + 1) % hull.length];
    sum += p.x * q.y - q.x * p.y;
  }
  return sum >= 0 ? 1 : -1;
}

// The [t0, t1] slice of the segment a -> b that lies inside a convex hull, or null when it misses. Cyrus-Beck: the interior is the intersection of one half-plane per edge, each of which is a linear inequality in t, so the whole clip is a running [lo, hi] narrowed edge by edge.
function spanInside(a: Pt, b: Pt, hull: readonly Pt[]): [number, number] | null {
  if (hull.length < 3) return null;
  const s = windingSign(hull);
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < hull.length; i += 1) {
    const p = hull[i];
    const q = hull[(i + 1) % hull.length];
    const f0 = s * cross(p, q, a);
    const f1 = s * cross(p, q, b);
    const df = f1 - f0;
    // Parallel to this edge: the segment is wholly in or wholly out of its half-plane, and no t narrows anything.
    if (Math.abs(df) < 1e-12) {
      if (f0 < 0) return null;
      continue;
    }
    const t = -f0 / df;
    if (df > 0) lo = Math.max(lo, t);
    else hi = Math.min(hi, t);
    if (lo > hi) return null;
  }
  return [lo, hi];
}

// A span shorter than this is a graze, not a cover, and emitting it would only add a zero-length subpath.
const MIN_SPAN = 1e-4;

// The parts of a -> b hidden by any of the hulls, as sorted, merged, non-overlapping [t0, t1] spans.
export function coveredSpans(a: Pt, b: Pt, hulls: readonly (readonly Pt[])[]): [number, number][] {
  const spans: [number, number][] = [];
  for (const hull of hulls) {
    const span = spanInside(a, b, hull);
    if (span !== null && span[1] - span[0] > MIN_SPAN) spans.push(span);
  }
  if (spans.length < 2) return spans;
  spans.sort((x, y) => x[0] - y[0]);
  const merged: [number, number][] = [spans[0]];
  for (let i = 1; i < spans.length; i += 1) {
    const last = merged[merged.length - 1];
    const [start, end] = spans[i];
    if (start <= last[1]) last[1] = Math.max(last[1], end);
    else merged.push([start, end]);
  }
  return merged;
}

// [0, 1] minus the covered spans — the parts of the line drawn at full strength. Expects the output of coveredSpans (sorted and merged).
export function clearSpans(covered: readonly (readonly [number, number])[]): [number, number][] {
  const out: [number, number][] = [];
  let at = 0;
  for (const [start, end] of covered) {
    if (start - at > MIN_SPAN) out.push([at, start]);
    at = Math.max(at, end);
  }
  if (1 - at > MIN_SPAN) out.push([at, 1]);
  return out;
}
