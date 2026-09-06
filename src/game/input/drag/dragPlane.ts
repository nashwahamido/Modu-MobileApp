// Where a finger lands while a part is in hand — the screen→world half of the drag. The hook owns the gesture, this owns the geometry.
// Pure, so it can be tested against the projection that has to invert it.
import { screenRay, type LookAt } from "@/src/game/core/geometry/math";
import { pointDepthInBox, rayBoxInterval, type BoxLike } from "@/src/game/core/geometry/obb";
import type { Vec3 } from "@/src/game/core/type";

type Float3 = [number, number, number];

// --------------- leash and drift cap

// Runaway guard, as a multiple of the camera's distance from its pivot. A fixed radius cut INSIDE the tray column and parked new parts 70-260px from the finger.
// Scaling holds at every zoom, since zooming is a similarity: the tray column reaches 2.3-2.4× eye distance across the range. What is left to catch is a ray aimed at the horizon.
export const LEASH_FACTOR = 2.5;

// The depth policy's no-answer default: when the plane misses (eye below a high plane, or grazing incidence) the part takes this fraction of the pivot's depth, on the ray under the finger.
// 0.75 holds it IN FRONT of the pivot — 1.75 put it deep in the backdrop, 1.25 put it inside the model, and the renderer has no draw-on-top control.
// The horizon crossing stays continuous: t_plane exceeds the cap well before it diverges.
export const DRIFT_CAP_FACTOR = 0.75;

// Walk an out-of-bounds point back ALONG ITS OWN AIM, never sideways: a radial pull is a move the finger never made, and zoomed in it pinned the part 100+px away.
// Retreating along `from`→p keeps the result on the finger's ray, so the leash bounds DEPTH only. The radial pull survives as the fallback for a degenerate segment.
export function leashAlongRay(
  eye: Vec3,
  center: Vec3,
  from: Float3,
  p: Float3,
): Float3 {
  const max =
    LEASH_FACTOR *
    Math.hypot(center[0] - eye[0], center[1] - eye[1], center[2] - eye[2]);
  const r = Math.hypot(p[0], p[2]);
  if (!(r > max) || r === 0) return p;
  const dx = p[0] - from[0];
  const dz = p[2] - from[2];
  const a = dx * dx + dz * dz;
  const b = 2 * (from[0] * dx + from[2] * dz);
  const c = from[0] * from[0] + from[2] * from[2] - max * max;
  const disc = b * b - 4 * a * c;
  if (a > 0 && disc > 0) {
    const u = (-b + Math.sqrt(disc)) / (2 * a);
    if (u > 0 && u < 1) {
      return [
        from[0] + u * (p[0] - from[0]),
        from[1] + u * (p[1] - from[1]),
        from[2] + u * (p[2] - from[2]),
      ];
    }
  }
  return [(p[0] * max) / r, p[1], (p[2] * max) / r];
}

// --------------- aim bands

// On-screen ceiling for the aim bands, which are authored in world metres though the imprecision they absorb is a THUMB's, 10-15px at any zoom.
// Metres break zoomed in: at the 0.65m floor the default 0.14m snap spans ~212px, reading "Drop it!" with the finger a third of a screen away.
// Scales the WHOLE family together so snap profiles keep their ratios; at bench distance the scale is 1.
export const AIM_BAND_MAX_PX = 160;

// 1 at normal range, shrinking once `approachM` would exceed AIM_BAND_MAX_PX at the socket's depth. Guarded so a degenerate `mPerPx` never zeroes the bands.
export function aimBandScale(mPerPx: number, approachM: number): number {
  if (!(mPerPx > 0) || !(approachM > 0)) return 1;
  return Math.min(1, (AIM_BAND_MAX_PX * mPerPx) / approachM);
}

// Distance from a screen point to segment AB, plus the parameter u of the nearest point.
// The matcher aims anywhere along HOLE→PARK: zoomed in the park point can project off-screen while the hole sits visibly centred.
export function pointToSegmentPx(
  fx: number,
  fy: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): { px: number; u: number } {
  const dx = bx - ax;
  const dy = by - ay;
  const dd = dx * dx + dy * dy;
  const u = dd > 0 ? Math.max(0, Math.min(1, ((fx - ax) * dx + (fy - ay) * dy) / dd)) : 0;
  const nx = ax + u * dx;
  const ny = ay + u * dy;
  return { px: Math.hypot(fx - nx, fy - ny), u };
}

