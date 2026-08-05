import type { ImageSourcePropType } from "react-native";

import type { ProfileId } from "./profile";

/** One source of truth for the avatar associated with each Helping Mode. */
export const AVATAR_IMAGES: Record<ProfileId, ImageSourcePropType> = {
  visual: require("../../assets/images/avatars/lumi.png"),
  momentum: require("../../assets/images/avatars/sparky.png"),
  clearPath: require("../../assets/images/avatars/pebble.png"),
  control: require("../../assets/images/avatars/felix.png"),
};

export function avatarForProfile(
  profile: ProfileId | null | undefined,
): ImageSourcePropType {
  return AVATAR_IMAGES[profile ?? "control"];
}
