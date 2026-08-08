import type { ProfileId } from "@/src/game/core/profile";
import type { TutorialEvent } from "@/src/game/tutorial/steps";

export type TutorialHapticCue = "none" | "selection" | "light" | "success";

// These actions already provide tactile feedback in their physical controls
// (drag/snap, dial, press, or swipe). A second tutorial vibration would feel
// like the same action fired twice.
const EVENTS_WITH_PHYSICAL_HAPTICS = new Set<TutorialEvent>([
  "part_picked_up",
  "part_snapped",
  "connector_placed",
  "connector_tightened",
  "all_legs_installed",
  "assembly_reoriented",
  "tool_used",
]);

export function hapticCueForTutorialStep(
  event: TutorialEvent | undefined,
  profile: ProfileId,
): TutorialHapticCue {
  if (!event || EVENTS_WITH_PHYSICAL_HAPTICS.has(event)) return "none";
  return profile === "momentum" ? "light" : "selection";
}

export function hapticCueForTutorialCompletion(): TutorialHapticCue {
  return "success";
}
