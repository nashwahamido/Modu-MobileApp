// Where a finger lands on the work plane while a part is in hand — the whole of the screen→world
// half of the part drag, kept pure so it can be tested against the projection that has to invert it
// (dragPlane.test.ts). The hook owns the gesture; this owns the geometry.
import { screenRay, type LookAt } from "@/src/game/core/geometry/math";
import { pointDepthInBox, rayBoxInterval, type BoxLike } from "@/src/game/core/geometry/obb";
import type { Vec3 } from "@/src/game/core/type";

type Float3 = [number, number, number];

/**
 * Runaway guard for the drag point, as a multiple of the camera's distance from its pivot.
 *
 * It replaces a fixed 0.9 m "bench" circle, which was small enough to cut INSIDE the screen area the parts tray occupies. The tray is a column on the screen's right edge, and in landscape every ray through it meets the work plane 1–5 m out, so a part left its card already parked on that circle 70–260 px from the finger, stayed pinned there while the finger travelled inward (a clamped point barely moves), and then locked on the instant the finger crossed the rim — the gain from finger to part going 0 → ~0.8 in one frame. That is the "it starts far away, then suddenly jumps to my finger".
 *
 * Scaling with camera distance rather than picking a bigger constant is what makes it hold at every zoom: zooming is a similarity, so the radius the tray column actually reaches stays at 2.3–2.4× the eye distance from 0.7× to 1.4× zoom, and 2.5 covers all of it (verified for pitched-up and pitched-down cameras too). What is left for the guard to catch is the genuine degeneracy: a ray aimed at the horizon meets the plane tens of metres out, or never.
 */
export const LEASH_FACTOR = 2.5;

/**
 * How far past the FOCUS POINT's depth the drag point may ride along the finger's ray.
 *
 * This is the depth policy's no-answer default. When the work plane cannot answer — the ray misses
 * it (an underside camera puts the eye BELOW a high plane, so every downward aim diverges from it)
 * or meets it absurdly far out (grazing incidence) — the part used to take the horizon-limit
 * convention: parked at the leash radius, at plane height, off the true ray. On-device that read as
 * a part frozen mid-air 2.5 m out, tracking the finger's azimuth but not its height (the
 * f=(436,291) part=(436,136) probe log). The cap replaces that: depth is bounded by a multiple of
 * the ORBIT PIVOT's depth along the ray, so a ray with no good plane answer holds the part at
 * assembly depth, exactly under the finger. On-device the first cut (1.75) parked the unanswered
 * part 75% PAST the assembly — under the finger but deep in the backdrop, rendered small: "floats
 * very far away" (probe: plane=0.56, p=(0.20,0.06,1.39), gapPx=0). 1.25 parked it AT the assembly —
 * where the furniture's own near geometry occludes it, so the part sat under the finger and
 * invisible behind a leg (phone probe: gapPx=0 while nothing showed at the touch). The renderer
 * exposes no draw-on-top control, so visibility must come from depth: 0.75 holds the part IN FRONT
 * of the pivot, clear of most of the model, and the socket-depth blend still carries it onto the
 * surface once a socket is matched. Plane hits beyond the cap ride slightly off-plane toward the
 * lens — visible, on-ray, and corrected by the blend where it matters. The horizon crossing stays
 * continuous: t_plane exceeds the cap well before it diverges, so both sides of the horizon give
 * the same capped point.
 */
export const DRIFT_CAP_FACTOR = 0.75;

/**
 * Keep a drag point within the leash by walking it back ALONG ITS OWN AIM, never sideways.
 *
 * The old leash pulled an out-of-bounds point radially toward the bench axis — a sideways move the
 * finger never made, and the one mechanism that could put the held part somewhere other than under
 * the finger on screen. Zoomed in over a high work plane the radius (2.5× a shrunken eye distance)
 * clamped almost every ray, so the part sat pinned on the leash circle 100+ px from the finger and
 * barely responded — the "sits far away and I'm not controlling it" report. Walking back along the
 * segment from `from` to the aimed point keeps the result on the finger's ray, so a leashed part is
 * still exactly under the finger (dragPlane.test.ts pins this as the on-ray invariant); the leash
 * now bounds DEPTH only, which is the system's axis, never the finger's two.
 *
 * `from` is the ray origin the walk-back retreats toward — the eye for a true finger ray. The
 * radial pull survives only as the fallback for a degenerate segment.
 */
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

