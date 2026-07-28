export type TutorialTargetId =
  | "scene"
  | "joystick"
  | "recenter"
  | "partsTray"
  | "assemblyArea"
  | "tool"
  | "toolbar"
  | "hint"
  | "undo"
  | "settings";

export type TutorialEvent =
  | "joystick_moved"
  | "camera_recentered"
  | "pinch_zoomed"
  | "one_finger_panned"
  | "part_picked_up"
  | "part_snapped"
  | "step_undone"
  | "step_redone"
  | "display_preferences_confirmed"
  | "release_behavior_changed"
  | "instruction_preferences_changed"
  | "auto_view_toggled"
  | "focus_mode_toggled"
  | "toolbar_used"
  | "hint_requested"
  | "tool_used";

export type ToolTutorialKind = "tighten" | "tap" | "beat" | "press";
export type TutorialAudioSource = number | { uri: string };

export interface TutorialContext {
  profile: "control" | "visual" | "momentum" | "clearPath";
  mode: "free" | "guide" | "strict";
  manualTools: boolean;
  softHints: boolean;
}

export interface TutorialStep {
  id: string;
  targetId: TutorialTargetId;
  message: string;
  event: TutorialEvent;
  audio?: TutorialAudioSource;
  when?: (context: TutorialContext) => boolean;
}

export const TUTORIAL_REWARD_TOKENS = 50;
export const TUTORIAL_STEP_REWARD_TOKENS = 10;

/** The short, first-run core loop. Preference education stays contextual. */
export const TUTORIAL_STEPS: TutorialStep[] = [
  {
    id: "long-press-part",
    targetId: "partsTray",
    message: "Long-press a panel card to pick it up.",
    event: "part_picked_up",
  },
  {
    id: "drag-and-snap",
    targetId: "assemblyArea",
    message:
      "Keep holding and drag the panel into the cabinet frame. Release when it lines up to snap.",
    event: "part_snapped",
  },
  {
    id: "choose-display-settings",
    targetId: "settings",
    message:
      "Open Settings, preview Background and Lighting, then confirm your choices.",
    event: "display_preferences_confirmed",
  },
  {
    id: "rotate-with-joystick",
    targetId: "joystick",
    message: "Use the left joystick to rotate around the cabinet.",
    event: "joystick_moved",
  },
  {
    id: "recenter-camera",
    targetId: "recenter",
    message: "Lost your view? Tap Recenter to return to the default angle.",
    event: "camera_recentered",
  },
  {
    id: "pinch-to-zoom",
    targetId: "scene",
    message: "Pinch with two fingers to zoom in and check the details.",
    event: "pinch_zoomed",
  },
  {
    id: "secure-with-tool",
    targetId: "tool",
    message: "Use the highlighted control to secure the part.",
    event: "tool_used",
  },
];

/**
 * Content ready for later, contextual moments. These are deliberately not part
 * of the opening sequence until product confirms the opening-vs-later split.
 */
export const CONTEXTUAL_TUTORIAL_STEPS: TutorialStep[] = [
  {
    id: "control-hint",
    targetId: "hint",
    message:
      "Need a nudge? Tap Hint for a calm suggestion about what to place next.",
    event: "hint_requested",
    when: ({ profile, mode, softHints }) =>
      profile === "control" && mode === "free" && softHints,
  },
  {
    id: "one-finger-pan",
    targetId: "scene",
    message: "Drag one finger across empty space to pan the camera.",
    event: "one_finger_panned",
  },
  {
    id: "undo-step",
    targetId: "undo",
    message: "Use Back one step to return to the previous assembly step.",
    event: "step_undone",
  },
  {
    id: "redo-step",
    targetId: "undo",
    message: "Use Forward one step to restore the step you just returned from.",
    event: "step_redone",
  },
];

/** Optional preference walkthrough offered after the short core tutorial. */
export const SETTINGS_TUTORIAL_STEPS: TutorialStep[] = [
  {
    id: "release-behavior-settings",
    targetId: "settings",
    message:
      "When a part misses its target, what should happen? In Settings, choose Released part: Auto-return or Float.",
    event: "release_behavior_changed",
  },
  {
    id: "guided-instructions-settings",
    targetId: "settings",
    message:
      "In Settings, choose Instructions: Standard or Simple. Show instructions can also hide or restore the step text.",
    event: "instruction_preferences_changed",
    when: ({ mode }) => mode === "guide",
  },
  {
    id: "focus-mode-settings",
    targetId: "settings",
    message:
      "In Settings, Focus mode shows only the current part or action and hides extra controls.",
    event: "focus_mode_toggled",
  },
  {
    id: "auto-view-settings",
    targetId: "settings",
    message:
      "In Settings, Auto-view frames the next open socket automatically.",
    event: "auto_view_toggled",
  },
];

export const FUTURE_TUTORIAL_REQUIREMENTS = {
  saveProgress: "Future requirement — do not implement yet.",
  floatPushBack:
    "The Put back button now exists in BOTH play and the tutorial fork; this entry only tracks whether a dedicated tutorial step should teach it.",
} as const;

export const TUTORIAL_CONTENT_DECISIONS = {
  display:
    "Teach Background and Lighting through the real Settings panel after the first placed part.",
  guidedInstructions:
    "Teach Standard/Simple as the primary choice and mention Show instructions.",
  sequencing:
    "Keep the opening to the core loop; teach preferences in a separate post-core walkthrough.",
} as const;

export const tutorialStepsFor = (context: TutorialContext): TutorialStep[] => {
  return TUTORIAL_STEPS.filter((step) => !step.when || step.when(context));
};

export const settingsTutorialStepsFor = (
  context: TutorialContext,
): TutorialStep[] =>
  SETTINGS_TUTORIAL_STEPS.filter((step) => !step.when || step.when(context));

export function messageForToolStep(kind: ToolTutorialKind | null) {
  if (kind === "press")
    return "Tap the hand four times to press the panel into place.";
  if (kind === "tap") return "Tap repeatedly to drive it in.";
  if (kind === "beat") return "Swipe up or down to continue.";
  return "Trace the circle clockwise to tighten the connector.";
}
