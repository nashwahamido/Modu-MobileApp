import type { ProfileId } from "@/src/game/core/profile";

export type RoomAvatarKind = "felix" | "sparky" | "lumi";

/** Each recommendation gets its own room companion; Clear Path overrides this with Pebble-in-bed. */
export const roomAvatarKindForProfile = (profile: ProfileId): RoomAvatarKind =>
  profile === "control" ? "felix" : profile === "visual" ? "lumi" : "sparky";
