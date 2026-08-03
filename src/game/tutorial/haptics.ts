import * as Haptics from "expo-haptics";

import type { ProfileId } from "@/src/game/core/profile";
import type { TutorialEvent } from "@/src/game/tutorial/steps";

const KEY_CONFIRMATION_EVENTS = new Set<TutorialEvent>([
  "part_snapped",
  "connector_placed",
  "connector_tightened",
  "tool_used",
  "all_legs_installed",
  "assembly_reoriented",
]);

/**
 * Tutorial feedback is intentionally event-based rather than gesture-based, so a
 * long drag or tool turn cannot produce a stream of duplicate vibrations.
 */
export function playTutorialStepHaptic(
  event: TutorialEvent | undefined,
  profile: ProfileId,
  enabled: boolean,
) {
  if (!enabled || !event) return;

  // Clear Path and Control only confirm meaningful assembly milestones. Visual
  // uses the same restrained rhythm to complement, rather than compete with,
  // its visual cues. Momentum celebrates every small completed tutorial step.
  if (profile !== "momentum" && !KEY_CONFIRMATION_EVENTS.has(event)) return;

  const style =
    profile === "momentum"
      ? Haptics.ImpactFeedbackStyle.Medium
      : Haptics.ImpactFeedbackStyle.Light;
  void Haptics.impactAsync(style).catch(() => {});
}

export function playTutorialCompletionHaptic(enabled: boolean) {
  if (!enabled) return;
  void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
    () => {},
  );
}
