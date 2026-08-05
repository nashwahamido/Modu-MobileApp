// The avatar image per onboarding helping-mode, chosen in avatar-recommendation and shown anywhere a player is named: their own profile, a friends list, a visited room's header.
import type { ImageSourcePropType } from "react-native";
import type { ProfileId } from "@/src/game/core/profile";

/* eslint-disable @typescript-eslint/no-require-imports */
const AVATARS: Record<ProfileId, ImageSourcePropType> = {
  visual: require("@/src/assets/images/avatars/lumi.jpg"),
  momentum: require("@/src/assets/images/avatars/sparky.jpg"),
  clearPath: require("@/src/assets/images/avatars/ciara.jpg"),
  control: require("@/src/assets/images/avatars/felix.jpg"),
};
/* eslint-enable @typescript-eslint/no-require-imports */

// Falls back to "control" when a profile has no mode set — an account that predates onboarding, or one that skipped it.
export function avatarFor(mode: ProfileId | null): ImageSourcePropType {
  return AVATARS[mode ?? "control"];
}
