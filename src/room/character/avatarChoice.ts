import type { ProfileId } from "@/src/game/core/profile";

export type RoomAvatarKind = "felix" | "sparky" | "lumi" | "pebble";

const AVATAR_BY_PROFILE: Record<ProfileId, RoomAvatarKind> = {
  control: "felix",
  visual: "lumi",
  momentum: "sparky",
  clearPath: "pebble",
};

export const roomAvatarKindForProfile = (profile: ProfileId): RoomAvatarKind =>
  AVATAR_BY_PROFILE[profile];
