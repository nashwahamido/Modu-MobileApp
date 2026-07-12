import { create } from 'zustand';
import { TUTORIAL_STEP_REWARD_TOKENS, TUTORIAL_STEPS, type TutorialEvent } from './steps';

interface TutorialState {
  currentIndex: number;
  skipped: boolean;
  completed: boolean;
  rewardReady: boolean;
  stepRewardReady: boolean;
  lastCompletedStepLabel: string | null;
  stepRewardsClaimed: number;
  acceptsEventsAfter: number;
  pendingAdvanceStepId: string | null;
  completeEvent: (event: TutorialEvent) => void;
  completeCurrentStep: () => void;
  skip: () => void;
  dismissStepReward: () => void;
  dismissReward: () => void;
  resetTutorial: () => void;
}

export const useTutorialStore = create<TutorialState>()((set, get) => ({
  currentIndex: 0,
  skipped: false,
  completed: false,
  rewardReady: false,
  stepRewardReady: false,
  lastCompletedStepLabel: null,
  stepRewardsClaimed: 0,
  acceptsEventsAfter: 0,
  pendingAdvanceStepId: null,
  completeEvent: (event) => {
    const { currentIndex, skipped, completed, acceptsEventsAfter, pendingAdvanceStepId } = get();
    if (skipped || completed) return;
    if (pendingAdvanceStepId) return;
    if (Date.now() < acceptsEventsAfter) return;
    const step = TUTORIAL_STEPS[currentIndex];
    if (!step || step.event !== event) return;
    get().completeCurrentStep();
  },
  completeCurrentStep: () => {
    const { currentIndex, skipped, completed, acceptsEventsAfter, pendingAdvanceStepId } = get();
    if (skipped || completed) return;
    if (pendingAdvanceStepId) return;
    if (Date.now() < acceptsEventsAfter) return;
    const step = TUTORIAL_STEPS[currentIndex];
    if (!step) return;
    const label = `${currentIndex + 1}/${TUTORIAL_STEPS.length}`;
    const completedIndex = currentIndex;
    set({
      stepRewardReady: true,
      lastCompletedStepLabel: label,
      stepRewardsClaimed: get().stepRewardsClaimed + TUTORIAL_STEP_REWARD_TOKENS,
      acceptsEventsAfter: Date.now() + 1600,
      pendingAdvanceStepId: step.id,
    });
    setTimeout(() => {
      const state = get();
      if (state.skipped || state.completed) return;
      if (state.pendingAdvanceStepId !== step.id || state.currentIndex !== completedIndex) return;
      const nextIndex = completedIndex + 1;
      if (nextIndex >= TUTORIAL_STEPS.length) {
        set({ completed: true, rewardReady: true, pendingAdvanceStepId: null });
      } else {
        set({ currentIndex: nextIndex, pendingAdvanceStepId: null });
      }
    }, 1200);
  },
  skip: () => set({ skipped: true, rewardReady: false, stepRewardReady: false, pendingAdvanceStepId: null }),
  dismissStepReward: () => set({ stepRewardReady: false }),
  dismissReward: () => set({ rewardReady: false }),
  resetTutorial: () =>
    set({
      currentIndex: 0,
      skipped: false,
      completed: false,
      rewardReady: false,
      stepRewardReady: false,
      lastCompletedStepLabel: null,
      stepRewardsClaimed: 0,
      acceptsEventsAfter: 0,
      pendingAdvanceStepId: null,
    }),
}));