// --------------- ray carry (EXPERIMENT: drag-no-plane)
// The finger's point with NO work plane: on the ray, at a fixed fraction of the pivot's depth, in front of the model. Bounded by construction, so no leash.
// Matching moved to screen space and delivery depth to the socket blend, leaving the plane only the UNMATCHED depth — which it chose badly at every degenerate camera. Level mode keeps it for comparison.

export const RAY_CARRY_MIN_M = 0.12; // absolute backstop, only reached by a camera sitting almost on its own pivot

// Zoom-scaled floor, as a fraction of the pivot distance. "Just in front of the model" is unsatisfiable once the camera is INSIDE the bounding sphere — DALFRED puts the pivot 0.53m out against a 0.45m radius.
// The old absolute 0.12m floor then carried a 0.43m leg 12cm from the lens at every screen position ("it becomes too close"); a fraction keeps shrinking with the zoom instead.
export const RAY_CARRY_MIN_FRACTION = 0.45;

// Clearance (m) between the camera and the NEAREST point of the part in hand. Since joint anchors, a leg is held at its TOP and reaches 0.40-0.43m down.
// The other floors settle near 0.29m at the zoom floor, putting that foot BEHIND the lens (-0.108m on LACK), where projection inverts and the part reads as enormous.
// Deliberately the PART's reach, not a blanket minimum: BEKVAM's legs reach 0.089m, and pushing those out would shrink them for nothing.
export const CARRY_NEAR_MARGIN_M = 0.06;

// OFF while we A/B: with it on a DALFRED leg carries 0.501m out to clear the lens, which also opens a 24.8cm gap to the socket's depth. The guard test re-arms itself with this flag.
export const CARRY_CLEARANCE_ENABLED = false;

// Carry at the TARGET SOCKET's depth instead of one derived from the model. Every complaint about the model-derived carry is a RATIO between part and socket — on EKET it renders 2.22× oversized, hangs ~207px off the finger, and leaves the magnet a ~36cm depth gap.
// Those numerators come from the socket and the denominator from the bounding sphere, so zoom pulls them apart; sharing a depth makes the ratios 1 by construction rather than by tuning.
// A/B partner of DEPTH_BLEND_ENABLED: that eases toward the socket once the finger is near, this starts there.
export const SOCKET_DEPTH_CARRY_ENABLED = true;

// The farthest bounds corner from the hold point. Corners rather than the box radius because the hold point is the part's JOINT at one end, so the reach is strongly asymmetric.
// Returns 0 with no box, leaving the clearance floor inert and the other floors in charge.
export function holdReachFrom(
  box: { min: Vec3; max: Vec3 } | undefined,
  holdPoint: Vec3,
): number {
  if (!box) return 0;
  let r = 0;
  for (const x of [box.min[0], box.max[0]]) {
    for (const y of [box.min[1], box.max[1]]) {
      for (const z of [box.min[2], box.max[2]]) {
        const d = Math.hypot(x - holdPoint[0], y - holdPoint[1], z - holdPoint[2]);
        if (d > r) r = d;
      }
    }
  }
  return r;
}

// The carry point on the finger's ray, at a depth that does NOT depend on where the finger is. Depth is AXIAL, making the carry a camera-facing plane rather than a curved surface, and that is the whole fix.
// `screenRay` leaves `dir` UNNORMALISED so `dir·fwd` is exactly 1 and t IS the axial depth in metres.
// Taking t at closest approach to the pivot and subtracting the model radius mixed metres into a ray parameter AND shrank off-axis: 1.101m deep at screen centre against 0.380m at the edges, dragging the body around under the finger.
export function dragRayPoint(
  look: LookAt,
  fovYDeg: number,
  viewW: number,
  viewH: number,
  screenX: number,
  screenY: number,
  modelRadius: number,
  holdReach = 0,
  socketDepthM: number | null = null,
  capM = Infinity,
): Float3 {
  const { eye, dir } = screenRay(look, fovYDeg, viewW, viewH, screenX, screenY);
  const pivot = Math.hypot(
    look.center[0] - eye[0],
    look.center[1] - eye[1],
    look.center[2] - eye[2],
  );
  // The socket's own axial depth replaces the model-derived floors entirely: `pivot - modelRadius` is a whole bounding radius nearer and would win the max() at every practical zoom.
  // The two kept are the ones protecting the LENS rather than framing the model.
  const want =
    SOCKET_DEPTH_CARRY_ENABLED && socketDepthM != null && Number.isFinite(socketDepthM) && socketDepthM > 0
      ? socketDepthM
      : Math.max(pivot * RAY_CARRY_MIN_FRACTION, pivot - modelRadius);
  // Never carry DEEPER than the first surface in front of the finger, or the thing in hand is drawn behind the furniture.
  // Applied to `want` and not the floors: a cap tighter than them is overruled, since being swallowed beats being smeared across the screen by the near plane.
  const t = Math.max(
    RAY_CARRY_MIN_M,
    CARRY_CLEARANCE_ENABLED ? holdReach + CARRY_NEAR_MARGIN_M : 0,
    Math.min(want, capM),
  );
  return [eye[0] + t * dir[0], eye[1] + t * dir[1], eye[2] + t * dir[2]];
}