/**
 * On-screen ceiling for the aim tolerance family, in pixels.
 *
 * Every band — approach/match, magnet pull, snap ("Drop it!") — is authored in world metres, but the
 * imprecision they exist to absorb is a THUMB's, which is 10–15 px at any zoom. Metres were a proxy
 * for that, and the proxy breaks zoomed in: at the 0.65 m zoom floor a socket sits ~0.3 m from the
 * eye, a pixel is ~0.66 mm, and the default 0.14 m snap spans ~212 px — the screw visibly seats in a
 * hole and reads "Drop it!" while the finger is a third of a screen away. The cap scales the WHOLE
 * family down together (ratios preserved, so accessibility snap profiles keep their meaning) so the
 * outermost band never exceeds this many pixels; at bench-distance cameras the scale is 1 and
 * nothing changes.
 */
export const AIM_BAND_MAX_PX = 160;

/** The factor that caps an aim-band family on screen: 1 at normal range, shrinking once `approachM` (the outermost band) would exceed AIM_BAND_MAX_PX at the matched socket's depth. `mPerPx` is world metres per screen pixel at that depth. Guarded so a degenerate mPerPx of 0 never zeroes the bands. */
export function aimBandScale(mPerPx: number, approachM: number): number {
  if (!(mPerPx > 0) || !(approachM > 0)) return 1;
  return Math.min(1, (AIM_BAND_MAX_PX * mPerPx) / approachM);
}

/** Distance from a screen point to the segment AB, plus the parameter u of the nearest point — the screen-space matcher's geometry: a socket is matched by aiming anywhere along the line from its HOLE to its PARK hover point, because zoomed in the park point alone can project clean off the screen while the hole sits visibly centered (measured on-device: best reachable aim 0.084 m, exactly the gate, with the argmin pinned at the screen edge — "can't snap when zoomed in"). */
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

/**
 * EXPERIMENT (drag-no-plane): the finger's point with NO work plane at all — always on the ray, at
 * a fixed fraction of the pivot's depth, riding IN FRONT of the model. The work plane's two
 * historical jobs are both gone in adaptive mode: matching moved to screen space, and delivery
 * depth comes from the socket blend, which the in-frame gate guarantees a visible target for. What
 * the plane still chose was the UNMATCHED depth, and it chose it badly at every degenerate camera —
 * this replaces that choice with the constant the cap already trusted. Bounded by construction, so
 * no leash. Level mode keeps the true plane (dragPlanePoint) as the comparison engine.
 */
/** Absolute backstop for the ray-carry depth (m) — only reached by a degenerate camera sitting almost on its own pivot. The zoom-scaled floor below is what normally catches a close camera. */
export const RAY_CARRY_MIN_M = 0.12;

/**
 * Zoom-scaled floor for the carry depth, as a fraction of the camera's distance to its pivot.
 *
 * "Just in front of the model" is unsatisfiable once the camera is INSIDE the assembly's bounding
 * sphere, which is the normal state when zoomed in: DALFRED at working zoom puts the pivot 0.53 m
 * away against a 0.45 m bounding radius, so pivot-minus-radius is 0.08 m. The old absolute 0.12 m
 * floor then carried a 0.43 m leg twelve centimetres from the lens at every screen position — the
 * part filling the frame, which on device reads as "it becomes too close". A fraction of the pivot
 * distance keeps shrinking with the zoom instead of hitting a wall, so the carry stays proportionate
 * to what the camera is actually looking at.
 */
export const RAY_CARRY_MIN_FRACTION = 0.45;

/**
 * Clearance (m) kept between the camera and the NEAREST point of the part in hand.
 *
 * The carry has to clear the part it is carrying, and since joint anchors the hold point is the
 * part's joint rather than its middle — so a leg held at its top reaches 0.40-0.43 m downward from
 * the point the finger controls. At the zoom floor (MIN_ORBIT_DISTANCE_M 0.65) the other floors
 * settle around 0.29 m, which put the foot end of a LACK leg at -0.108 m and a DALFRED leg at
 * -0.134 m: behind the lens, sweeping through the near plane, where projection inverts and the part
 * reads as enormous and moving the wrong way. Flooring the carry at the part's own reach plus this
 * margin keeps the whole part in front of the camera at any zoom. It is deliberately the PART's
 * reach and not a blanket minimum — BEKVAM's legs reach 0.089 m and EKET's drawer sides 0.133 m, and
 * pushing those out to a leg's distance would shrink them on screen for nothing.
 */
