// Generic part-name resolution. The data (a LabelMap) is authored per furniture;
// this picks the right wording for the player's text level.
import { LabelMap, TextLevel } from "@/src/adhd/core/type";

/** Display name for a part group at a text level, falling back to standard. */
export function labelFor(
  labels: LabelMap,
  group: string,
  level: TextLevel = "standard",
): string {
  const set = labels[group];
  if (!set) return group; // visible placeholder for an un-named group
  return (level !== "standard" && set[level]) || set.standard;
}
