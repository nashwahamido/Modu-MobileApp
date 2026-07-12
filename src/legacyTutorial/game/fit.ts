import { Quat, Vec3, quatAngleDeg, vec3Distance } from './math';

export type FitState = 'idle' | 'held' | 'nearCorrect' | 'nearRotation' | 'wrongTarget';

export interface FitTarget {
  position: Vec3;
  rotation: Quat;
}

export const DEFAULT_THRESHOLDS = { distance: 0.06, angleDeg: 25 };

export function computeFit(
  heldPos: Vec3,
  heldRot: Quat,
  target: FitTarget,
  otherSocketPositions: readonly Vec3[],
  t = DEFAULT_THRESHOLDS,
): FitState {
  if (vec3Distance(heldPos, target.position) <= t.distance) {
    return quatAngleDeg(heldRot, target.rotation) <= t.angleDeg ? 'nearCorrect' : 'nearRotation';
  }
  if (otherSocketPositions.some((p) => vec3Distance(heldPos, p) <= t.distance)) return 'wrongTarget';
  return 'held';
}