// Axial depth where the finger's ray first ENTERS one of `boxes`, and which owns it. Infinity over open space.
// Same slab arithmetic as sightlineGapM on a different line — that runs eye→socket and asks what is seen first, this runs eye→finger and asks how far the hand may reach.
// NO NORMALISATION: `dir·fwd = 1` makes t the AXIAL depth directly, and normalising would return euclidean distance and tighten the cap toward the frame edges.
// A box entered at t <= 0 is skipped, not clamped: it contains the eye or lies behind it, so it blocks nothing, and clamping would cap the carry at the lens whenever the camera sat inside a part.
export function rayBoxEntryT(
  eye: Vec3,
  dir: Vec3,
  boxes: readonly BoxLike[],
): { t: number; by: string | null } {
  let best = Infinity;
  let by: string | null = null;
  for (const b of boxes) {
    // Against the part's aligned∩oriented box: t is the same parameter in both frames, so it is still the axial depth the unnormalised dir encodes.
    const iv = rayBoxInterval(b, eye, dir, -Infinity, Infinity);
    if (!iv || iv.lo <= 0 || iv.lo >= best) continue;
    best = iv.lo;
    by = b.pid ?? null;
  }
  return { t: best, by };
}

// --------------- visibility

// Slack added to an anchor's burial depth to form its visibility threshold: the first surface the sightline meets must be within (burial + slack).
// 6mm passes a countersunk screw face-on and a cam from its bore side, while a 15mm panel's far side (11mm vs 4+6) and a leg's (20mm+ vs 0+6) fail.
export const VIS_GAP_SLACK_M = 0.006;

// How far a ghost sample is pulled in from its box corner. A corner is the one place an AABB is guaranteed to be air, and a sample there reports the part visible where only its box is.
// 0.2 keeps every sample inside the mesh's own quarter while still spreading them to the extremities.
const GHOST_SAMPLE_INSET = 0.2;

// Points on a part's GHOST, the copy standing where release will deliver it — centre first as the cheapest early exit, then eight inset corners.
// `shift` is the staging displacement plus the engagement's park, so this stands where the ghost renderer draws.
// Oriented box where the part has one: a DALFRED leg is a 35mm stick in its own frame and a 192mm slab in world, so world-box samples would land beside it.
export function ghostSamplePoints(box: BoxLike | undefined, shift: Vec3): Vec3[] {
  if (!box) return [];
  const k = 1 - GHOST_SAMPLE_INSET;
  const out: Vec3[] = [];
  if (box.obb) {
    const { center, axes, half } = box.obb;
    const c: Vec3 = [center[0] + shift[0], center[1] + shift[1], center[2] + shift[2]];
    out.push(c);
    for (const sx of [-1, 1])
      for (const sy of [-1, 1])
        for (const sz of [-1, 1]) {
          const a = sx * half[0] * k;
          const b = sy * half[1] * k;
          const d = sz * half[2] * k;
          out.push([
            c[0] + a * axes[0][0] + b * axes[1][0] + d * axes[2][0],
            c[1] + a * axes[0][1] + b * axes[1][1] + d * axes[2][1],
            c[2] + a * axes[0][2] + b * axes[1][2] + d * axes[2][2],
          ]);
        }
    return out;
  }
  const c: Vec3 = [
    (box.min[0] + box.max[0]) / 2 + shift[0],
    (box.min[1] + box.max[1]) / 2 + shift[1],
    (box.min[2] + box.max[2]) / 2 + shift[2],
  ];
  out.push(c);
  const h: Vec3 = [
    ((box.max[0] - box.min[0]) / 2) * k,
    ((box.max[1] - box.min[1]) / 2) * k,
    ((box.max[2] - box.min[2]) / 2) * k,
  ];
  for (const sx of [-1, 1])
    for (const sy of [-1, 1])
      for (const sz of [-1, 1])
        out.push([c[0] + sx * h[0], c[1] + sy * h[1], c[2] + sz * h[2]]);
  return out;
}