export const CARRY_NEAR_MARGIN_M = 0.06;

/** Master switch for the clearance floor above. OFF while we A/B the drag: with it on, a DALFRED leg is carried 0.501 m out so its far end clears the lens, which is also what opens a 24.8 cm gap to the socket's own depth. Flip to true to restore it — the guard test in dragPlane.test.ts re-arms itself with this flag. */
export const CARRY_CLEARANCE_ENABLED = false;

/**
 * Carry the held part at the TARGET SOCKET's depth instead of a depth derived from the model.
 *
 * The model-derived carry below never mentions the socket, yet every complaint about it is a RATIO between the part and its socket. Measured on EKET at the 0.65 m zoom floor: the carry lands at 0.293 m against a 0.65 m pivot, so the part renders 2.22× oversized, its body hangs ~207 px off the finger, and the magnet has to close a ~36 cm depth gap in one step at the end. Each of those numerators comes from the socket and their denominator from the assembly's bounding sphere, so zoom pulls them apart — and every fix so far has been another constant re-pinning one ratio at one zoom (RAY_CARRY_MIN_FRACTION, aimBandScale's pixel cap).
 *
 * Referencing the socket collapses all of it: part and socket share a depth, therefore share metres-per-pixel. The part is drawn the size it will be once placed, its screen offset from the finger is the offset it has at rest, world tolerances and pixels finally agree, and the magnet is left closing lateral aim error alone. Zoom stops being a parameter because the ratios are 1 by construction rather than by tuning.
 *
 * Flip to false to restore the model-derived carry. A/B partner of DEPTH_BLEND_ENABLED: that one eases toward the socket only once the finger is near it, this one starts there.
 */
export const SOCKET_DEPTH_CARRY_ENABLED = true;

/** How far the held part reaches from the point the finger controls — the farthest corner of its bounds from that hold point. Corners rather than the box's own radius because the hold point is the part's JOINT, sitting at one end of it, so the reach is strongly asymmetric: a leg held at its top reaches its full length downward and almost nothing upward. Returns 0 with no box, which makes the clearance floor inert and leaves the other floors in charge. */
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

/**
 * The carry point for the finger, on its ray, at a depth that does NOT depend on where the finger is.
 *
 * Depth is stated as AXIAL depth — distance along the view axis — which makes the carry a
 * camera-facing plane rather than a curved surface. That distinction is the whole fix. `screenRay`
 * returns `dir` deliberately UNNORMALISED, as `fwd + ndcX·tanH·right + ndcY·tanV·up`, so `dir·fwd`
 * is exactly 1 and the ray parameter t IS the axial depth in metres. The previous formula instead
 * took t at the ray's closest approach to the pivot and subtracted the model radius from it, which
 * was wrong twice over: it mixed a metre quantity into a ray parameter, and the closest-approach
 * depth shrinks as the ray tilts off-axis. |dir| reaches 1.364 at the horizontal edge of an 844×390
 * landscape frame, and the two errors compound there — measured at bench range the carry ran 1.101 m
 * deep at screen centre and 0.380 m at both edges, the same part nearly three times closer for no
 * input the player gave. That mattered far more once joint anchors made the hold point the part's
 * real joint: the body hangs off the carry point by a fixed WORLD offset, its screen offset is that
 * over depth, so a depth that moves with screen position drags the body around under the finger.
 */
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
  // Socket-referenced carry (SOCKET_DEPTH_CARRY_ENABLED): the target's own axial depth replaces the model-derived floors entirely — keeping them would defeat it, since `pivot - modelRadius` is a whole bounding radius nearer than the socket and would win the max() at every practical zoom. The two floors kept are the ones that protect the LENS rather than frame the model: the absolute backstop, and the part's own reach when the clearance experiment is on.
  const want =
    SOCKET_DEPTH_CARRY_ENABLED && socketDepthM != null && Number.isFinite(socketDepthM) && socketDepthM > 0
      ? socketDepthM
      : Math.max(pivot * RAY_CARRY_MIN_FRACTION, pivot - modelRadius);
  // The occlusion cap (see rayBoxEntryT): the part may never be carried DEEPER than the first surface in front of the finger, or the thing in hand is drawn behind the furniture and the player loses sight of what they are dragging. Applied to `want` and not to the floors, in that order deliberately — the floors protect the LENS, and a cap that could push the carry inside the near plane would trade an invisible part for a part smeared across the whole screen. So a cap tighter than the floors is simply overruled: being swallowed is the lesser failure of the two, and the camera has to be pressed against geometry for it to arise at all.
  const t = Math.max(
    RAY_CARRY_MIN_M,
    CARRY_CLEARANCE_ENABLED ? holdReach + CARRY_NEAR_MARGIN_M : 0,
    Math.min(want, capM),
  );
  return [eye[0] + t * dir[0], eye[1] + t * dir[1], eye[2] + t * dir[2]];
}

