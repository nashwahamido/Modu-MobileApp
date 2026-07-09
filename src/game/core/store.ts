import { create } from "zustand";
import {
  availableActions,
  availableInMode,
  currentStage,
} from "@/src/game/core/evaluation/availability";
import { actionCluster } from "@/src/game/core/evaluation/clusters";
import { FitState } from "@/src/game/core/geometry/fit";
import {
  ActionId,
  AssemblyAction,
  AssemblyMode,
  BackdropId,
  ClusterId,
  Furniture,
  PartId,
  RenderStyleId,
  TextLevel,
  ThemeId,
  ToolId,
} from "@/src/game/core/type";
import { blockReason } from "@/src/game/core/evaluation/blockReason";
import { hintText } from "@/src/game/core/presentation/hintText";
import { instructionText } from "@/src/game/core/presentation/instructions";

/** Total clockwise rotation to fully tighten a fastener, in degrees. */
export const TIGHTEN_TOTAL_DEG = 720;
/** Mallet taps to drive a tool-secured part flush. */
export const MALLET_TAPS = 5;
/** Demo rotation needed to accept an orientation correction, in degrees. */
export const ORIENTATION_TOTAL_DEG = 180;
/** Taps to press a push-fit part home (PressControl). */
export const PRESS_TAPS = 4;

export interface AccessibilitySettings {
  textLevel: TextLevel;
  /** Spoken steps: play each step's clip (independent of textLevel). */
  audio: boolean;
  showPictogram: boolean;
  showSymbols: boolean;
  authoredSteps: boolean;
  /** FREE-mode soft hints when reaching for a not-yet-available part. */
  softHints: boolean;
  /** Player picks the tool from the tool bar before tightening; off = the
   *  system equips the right tool automatically. */
  manualTools: boolean;
  /** Show only the current part + action; hide the rest of the chrome. */
  focusMode: boolean;
  /** Auto-orient the camera to frame the next open target socket. */
  autoView: boolean;
  fontScale: number;
}

const DEFAULT_SETTINGS: AccessibilitySettings = {
  textLevel: "standard",
  audio: false,
  showPictogram: false,
  showSymbols: false,
  authoredSteps: false,
  softHints: true,
  manualTools: false,
  focusMode: false,
  autoView: false,
  fontScale: 1,
};

/** What the player is inspecting via single-tap (look only, no assembly). */
export type ExamineTarget =
  | { kind: "part"; partId: PartId }
  | { kind: "cluster"; cluster: ClusterId };

interface GameState {
  /** The furniture currently being assembled (loaded when chosen). */
  furniture: Furniture | null;
  /** Completed action ids — the source of truth for progress. */
  completed: ActionId[];

  /** Part picked up for ASSEMBLY via long-press (the drag flow). */
  heldActionId: ActionId | null;
  /** Item being EXAMINED via single-tap — look, don't commit. */
  examine: ExamineTarget | null;
  /** Which cluster's work area is on screen; others sit "stashed" in the tray. */
  activeCluster: ClusterId | null;
  /** Cluster being dragged from the tray to combine onto the in-scene one (null = none). */
  combiningCluster: ClusterId | null;
  /** Live snap feedback while dragging a held part. */
  fitState: FitState;
  /** Nearest interchangeable socket the held part would snap to. */
  matchedActionId: ActionId | null;
  /** FREE-mode soft hint shown when reaching for a not-yet-available part. */
  hint: string | null;
  /** Accumulated tighten rotation per tighten-action id, in degrees. */
  tightenDeg: Record<ActionId, number>;
  /** Snap action parked at the socket, waiting for orientation correction. */
  orientationActionId: ActionId | null;
  /** Accumulated orientation correction per snap-action id, in degrees. */
  orientationDeg: Record<ActionId, number>;
  /** placePart parked at its seat awaiting a slide/press DRIVE gesture (null =
   *  none). Parallel to the orientation/screw park, but for the linear gestures:
   *  a slider glided in, a push-fit pressed home. */
  driveActionId: ActionId | null;
  driveKind: "slide" | "press" | null;
  /** Normalized 0..1 drive progress per parked action id (SlideControl adds a
   *  drag fraction; PressControl adds 1/PRESS_TAPS per tap). */
  driveProgress: Record<ActionId, number>;
  /** Tool the player holds when `settings.manualTools` is on (sticky across steps). */
  selectedTool: ToolId | null;

  settings: AccessibilitySettings;
  /** How the assembly task is gated: free | plan | guide. */
  mode: AssemblyMode;
  /** 3D render style for the scene: realistic | cozy | cartoon (own axis, not theme). */
  renderStyle: RenderStyleId;
  /** Scene background: clean | studio | dot (independent of the model look). */
  backdrop: BackdropId;
  /** Display theme (backdrop + thumbnails): light | dark | high_contrast. */
  theme: ThemeId;

