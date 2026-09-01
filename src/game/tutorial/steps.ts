export type TutorialTargetId =
  | "scene"
  | "joystick"
  | "recenter"
  | "partsTray"
  | "assemblyArea"
  | "tool"
  | "beatControl"
  | "hint"
  | "undo"
  | "focus"
  | "spot"
  | "settings"
  | "undoRecenter"
  | "auto"
  | "device";

export type TutorialEvent =
  | "grip_acknowledged"
  | "joystick_moved"
  | "camera_recentered"
  | "pinch_zoomed"
  | "one_finger_panned"
  | "underside_view_reached"
  | "part_picked_up"
  | "part_snapped"
  | "all_legs_installed"
  | "connector_placed"
  | "connector_tightened"
  | "assembly_reoriented"
  | "step_undone"
  | "backdrop_changed"
  | "instruction_preferences_changed"
  | "spot_used"
  | "focus_mode_toggled"
  | "hint_requested"
  | "tool_used"
  | "controls_acknowledged"
  | "settings_browsed";

export type ToolTutorialKind = "tighten" | "tap" | "beat" | "press";
export type TutorialAudioSource = number | { uri: string };

export interface TutorialContext {
  profile: "control" | "visual" | "momentum" | "clearPath";
  mode: "free" | "guide" | "strict";
  manualTools: boolean;
  softHints: boolean;
  tablet?: boolean;
}

export interface TutorialStep {
  id: string;
  targetId: TutorialTargetId;
  message: string;
  shortLabel?: string;
  event: TutorialEvent;
  audio?: TutorialAudioSource;
  unnumbered?: boolean;
  when?: (context: TutorialContext) => boolean;
}

export const TUTORIAL_REWARD_TOKENS = 80;
export const TUTORIAL_STEP_REWARD_TOKENS = 10;

export const TUTORIAL_STEPS: TutorialStep[] = [
  {
    id: "hold-like-controller",
    targetId: "device",
    message: "Hold your device with both hands, like a game controller.",
    shortLabel: "Get comfortable",
    event: "grip_acknowledged",
  },
  {
    id: "long-press-part",
    targetId: "partsTray",
    message: "Long-press a part card to pick it up.",
    shortLabel: "Pick up the tabletop",
    event: "part_picked_up",
  },
  {
    id: "drag-and-snap",
    targetId: "assemblyArea",
    message: "Drag the part into place. Release when it lines up.",
    shortLabel: "Place the tabletop",
    event: "part_snapped",
  },
  {
    id: "view-under-table",
    targetId: "joystick",
    message:
      "Use the joystick to lower the view until you can clearly see underneath the tabletop.",
    shortLabel: "View the underside",
    event: "underside_view_reached",
  },
  {
    id: "place-connector",
    targetId: "partsTray",
    message: "Long-press a bolt, then place it into the highlighted hole.",
    shortLabel: "Insert the first bolt",
    event: "connector_placed",
  },
  {
    id: "tighten-connector",
    targetId: "tool",
    message: "Turn clockwise to tighten the bolt by hand.",
    shortLabel: "Tighten the bolt",
    event: "connector_tightened",
  },
  {
    id: "install-four-legs",
    targetId: "partsTray",
    message:
      "Install the leg onto the bolt. Repeat the bolt and leg steps for all four legs to finish the table.",
    shortLabel: "Install all four legs",
    event: "all_legs_installed",
  },
];

export const TUTORIAL_VOICE_OVER_SCRIPT = TUTORIAL_STEPS.map(
  ({ id, message }) => ({ id, text: message }),
);

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
];

export const SHARED_HUD_TUTORIAL_STEPS: TutorialStep[] = [
  {
    id: "hud-recenter",
    targetId: "recenter",
    message: "Tap Recenter to bring the furniture back into view.",
    shortLabel: "Try Recenter",
    event: "camera_recentered",
  },
  {
    id: "hud-undo",
    targetId: "undo",
    message: "Tap Back one step to undo the last assembly action.",
    shortLabel: "Try Undo",
    event: "step_undone",
  },
  {
    id: "hud-focus",
    targetId: "focus",
    message: "Tap Focus to reduce the screen to the controls you need now.",
    shortLabel: "Try Focus",
    event: "focus_mode_toggled",
  },
  {
    id: "hud-spot",
    targetId: "spot",
    message: "Tap Spot to see the next part move into place.",
    shortLabel: "Try Spot",
    event: "spot_used",
  },
];