/**
 * Axial depth (m) at which the finger's ray first ENTERS one of `boxes`, and which box owns it. Infinity when the ray meets none — the finger is over open space and nothing caps the carry.
 *
 * Same slab arithmetic as sightlineGapM, asked along a different line: that one runs eye→socket and asks whether the socket is the first thing seen, this one runs eye→finger and asks how far the hand may reach before it hits something. One primitive would need a segment; these are a segment and an open ray, so they stay two.
 *
 * NO NORMALISATION, and that is not an oversight: screenRay hands back `dir` as `fwd + …` so that `dir·fwd = 1`, which makes the slab parameter t the AXIAL depth in metres directly — the very quantity dragRayPoint carries at and projectToScreen reports. Normalising dir here would silently return euclidean distance instead and the cap would tighten toward the edges of the frame.
 *
 * A box the ray enters at t <= 0 is skipped rather than clamped to zero. It contains the eye, or lies behind it; either way its front face is already behind the camera and it is not standing between the finger and anything. Clamping instead would cap the carry at the lens for the whole time the camera sat inside a part.
 */
export function rayBoxEntryT(
  eye: Vec3,
  dir: Vec3,
  boxes: readonly BoxLike[],
): { t: number; by: string | null } {
  let best = Infinity;
  let by: string | null = null;
  for (const b of boxes) {
    // Against the part's aligned∩oriented box (core/geometry/obb): t is the same parameter in both frames, so it is still the axial depth the unnormalised dir encodes.
    const iv = rayBoxInterval(b, eye, dir, -Infinity, Infinity);
    if (!iv || iv.lo <= 0 || iv.lo >= best) continue;
    best = iv.lo;
    by = b.pid ?? null;
  }
  return { t: best, by };
}

/** Slack (m) added to an anchor's own burial depth to form its visibility threshold: the first surface the sightline meets must be within (burial + slack) of the anchor. 6mm passes a countersunk screw seen face-on (gap ~0) and a cam seen from its bore side (gap = its 4mm burial), while a 15mm panel's far side (gap 11mm vs 4+6) and a leg's far side (gap 20mm+ vs 0+6) fail. */
export const VIS_GAP_SLACK_M = 0.006;

/** How deep `target` sits inside the boxes that contain it — the distance to the nearest boundary of the tightest containing box, 0 when nothing contains it. An anchor buried d metres deep cannot possibly be seen closer than d, so d joins its visibility threshold: this is what lets ONE rule serve a flush screw head (d=0), a cam 4mm into its bore, and a bridge anchor at a dowel's centre, with no per-type exemptions. */
export function burialDepthM(
  target: Vec3,
  boxes: readonly BoxLike[],
): number {
  let d = 0;
  for (const b of boxes) {
    // Depth inside the part's aligned∩oriented box: a splayed leg is a 22mm plank in its own frame, so a screw head ON its surface reads as buried ~0 instead of 18mm inside the leg's world-aligned slab.
    const toFace = pointDepthInBox(b, target);
    if (toFace > d) d = toFace;
  }
  return d;
}

