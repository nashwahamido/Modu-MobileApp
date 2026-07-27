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
};

// How long a completed step shows its reward before advancing. The event cooldown
// matches it exactly, so the only window that blocks (and latches) events is the
// pending-advance one — which completeCurrentStep drains on advance. A longer
// cooldown would reopen a gap where an event is latched with nothing to replay it.
const STEP_ADVANCE_DELAY_MS = 1200;

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
  /** Events fired during a step's reward/cooldown window, replayed once the step they belong to becomes current (so a fast pick-up → snap gesture isn't lost). */
  latchedEvents: TutorialEvent[];
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
  latchedEvents: [],
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
      latchedEvents: [],
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
      latchedEvents,
    } = get();
    if (skipped || completed) return;
    const step = steps[currentIndex];
    // While the previous step's reward is still animating (pendingAdvanceStepId)
    // or we're inside its cooldown, an event that belongs to the current or the
    // very next step would otherwise be dropped. Since the action behind it (a
    // placed part, say) usually can't happen again, latch it and replay it when
    // that step becomes current — see the advance in completeCurrentStep.
    if (pendingAdvanceStepId || Date.now() < acceptsEventsAfter) {
      const upcoming = steps[currentIndex + 1]?.event;
      if (
        (step?.event === event || upcoming === event) &&
        !latchedEvents.includes(event)
      ) {
        set({ latchedEvents: [...latchedEvents, event] });
      }
      return;
    }
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
      acceptsEventsAfter: Date.now() + STEP_ADVANCE_DELAY_MS,
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
            settingsReady: false,
            rewardReady: true,
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
        // Replay an event that fired early (during this step's reward) and
        // belongs to the now-current step; otherwise clear any stale latch.
        const nextStep = state.steps[nextIndex];
        const { latchedEvents } = get();
        if (nextStep && latchedEvents.includes(nextStep.event)) {
          set({
            latchedEvents: latchedEvents.filter((e) => e !== nextStep.event),
            acceptsEventsAfter: 0,
          });
          get().completeCurrentStep();
        } else if (latchedEvents.length) {
          set({ latchedEvents: [] });
        }
      }
    }, STEP_ADVANCE_DELAY_MS);
  },
  skip: () =>
    set({
      skipped: true,
      rewardReady: false,
      stepRewardReady: false,
      pendingAdvanceStepId: null,
      latchedEvents: [],
    }),
  dismissStepReward: () => set({ stepRewardReady: false }),
  dismissReward: () => set({ rewardReady: false }),
  resetTutorial: () => set(resetState(get().context)),
}));
