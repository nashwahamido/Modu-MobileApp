export const TURN_IN_PLACE_THRESHOLD = Math.PI / 6;
export const POST_PATH_STANDING_MS = 3_000;
export const SPECIAL_ACTION_PROBABILITY = 0.3;

export function shouldPlaySpecialAction(randomValue = Math.random()): boolean {
  return randomValue < SPECIAL_ACTION_PROBABILITY;
}

export type AvatarSpecialAction = {
  index: number;
  duration: number;
};

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
