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
  | "auto_view_toggled"
  | "focus_mode_toggled"
  | "toolbar_used"
  | "hint_requested"
  | "tool_used";

export type ToolTutorialKind = "tighten" | "tap" | "beat";
export type TutorialAudioSource = number | { uri: string };

export interface TutorialContext {
  profile: "control" | "visual" | "momentum" | "clearPath";
  mode: "free" | "guide" | "strict";
  manualTools: boolean;
  softHints: boolean;
  releaseBehavior: "float" | "autoReturn";
  oneFingerPanEnabled: boolean;
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
    id: "control-toolbar",
    targetId: "toolbar",
    message:
      "Before tightening, open the toolbox at the bottom of the assembly screen and equip the highlighted tool.",
    event: "toolbar_used",
    when: ({ profile, mode, manualTools }) =>
      profile === "control" && mode === "free" && manualTools,
  },
  {
    id: "secure-with-tool",
    targetId: "tool",
    message: "Use the tool control to secure the connector.",
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
    when: ({ oneFingerPanEnabled }) => oneFingerPanEnabled,
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
  {
    id: "auto-view-settings",
    targetId: "settings",
    message:
      "Open Settings and switch on Auto-view to frame the next open socket automatically.",
    event: "auto_view_toggled",
  },
  {
    id: "focus-mode-settings",
    targetId: "settings",
    message:
      "Open Settings and switch on Focus mode to show only the current part or action and hide extra controls.",
    event: "focus_mode_toggled",
  },
];

export const FUTURE_TUTORIAL_REQUIREMENTS = {
  saveProgress: "Future requirement — do not implement yet.",
  renderStyleGuidance:
    "Open product question — decide whether to teach model look in Settings.",
  guidedInstructionStyle:
    "Open product question — decide whether this means instruction detail, showing step text, or both.",
  floatPushBack:
    "Blocked on the final push-back control or gesture; keep it out of user-facing copy.",
  contextualPlacement:
    "Open product question — decide the exact opening-versus-later lesson split.",
} as const;

export const tutorialStepsFor = (context: TutorialContext): TutorialStep[] => {
  return TUTORIAL_STEPS.filter((step) => !step.when || step.when(context));
};

export function messageForToolStep(kind: ToolTutorialKind | null) {
  if (kind === "tap") return "Tap repeatedly to drive it in.";
  if (kind === "beat") return "Swipe up or down to continue.";
  return "Trace the circle clockwise to tighten the connector.";
}