export const SETTINGS_TUTORIAL_STEPS: TutorialStep[] = [
  {
    id: "background-settings",
    targetId: "settings",
    message:
      "In Settings, you can change the Build background behind the furniture.",
    event: "backdrop_changed",
  },
  {
    id: "guided-instructions-settings",
    targetId: "settings",
    message:
      "You can choose Standard or Simple instructions, and show or hide the step text.",
    event: "instruction_preferences_changed",
    when: ({ mode }) => mode === "guide",
  },
];

export const VISUAL_TUTORIAL_STEPS: TutorialStep[] = [
  {
    id: "hold-like-controller",
    targetId: "device",
    message: "Hold your device with both hands, like a game controller.",
    shortLabel: "Get comfortable",
    event: "grip_acknowledged",
  },
  {
    id: "visual-pickup-and-place",
    targetId: "partsTray",
    message:
      "Long-press a part to drag to canvas then release it in the middle circle.",
    event: "part_snapped",
  },
  {
    id: "visual-settings",
    targetId: "settings",
    message: "You can adjust accessibility features and aesthetics in settings.",
    event: "settings_browsed",
  },
  {
    id: "hud-focus",
    targetId: "focus",
    message: "Simplify the screen with ‘Focus’; press again to restore.",
    event: "focus_mode_toggled",
  },
  {
    id: "view-under-table",
    targetId: "joystick",
    message:
      "Use the joystick to rotate the view.",
    event: "underside_view_reached",
  },
  {
    id: "place-connector",
    targetId: "partsTray",
    message: "Drag a bolt to place it into the highlighted hole.",
    event: "connector_placed",
  },
  {
    id: "tighten-connector",
    targetId: "tool",
    message: "Turn clockwise to tighten the bolt by hand.",
    event: "connector_tightened",
  },
  {
    id: "visual-undo-recenter",
    targetId: "undoRecenter",
    message:
      'Press "Undo" to go back, or "Recenter" to adjust the view.',
    event: "controls_acknowledged",
  },
  {
    id: "visual-stuck-help",
    targetId: "spot",
    message:
      'If stuck, press "Spot" for a hint or "Auto" for support.',
    event: "controls_acknowledged",
  },
  {
    id: "install-four-legs",
    targetId: "partsTray",
    message:
      "Continue assembling.",
    event: "all_legs_installed",
  },
];

export const CLEAR_PATH_TUTORIAL_STEPS: TutorialStep[] = [
  {
    id: "hold-like-controller",
    targetId: "device",
    message: "Hold your device with both hands, like a game controller.",
    shortLabel: "Get comfortable",
    event: "grip_acknowledged",
  },
  {
    id: "long-press-part",
    targetId: "partsTray",
    message: "Long-press a part card to pick it up.",
    shortLabel: "Place the tabletop",
    event: "part_snapped",
  },
  {
    id: "visual-settings",
    targetId: "settings",
    message:
      "You can change aesthetics and accessibility features in Settings.",
    event: "settings_browsed",
  },
  {
    id: "hud-focus",
    targetId: "focus",
    message:
      "Press ‘Focus’ to show more screen controls; press again to simplify.",
    shortLabel: "Try Focus",
    event: "focus_mode_toggled",
  },
  {
    id: "view-under-table",
    targetId: "joystick",
    message:
      "Use the joystick to rotate the view until you can see the highlighted areas clearly.",
    shortLabel: "Rotate the view",
    event: "joystick_moved",
  },
  {
    id: "visual-undo-recenter",
    targetId: "undoRecenter",
    message: 'Press "Undo" to go back, or "Recenter" to reset the view.',
    shortLabel: "Undo and Recenter",
    event: "controls_acknowledged",
  },
  {
    id: "visual-stuck-help",
    targetId: "spot",
    message:
      'If you feel stuck, press "Spot" for a visual hint, or "Auto" to skip a step.',
    shortLabel: "Spot and Auto",
    event: "controls_acknowledged",
  },
  {
    id: "place-connector",
    targetId: "partsTray",
    message: "Long-press a bolt, then place it into the highlighted hole.",
    shortLabel: "Insert the first bolt",
    event: "connector_placed",
  },
  {
    id: "tighten-connector",
    targetId: "tool",
    message: "Turn clockwise to tighten the bolt by hand.",
    shortLabel: "Tighten the bolt",
    event: "connector_tightened",
  },
  {
    id: "install-four-legs",
    targetId: "partsTray",
    message: "Continue assembling.",
    shortLabel: "Install all four legs",
    event: "all_legs_installed",
  },
];

