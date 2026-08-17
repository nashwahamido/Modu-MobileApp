// The avatar art per onboarding Helping Mode, resolved in one place so onboarding, the profile screen, the tutorial mascot and the room HUDs can never point at different files for the same mode. Lives here rather than under game/ because a player's avatar is shown anywhere they are named, not only in the assembly game.
import type { ImageSourcePropType } from "react-native";
import type { ProfileId } from "@/src/game/core/profile";

/** One source of truth for the avatar associated with each Helping Mode. */
export const AVATAR_IMAGES: Record<ProfileId, ImageSourcePropType> = {
  visual: require("@/src/assets/images/avatars/lumi.png"),
  momentum: require("@/src/assets/images/avatars/sparky.png"),
  clearPath: require("@/src/assets/images/avatars/pebble.png"),
  control: require("@/src/assets/images/avatars/felix.png"),
};

// Falls back to "control" when a profile has no mode set — an account that predates onboarding, or one that skipped it.
/** HEAD-ONLY art, for the small round/rect frames: the tutorial portrait, and anywhere a character
 *  appears at chip size. A full body shrunk into an 82pt box became an unreadable speck, and a crop
 *  of the body art framed a different part of each character — so the heads are their own assets. */
export const AVATAR_HEAD_IMAGES: Record<ProfileId, ImageSourcePropType> = {
  visual: require("@/src/assets/images/avatars/lumi-head.png"),
  momentum: require("@/src/assets/images/avatars/sparky-head.png"),
  clearPath: require("@/src/assets/images/avatars/pebble-head.png"),
  control: require("@/src/assets/images/avatars/felix-head.png"),
};

/** CARD art: full body, but every character scaled to the same height and sitting on the same
 *  baseline, so a row of cards lines up. The plain full-body art above is each character at its own
 *  natural size, which is right for a hero image and wrong for a grid. */
export const AVATAR_CARD_IMAGES: Record<ProfileId, ImageSourcePropType> = {
  visual: require("@/src/assets/images/avatars/lumi-card.png"),
  momentum: require("@/src/assets/images/avatars/sparky-card.png"),
  clearPath: require("@/src/assets/images/avatars/pebble-card.png"),
  control: require("@/src/assets/images/avatars/felix-card.png"),
};

/** The card avatar for a Helping Mode. */
export function avatarCardForProfile(profile: ProfileId): ImageSourcePropType {
  return AVATAR_CARD_IMAGES[profile];
}

/** The head-only avatar for a Helping Mode. */
export function avatarHeadForProfile(profile: ProfileId): ImageSourcePropType {
  return AVATAR_HEAD_IMAGES[profile];
}

export function avatarForProfile(
  profile: ProfileId | null | undefined,
): ImageSourcePropType {
  return AVATAR_IMAGES[profile ?? "control"];
}