// How deep `target` sits inside the boxes containing it, 0 when none do. An anchor buried d metres cannot be seen closer than d, so d joins its threshold.
// That is what lets ONE rule serve a flush screw head, a cam 4mm into its bore, and a bridge anchor at a dowel's centre, with no per-type exemptions.
export function burialDepthM(
  target: Vec3,
  boxes: readonly BoxLike[],
): number {
  let d = 0;
  for (const b of boxes) {
    // Depth inside the aligned∩oriented box: a splayed leg is a 22mm plank in its own frame, so a screw head ON its surface reads as buried ~0 instead of 18mm inside the world-aligned slab.
    const toFace = pointDepthInBox(b, target);
    if (toFace > d) d = toFace;
  }
  return d;
}

// The gap between the FIRST surface the sightline eye→target crosses and the target, plus which box owns it. 0 when nothing stands in front.
// The visibility question asked properly: not "is the neighbourhood visible" — halo sampling passed sockets the player could not see — but "is the first thing the eye touches the socket".
// Boxes met only past the target do not count; one the EYE starts inside has its entry clamped to 0 and counts only if the target is beyond.
export function sightlineGapM(
  eye: Vec3,
  target: Vec3,
  boxes: readonly BoxLike[],
): { gap: number; by: string | null } {
  const seg: Vec3 = [target[0] - eye[0], target[1] - eye[1], target[2] - eye[2]];
  const len = Math.hypot(seg[0], seg[1], seg[2]) || 1;
  let tFirst = 1;
  let by: string | null = null;
  for (const b of boxes) {
    // Segment parameter 0..1 from eye to target, against the aligned∩oriented box — a tilted part stops casting its world-aligned shadow across sightlines that pass beside it.
    const iv = rayBoxInterval(b, eye, seg, 0, 1);
    if (!iv || iv.lo >= 1) continue;
    const entry = Math.max(0, iv.lo);
    if (entry < tFirst) {
      tFirst = entry;
      by = b.pid ?? null;
    }
  }
  return { gap: (1 - tFirst) * len, by };
}

// Whether a projected aim segment touches the viewport plus `margin` px — endpoints and midpoint cover the short hole→park segments this gates.
// A snap must not be earnable against a socket the player cannot see: an off-screen seat at y=-88 was still inside the capture band. Acquisition uses margin 0, a matched socket a generous one elsewhere.
export function segmentInFrame(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  w: number,
  h: number,
  margin: number,
): boolean {
  const inF = (x: number, y: number) =>
    x >= -margin && x <= w + margin && y >= -margin && y <= h + margin;
  return inF(ax, ay) || inF(bx, by) || inF((ax + bx) / 2, (ay + by) / 2);
}

// Whether the SEGMENT `from`→`to` passes through `box` — the line-of-sight test, slab method.
// The interior margin stops the endpoints counting: `to` sits ON the receiver, and grazing the last centimetres in is arrival, not occlusion.
// Facing normals were tried first and rejected — a DALFRED leg's contact slab faces DOWN, so a facing gate blocks all four legs from any elevated camera.
export function segmentHitsBox(
  from: Vec3,
  to: Vec3,
  box: { min: Vec3; max: Vec3 },
  margin = 0.04,
): boolean {
  let t0 = 0;
  let t1 = 1;
  for (let k = 0; k < 3; k++) {
    const d = to[k] - from[k];
    if (Math.abs(d) < 1e-9) {
      if (from[k] < box.min[k] || from[k] > box.max[k]) return false;
      continue;
    }
    let a = (box.min[k] - from[k]) / d;
    let b = (box.max[k] - from[k]) / d;
    if (a > b) [a, b] = [b, a];
    if (a > t0) t0 = a;
    if (b < t1) t1 = b;
    if (t0 > t1) return false;
  }
  // The overlap [t0,t1] must include a stretch genuinely BETWEEN the endpoints, past the margins.
  const lo = Math.max(t0, margin);
  const hi = Math.min(t1, 1 - margin);
  return hi > lo;
}

// --------------- carry targets

