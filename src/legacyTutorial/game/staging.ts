import { ACTIONS, Stage } from './assembly';
import { PARTS, PartId } from './parts';
import { loosePosition } from './fastenerPose';
import { ENGAGE_DIR } from './fastenerAxes.gen';
import type { Vec3 } from './math';

/** Where a part materializes (XZ) when picked up from the tray, world meters. */
export const SPAWN_POS: Vec3 = [0.28, 0, 0.15];

/** Hover lift applied to a held part so it floats above the work area. */
export const HOVER_LIFT_M = 0.06;

/** Offset from baked pose to the spawn point at the given work-plane height. */
export function spawnDelta(id: PartId, planeY: number): [number, number, number] {
  const p = PARTS[id].pose.position;
  return [SPAWN_POS[0] - p[0], planeY - p[1], SPAWN_POS[2] - p[2]];
}

/**
 * Camera orbit pivot for a stage: the vertical centre of what's visible
 * (part origins; the stool's axis is X=Z=0). When the base is set aside during
 * the seat build (stage 3), frame just the seat assembly; otherwise frame
 * everything built up to and including the stage.
 */
export function stagePivot(stage: Stage, baseStashed = false): [number, number, number] {
  const seatOnly = stage === 3 && baseStashed;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const a of ACTIONS) {
    if (!a.partId) continue;
    if (seatOnly ? a.stage !== 3 : a.stage > stage) continue;
    const y = PARTS[a.partId].pose.position[1];
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  return [0, (minY + maxY) / 2, 0];
}

/** Offset of the loose (inserted, untightened) pose from the baked pose. */
export function looseDelta(id: PartId): [number, number, number] {
  const pose = PARTS[id].pose;
  const lp = loosePosition(pose, ENGAGE_DIR[id] ?? [0, 0, 0]);
  return [lp[0] - pose.position[0], lp[1] - pose.position[1], lp[2] - pose.position[2]];
}
