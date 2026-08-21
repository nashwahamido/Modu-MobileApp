export const TURN_IN_PLACE_THRESHOLD = Math.PI / 6;
export const POST_PATH_STANDING_MS = 5_000;

export type AvatarSpecialAction = {
  index: number;
  duration: number;
};

/**
 * Select a one-shot action without immediately repeating the previous one.
 * A model with only one special action waits instead of violating that rule.
 */
export function chooseDistinctSpecialAction(
  actions: readonly AvatarSpecialAction[],
  lastIndex: number | null,
  randomValue = Math.random(),
): AvatarSpecialAction | null {
  const candidates = actions.filter((action) => action.index !== lastIndex);
  if (candidates.length === 0) return null;
  const offset = Math.min(
    candidates.length - 1,
    Math.floor(Math.max(0, randomValue) * candidates.length),
  );
  return candidates[offset];
}

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
