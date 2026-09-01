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

const STEP_ADVANCE_DELAY_MS = 1200;

const EVENT_SETTLE_DELAY_MS: Partial<Record<TutorialEvent, number>> = {
  connector_tightened: 450,
  all_legs_installed: 500,
  assembly_reoriented: 500,
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
  attentionOverlayActive: boolean;
  lastCompletedStepLabel: string | null;
  stepRewardsClaimed: number;
  acceptsEventsAfter: number;
  pendingCompletionStepId: string | null;
  pendingAdvanceStepId: string | null;
  latchedEvents: TutorialEvent[];
  configureTutorial: (context: TutorialContext) => void;
  beginSettingsTutorial: () => void;
  skipSettingsTutorial: () => void;
  completeEvent: (event: TutorialEvent) => void;
  completeCurrentStep: () => void;
  skip: () => void;
  dismissStepReward: () => void;
  dismissReward: () => void;
  setAttentionOverlayActive: (active: boolean) => void;
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
  attentionOverlayActive: false,
  lastCompletedStepLabel: null,
  stepRewardsClaimed: 0,
  acceptsEventsAfter: 0,
  pendingCompletionStepId: null,
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
      pendingCompletionStepId: null,
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
      pendingCompletionStepId,
      pendingAdvanceStepId,
      latchedEvents,
    } = get();
    if (skipped || completed) return;
    const step = steps[currentIndex];
    if (
      pendingCompletionStepId ||
      pendingAdvanceStepId ||
      Date.now() < acceptsEventsAfter
    ) {
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
    const settleDelay = EVENT_SETTLE_DELAY_MS[event] ?? 0;
    if (settleDelay > 0) {
      set({ pendingCompletionStepId: step.id });
      setTimeout(() => {
        const state = get();
        if (
          state.skipped ||
          state.completed ||
          state.pendingCompletionStepId !== step.id ||
          state.steps[state.currentIndex]?.id !== step.id
        ) {
          return;
        }
        set({
          pendingCompletionStepId: null,
          acceptsEventsAfter: 0,
          latchedEvents: state.latchedEvents.filter(
            (latchedEvent) => latchedEvent !== event,
          ),
        });
        get().completeCurrentStep();
      }, settleDelay);
      return;
    }
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
      pendingCompletionStepId: null,
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
            rewardReady: false,
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
        const nextStep = state.steps[nextIndex];
        const { latchedEvents } = get();
        if (nextStep && latchedEvents.includes(nextStep.event)) {
          const afterLatchedIndex = nextIndex + 1;
          const remainingLatchedEvents = latchedEvents.filter(
            (event) => event !== nextStep.event,
          );
          const claimedRewards =
            get().stepRewardsClaimed + TUTORIAL_STEP_REWARD_TOKENS;
          if (afterLatchedIndex >= state.steps.length) {
            set({
              completed: true,
              settingsReady: state.phase === "core",
              rewardReady: state.phase === "settings",
              stepRewardReady: false,
              lastCompletedStepLabel: `${nextIndex + 1}/${state.steps.length}`,
              stepRewardsClaimed: claimedRewards,
              acceptsEventsAfter: 0,
              pendingAdvanceStepId: null,
              latchedEvents: remainingLatchedEvents,
            });
          } else {
            set({
              currentIndex: afterLatchedIndex,
              stepRewardReady: false,
              lastCompletedStepLabel: `${nextIndex + 1}/${state.steps.length}`,
              stepRewardsClaimed: claimedRewards,
              acceptsEventsAfter: 0,
              pendingAdvanceStepId: null,
              latchedEvents: remainingLatchedEvents,
            });
          }
        } else {
          set({
            currentIndex: nextIndex,
            acceptsEventsAfter: 0,
            pendingAdvanceStepId: null,
            ...(latchedEvents.length ? { latchedEvents: [] } : {}),
          });
        }
      }
    }, STEP_ADVANCE_DELAY_MS);
  },
  skip: () =>
    set({
      skipped: true,
      rewardReady: false,
      stepRewardReady: false,
      pendingCompletionStepId: null,
      pendingAdvanceStepId: null,
      latchedEvents: [],
    }),
  dismissStepReward: () => set({ stepRewardReady: false }),
  dismissReward: () => set({ rewardReady: false }),
  setAttentionOverlayActive: (attentionOverlayActive) =>
    set({ attentionOverlayActive }),
  resetTutorial: () => set(resetState(get().context)),
}));