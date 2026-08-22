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
  /** Undo and Recenter together — one rectangle over the pair, taught as a single idea. */
  | "undoRecenter"
  /** The Auto button. Its own target rather than part of a row: Auto and Spot sit at opposite ends
   *  of the toggles row with Focus between them, so a single rectangle over "the two the copy names"
   *  would light Focus as well. The stuck-help step rings both of these separately. */
  | "auto"
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
  | "tool_used"
  /** A step the player READS rather than does: any tap on the screen closes it. Used where the
   *  tutorial is explaining a control's purpose instead of asking for it to be exercised. */
  | "controls_acknowledged"
  /** The Settings panel was OPENED and then closed again — by Done or by tapping outside it.
   *  Distinct from backdrop_changed and instruction_preferences_changed, which require the player to
   *  actually change a setting: this one asks them to look, not to commit to anything. */
  | "settings_browsed";

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
  // THE LAST STEP. The tutorial used to close on a "stand-table-upright" beat, which was a swipe
  // card for an action that moved nothing — removed 2026-08-19 along with `finishing_checks` on
  // every furniture. Installing the fourth leg finishes the table, so it finishes the tutorial too,
  // and the copy says so rather than pointing at a next thing that no longer exists.
  {
    id: "install-four-legs",
    targetId: "partsTray",
    message:
      "Install the leg onto the bolt. Repeat the bolt and leg steps for all four legs to finish the table.",
    shortLabel: "Install all four legs",
    event: "all_legs_installed",
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
  // Background, not Released part: the in-build panel no longer carries the dev interaction rows, and this is the one step every profile gets — Control pins mode "free", which filters the instructions step below out for it. Teaching Background through the real panel is also the standing content decision (TUTORIAL_CONTENT_DECISIONS.display).
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

/**
 * LUMI's own run — the visual profile, and the only profile with a hand-written sequence.
 *
 * A SEPARATE LIST rather than `when` clauses on the shared ones, because this run merges steps the
 * others keep apart: pick-up and drag are one instruction here, and so are the two Settings steps.
 * Expressing that as filters on TUTORIAL_STEPS would have meant a merged step that only ever shows
 * for one profile sitting in the list every profile reads, and `tutorialStepsFor`'s slice(0, 3)
 * silently re-cutting the opening for everyone else the moment the count changed.
 *
 * Every step keeps the two properties that make the tutorial a tutorial: a `targetId` the spotlight
 * rings, and an `event` that only fires when the player has actually DONE the thing. Nothing here
 * advances on a tap-through.
 *
 * No `shortLabel` on any of them, deliberately: the visual profile renders shortLabel in preference
 * to message (MascotGuideOverlay.visualMessageForStep), so a short label here would replace the
 * sentences below with three-word stubs.
 */
export const VISUAL_TUTORIAL_STEPS: TutorialStep[] = [
  // The grip comes first for every profile — the controls that follow assume two thumbs on the edges.
  {
    // THE ONLY STEP IN THIS LIST WITH A shortLabel, and deliberately: the visual profile renders
    // shortLabel in preference to message, which for every other step would swap the authored
    // sentence for a stub. Here it is the opposite — the card the player actually reads is
    // GripCoach's own ("Hold it like a controller", with the hands art and the Got it button), so
    // `message` is never shown and the label is what appears wherever the step is named.
    id: "hold-like-controller",
    targetId: "device",
    message: "Hold your device with both hands, like a game controller.",
    shortLabel: "Get comfortable",
    event: "grip_acknowledged",
  },
  {
    // ONE step where the others have two. The spotlight rings the tray, which is where the gesture
    // starts; it advances on `part_snapped`, not `part_picked_up`, so a player who lifts a part and
    // puts it back down again has not finished the step.
    id: "visual-pickup-and-place",
    targetId: "partsTray",
    message:
      "Long-press a part to drag to canvas then release it in the middle circle.",
    event: "part_snapped",
  },
  {
    // Both Settings steps folded into one, and a BROWSE rather than a change. It used to advance on
    // `backdrop_changed`, which meant the player had to pick a different background to get past a
    // card that never told them to — and left them with a backdrop they had not chosen. Opening the
    // panel and closing it again is the whole ask now.
    id: "visual-settings",
    targetId: "settings",
    message: "You can adjust accessibility features and aesthetics in settings.",
    event: "settings_browsed",
  },
  {
    // `focus_mode_toggled` fires on the FIRST toggle, so the step closes when Focus goes on. The
    // second half of the sentence tells the player how to come back rather than gating on it —
    // there is no "toggled twice" event, and leaving them in focus mode with no way out is worse.
    id: "hud-focus",
    targetId: "focus",
    message:
      'Reduce UI with "Focus", press again to bring it back.',
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
    // LACK's bolt is hand-tightened: hardware.ts calls it "spun in by hand".
    id: "tighten-connector",
    targetId: "tool",
    message: "Turn clockwise to tighten the bolt by hand.",
    event: "connector_tightened",
  },
  {
    // A step to READ, not to perform — and deliberately so. Undo and Recenter are the two controls a
    // player wants when something has gone wrong, which is the worst moment to be meeting them for
    // the first time; but making the tutorial demand an undo would force a player to break a build
    // they are in the middle of getting right. So it explains, rings both buttons, and closes on any
    // tap (see `controls_acknowledged`).
    id: "visual-undo-recenter",
    targetId: "undoRecenter",
    message:
      'Press "Undo" to go back, or "Recenter" to adjust the view.',
    event: "controls_acknowledged",
  },
  {
    // BEFORE the finishing step, not after it. It is a safety net, and a safety net offered once the
    // table is already built is a footnote — the player has nothing left to be stuck on. Here it
    // lands with three legs still to go, which is exactly when it might be needed.
    //
    // Rings SPOT and AUTO — the two the copy names, and only those. The overlay draws a second ring
    // on the `auto` frame for this step; Focus sits between them in the row and stays unlit.
    //
    // READ-ONLY (`controls_acknowledged`): a tap anywhere closes it, and so does pressing either
    // button. Requiring the player to press one would be worse than it sounds — Spot is a hint they
    // may not need and Auto skips a step they may want to do, so a step that demands one makes the
    // player use a crutch to be told the crutch exists. Auto also does not render outside __DEV__ or
    // a showcase build, so waiting on it would trap a real player forever.
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
  // Lumi runs its own hand-written sequence — see VISUAL_TUTORIAL_STEPS. Returned whole rather than
  // composed, because its merged steps do not survive the slicing below.
  if (context.profile === "visual") return VISUAL_TUTORIAL_STEPS;

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
  // NONE for Lumi. Her run teaches Settings as its own step (`visual-settings`), so the walkthrough
  // this composes would be a second one — and it runs AFTER the table is finished, between the last
  // leg and the reward. That is why finishing the build appeared to do nothing: the tutorial was not
  // over, it had moved into a settings phase the player had already been through.
  //
  // An empty list is the supported way to say "skip it": beginSettingsTutorial checks for exactly
  // that and goes straight to rewardReady.
  context.profile === "visual"
    ? []
    : SETTINGS_TUTORIAL_STEPS.filter((step) => !step.when || step.when(context));

export function messageForToolStep(kind: ToolTutorialKind | null) {
  if (kind === "press")
    return "Tap the hand four times to press the part into place.";
  if (kind === "tap") return "Tap repeatedly to drive it in.";
  if (kind === "beat") return "Swipe up or down to continue.";
  return "Trace the circle clockwise to tighten the connector.";
}