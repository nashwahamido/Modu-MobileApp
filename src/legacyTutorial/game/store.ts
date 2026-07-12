import { create } from 'zustand';
import { ACTIONS } from './assembly';
import { availableActions, currentStage } from './availability';
import type { AssemblyAction, Stage } from './assembly';
import type { FitState } from './fit';

export type Phase = 'idle' | 'held';
export type MissedDropBehavior = 'keepOnCanvas' | 'returnToTray';
export type MissedDropPromptKind = 'missedDrop' | 'successTip';

/** Total clockwise rotation required to fully tighten a fastener. */
export const TIGHTEN_TOTAL_DEG = 720;

/** Mallet hits required to drive a tool-secured part flush. */
export const MALLET_TAPS = 5;

interface GameState {
  completed: string[];
  bonusTokens: number;
  tutorialRewardClaimed: boolean;
  phase: Phase;
  heldActionId: string | null;
  fitState: FitState;
  /** Group socket the held part is currently nearest to (drives ghost + snap). */
  matchedActionId: string | null;
  /** Whether the player has set the leg/ring base aside (into the tray) during the seat build. */
  baseStashed: boolean;
  /** Accumulated tighten rotation per tighten-action id, in degrees. */
  tightenDeg: Record<string, number>;
  /** Prototype user setting: what happens when a dragged part is released away from the target. */
  missedDropBehavior: MissedDropBehavior;
  missedDropPromptAnswered: boolean;
  missedDropPromptVisible: boolean;
  missedDropPromptKind: MissedDropPromptKind;
  completeAction: (id: string) => void;
  reset: () => void;
  available: () => AssemblyAction[];
  stage: () => Stage;
  progress: () => { completedCount: number; totalCount: number };
  beginPickup: (actionId: string) => void;
  setFitState: (fitState: FitState) => void;
  /** Per-frame drag feedback: fit state plus the nearest group socket. */
  setDragFit: (fitState: FitState, matchedActionId: string | null) => void;
  setBaseStashed: (baseStashed: boolean) => void;
  releaseHeld: () => 'snap' | 'recover';
  cancelHeld: () => void;
  setMissedDropBehavior: (behavior: MissedDropBehavior) => void;
  showMissedDropPrompt: (kind?: MissedDropPromptKind) => void;
  dismissMissedDropPrompt: () => void;
  chooseMissedDropBehavior: (behavior: MissedDropBehavior) => void;
  addTightenDeg: (actionId: string, deg: number) => void;
  addTutorialStepReward: (amount: number) => void;
  claimTutorialReward: (amount: number) => void;
}

export const useGameStore = create<GameState>()((set, get) => ({
  completed: [],
  bonusTokens: 0,
  tutorialRewardClaimed: false,
  phase: 'idle',
  heldActionId: null,
  fitState: 'idle',
  matchedActionId: null,
  baseStashed: false,
  tightenDeg: {},
  missedDropBehavior: 'keepOnCanvas',
  missedDropPromptAnswered: false,
  missedDropPromptVisible: false,
  missedDropPromptKind: 'missedDrop',
  completeAction: (id) => {
    const done = new Set(get().completed);
    if (done.has(id)) return;
    if (!availableActions(done).some((a) => a.id === id)) return;
    const shouldShowSuccessTip =
      done.size === 0 && !get().missedDropPromptAnswered && !get().missedDropPromptVisible;
    set({ completed: [...get().completed, id] });
    if (shouldShowSuccessTip) {
      setTimeout(() => {
        const state = get();
        if (state.completed.length === 0 || state.missedDropPromptAnswered || state.missedDropPromptVisible) return;
        set({ missedDropPromptVisible: true, missedDropPromptKind: 'successTip' });
      }, 850);
    }
  },
  reset: () =>
    set({
      completed: [],
      bonusTokens: 0,
      tutorialRewardClaimed: false,
      phase: 'idle',
      heldActionId: null,
      fitState: 'idle',
      matchedActionId: null,
      baseStashed: false,
      tightenDeg: {},
      missedDropPromptVisible: false,
      missedDropPromptKind: 'missedDrop',
    }),
  available: () => availableActions(new Set(get().completed)),
  stage: () => currentStage(new Set(get().completed)),
  progress: () => ({ completedCount: get().completed.length, totalCount: ACTIONS.length }),
  beginPickup: (actionId) => {
    const a = get()
      .available()
      .find((x) => x.id === actionId);
    if (!a || (a.type !== 'snapPart' && a.type !== 'insertFastener')) return;
    set({ phase: 'held', heldActionId: actionId, fitState: 'held', matchedActionId: null });
  },
  setFitState: (fitState) => set({ fitState }),
  setDragFit: (fitState, matchedActionId) => set({ fitState, matchedActionId }),
  setBaseStashed: (baseStashed) => set({ baseStashed }),
  releaseHeld: () => {
    const { heldActionId, fitState, matchedActionId } = get();
    if (!heldActionId) return 'recover';
    const ok = fitState === 'nearCorrect' || fitState === 'nearRotation';
    // Complete the matched group socket the part snapped to (e.g. dropping a
    // leg on any open leg position); fall back to the picked representative.
    if (ok) get().completeAction(matchedActionId ?? heldActionId);
    set({ phase: 'idle', heldActionId: null, fitState: 'idle', matchedActionId: null });
    return ok ? 'snap' : 'recover';
  },
  cancelHeld: () => set({ phase: 'idle', heldActionId: null, fitState: 'idle', matchedActionId: null }),
  setMissedDropBehavior: (missedDropBehavior) =>
    set({ missedDropBehavior, missedDropPromptAnswered: true, missedDropPromptVisible: false }),
  showMissedDropPrompt: (missedDropPromptKind = 'missedDrop') => {
    const { missedDropPromptAnswered, missedDropPromptVisible } = get();
    if (missedDropPromptAnswered || missedDropPromptVisible) return;
    set({ missedDropPromptVisible: true, missedDropPromptKind });
  },
  dismissMissedDropPrompt: () =>
    set({ missedDropBehavior: 'keepOnCanvas', missedDropPromptAnswered: true, missedDropPromptVisible: false }),
  chooseMissedDropBehavior: (missedDropBehavior) =>
    set({ missedDropBehavior, missedDropPromptAnswered: true, missedDropPromptVisible: false }),
  addTightenDeg: (actionId, deg) => {
    const cur = (get().tightenDeg[actionId] ?? 0) + deg;
    set({ tightenDeg: { ...get().tightenDeg, [actionId]: cur } });
    if (cur >= TIGHTEN_TOTAL_DEG) get().completeAction(actionId);
  },
  addTutorialStepReward: (amount) => {
    set({ bonusTokens: get().bonusTokens + amount });
  },
  claimTutorialReward: (amount) => {
    if (get().tutorialRewardClaimed) return;
    set({ tutorialRewardClaimed: true, bonusTokens: get().bonusTokens + amount });
  },
}));