// The point on the finger's ray nearest `socket`: under the finger on screen, at the depth where vertical tremor costs nothing — a grazing work plane turns the same tremor into metres.
// `t` is floored at 0, so a socket behind the camera degrades to the eye.
export function rayPointNearest(eye: Vec3, dir: Vec3, socket: Vec3): Float3 {
  const dd = dir[0] * dir[0] + dir[1] * dir[1] + dir[2] * dir[2] || 1;
  const t = Math.max(
    0,
    ((socket[0] - eye[0]) * dir[0] +
      (socket[1] - eye[1]) * dir[1] +
      (socket[2] - eye[2]) * dir[2]) /
      dd,
  );
  return [eye[0] + t * dir[0], eye[1] + t * dir[1], eye[2] + t * dir[2]];
}

// The camera-plane anchor for a combine carry, or null for the horizontal glide.
// A cluster parking mostly VERTICALLY fails like a vertical-entry part: its glide plane hangs at the top of the assembly, a level camera sees it edge-on, and the ray lands 0.6-0.9m out across three quarters of the screen.
// The escape is uprightAnchor's: carry on the plane through the PARK POSE facing the lens, where finger-over-the-ring means the offset IS the park offset. Horizontal parks return null.
// The threshold mirrors the part rule (|placeDir[1]| > 0.7) — park.offset is −placeDir·backoff, so its axis share reads the same authored direction without the cluster def.
export function clusterCarryAnchor(
  centroid: Float3,
  parkOffset: Float3,
): Float3 | null {
  const l = Math.hypot(parkOffset[0], parkOffset[1], parkOffset[2]);
  // The SEED has no park offset: it drops onto its own baked pose, so its glide plane passes through the assembly's middle where the pivot sits.
  // That is the edge-on case at its worst, the plane holding the target — a level camera grazes it exactly at the ring being aimed for, and DALFRED's base was unplaceable at every zoom. Same escape as the vertical park.
  if (!l) return [centroid[0], centroid[1], centroid[2]];
  if (Math.abs(parkOffset[1]) / l <= 0.7) return null;
  return [
    centroid[0] + parkOffset[0],
    centroid[1] + parkOffset[1],
    centroid[2] + parkOffset[2],
  ];
}

// The carried cluster's offset from its baked centroid, for the finger point `p`.
// An ANCHORED carry takes all three axes, so a finger over the target ring yields exactly the park offset and the lift falls out of the geometry.
// Substituting the park height froze the cluster at one world height, hanging it ~0.3m off the finger at the bottom of a landscape phone — where the tray card sits. The glide keeps its 2-DOF contract at the park height.
export function clusterCarryOffset(
  p: Float3,
  centroid: Float3,
  parkOffset: Float3,
  anchored: boolean,
): Float3 {
  return [
    p[0] - centroid[0],
    anchored ? p[1] - centroid[1] : parkOffset[1],
    p[2] - centroid[2],
  ];
}

// What a finger is aiming at: on the work plane when it answers sanely, otherwise on the ray at capped assembly depth. Never fails, never leaves the ray.
// One scalar decides it — t, the depth along the ray: the plane proposes, the cap bounds. A miss takes the cap outright, same axis and same rule, with no separate limit convention.
// A capped point leaves the plane's height, the deliberate trade: the finger's pixel is the invariant, the plane only a policy.
export function dragPlanePoint(
  look: LookAt,
  fovYDeg: number,
  viewW: number,
  viewH: number,
  screenX: number,
  screenY: number,
  planeY: number,
): Float3 {
  const { eye, dir } = screenRay(look, fovYDeg, viewW, viewH, screenX, screenY);
  const dd = dir[0] * dir[0] + dir[1] * dir[1] + dir[2] * dir[2] || 1;
  const tFocus =
    ((look.center[0] - eye[0]) * dir[0] +
      (look.center[1] - eye[1]) * dir[1] +
      (look.center[2] - eye[2]) * dir[2]) /
    dd;
  // The pivot is in front of the camera by construction; the guard covers a transient degenerate lookAt during camera swaps.
  const tCap = DRIFT_CAP_FACTOR * Math.max(tFocus, 1e-3);
  const tPlane = (planeY - eye[1]) / dir[1];
  const t =
    Number.isFinite(tPlane) && tPlane > 0 ? Math.min(tPlane, tCap) : tCap;
  return leashAlongRay(eye, look.center, eye as Float3, [
    eye[0] + t * dir[0],
    eye[1] + t * dir[1],
    eye[2] + t * dir[2],
  ]);
}
