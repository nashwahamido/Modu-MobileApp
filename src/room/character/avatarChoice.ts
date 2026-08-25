import type { ProfileId } from "@/src/game/core/profile";

export type RoomAvatarKind = "felix" | "sparky" | "lumi" | "pebble";

/** Each recommendation gets its own roaming room companion. */
export const roomAvatarKindForProfile = (profile: ProfileId): RoomAvatarKind =>
  profile === "control"
    ? "felix"
    : profile === "visual"
      ? "lumi"
      : profile === "clearPath"
        ? "pebble"
        : "sparky";
