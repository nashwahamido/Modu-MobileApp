import { Quat, Vec3 } from "@/src/game/core/type";
import { quatAngleDeg, vec3Distance } from "./math";

export type FitState =
  | "idle"
  | "held"
  // Closing on the right socket but not yet inside the snap radius. Its own state so the approach can be signalled BEFORE the part is placeable — "held" covers the whole rest of the canvas.
  | "approaching"
  | "nearCorrect"
  | "nearRotation"
  | "wrongTarget";

export interface FitTarget {
  position: Vec3;
  rotation: Quat;
}

export const DEFAULT_THRESHOLDS = { distance: 0.06, angleDeg: 25 };

// How far the approach band reaches, as a multiple of the snap distance: a visible run-up without lighting up the moment the part leaves the tray.
export const APPROACH_FACTOR = 2.5;

export function computeFit(
  heldPos: Vec3,
  heldRot: Quat,
  target: FitTarget,
  otherSocketPositions: readonly Vec3[],
  t = DEFAULT_THRESHOLDS,
): FitState {
  if (vec3Distance(heldPos, target.position) <= t.distance) {
    return quatAngleDeg(heldRot, target.rotation) <= t.angleDeg
      ? "nearCorrect"
      : "nearRotation";
  }
  if (otherSocketPositions.some((p) => vec3Distance(heldPos, p) <= t.distance)) {
    return "wrongTarget";
  }
  if (vec3Distance(heldPos, target.position) <= t.distance * APPROACH_FACTOR) {
    return "approaching";
  }
  return "held";
}