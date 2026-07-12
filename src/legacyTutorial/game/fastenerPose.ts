import type { Vec3 } from './math';
import type { PartPose } from './poses.gen';

/**
 * How far a hand-inserted (untightened) fastener sticks out of its hole,
 * along its engage direction (toward the tool/head side). Verified on device.
 */
export const LOOSE_OFFSET_M = 0.02;

/**
 * World position of a fastener inserted by hand but not yet tightened: the
 * seated pose backed out along `engage` (the head/strike side). Tightening
 * animates it back along −engage to the baked pose.
 */
export function loosePosition(pose: PartPose, engage: Vec3): [number, number, number] {
  return [
    pose.position[0] + engage[0] * LOOSE_OFFSET_M,
    pose.position[1] + engage[1] * LOOSE_OFFSET_M,
    pose.position[2] + engage[2] * LOOSE_OFFSET_M,
  ];
}
