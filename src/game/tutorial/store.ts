import { create } from "zustand";
import {
  TUTORIAL_STEP_REWARD_TOKENS,
  settingsTutorialStepsFor,
  tutorialStepsFor,
  type TutorialContext,
  type TutorialEvent,
  type TutorialStep,
} from "./steps";

const DEFAULT_CONTEXT: TutorialContext = {
  profile: "control",
  mode: "free",
  manualTools: true,
  softHints: true,
  releaseBehavior: "autoReturn",
  oneFingerPanEnabled: false,
};

interface TutorialState {
  steps: TutorialStep[];
  context: TutorialContext;
  phase: "core" | "settings";
  currentIndex: number;
  skipped: boolean;
  completed: boolean;
  rewardReady: boolean;
  settingsReady: boolean;
  stepRewardReady: boolean;
  lastCompletedStepLabel: string | null;
  stepRewardsClaimed: number;
  acceptsEventsAfter: number;
  pendingAdvanceStepId: string | null;
  configureTutorial: (context: TutorialContext) => void;
  beginSettingsTutorial: () => void;
  skipSettingsTutorial: () => void;
  completeEvent: (event: TutorialEvent) => void;
  completeCurrentStep: () => void;
  skip: () => void;
  dismissStepReward: () => void;
  dismissReward: () => void;
  resetTutorial: () => void;
}

const resetState = (context: TutorialContext) => ({
  steps: tutorialStepsFor(context),
  context,
  phase: "core" as const,
  currentIndex: 0,
  skipped: false,
  completed: false,
  rewardReady: false,
  settingsReady: false,
  stepRewardReady: false,
  lastCompletedStepLabel: null,
  stepRewardsClaimed: 0,
  acceptsEventsAfter: 0,
  pendingAdvanceStepId: null,
});

export const useTutorialStore = create<TutorialState>()((set, get) => ({
  ...resetState(DEFAULT_CONTEXT),
  configureTutorial: (context) => set(resetState(context)),
  beginSettingsTutorial: () => {
    const { context } = get();
    const steps = settingsTutorialStepsFor(context);
    if (!steps.length) {
      set({ settingsReady: false, rewardReady: true });
      return;
    }
    set({
      steps,
      phase: "settings",
      currentIndex: 0,
      skipped: false,
      completed: false,
      rewardReady: false,
      settingsReady: false,
      stepRewardReady: false,
      lastCompletedStepLabel: null,
      acceptsEventsAfter: Date.now() + 400,
      pendingAdvanceStepId: null,
    });
  },
  skipSettingsTutorial: () =>
    set({ settingsReady: false, rewardReady: true }),
  completeEvent: (event) => {
    const {
      steps,
      currentIndex,
      skipped,
      completed,
      acceptsEventsAfter,
      pendingAdvanceStepId,
    } = get();
    if (skipped || completed || pendingAdvanceStepId) return;
    if (Date.now() < acceptsEventsAfter) return;
    const step = steps[currentIndex];
    if (!step || step.event !== event) return;
    get().completeCurrentStep();
  },
  completeCurrentStep: () => {
    const {
      steps,
      currentIndex,
      skipped,
      completed,
      acceptsEventsAfter,
      pendingAdvanceStepId,
    } = get();
    if (skipped || completed || pendingAdvanceStepId) return;
    if (Date.now() < acceptsEventsAfter) return;
    const step = steps[currentIndex];
    if (!step) return;
    const label = `${currentIndex + 1}/${steps.length}`;
    const completedIndex = currentIndex;
    set({
      stepRewardReady: true,
      lastCompletedStepLabel: label,
      stepRewardsClaimed:
        get().stepRewardsClaimed + TUTORIAL_STEP_REWARD_TOKENS,
      acceptsEventsAfter: Date.now() + 1600,
      pendingAdvanceStepId: step.id,
    });
    setTimeout(() => {
      const state = get();
      if (state.skipped || state.completed) return;
      if (
        state.pendingAdvanceStepId !== step.id ||
        state.currentIndex !== completedIndex
      )
        return;
      const nextIndex = completedIndex + 1;
      if (nextIndex >= state.steps.length) {
        if (state.phase === "core") {
          set({
            completed: true,
            settingsReady: true,
            pendingAdvanceStepId: null,
          });
        } else {
          set({
            completed: true,
            rewardReady: true,
            pendingAdvanceStepId: null,
          });
        }
      } else {
        set({ currentIndex: nextIndex, pendingAdvanceStepId: null });
      }
    }, 1200);
  },
  skip: () =>
    set({
      skipped: true,
      rewardReady: false,
      stepRewardReady: false,
      pendingAdvanceStepId: null,
    }),
  dismissStepReward: () => set({ stepRewardReady: false }),
  dismissReward: () => set({ rewardReady: false }),
  resetTutorial: () => set(resetState(get().context)),
}));
