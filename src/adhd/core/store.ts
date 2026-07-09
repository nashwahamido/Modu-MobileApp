import { create } from "zustand";
import { availableActions, currentStage } from "@/src/adhd/core/assembly/availability";
import { FitState } from "@/src/adhd/core/geometry/fit";
import { AssemblyAction, Furniture, FurnitureStyle, LightingChoice, Vec3 } from "@/src/adhd/core/type";

/** Total clockwise rotation to fully tighten a fastener, in degrees. */
export const TIGHTEN_TOTAL_DEG = 720;
/** Mallet taps to drive a tool-secured part flush. */
export const MALLET_TAPS = 5;
/** Demo rotation needed to accept an orientation correction, in degrees. */
export const ORIENTATION_TOTAL_DEG = 180;

export interface AccessibilitySettings {
  textLevel: "standard" | "simple" | "minimal"; // a SELECTOR
  // ── ADHD tunings ──
  focusMode: boolean; // show only the current part + action
  showHints: boolean; // instructional prompts on/off
  autoView: boolean; // auto-orient to the next highlighted socket
  darkMode: boolean; // dark background theme
  style: FurnitureStyle; // visual preset: table look + backdrop
  lightingPreset: LightingChoice; // lighting rig (auto = per-style default)
  toonShader: boolean; // apply the custom toon material to the table (test)
  // ADDITIVE toggles…
  showPictogram: boolean;
  showSymbols: boolean;
  audioCues: boolean;
  authoredSteps: boolean;
  fontScale: number;
}

const DEFAULT_SETTINGS: AccessibilitySettings = {
  textLevel: "standard",
  focusMode: false,
  showHints: true,
  autoView: false,
  darkMode: false,
  style: "realistic",
  lightingPreset: "auto",
  toonShader: false,
  showPictogram: false,
  showSymbols: false,
  audioCues: false,
  authoredSteps: false,
  fontScale: 1,
};

/** What the player is inspecting via single-tap (look only, no assembly). */
export type ExamineTarget =
  | { kind: "part"; partId: string }
  | { kind: "cluster"; cluster: string };

interface GameState {
  /** The furniture currently being assembled (loaded when chosen). */
  furniture: Furniture | null;
  /** Completed action ids — the source of truth for progress. */
  completed: string[];
  /** Redo stack: actions undone but re-appliable, most-recent last. */
  undoneActions: string[];

  // ── transient interaction state ──
  /** Part picked up for ASSEMBLY via long-press (the drag flow). */
  heldActionId: string | null;
  /** Item being EXAMINED via single-tap — look, don't commit. */
  examine: ExamineTarget | null;
  /** Which cluster's work area is on screen; others sit "stashed" in the tray. */
  activeCluster: string | null;
  /** Live snap feedback while dragging a held part. */
  fitState: FitState;
  /** Nearest interchangeable socket the held part would snap to. */
  matchedActionId: string | null;
  /** Accumulated tighten rotation per tighten-action id, in degrees. */
  tightenDeg: Record<string, number>;
  /** Snap action parked at the socket, waiting for orientation correction. */
  orientationActionId: string | null;
  /** Accumulated orientation correction per snap-action id, in degrees. */
  orientationDeg: Record<string, number>;
  /**
   * Origin shift for the whole assembly, world meters. Set when the table top
   * is dropped: the top stays where you let go, and every other part (and its
   * snap target) is offset by the same amount so the table builds around it.
   */
  worldShift: Vec3;

  settings: AccessibilitySettings;

  // ── lifecycle ──
  loadFurniture: (f: Furniture) => void;
  reset: () => void;

  // ── derived ──
  available: () => AssemblyAction[];
  stage: () => number;
  progress: () => { completedCount: number; totalCount: number };

  // ── progress ──
  completeAction: (id: string) => void;
  undoLastAction: () => void;
  redoLastAction: () => void;
  addTightenDeg: (actionId: string, deg: number) => void;
  parkOrientation: (actionId: string) => void;
  addOrientationDeg: (actionId: string, deg: number) => void;

  // ── assembly pickup (long-press) ──
  beginPickup: (actionId: string) => void;
  setDragFit: (fitState: FitState, matchedActionId: string | null) => void;
  releaseHeld: () => "snap" | "recover";
  cancelHeld: () => void;
  setWorldShift: (v: Vec3) => void;

  // ── examine (single-tap) + cluster focus ──
  examinePart: (partId: string) => void;
  examineCluster: (cluster: string) => void;
  clearExamine: () => void;
  setActiveCluster: (cluster: string | null) => void;

  // ── settings ──
  setSettings: (patch: Partial<AccessibilitySettings>) => void;
}

const CLEARED = {
  heldActionId: null,
  examine: null,
  fitState: "idle" as FitState,
  matchedActionId: null,
};

