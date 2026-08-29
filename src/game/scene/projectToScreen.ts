// Projecting a world point to screen pixels, so a HUD overlay can ask "is that socket actually on
// screen?" and the drag can match drop candidates by where the finger AIMS. One implementation for
// both: the gesture layer used to carry its own copy of this maths, which meant the projector the
// drag ran on and the projector its tests measured with were two functions that merely looked alike.
//
// Manual projection rather than a camera matrix: Filament's manipulator exposes getLookAt() and
// nothing else, so the basis has to be rebuilt from eye/center/up on each call.
import { FOV_Y_DEG } from "@/src/game/scene/cameraConfig";
import type { Vec3 } from "@/src/game/core/type";

export interface ScreenPoint {
  x: number;
  y: number;
  /** Distance along the view axis. Zero or negative means the point is BEHIND the camera — the case
   *  a naive projection silently turns into a mirrored on-screen position. */
  depth: number;
}

export type LookAt = readonly [
  readonly number[],
  readonly number[],
  readonly number[],
];

/** Reads the look-at the RENDERER is drawing with, pan included — the only camera a screen↔world conversion may use. See useOrbitCamera's getLookAt for why the manipulator's own pair is not that camera. */
export type GetLookAt = () => readonly [Vec3, Vec3, Vec3] | null;

/** The camera's orthonormal frame, rebuilt from a look-at. Every screen-space question in the game starts here — projecting a point, mapping a finger delta to metres, spreading a plane across the view — so it is derived once and shared rather than re-copied per call site. */
export interface CameraBasis {
  eye: readonly number[];
  fwd: Vec3;
  right: Vec3;
  camUp: Vec3;
}

export function cameraBasis(lookAt: LookAt | null | undefined): CameraBasis | null {
  if (!lookAt) return null;
  const [eye, center, up] = lookAt;
  const f: Vec3 = [center[0] - eye[0], center[1] - eye[1], center[2] - eye[2]];
  const fl = Math.hypot(f[0], f[1], f[2]) || 1;
  const fwd: Vec3 = [f[0] / fl, f[1] / fl, f[2] / fl];
  const r: Vec3 = [
    fwd[1] * up[2] - fwd[2] * up[1],
    fwd[2] * up[0] - fwd[0] * up[2],
    fwd[0] * up[1] - fwd[1] * up[0],
  ];
  const rl = Math.hypot(r[0], r[1], r[2]) || 1;
  const right: Vec3 = [r[0] / rl, r[1] / rl, r[2] / rl];
  const camUp: Vec3 = [
    right[1] * fwd[2] - right[2] * fwd[1],
    right[2] * fwd[0] - right[0] * fwd[2],
    right[0] * fwd[1] - right[1] * fwd[0],
  ];
  return { eye, fwd, right, camUp };
}

export function projectToScreen(
  lookAt: LookAt | null | undefined,
  w: Vec3,
  winW: number,
  winH: number,
): ScreenPoint | null {
  const basis = cameraBasis(lookAt);
  if (!basis) return null;
  const { eye, fwd, right, camUp } = basis;
  const d: Vec3 = [w[0] - eye[0], w[1] - eye[1], w[2] - eye[2]];
  const depth = d[0] * fwd[0] + d[1] * fwd[1] + d[2] * fwd[2];
  if (!Number.isFinite(depth) || depth <= 0) return null;
  const tanV = Math.tan((FOV_Y_DEG * Math.PI) / 360);
  const tanH = tanV * (winW / winH);
  const ndcX = (d[0] * right[0] + d[1] * right[1] + d[2] * right[2]) / (depth * tanH);
  const ndcY = (d[0] * camUp[0] + d[1] * camUp[1] + d[2] * camUp[2]) / (depth * tanV);
  return { x: ((ndcX + 1) / 2) * winW, y: ((1 - ndcY) / 2) * winH, depth };
}