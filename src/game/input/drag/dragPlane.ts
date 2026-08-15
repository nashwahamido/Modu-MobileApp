// Where a finger lands on the work plane while a part is in hand — the whole of the screen→world
// half of the part drag, kept pure so it can be tested against the projection that has to invert it
// (dragPlane.test.ts). The hook owns the gesture; this owns the geometry.
import { screenRay, type LookAt } from "@/src/game/core/geometry/math";
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

/** Stands in for "infinitely far along the aim" when a ray never meets the work plane. Any distance past the leash gives the same leashed point, so the value only has to be comfortably beyond it. */
const FAR_AIM_M = 1e6;

/** Keep a drag point within the leash, pulling it straight back toward the bench centre. Points inside — which is everywhere a finger can reasonably be — are returned untouched, so the part tracks the finger exactly. */
export function leashToBench(eye: Vec3, center: Vec3, p: Float3): Float3 {
  const max =
    LEASH_FACTOR *
    Math.hypot(center[0] - eye[0], center[1] - eye[1], center[2] - eye[2]);
  const r = Math.hypot(p[0], p[2]);
  if (!(r > max) || r === 0) return p;
  return [(p[0] * max) / r, p[1], (p[2] * max) / r];
}

/**
 * The point on the work plane a finger is aiming at, leashed. Never fails.
 *
 * Past the horizon the plane is met infinitely far ahead, or behind the eye — and the leash is what
 * the answer collapses to either way, so that limit is taken directly: keep the aim's horizontal
 * heading and run out along it. It is the same point the last ray BEFORE the horizon gets (that one
 * lands tens of metres out and is leashed to the identical spot), so the finger can cross the
 * horizon without the part moving at all. A plain intersection returns null there instead, and the
 * pickup that inherited the null spawned the part at its SOCKET — yards from the finger, until the
 * first connecting ray teleported it across.
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
  const t = (planeY - eye[1]) / dir[1];
  if (Number.isFinite(t) && t > 0) {
    return leashToBench(eye, look.center, [
      eye[0] + t * dir[0],
      planeY,
      eye[2] + t * dir[2],
    ]);
  }
  const l = Math.hypot(dir[0], dir[2]) || 1;
  return leashToBench(eye, look.center, [
    eye[0] + (dir[0] / l) * FAR_AIM_M,
    planeY,
    eye[2] + (dir[2] / l) * FAR_AIM_M,
  ]);
}