  loadFurniture: (f: Furniture) => void;
  reset: () => void;

  /** Pure legality (free) — the guard for what may be completed. */
  available: () => AssemblyAction[];
  /** What the current MODE offers the player right now (tray/scene read this). */
  availableForMode: () => AssemblyAction[];
  stage: () => number;
  progress: () => { completedCount: number; totalCount: number };
  setMode: (mode: AssemblyMode) => void;
  setRenderStyle: (style: RenderStyleId) => void;
  setBackdrop: (backdrop: BackdropId) => void;
  setTheme: (theme: ThemeId) => void;

  completeAction: (id: ActionId) => void;
  undoLastAction: () => void;
  addTightenDeg: (actionId: ActionId, deg: number) => void;
  parkOrientation: (actionId: ActionId) => void;
  addOrientationDeg: (actionId: ActionId, deg: number) => void;
  /** Park a placePart for a linear DRIVE (slide glide / press push). */
  parkDrive: (actionId: ActionId, kind: "slide" | "press") => void;
  /** Advance a parked drive by a normalized fraction; commits at ≥1. */
  advanceDrive: (actionId: ActionId, delta: number) => void;

  /** Reaching for a not-yet-available part in free mode → set a gentle nudge. */
  noteBlocked: (actionId: ActionId) => void;
  /** Free-mode hint BUTTON: suggest one doable next step (never forces it). */
  suggestNext: () => void;
  clearHint: () => void;

  setSelectedTool: (tool: ToolId | null) => void;

  beginPickup: (actionId: ActionId) => void;
  setDragFit: (fitState: FitState, matchedActionId: ActionId | null) => void;
  releaseHeld: () => "snap" | "recover";
  cancelHeld: () => void;

  examinePart: (partId: PartId) => void;
  examineCluster: (cluster: ClusterId) => void;
  clearExamine: () => void;
  setActiveCluster: (cluster: ClusterId | null) => void;
  setCombiningCluster: (cluster: ClusterId | null) => void;

  setSettings: (patch: Partial<AccessibilitySettings>) => void;
}

const CLEARED = {
  heldActionId: null,
  examine: null,
  fitState: "idle" as FitState,
  matchedActionId: null,
  hint: null,
};

