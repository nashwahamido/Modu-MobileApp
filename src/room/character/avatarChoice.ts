import type { ProfileId } from "@/src/game/core/profile";

export type RoomAvatarKind = "felix" | "sparky";

/** Felix is the Control-mode recommendation; every other recommendation uses Sparky. */
export const roomAvatarKindForProfile = (profile: ProfileId): RoomAvatarKind =>
  profile === "control" ? "felix" : "sparky";
