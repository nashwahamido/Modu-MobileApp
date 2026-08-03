import * as Haptics from "expo-haptics";

import { useGameStore } from "@/src/game/core/store";

/** Haptics used by gameplay controls must respect the shared Settings switch. */
export function selectionHaptic() {
  if (!useGameStore.getState().settings.haptics) return;
  void Haptics.selectionAsync().catch(() => {});
}

export function impactHaptic(style: Haptics.ImpactFeedbackStyle) {
  if (!useGameStore.getState().settings.haptics) return;
  void Haptics.impactAsync(style).catch(() => {});
}
