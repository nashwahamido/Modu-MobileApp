import { PartPose, Vec3 } from "@/src/game/core/type";

export const LOOSE_OFFSET_M = 0.02;

export function loosePosition(pose: PartPose, engage: Vec3): Vec3 {
  return [
    pose.position[0] + engage[0] * LOOSE_OFFSET_M,
    pose.position[1] + engage[1] * LOOSE_OFFSET_M,
    pose.position[2] + engage[2] * LOOSE_OFFSET_M,
  ];
}
