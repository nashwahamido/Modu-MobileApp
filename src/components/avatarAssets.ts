// The avatar art per onboarding Helping Mode, resolved in one place so onboarding, the profile screen, the tutorial mascot and the room HUDs can never point at different files for the same mode. Lives here rather than under game/ because a player's avatar is shown anywhere they are named, not only in the assembly game.
import type { ImageSourcePropType } from "react-native";
import type { ProfileId } from "@/src/game/core/profile";

/* eslint-disable @typescript-eslint/no-require-imports */
/** One source of truth for the avatar associated with each Helping Mode. */
export const AVATAR_IMAGES: Record<ProfileId, ImageSourcePropType> = {
  visual: require("@/src/assets/images/avatars/lumi.png"),
  momentum: require("@/src/assets/images/avatars/sparky.png"),
  clearPath: require("@/src/assets/images/avatars/pebble.png"),
  control: require("@/src/assets/images/avatars/felix.png"),
};
/* eslint-enable @typescript-eslint/no-require-imports */

// Falls back to "control" when a profile has no mode set — an account that predates onboarding, or one that skipped it.
export function avatarForProfile(
  profile: ProfileId | null | undefined,
): ImageSourcePropType {
  return AVATAR_IMAGES[profile ?? "control"];
}
