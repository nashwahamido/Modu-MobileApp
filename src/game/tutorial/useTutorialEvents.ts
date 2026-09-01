// The tutorial's events, DERIVED FROM THE BUILD rather than reported to it.
//
// Ten of the tutorial's twenty events are already store transitions: a part is held, an action
// completes, a setting changes. Subscribing once here means the assembly screen does not have to
// know a tutorial exists in order to advance one — which is the whole point, because the alternative
// is what this replaces: a `completeEvent` call inside each control's own handler, on a screen that
// had to be a fork of the assembly screen to carry them.
//
// The same architecture as audio/useAssemblySfx: one subscription over the transitions every gesture
// already ends in. A control added to the build gets its tutorial events for free, and cannot be
// forgotten.
//
// WHAT IS NOT HERE, and why:
//   grip_acknowledged, settings_browsed, controls_acknowledged  — surfaces the tutorial layer owns,
//     so the layer fires them directly. Nothing in the build corresponds to "the player read a card".
//   joystick_moved, pinch_zoomed, one_finger_panned,
//   underside_view_reached, camera_recentered                   — camera gestures. The camera lives
//     in the assembly screen's own state and never reaches the store, so these cannot be derived
//     here; the screen passes them in. See useTutorialCameraEvents.
import { useEffect } from "react";

import { useGameStore } from "@/src/game/core/store";
import { usePrefsStore } from "@/src/game/core/prefsStore";
import { useTutorialStore } from "./store";

/**
 * @param onPickupDuringPlacement fired when a part is lifted during a step whose card would sit over
 *   the tray the player is reaching into. The screen collapses its guide; this hook only reports the
 *   moment, because WHAT to do about it is presentation and belongs to whoever is drawing.
 */
export function useTutorialEvents(onPickupDuringPlacement?: () => void): void {
  useEffect(
    () =>
      useGameStore.subscribe((state, previous) => {
        const tutorial = useTutorialStore.getState();
        // A step the player is only READING closes on ANY sign of activity, not just a tap on the
        // dimmed area. The stuck-help card names Spot and Auto: pressing either is the clearest
        // acknowledgement there is, and a card that stayed up after the player did the thing it
        // suggested would read as the tutorial not noticing.
        const ackIfReading = () => {
          if (tutorial.steps[tutorial.currentIndex]?.event === "controls_acknowledged") {
            tutorial.completeEvent("controls_acknowledged");
          }
        };
        // A settings step is ALREADY watching the panel for its own completion, and the player is
        // inside that panel changing things. Without this guard, changing the backdrop to satisfy
        // one settings step also fires the event the NEXT settings step is waiting for, and the
        // tutorial skips a card the player never saw.
        const settingsTutorialActive =
          tutorial.steps[tutorial.currentIndex]?.targetId === "settings";

        if (!previous.heldActionId && state.heldActionId) {
          const currentStepId = tutorial.steps[tutorial.currentIndex]?.id;
          if (
            currentStepId === "install-four-legs" ||
            currentStepId === "place-connector" ||
            currentStepId === "visual-pickup-and-place" ||
            // Pebble's merged first step. It closes on the SNAP, not the pickup, so without this the
            // card would sit over the tray for the whole drag still saying "long-press a part card"
            // — the one profile whose run no longer has a separate drag step is the one that most
            // needs the bubble out of the way while the drag happens.
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
          // Auto completes a real action, so this is also how "the player pressed Auto" reaches a
          // read-only step — there is no Auto event of its own to listen for.
          ackIfReading();
          const added = state.completed.slice(previous.completed.length);
          for (const id of added) {
            const action = state.furniture?.actions.find(
              (candidate) => candidate.actionId === id,
            );
            // A part that arrived on a DRIVE — a slider or a press — was moved by a tool, not
            // dragged into place, so it satisfies "you used a tool" rather than "you placed a part".
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

        // hintPulse increments on every Spot press, including repeated presses for the same part —
        // which is why it is a counter and not a boolean.
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
    // Subscribed ONCE. The callback reads both stores through getState at fire time, so it never
    // needs re-subscribing — and re-subscribing on every render is how a store subscription starts
    // missing the transition it was written for.
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