/** The gap (m) between the FIRST box surface the sightline eye->target crosses and the target itself, plus which box owns that surface. 0 when nothing stands in front. This is the visibility question asked properly: not "is the neighbourhood visible" (box/halo sampling — a halo corner peeking past a silhouette passed a socket the player could not see) but "is the first thing the eye touches along this line the socket, or something in front of it". Boxes the ray only meets past the target do not count; a box the EYE starts inside contributes its exit... its entry is clamped to 0 and counts only if the target is beyond it. */
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
    // Segment parameter 0..1 from eye to target, against the part's aligned∩oriented box — a tilted part stops casting its world-aligned shadow across sightlines that pass beside it.
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

/** Whether any part of a projected aim segment is inside the viewport plus `margin` px. Endpoints and midpoint cover the short hole→park segments this gates; a snap must not be earnable against a socket the player cannot see (measured: an off-screen seat at y=-88 was still inside the finger's capture band near the top edge). Acquisition uses margin 0; an ALREADY-matched socket is held to a generous negative test elsewhere so an orbit nudge does not pop the match. */
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

/** Whether the SEGMENT from `from` to `to` passes through `box` — the socket-visibility line-of-sight test, slab method. The interior margin keeps the segment's own endpoints from counting: `to` sits ON the receiver (the anchor is clamped into its box), and grazing the last centimetres into the socket is arrival, not occlusion. Facing normals were tried for this job first and rejected: a DALFRED leg's contact slab faces DOWN (leg top meets the plate underside), so a facing gate blocks all four legs from any normal elevated camera — line-of-sight is the fact the player's eye actually experiences. */
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

/** The point on the finger's ray nearest `socket` — the socket-depth policy's target: on the ray, so exactly under the finger on screen, at the depth where vertical finger tremor costs nothing (a grazing work plane turns the same tremor into metres). `t` is floored at 0 so a socket behind the camera degrades to the eye rather than a point behind it. */
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

/**
 * The camera-plane anchor for a combine carry, or null for the horizontal glide.
 *
 * A cluster that parks mostly VERTICALLY (DALFRED's seat: straight up off the base) is the cluster
 * shape of a vertical-entry part, and it fails the same way: its glide plane hangs at the top of the
 * assembly, the orbit pivot sits at the assembly's middle, and a camera anywhere near level sees the
 * plane edge-on — the finger's ray lands 0.6–0.9 m out across three quarters of the screen, so the
 * in-plane snap distance is unsatisfiable (measured, DALFRED at every zoom). The part path escapes
 * this with uprightAnchor; this is that escape for combines: carry on the plane through the PARK
 * POSE facing the lens, where finger-over-the-target-ring means the offset is exactly the park
 * offset. Horizontal parks (EKET's drawers) return null and keep the glide, which tracks the finger
 * fine at bench height.
 *
 * The threshold mirrors the part rule (|placeDir[1]| > 0.7): park.offset is −placeDir·backoff, so
 * testing its axis share reads the same authored direction without needing the cluster def here.
 */
export function clusterCarryAnchor(
  centroid: Float3,
  parkOffset: Float3,
): Float3 | null {
  const l = Math.hypot(parkOffset[0], parkOffset[1], parkOffset[2]);
  if (!l || Math.abs(parkOffset[1]) / l <= 0.7) return null;
  return [
    centroid[0] + parkOffset[0],
    centroid[1] + parkOffset[1],
    centroid[2] + parkOffset[2],
  ];
}

/**
 * The point a finger is aiming at: on the work plane when the plane answers sanely, otherwise on
 * the finger's ray at capped assembly depth. Never fails, and never leaves the ray.
 *
 * One scalar decides everything: t, the depth along the finger's ray. The plane proposes its
 * intersection depth; the cap (DRIFT_CAP_FACTOR × the orbit pivot's depth on this ray) bounds it.
 * A ray that misses the plane — aimed below a plane the eye is under, or past the horizon — simply
 * takes the cap outright: same axis, same rule, no separate limit convention. Because t_plane
 * exceeds the cap well before the horizon, the crossing is continuous: the last hitting ray and the
 * first missing ray produce the same capped point. A capped point leaves the plane's height (it is
 * partway down the ray, not on the plane), which is the deliberate trade: the finger's pixel is the
 * invariant, the plane is only a policy.
 */
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
