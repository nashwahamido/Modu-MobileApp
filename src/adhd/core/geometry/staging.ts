// Scene-staging helpers: where a part spawns from the tray, how far a loose
// fastener sits from its seat, and where to point the camera. Generic — pass in
// the parts you care about (e.g. one cluster's), no furniture knowledge here.
import { PartDef, PartPose, Vec3 } from "@/src/adhd/core/type";
import { loosePosition } from "./fastenerPose";

/** Where a part materializes (XZ) when picked up from the tray, world meters. */
export const SPAWN_POS: Vec3 = [0.28, 0, 0.15];

/** Hover lift applied to a held part so it floats above the work area. */
export const HOVER_LIFT_M = 0.06;

/** Offset from a part's baked pose to the spawn point at the work-plane height. */
export function spawnDelta(pose: PartPose, planeY: number): Vec3 {
  return [
    SPAWN_POS[0] - pose.position[0],
    planeY - pose.position[1],
    SPAWN_POS[2] - pose.position[2],
  ];
}

/** Offset of a fastener's loose (inserted, untightened) pose from its baked pose. */
export function looseDelta(part: PartDef): Vec3 {
  const lp = loosePosition(part.pose, part.engageDir ?? [0, 0, 0]);
  const p = part.pose.position;
  return [lp[0] - p[0], lp[1] - p[1], lp[2] - p[2]];
}

/**
 * Camera pivot for a set of parts: the center of their structural bounding box.
 * Fasteners are ignored when structural parts are present, so cluster orbit
 * stays centered on the furniture body rather than on surrounding screw heads.
 */
export function clusterPivot(parts: readonly PartDef[]): Vec3 {
  const structural = parts.filter((part) => part.type !== "fastener");
  const pivotParts = structural.length ? structural : parts;
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (const part of pivotParts) {
    for (let i = 0; i < 3; i++) {
      const v = part.pose.position[i];
      if (v < min[i]) min[i] = v;
      if (v > max[i]) max[i] = v;
    }
  }
  if (!pivotParts.length) return [0, 0, 0];
  return [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2];
}
