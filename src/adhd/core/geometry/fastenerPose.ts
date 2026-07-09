// Where a hand-inserted (untightened) element sits before it's driven home:
// its seated pose, backed out along the engage axis (toward the tool/head side).
// Tightening animates it back along −engage to the seated pose.
import { PartPose, Vec3 } from "@/src/adhd/core/type";

// How far a loose fastener sticks out of its hole, in meters
export const LOOSE_OFFSET_M = 0.02;

// World position of a loose (inserted, untightened) fastener.
export function loosePosition(pose: PartPose, engage: Vec3): Vec3 {
  return [
    pose.position[0] + engage[0] * LOOSE_OFFSET_M,
    pose.position[1] + engage[1] * LOOSE_OFFSET_M,
    pose.position[2] + engage[2] * LOOSE_OFFSET_M,
  ];
}
