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
  /** The whole screen, for the grip step: what it teaches is the DEVICE, not a control on it. */
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
  shortLabel?: string;
  event: TutorialEvent;
  audio?: TutorialAudioSource;
  when?: (context: TutorialContext) => boolean;
}

export const TUTORIAL_REWARD_TOKENS = 80;
export const TUTORIAL_STEP_REWARD_TOKENS = 10;

/** The short, first-run core loop. Preference education stays contextual. */
export const TUTORIAL_STEPS: TutorialStep[] = [
  {
    // FIRST, before anything on screen. Every control after this assumes two thumbs on the edges -
    // the joystick is bottom-left, the tray bottom-right - and a player holding the phone one-handed
    // to read finds the first drag awkward for a reason the tutorial never mentions.
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
    // LACK's bolt is hand-tightened: hardware.ts calls it "spun in by hand", and the tool override
    // that put an Allen key in the toolbox and the scene is gone.
    message: "Turn clockwise to tighten the bolt by hand.",
    shortLabel: "Tighten the bolt",
    event: "connector_tightened",
  },
  {
    id: "install-four-legs",
    targetId: "partsTray",
    message:
      "Install the leg onto the bolt. Repeat the bolt and leg steps for all four legs.",
    shortLabel: "Install all four legs",
    event: "all_legs_installed",
  },
  {
    id: "stand-table-upright",
    targetId: "beatControl",
    message:
      "All four legs are installed. Swipe down on the orange card to stand the table upright and finish.",
    shortLabel: "Stand the table upright",
    event: "assembly_reoriented",
  },
];

/** Canonical short copy for recording voice-over; audio assets can be attached later. */
export const TUTORIAL_VOICE_OVER_SCRIPT = TUTORIAL_STEPS.map(
  ({ id, message }) => ({ id, text: message }),
);

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
];

/** Momentum and Control explicitly teach the HUD controls requested in the review. */
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
    // Spot no longer moves the camera. It plays a ghost of the next part travelling into its socket,
    // so the copy has to describe a demonstration rather than a framing.
    message: "Tap Spot to see the next part move into place.",
    shortLabel: "Try Spot",
    event: "spot_used",
  },
];

/** Hint remains a Control-only affordance; Momentum keeps its lighter flow. */
export const CONTROL_TUTORIAL_STEPS: TutorialStep[] = [
  {
    id: "control-hint",
    targetId: "hint",
    message: "Tap Hint whenever you want a suggestion for the next action.",
    shortLabel: "Try Hint",
    event: "hint_requested",
  },
];

/** Optional preference walkthrough offered after the short core tutorial. */
export const SETTINGS_TUTORIAL_STEPS: TutorialStep[] = [
  // Background, not Released part: the in-build panel no longer carries the dev interaction rows, and this is the step every profile gets — Control pins mode "free", which filters the instructions step out, and Control/Momentum are filtered out of the two below. Teaching Background through the real panel is also the standing content decision (TUTORIAL_CONTENT_DECISIONS.display).
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
  // Focus is taught by hud-focus, on the chip itself — the in-build panel no longer carries the row.
];

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

export const tutorialStepsFor = (context: TutorialContext): TutorialStep[] => {
  const core = TUTORIAL_STEPS.filter(
    (step) => !step.when || step.when(context),
  );
  // Three, not two: the grip step precedes the first two touch steps, and the Settings
  // introduction still belongs after the tabletop has been PLACED, not merely picked up.
  const openingSteps = core.slice(0, 3);
  const remainingCore = core.slice(3);
  const finishingStep = remainingCore.at(-1);
  const assemblySteps = finishingStep
    ? remainingCore.slice(0, -1)
    : remainingCore;
  // Every profile learns Focus, because every profile SEES the Focus chip — ToggleChips renders unconditionally in play, and the tutorial fork now matches it. The rest of the shared HUD run stays with the two profiles built around user-directed controls.
  const sharedHudSteps =
    context.profile === "control" || context.profile === "momentum"
      ? SHARED_HUD_TUTORIAL_STEPS
      : SHARED_HUD_TUTORIAL_STEPS.filter((step) => step.id === "hud-focus");
  // Hint is taught where it is wanted, not on the HUD tour: the step follows tighten-connector, the first moment the player is mid-action and could actually want a suggestion.
  const assemblyStepsWithContextualHint = assemblySteps.flatMap((step) =>
    context.profile === "control" && step.id === "tighten-connector"
      ? [step, ...CONTROL_TUTORIAL_STEPS]
      : [step],
  );
  const settingsSteps = SETTINGS_TUTORIAL_STEPS.filter(
    (step) => !step.when || step.when(context),
  );

  // Introduce the real Settings panel once the tabletop is present, then return
  // to the profile-specific controls and the rest of the assembly sequence.
  return [
    ...openingSteps,
    ...settingsSteps,
    ...sharedHudSteps,
    ...assemblyStepsWithContextualHint,
    ...(finishingStep ? [finishingStep] : []),
  ];
};

export const settingsTutorialStepsFor = (
  context: TutorialContext,
): TutorialStep[] =>
  SETTINGS_TUTORIAL_STEPS.filter((step) => !step.when || step.when(context));

export function messageForToolStep(kind: ToolTutorialKind | null) {
  if (kind === "press")
    return "Tap the hand four times to press the part into place.";
  if (kind === "tap") return "Tap repeatedly to drive it in.";
  if (kind === "beat") return "Swipe up or down to continue.";
  return "Trace the circle clockwise to tighten the connector.";
}