export const CONTROL_TUTORIAL_STEPS: TutorialStep[] = [
  {
    id: "hold-like-controller",
    targetId: "device",
    message: "Hold your device with both hands, like a game controller.",
    shortLabel: "Get comfortable",
    event: "grip_acknowledged",
  },
  {
    id: "long-press-part",
    targetId: "partsTray",
    message: "Long-press a part card to pick it up.",
    shortLabel: "Place the tabletop",
    event: "part_snapped",
  },
  {
    id: "visual-settings",
    targetId: "settings",
    message:
      "You can change aesthetics and accessibility features in Settings.",
    event: "settings_browsed",
  },
  {
    id: "visual-undo-recenter",
    targetId: "undoRecenter",
    message: 'Press "Undo" to go back, or "Recenter" to reset the view.',
    shortLabel: "Undo and Recenter",
    event: "controls_acknowledged",
  },
  {
    id: "hud-focus",
    targetId: "focus",
    message: "Press ‘Focus’ to simplify the screen controls.",
    shortLabel: "Try Focus",
    event: "focus_mode_toggled",
  },
  {
    id: "hud-stuck-help",
    targetId: "spot",
    message:
      'If you feel stuck, press "Spot" for a visual hint, or "Auto" to skip a step.',
    shortLabel: "Spot and Auto",
    event: "controls_acknowledged",
  },
  {
    id: "view-under-table",
    targetId: "joystick",
    message:
      "Use the joystick to rotate the view until you can see the highlighted areas clearly.",
    shortLabel: "Rotate the view",
    event: "joystick_moved",
  },
  {
    id: "place-connector",
    targetId: "partsTray",
    message: "Long-press a bolt, then place it into the highlighted hole.",
    shortLabel: "Insert the first bolt",
    event: "connector_placed",
  },
  {
    id: "tighten-connector",
    targetId: "tool",
    message: "Turn clockwise to tighten the bolt by hand.",
    shortLabel: "Tighten the bolt",
    event: "connector_tightened",
  },
  {
    id: "control-hint",
    targetId: "hint",
    message: 'Press "Hint" if you need a tip for the next step.',
    shortLabel: "Try Hint",
    event: "hint_requested",
  },
  {
    id: "install-four-legs",
    targetId: "partsTray",
    message: "Continue assembling.",
    shortLabel: "Install all four legs",
    event: "all_legs_installed",
    unnumbered: true,
  },
];

