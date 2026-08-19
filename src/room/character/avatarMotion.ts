export const TURN_IN_PLACE_THRESHOLD = Math.PI / 6;

export type AvatarMotionPhase = "idle" | "turning" | "walking" | "special";

export type AvatarMotionSituation = {
  editing: boolean;
  recovering: boolean;
  hasPath: boolean;
  turnError: number;
  specialActive: boolean;
};

/**
 * Animation follows physical state. Safety always wins: editing/recovery force
 * idle, a route outranks a queued one-shot action, and sharp turns complete
 * before translation starts so the avatar cannot walk sideways.
 */
export function avatarMotionPhase({
  editing,
  recovering,
  hasPath,
  turnError,
  specialActive,
}: AvatarMotionSituation): AvatarMotionPhase {
  if (editing || recovering) return "idle";
  if (hasPath) {
    return Math.abs(turnError) > TURN_IN_PLACE_THRESHOLD ? "turning" : "walking";
  }
  if (specialActive) return "special";
  return "idle";
}
