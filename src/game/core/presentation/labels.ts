import {
  AssetSrc,
  GroupId,
  LabelMap,
  TextLevel,
  ThemeId,
  ThumbMap,
  ThumbSet,
} from "@/src/game/core/type";

/** Display name for a part group at a text level, falling back to standard. */
export function labelFor(
  labels: LabelMap,
  group: GroupId,
  level: TextLevel = "standard",
): string {
  const set = labels[group];
  if (!set) return group;
  const alt = level !== "standard" ? set[level] : undefined;
  return (typeof alt === "string" && alt) || set.standard;
}
/** Back-compat alias; prefer ThemeId. */
export type ThumbTheme = ThemeId;

/** One thumbnail for the active theme, falling back to light. */
export function pickThumb(set: ThumbSet, theme: ThemeId = "light"): AssetSrc {
  return set[theme] ?? set.light;
}

/** Per-group part thumbnail for the active theme (undefined if the group has none). */
export function thumbFor(
  thumbs: ThumbMap,
  group: GroupId,
  theme: ThemeId = "light",
): AssetSrc | undefined {
  const set = thumbs[group];
  return set ? pickThumb(set, theme) : undefined;
}
