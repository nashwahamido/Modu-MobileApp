import type { ProfileId } from "@/src/game/core/profile";

export interface AvatarRef {
  id: number;
  mode: ProfileId;
}

// Mirrors the rows seeded in the avatars table.
export const DEFAULT_AVATARS: AvatarRef[] = [
  { id: 1, mode: "control" },
  { id: 2, mode: "visual" },
  { id: 3, mode: "momentum" },
  { id: 4, mode: "clearPath" },
];

export function modeForId(
  id: number | null,
  avatars: AvatarRef[] = DEFAULT_AVATARS,
): ProfileId | null {
  if (id == null) return null;
  return avatars.find((a) => a.id === id)?.mode ?? null;
}

export function idForMode(
  mode: ProfileId | null,
  avatars: AvatarRef[] = DEFAULT_AVATARS,
): number | null {
  if (mode == null) return null;
  return avatars.find((a) => a.mode === mode)?.id ?? null;
}
