import type { ImageSourcePropType } from "react-native";
import type { ProfileId } from "@/src/game/core/profile";

export const AVATAR_IMAGES: Record<ProfileId, ImageSourcePropType> = {
  visual: require("@/src/assets/images/avatars/lumi.png"),
  momentum: require("@/src/assets/images/avatars/sparky.png"),
  clearPath: require("@/src/assets/images/avatars/pebble.png"),
  control: require("@/src/assets/images/avatars/felix.png"),
};

export const AVATAR_HEAD_IMAGES: Record<ProfileId, ImageSourcePropType> = {
  visual: require("@/src/assets/images/avatars/lumi-head.png"),
  momentum: require("@/src/assets/images/avatars/sparky-head.png"),
  clearPath: require("@/src/assets/images/avatars/pebble-head.png"),
  control: require("@/src/assets/images/avatars/felix-head.png"),
};

export const AVATAR_CARD_IMAGES: Record<ProfileId, ImageSourcePropType> = {
  visual: require("@/src/assets/images/avatars/lumi-card.png"),
  momentum: require("@/src/assets/images/avatars/sparky-card.png"),
  clearPath: require("@/src/assets/images/avatars/pebble-card.png"),
  control: require("@/src/assets/images/avatars/felix-card.png"),
};

export function avatarCardForProfile(profile: ProfileId): ImageSourcePropType {
  return AVATAR_CARD_IMAGES[profile];
}

export function avatarHeadForProfile(profile: ProfileId): ImageSourcePropType {
  return AVATAR_HEAD_IMAGES[profile];
}

export function avatarForProfile(
  profile: ProfileId | null | undefined,
): ImageSourcePropType {
  return AVATAR_IMAGES[profile ?? "control"];
}