export const MOMENTUM_TUTORIAL_STEPS: TutorialStep[] = [
  {
    id: "hold-like-controller",
    targetId: "device",
    message: "Hold your device with both hands, like a game controller.",
    shortLabel: "Get comfortable",
    event: "grip_acknowledged",
  },
  {
    id: "long-press-part",
    targetId: "partsTray",
    message: "Long-press a part card to pick it up.",
    shortLabel: "Place the tabletop",
    event: "part_snapped",
  },
  {
    id: "visual-settings",
    targetId: "settings",
    message:
      "You can change aesthetics and accessibility features in Settings.",
    event: "settings_browsed",
  },
  {
    id: "visual-undo-recenter",
    targetId: "undoRecenter",
    message: 'Press "Undo" to go back, or "Recenter" to reset the view.',
    shortLabel: "Undo and Recenter",
    event: "controls_acknowledged",
  },
  {
    id: "hud-focus",
    targetId: "focus",
    message: "Press ‘Focus’ to focus on the next part only.",
    shortLabel: "Try Focus",
    event: "focus_mode_toggled",
  },
  {
    id: "hud-stuck-help",
    targetId: "spot",
    message:
      'If you feel stuck, press "Spot" for a visual hint, or "Auto" to skip a step.',
    shortLabel: "Spot and Auto",
    event: "controls_acknowledged",
  },
  {
    id: "view-under-table",
    targetId: "joystick",
    message:
      "Use the joystick to rotate the view until you can see the highlighted areas clearly.",
    shortLabel: "Rotate the view",
    event: "joystick_moved",
  },
  {
    id: "place-connector",
    targetId: "partsTray",
    message: "Long-press a bolt, then place it into the highlighted hole.",
    shortLabel: "Insert the first bolt",
    event: "connector_placed",
  },
  {
    id: "tighten-connector",
    targetId: "tool",
    message: "Turn clockwise to tighten the bolt by hand.",
    shortLabel: "Tighten the bolt",
    event: "connector_tightened",
  },
  {
    id: "install-four-legs",
    targetId: "partsTray",
    message: "Continue assembling.",
    shortLabel: "Install all four legs",
    event: "all_legs_installed",
  },
];

export const SECONDARY_TARGET_BY_STEP: Record<string, TutorialTargetId> = {
  "visual-stuck-help": "auto",
  "hud-stuck-help": "auto",
};

export const FUTURE_TUTORIAL_REQUIREMENTS = {
  saveProgress: "Future requirement — do not implement yet.",
  floatPushBack:
    "The Put back button now exists in BOTH play and the tutorial fork; this entry only tracks whether a dedicated tutorial step should teach it.",
} as const;

export const TUTORIAL_CONTENT_DECISIONS = {
  display:
    "Teach Background through the real Settings panel after the first placed part.",
  guidedInstructions:
    "Teach Standard/Simple as the primary choice and mention Show instructions.",
  sequencing:
    "Keep the opening to the core loop; teach preferences in a separate post-core walkthrough.",
} as const;

export const GRIP_STEP_ID = "hold-like-controller";

export const tutorialStepsFor = (context: TutorialContext): TutorialStep[] => {
  const steps = composeTutorialSteps(context);
  return context.tablet ? steps.filter((s) => s.id !== GRIP_STEP_ID) : steps;
};

const composeTutorialSteps = (context: TutorialContext): TutorialStep[] => {
  if (context.profile === "visual") return VISUAL_TUTORIAL_STEPS;
  if (context.profile === "clearPath") return CLEAR_PATH_TUTORIAL_STEPS;
  if (context.profile === "control") return CONTROL_TUTORIAL_STEPS;
  if (context.profile === "momentum") return MOMENTUM_TUTORIAL_STEPS;

  const core = TUTORIAL_STEPS.filter(
    (step) => !step.when || step.when(context),
  );
  const openingSteps = core.slice(0, 3);
  const remainingCore = core.slice(3);
  const finishingStep = remainingCore.at(-1);
  const assemblySteps = finishingStep
    ? remainingCore.slice(0, -1)
    : remainingCore;
  const sharedHudSteps = SHARED_HUD_TUTORIAL_STEPS;
  const settingsSteps = SETTINGS_TUTORIAL_STEPS.filter(
    (step) => !step.when || step.when(context),
  );

  return [
    ...openingSteps,
    ...settingsSteps,
    ...sharedHudSteps,
    ...assemblySteps,
    ...(finishingStep ? [finishingStep] : []),
  ];
};

export const settingsTutorialStepsFor = (
  _context: TutorialContext,
): TutorialStep[] =>
  [];

export function messageForToolStep(kind: ToolTutorialKind | null) {
  if (kind === "press")
    return "Tap the hand four times to press the part into place.";
  if (kind === "tap") return "Tap repeatedly to drive it in.";
  if (kind === "beat") return "Swipe up or down to continue.";
  return "Trace the circle clockwise to tighten the connector.";
}