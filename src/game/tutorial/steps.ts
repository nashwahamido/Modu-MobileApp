export type TutorialTargetId =
  | "scene"
  | "joystick"
  | "recenter"
  | "partsTray"
  | "assemblyArea"
  | "tool"
  | "toolbar"
  | "hint"
  | "toggles"
  | "return"
  | "instructionStyle";

export type TutorialEvent =
  | "joystick_moved"
  | "camera_recentered"
  | "pinch_zoomed"
  | "one_finger_panned"
  | "part_picked_up"
  | "part_snapped"
  | "part_returned"
  | "auto_view_toggled"
  | "focus_mode_toggled"
  | "toolbar_used"
  | "hint_requested"
  | "instruction_style_selected"
  | "tool_used";

export type ToolTutorialKind = "tighten" | "tap" | "beat";
export type TutorialAudioSource = number | { uri: string };

export interface TutorialContext {
  audience: "control" | "guided";
  releaseBehavior: "float" | "autoReturn";
  oneFingerPanEnabled: boolean;
  focusMode: boolean;
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
    id: "guided-instruction-style",
    targetId: "instructionStyle",
    message:
      "Choose the instruction style that feels clearest. You can change it again later.",
    event: "instruction_style_selected",
    when: ({ audience }) => audience === "guided",
  },
  {
    id: "control-hint",
    targetId: "hint",
    message: "Tap Hint whenever you want a calm suggestion for the next step.",
    event: "hint_requested",
    when: ({ audience }) => audience === "control",
  },
  {
    id: "control-toolbar",
    targetId: "toolbar",
    message:
      "Open the toolbar and choose a tool. The orange outline shows what the current step needs.",
    event: "toolbar_used",
    when: ({ audience }) => audience === "control",
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
    id: "one-finger-pan",
    targetId: "scene",
    message: "Drag one finger across empty space to pan the workbench.",
    event: "one_finger_panned",
    when: ({ oneFingerPanEnabled }) => oneFingerPanEnabled,
  },
  {
    id: "return-floating-part",
    targetId: "return",
    message:
      "Release the next panel away from its target, then tap Put back to return it to the tray.",
    event: "part_returned",
    when: ({ releaseBehavior }) => releaseBehavior === "float",
  },
  {
    id: "auto-return-part",
    targetId: "assemblyArea",
    message:
      "Release the next panel away from its target. Auto-return safely sends it back to the tray.",
    event: "part_returned",
    when: ({ releaseBehavior }) => releaseBehavior === "autoReturn",
  },
  {
    id: "auto-view",
    targetId: "toggles",
    message: "Toggle Auto-View to let the camera frame the next open target.",
    event: "auto_view_toggled",
  },
  {
    id: "focus-mode",
    targetId: "toggles",
    message: "Toggle Focus to reduce the screen to the current action.",
    event: "focus_mode_toggled",
  },
  {
    id: "secure-with-tool",
    targetId: "tool",
    message: "Use the tool control to secure the connector.",
    event: "tool_used",
  },
];

export const FUTURE_TUTORIAL_REQUIREMENTS = {
  saveProgress: "Future requirement — do not implement yet.",
  renderStyleGuidance:
    "Open product question — not a mandatory tutorial step.",
} as const;

export const tutorialStepsFor = (context: TutorialContext): TutorialStep[] => {
  const steps = TUTORIAL_STEPS.filter(
    (step) => !step.when || step.when(context),
  );
  if (!context.focusMode) return steps;
  const focusIndex = steps.findIndex((step) => step.id === "focus-mode");
  const autoViewIndex = steps.findIndex((step) => step.id === "auto-view");
  if (focusIndex < 0 || autoViewIndex < 0 || focusIndex < autoViewIndex)
    return steps;
  const reordered = [...steps];
  const [focusStep] = reordered.splice(focusIndex, 1);
  reordered.splice(autoViewIndex, 0, focusStep);
  return reordered;
};

export function messageForToolStep(kind: ToolTutorialKind | null) {
  if (kind === "tap") return "Tap repeatedly to drive it in.";
  if (kind === "beat") return "Swipe up or down to continue.";
  return "Trace the circle clockwise to tighten the connector.";
}
