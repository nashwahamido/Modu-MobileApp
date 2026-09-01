import { useEffect } from "react";

import { useGameStore } from "@/src/game/core/store";
import { usePrefsStore } from "@/src/game/core/prefsStore";
import { useTutorialStore } from "./store";

export function useTutorialEvents(onPickupDuringPlacement?: () => void): void {
  useEffect(
    () =>
      useGameStore.subscribe((state, previous) => {
        const tutorial = useTutorialStore.getState();
        const ackIfReading = () => {
          if (tutorial.steps[tutorial.currentIndex]?.event === "controls_acknowledged") {
            tutorial.completeEvent("controls_acknowledged");
          }
        };
        const settingsTutorialActive =
          tutorial.steps[tutorial.currentIndex]?.targetId === "settings";

        if (!previous.heldActionId && state.heldActionId) {
          const currentStepId = tutorial.steps[tutorial.currentIndex]?.id;
          if (
            currentStepId === "install-four-legs" ||
            currentStepId === "place-connector" ||
            currentStepId === "visual-pickup-and-place" ||
            currentStepId === "long-press-part"
          ) {
            onPickupDuringPlacement?.();
          }
          tutorial.completeEvent("part_picked_up");
        }

        if (state.completed.length < previous.completed.length) {
          tutorial.completeEvent("step_undone");
        }

        if (state.completed.length > previous.completed.length) {
          ackIfReading();
          const added = state.completed.slice(previous.completed.length);
          for (const id of added) {
            const action = state.furniture?.actions.find(
              (candidate) => candidate.actionId === id,
            );
            if (action?.type === "placePart") {
              if (previous.driveActionId === id) {
                tutorial.completeEvent("tool_used");
              } else {
                tutorial.completeEvent("part_snapped");
              }
            }
            if (action?.type === "tightenFastener") {
              tutorial.completeEvent("tool_used");
            }
            if (action?.type === "reorient") {
              tutorial.completeEvent("assembly_reoriented");
            }
          }
        }

        if (state.hintPulse > previous.hintPulse) {
          tutorial.completeEvent("spot_used");
          ackIfReading();
        }

        if (
          !settingsTutorialActive &&
          state.settings.focusMode !== previous.settings.focusMode
        ) {
          tutorial.completeEvent("focus_mode_toggled");
        }
        if (
          !settingsTutorialActive &&
          (state.settings.textLevel !== previous.settings.textLevel ||
            state.settings.showInstructions !== previous.settings.showInstructions)
        ) {
          tutorial.completeEvent("instruction_preferences_changed");
        }
      }),
    [onPickupDuringPlacement],
  );

  useEffect(
    () =>
      usePrefsStore.subscribe((state, previous) => {
        if (state.backdrop === previous.backdrop) return;
        const tutorial = useTutorialStore.getState();
        if (tutorial.steps[tutorial.currentIndex]?.targetId === "settings") return;
        tutorial.completeEvent("backdrop_changed");
      }),
    [],
  );
}