export const useGameStore = create<GameState>()((set, get) => ({
  furniture: null,
  completed: [],
  undoneActions: [],
  ...CLEARED,
  activeCluster: null,
  tightenDeg: {},
  orientationActionId: null,
  orientationDeg: {},
  worldShift: [0, 0, 0],
  settings: DEFAULT_SETTINGS,

  loadFurniture: (f) =>
    set({
      furniture: f,
      completed: [],
      undoneActions: [],
      activeCluster: null,
      tightenDeg: {},
      orientationActionId: null,
      orientationDeg: {},
      worldShift: [0, 0, 0],
      ...CLEARED,
    }),
  reset: () =>
    set({
      completed: [],
      undoneActions: [],
      activeCluster: null,
      tightenDeg: {},
      orientationActionId: null,
      orientationDeg: {},
      worldShift: [0, 0, 0],
      ...CLEARED,
    }),

  available: () => {
    const f = get().furniture;
    return f ? availableActions(f.actions, f.gates, new Set(get().completed)) : [];
  },
  stage: () => {
    const f = get().furniture;
    return f ? currentStage(f.actions, new Set(get().completed)) : 1;
  },
  progress: () => ({
    completedCount: get().completed.length,
    totalCount: get().furniture?.actions.length ?? 0,
  }),

  completeAction: (id) => {
    const s = get();
    if (s.completed.includes(id)) return;
    // only legal (currently available) actions may complete
    if (!s.available().some((a) => a.actionId === id)) return;
    // a fresh action invalidates the redo stack
    set({ completed: [...s.completed, id], undoneActions: [] });
  },
  undoLastAction: () => {
    const s = get();
    if (s.completed.length === 0) return;
    const last = s.completed[s.completed.length - 1];
    const tightenDeg = { ...s.tightenDeg };
    const orientationDeg = { ...s.orientationDeg };
    delete tightenDeg[last];
    delete orientationDeg[last];
    set({
      completed: s.completed.slice(0, -1),
      undoneActions: [...s.undoneActions, last],
      tightenDeg,
      orientationDeg,
      orientationActionId:
        s.orientationActionId === last ? null : s.orientationActionId,
      ...CLEARED,
    });
  },
  redoLastAction: () => {
    const s = get();
    if (s.undoneActions.length === 0) return;
    const next = s.undoneActions[s.undoneActions.length - 1];
    // only re-apply if it is legal again (its prerequisites still hold)
    if (!s.available().some((a) => a.actionId === next)) return;
    set({
      completed: [...s.completed, next],
      undoneActions: s.undoneActions.slice(0, -1),
      ...CLEARED,
    });
  },
  addTightenDeg: (actionId, deg) => {
    const cur = (get().tightenDeg[actionId] ?? 0) + deg;
    set({ tightenDeg: { ...get().tightenDeg, [actionId]: cur } });
    if (cur >= TIGHTEN_TOTAL_DEG) get().completeAction(actionId);
  },
  parkOrientation: (actionId) => {
    const a = get().available().find((x) => x.actionId === actionId);
    if (!a || a.type !== "snapPart") return;
    set({
      orientationActionId: actionId,
      fitState: "nearRotation",
      matchedActionId: actionId,
      examine: null,
    });
  },
  addOrientationDeg: (actionId, deg) => {
    if (get().orientationActionId !== actionId) return;
    const cur = (get().orientationDeg[actionId] ?? 0) + deg;
    set({ orientationDeg: { ...get().orientationDeg, [actionId]: cur } });
    if (cur >= ORIENTATION_TOTAL_DEG) {
      get().completeAction(actionId);
      set({
        orientationActionId: null,
        orientationDeg: {},
        ...CLEARED,
      });
    }
  },

  beginPickup: (actionId) => {
    const a = get().available().find((x) => x.actionId === actionId);
    if (!a || (a.type !== "snapPart" && a.type !== "insertFastener")) return;
    // assembling and examining are mutually exclusive
    set({ ...CLEARED, heldActionId: actionId, fitState: "held" });
  },
  setDragFit: (fitState, matchedActionId) => set({ fitState, matchedActionId }),
  releaseHeld: () => {
    const { heldActionId, fitState, matchedActionId } = get();
    if (!heldActionId) return "recover";
    const ok = fitState === "nearCorrect";
    // snap to the matched interchangeable socket, else the picked representative
    if (ok) get().completeAction(matchedActionId ?? heldActionId);
    set({ ...CLEARED });
    return ok ? "snap" : "recover";
  },
  cancelHeld: () => set({ orientationActionId: null, orientationDeg: {}, ...CLEARED }),
  setWorldShift: (v) => set({ worldShift: v }),

  examinePart: (partId) => set({ ...CLEARED, examine: { kind: "part", partId } }),
  examineCluster: (cluster) => set({ ...CLEARED, examine: { kind: "cluster", cluster } }),
  clearExamine: () => set({ examine: null }),
  setActiveCluster: (cluster) => set({ activeCluster: cluster }),

  setSettings: (patch) => set({ settings: { ...get().settings, ...patch } }),
}));