export const useGameStore = create<GameState>()((set, get) => ({
  furniture: null,
  completed: [],
  ...CLEARED,
  activeCluster: null,
  combiningCluster: null,
  tightenDeg: {},
  orientationActionId: null,
  orientationDeg: {},
  driveActionId: null,
  driveKind: null,
  driveProgress: {},
  selectedTool: null,
  settings: DEFAULT_SETTINGS,
  mode: "free",
  renderStyle: "realistic",
  backdrop: "clean",
  theme: "light",

  loadFurniture: (f) =>
    set({
      furniture: f,
      completed: [],
      activeCluster: null,
      combiningCluster: null,
      tightenDeg: {},
      orientationActionId: null,
      orientationDeg: {},
      driveActionId: null,
      driveKind: null,
      driveProgress: {},
      selectedTool: null,
      ...CLEARED,
    }),
  reset: () =>
    set({
      completed: [],
      activeCluster: null,
      combiningCluster: null,
      tightenDeg: {},
      orientationActionId: null,
      orientationDeg: {},
      driveActionId: null,
      driveKind: null,
      driveProgress: {},
      selectedTool: null,
      ...CLEARED,
    }),

  available: () => {
    const f = get().furniture;
    return f ? availableActions(f, new Set(get().completed)) : [];
  },
  availableForMode: () => {
    const s = get();
    return s.furniture
      ? availableInMode(s.furniture, new Set(s.completed), s.mode, s.activeCluster)
      : [];
  },
  stage: () => {
    const f = get().furniture;
    return f ? currentStage(f.actions, new Set(get().completed)) : 1;
  },
  progress: () => ({
    completedCount: get().completed.length,
    totalCount: get().furniture?.actions.length ?? 0,
  }),
  setMode: (mode) => set({ mode }),
  setRenderStyle: (renderStyle) => set({ renderStyle }),
  setBackdrop: (backdrop) => set({ backdrop }),
  setTheme: (theme) => set({ theme }),

  completeAction: (id) => {
    const s = get();
    if (s.completed.includes(id)) return;
    if (!s.available().some((a) => a.actionId === id)) return;
    set({ completed: [...s.completed, id] });
  },
  undoLastAction: () => {
    const completed = get().completed;
    if (completed.length === 0) return;

    const lastActionId = completed[completed.length - 1];
    const tightenDeg = { ...get().tightenDeg };
    const orientationDeg = { ...get().orientationDeg };
    const driveProgress = { ...get().driveProgress };
    delete tightenDeg[lastActionId];
    delete orientationDeg[lastActionId];
    delete driveProgress[lastActionId];

    set({
      completed: completed.slice(0, -1),
      tightenDeg,
      orientationDeg,
      driveProgress,
      orientationActionId:
        get().orientationActionId === lastActionId ? null : get().orientationActionId,
      driveActionId: get().driveActionId === lastActionId ? null : get().driveActionId,
      driveKind: get().driveActionId === lastActionId ? null : get().driveKind,
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
    if (!a || a.type !== "placePart") return;
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
  parkDrive: (actionId, kind) => {
    const a = get().available().find((x) => x.actionId === actionId);
    if (!a || a.type !== "placePart") return;
    set({
      driveActionId: actionId,
      driveKind: kind,
      fitState: "nearRotation",
      matchedActionId: actionId,
      examine: null,
    });
  },
  advanceDrive: (actionId, delta) => {
    if (get().driveActionId !== actionId) return;
    const cur = Math.min(1, Math.max(0, (get().driveProgress[actionId] ?? 0) + delta));
    set({ driveProgress: { ...get().driveProgress, [actionId]: cur } });
    if (cur >= 1) {
      get().completeAction(actionId);
      set({
        driveActionId: null,
        driveKind: null,
        driveProgress: {},
        ...CLEARED,
      });
    }
  },

  noteBlocked: (actionId) => {
    const s = get();
    if (s.mode !== "free" || !s.settings.softHints || !s.furniture) return;
    const reason = blockReason(s.furniture, actionId, new Set(s.completed));
    if (reason) set({ hint: hintText(reason, s.furniture, s.settings.textLevel) });
  },
  suggestNext: () => {
    const s = get();
    if (!s.furniture) return;
    const next = s.availableForMode()[0];
    if (!next) {
      set({ hint: "This area is done — switch focus." });
      return;
    }
    const text = instructionText(
      s.furniture.instructions,
      next.actionId,
      s.settings.textLevel,
    );
    set({ hint: text ? `Try: ${text}` : null });
  },
  clearHint: () => set({ hint: null }),

  setSelectedTool: (tool) => set({ selectedTool: tool }),

  beginPickup: (actionId) => {
    const s = get();
    const a = s.furniture?.actions.find((x) => x.actionId === actionId);
    if (!a || (a.type !== "placePart" && a.type !== "insertFastener")) return;
    if (s.completed.includes(actionId)) return;
    const legal = s.available().some((x) => x.actionId === actionId);
    if (!legal && s.mode !== "free") return;
    set({ ...CLEARED, heldActionId: actionId, fitState: "held" });
  },
  setDragFit: (fitState, matchedActionId) => set({ fitState, matchedActionId }),
  releaseHeld: () => {
    const { heldActionId, fitState, matchedActionId } = get();
    if (!heldActionId) return "recover";
    const ok = fitState === "nearCorrect";
    if (ok) get().completeAction(matchedActionId ?? heldActionId);
    set({ ...CLEARED });
    return ok ? "snap" : "recover";
  },
  cancelHeld: () =>
    set({
      orientationActionId: null,
      orientationDeg: {},
      driveActionId: null,
      driveKind: null,
      driveProgress: {},
      ...CLEARED,
    }),

  examinePart: (partId) => set({ ...CLEARED, examine: { kind: "part", partId } }),
  examineCluster: (cluster) => set({ ...CLEARED, examine: { kind: "cluster", cluster } }),
  clearExamine: () => set({ examine: null }),
  setActiveCluster: (cluster) => set({ activeCluster: cluster }),
  setCombiningCluster: (cluster) => set({ combiningCluster: cluster }),

  setSettings: (patch) => set({ settings: { ...get().settings, ...patch } }),
}));

/**
 * The "first part" case: a part is held AND the cluster it belongs to has no
 * structural part placed yet. The very first drop gets a simplified UX — drop on
 * a centre ring instead of aiming at a socket ghost. Shared by the scene, the
 * drag, and the centre-ring overlay so they agree.
 */
export const selectFirstDrop = (s: GameState): boolean => {
  const f = s.furniture;
  if (!f || !s.heldActionId) return false;
  const held = f.actions.find((a) => a.actionId === s.heldActionId);
  const cluster = s.activeCluster ?? (held?.partId ? f.parts[held.partId]?.cluster ?? null : null);
  const done = new Set(s.completed);
  return !f.actions.some(
    (a) =>
      a.type === "placePart" &&
      a.partId &&
      done.has(a.actionId) &&
      (cluster == null || actionCluster(f, a) === cluster),
  );
};
