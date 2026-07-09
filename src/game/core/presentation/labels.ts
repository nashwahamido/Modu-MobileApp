import {
  GroupId,
  LabelMap,
  RenderStyle,
  RenderStyleId,
  StyleSet,
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
export function pickThumb(set: ThumbSet, theme: ThemeId = "light"): number {
  return set[theme] ?? set.light;
}

/** Per-group part thumbnail for the active theme (undefined if the group has none). */
export function thumbFor(
  thumbs: ThumbMap,
  group: GroupId,
  theme: ThemeId = "light",
): number | undefined {
  const set = thumbs[group];
  return set ? pickThumb(set, theme) : undefined;
}

/** The chosen render style (realistic/cartoon), falling back to `realistic` (or
 *  undefined → the scene uses each model's own GLB materials). Its own axis,
 *  independent of theme — a model can be cartoon in light OR dark. */
export function styleFor(
  styles: StyleSet | undefined,
  style: RenderStyleId = "realistic",
): RenderStyle | undefined {
  return styles?.[style] ?? styles?.realistic;
}