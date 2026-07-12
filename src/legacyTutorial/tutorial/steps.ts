export type TutorialTargetId = 'scene' | 'joystick' | 'recenter' | 'partsTray' | 'assemblyArea' | 'tool';

export type TutorialEvent =
  | 'joystick_moved'
  | 'camera_recentered'
  | 'pinch_zoomed'
  | 'part_picked_up'
  | 'part_snapped'
  | 'tool_used';

export type ToolTutorialKind = 'tighten' | 'tap' | 'beat';

export interface TutorialStep {
  id: string;
  targetId: TutorialTargetId;
  message: string;
  event: TutorialEvent;
}

export const TUTORIAL_REWARD_TOKENS = 50;
export const TUTORIAL_STEP_REWARD_TOKENS = 10;

export const TUTORIAL_STEPS: TutorialStep[] = [
  {
    id: 'long-press-part',
    targetId: 'partsTray',
    message: 'Long-press a panel card to pick it up.',
    event: 'part_picked_up',
  },
  {
    id: 'drag-and-snap',
    targetId: 'assemblyArea',
    message: 'Keep holding and drag the panel into the cabinet frame. Release when it lines up to snap.',
    event: 'part_snapped',
  },
  {
    id: 'rotate-with-joystick',
    targetId: 'joystick',
    message: 'Use the left joystick to rotate around the cabinet.',
    event: 'joystick_moved',
  },
  {
    id: 'recenter-camera',
    targetId: 'recenter',
    message: 'Lost your view? Tap Recenter to return to the default angle.',
    event: 'camera_recentered',
  },
  {
    id: 'pinch-to-zoom',
    targetId: 'scene',
    message: 'Pinch with two fingers to zoom in and check the details.',
    event: 'pinch_zoomed',
  },
  {
    id: 'secure-with-tool',
    targetId: 'tool',
    message: 'Use the tool control to secure the connector.',
    event: 'tool_used',
  },
];

export function messageForToolStep(kind: ToolTutorialKind | null) {
  if (kind === 'tap') return 'Tap repeatedly to drive it in.';
  if (kind === 'beat') return 'Swipe up or down to continue.';
  return 'Trace the circle clockwise to tighten the connector.';
}
