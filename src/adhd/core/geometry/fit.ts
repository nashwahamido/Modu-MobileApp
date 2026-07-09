// Decides the snap-feedback state for a held part as the player drags it near
// a target socket. Pure geometry — distance + angle thresholds, nothing else.
import { Quat, Vec3 } from "@/src/adhd/core/type";
import { quatAngleDeg, vec3Distance } from "./math";

export type FitState =
  | "idle" // nothing held
  | "held" // held, not near any socket — discovery
  | "approaching" // within the wider preview radius of the intended socket (blue)
  | "nearCorrect" // close in position AND rotation — ready to snap (green)
  | "nearRotation" // close in position, wrong orientation — turn it (orange)
  | "wrongTarget"; // hovering a different same-label socket (red)

export interface FitTarget {
  position: Vec3;
  rotation: Quat;
}

/** distance = snap radius; approach = wider radius where the preview appears. */
export const DEFAULT_THRESHOLDS = { distance: 0.1, angleDeg: 25, approach: 0.3 };

export function computeFit(
  heldPos: Vec3,
  heldRot: Quat,
  target: FitTarget,
  otherSocketPositions: readonly Vec3[],
  t = DEFAULT_THRESHOLDS,
): FitState {
  const d = vec3Distance(heldPos, target.position);
  // near the intended socket → distinguish good rotation from bad
  if (d <= t.distance) {
    return quatAngleDeg(heldRot, target.rotation) <= t.angleDeg
      ? "nearCorrect"
      : "nearRotation";
  }
  // near some OTHER open socket of the same kind → wrong spot
  if (otherSocketPositions.some((p) => vec3Distance(heldPos, p) <= t.distance)) {
    return "wrongTarget";
  }
  // getting close to the intended socket → show the preview
  if (d <= t.approach) return "approaching";
  return "held";
}
