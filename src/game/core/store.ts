import { create } from "zustand";
import { isPickupType } from "@/src/game/core/ids";
import {
  actionableGroups,
  availableActions,
  availableInMode,
  currentStage,
  nextAction,
  openWayCount,
} from "@/src/game/core/evaluation/availability";
import { AccessibilitySettings } from "@/src/game/core/accessibility";
import { actionCluster, clusterStarted } from "@/src/game/core/evaluation/clusters";
import {
  PROFILE_MODE,
  ProfileId,
  settingsForProfile,
} from "@/src/game/core/profile";
import { FitState } from "@/src/game/core/geometry/fit";
import {
  ActionId,
  AssemblyAction,
  AssemblyMode,
  ClusterId,
  Furniture,
  GroupId,
  PartBox,
  PartId,
  ToolId,
} from "@/src/game/core/type";
import { blockReason } from "@/src/game/core/evaluation/blockReason";
import { hasTrayCard } from "@/src/game/core/evaluation/trayCard";
import { hintText } from "@/src/game/core/presentation/hintText";
import { instructionText } from "@/src/game/core/presentation/instructions";
import { memberPlaceIdsForLead, componentBlockAtTail } from "@/src/game/core/model/components";
import AsyncStorage from "@react-native-async-storage/async-storage";

export const TIGHTEN_TOTAL_DEG = 720;
export const MALLET_TAPS = 5;
export const ORIENTATION_TOTAL_DEG = 180;
export const PRESS_TAPS = 4;

export type { AccessibilitySettings } from "@/src/game/core/accessibility";

export type ExamineTarget =
  | { kind: "part"; partId: PartId }
  | { kind: "cluster"; cluster: ClusterId };

interface GameState {
  furniture: Furniture | null;
  partBoxes: Record<PartId, PartBox>;
  completed: ActionId[];
  heldActionId: ActionId | null;
  examine: ExamineTarget | null;
  activeCluster: ClusterId | null;
  combiningCluster: ClusterId | null;
  fitState: FitState;
  aimBlocked: boolean;
  matchedActionId: ActionId | null;
  hint: string | null;
  hintTone: "info" | "error";
  hintGroup: GroupId | null;
  hintGroups: GroupId[];
  hintParts: PartId[];
  hintClusters: ClusterId[];
  hintPulse: number;
  hintTool: ToolId | null;
  clearSpot: () => void;
  hintPartId: PartId | null;
  tightenDeg: Record<ActionId, number>;
  orientationActionId: ActionId | null;
  orientationDeg: Record<ActionId, number>;
  driveActionId: ActionId | null;
  driveKind: "slide" | "press" | "screw" | null;
  driveProgress: Record<ActionId, number>;
  selectedTool: ToolId | null;

  settings: AccessibilitySettings;
  profile: ProfileId;
  mode: AssemblyMode;

  loadFurniture: (f: Furniture) => void;
  reset: () => void;

  available: () => AssemblyAction[];
  availableForMode: () => AssemblyAction[];
  stage: () => number;
  progress: () => { completedCount: number; totalCount: number };
  setMode: (mode: AssemblyMode) => void;

  completeAction: (id: ActionId) => void;
  undoneActions: ActionId[];
  undoLastAction: () => void;
  redoLastAction: () => void;
  addTightenDeg: (actionId: ActionId, deg: number) => void;
  parkOrientation: (actionId: ActionId) => void;
  addOrientationDeg: (actionId: ActionId, deg: number) => void;
  parkDrive: (actionId: ActionId, kind: "slide" | "press" | "screw") => void;
  advanceDrive: (actionId: ActionId, delta: number) => void;

  noteBlocked: (actionId: ActionId) => void;
  suggestNext: (source?: "hint" | "spot") => void;
  clearHint: () => void;

  setSelectedTool: (tool: ToolId | null) => void;

  beginPickup: (actionId: ActionId) => void;
  setDragFit: (fitState: FitState, matchedActionId: ActionId | null) => void;
  setAimBlocked: (aimBlocked: boolean) => void;
  releaseHeld: () => "snap" | "recover";
  missActionId: ActionId | null;
  missCount: number;
  noteMiss: (actionId: ActionId) => void;
  clearMisses: () => void;
  cancelHeld: () => void;

  examinePart: (partId: PartId) => void;
  examineCluster: (cluster: ClusterId) => void;
  clearExamine: () => void;
  mapOpen: boolean;
  setMapOpen: (open: boolean) => void;
  settingsOpen: boolean;
  setSettingsOpen: (open: boolean) => void;
  activityTick: number;
  noteActivity: () => void;
  celebratingCluster: ClusterId | null;
  celebratedClusters: ClusterId[];
  celebrateCluster: (cluster: ClusterId) => void;
  dismissCelebration: () => void;
  baselineCelebrated: (clusters: ClusterId[]) => void;
  mapSeen: boolean;
  setMapSeen: (seen: boolean) => void;
  doneDismissed: boolean;
  setDoneDismissed: (v: boolean) => void;
  completeConfirmed: boolean;
  setCompleteConfirmed: (v: boolean) => void;

  setActiveCluster: (cluster: ClusterId | null) => void;
  setCombiningCluster: (cluster: ClusterId | null) => void;
  setPartBoxes: (boxes: Record<PartId, PartBox>) => void;

  setSettings: (patch: Partial<AccessibilitySettings>) => void;
  applyProfile: (profile: ProfileId) => void;
}

const CLEARED = {
  heldActionId: null,
  examine: null,
  fitState: "idle" as FitState,
  aimBlocked: false,
  matchedActionId: null,
  hint: null,
  hintTone: "info" as const,
  hintGroup: null,
  hintGroups: [] as GroupId[],
  hintPartId: null,
  hintParts: [] as PartId[],
  hintClusters: [] as ClusterId[],
  hintTool: null as ToolId | null,
};

const SETTINGS_KEY = "modu.settings.v1";
const TOUCHED_KEY = "modu.settings.touched.v1";

const touched = new Set<string>();

const RETIRED_SETTINGS = new Set<string>(["dragPlane", "lightingPreset"]);

async function persistSettings(settings: AccessibilitySettings): Promise<void> {
  try {
    await AsyncStorage.multiSet([
      [SETTINGS_KEY, JSON.stringify(settings)],
      [TOUCHED_KEY, JSON.stringify([...touched])],
    ]);
  } catch {
  }
}

export async function hydrateSettings(): Promise<void> {
  try {
    const [[, rawSettings], [, rawTouched]] = await AsyncStorage.multiGet([
      SETTINGS_KEY,
      TOUCHED_KEY,
    ]);
    if (rawTouched) {
      for (const key of JSON.parse(rawTouched) as string[]) {
        if (!RETIRED_SETTINGS.has(key)) touched.add(key);
      }
    }
    if (!rawSettings) return;
    const saved = JSON.parse(rawSettings) as Partial<AccessibilitySettings>;
    const kept: Record<string, unknown> = {};
    for (const key of touched) {
      if (key in saved) kept[key] = (saved as Record<string, unknown>)[key];
    }
    useGameStore.setState((state) => ({
      settings: { ...state.settings, ...(kept as Partial<AccessibilitySettings>) },
    }));
  } catch {
  }
}

let lastActivityAt = 0;

export const useGameStore = create<GameState>()((set, get) => ({
  furniture: null,
  completed: [],
  undoneActions: [],
  hintPulse: 0,
  ...CLEARED,
  activeCluster: null,
  combiningCluster: null,
  partBoxes: {},
  mapOpen: false,
  missActionId: null as ActionId | null,
  missCount: 0,
  settingsOpen: false,
  activityTick: 0,
  celebratingCluster: null as ClusterId | null,
  celebratedClusters: [] as ClusterId[],
  mapSeen: false,
  doneDismissed: false,
  completeConfirmed: false,
  tightenDeg: {},
  orientationActionId: null,
  orientationDeg: {},
  driveActionId: null,
  driveKind: null,
  driveProgress: {},
  selectedTool: null,
  settings: settingsForProfile("control"),
  profile: "control",
  mode: "free",

  loadFurniture: (f) =>
    set({
      furniture: f,
      mode: f.meta.mode ?? get().mode,
      completed: [],
      undoneActions: [],
      activeCluster: null,
      combiningCluster: null,
      mapSeen: false,
      doneDismissed: false,
      completeConfirmed: false,
      tightenDeg: {},
      orientationActionId: null,
      orientationDeg: {},
      driveActionId: null,
      driveKind: null,
      driveProgress: {},
      selectedTool: null,
      partBoxes: {},
      celebratingCluster: null,
      celebratedClusters: [],
      ...CLEARED,
    }),
  reset: () =>
    set({
      completed: [],
      undoneActions: [],
      activeCluster: null,
      combiningCluster: null,
      tightenDeg: {},
      orientationActionId: null,
      orientationDeg: {},
      driveActionId: null,
      driveKind: null,
      driveProgress: {},
      selectedTool: null,
      celebratingCluster: null,
      celebratedClusters: [],
      ...CLEARED,
    }),

  available: () => {
    const f = get().furniture;
    return f ? availableActions(f, new Set(get().completed)) : [];
  },
  availableForMode: () => {
    const s = get();
    return s.furniture
      ? availableInMode(
          s.furniture,
          new Set(s.completed),
          s.mode,
          s.activeCluster,
        )
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
  setMode: (mode) => {
    set({ mode });
    if (mode !== "free" && !get().settings.showInstructions && !touched.has("showInstructions")) {
      const settings = { ...get().settings, showInstructions: true };
      set({ settings });
      void persistSettings(settings);
    }
  },

  completeAction: (id) => {
    const s = get();
    if (s.completed.includes(id)) return;
    if (!s.available().some((a) => a.actionId === id)) return;
    const members = memberPlaceIdsForLead(s.furniture?.components, id);
    const finished = s.furniture?.actions.find((a) => a.actionId === id);
    const usedTool = !!finished?.tool && finished.tool !== "hand";
    set({
      completed: [...s.completed, id, ...members],
      undoneActions: [],
      ...(s.settings.manualTools && usedTool ? { selectedTool: null } : {}),
    });
  },
  undoLastAction: () => {
    const s = get();
    const completed = s.completed;
    if (completed.length === 0) return;

    const block = s.furniture
      ? componentBlockAtTail(s.furniture.components, s.furniture.actions, completed)
      : null;
    const dropCount = block ? block.count : 1;
    const removed = completed.slice(completed.length - dropCount);
    const rememberForRedo = block ? block.leadActionId : removed[0];

    const tightenDeg = { ...s.tightenDeg };
    const orientationDeg = { ...s.orientationDeg };
    const driveProgress = { ...s.driveProgress };
    for (const rid of removed) {
      delete tightenDeg[rid];
      delete orientationDeg[rid];
      delete driveProgress[rid];
    }

    set({
      completed: completed.slice(0, completed.length - dropCount),
      undoneActions: [...s.undoneActions, rememberForRedo],
      tightenDeg,
      orientationDeg,
      driveProgress,
      orientationActionId: removed.includes(s.orientationActionId as ActionId) ? null : s.orientationActionId,
      driveActionId: removed.includes(s.driveActionId as ActionId) ? null : s.driveActionId,
      driveKind: removed.includes(s.driveActionId as ActionId) ? null : s.driveKind,
      ...CLEARED,
    });
  },
  redoLastAction: () => {
    const s = get();
    if (s.undoneActions.length === 0) return;
    const next = s.undoneActions[s.undoneActions.length - 1];
    if (!s.available().some((a) => a.actionId === next)) return;
    const members = memberPlaceIdsForLead(s.furniture?.components, next);
    set({
      completed: [...s.completed, next, ...members],
      undoneActions: s.undoneActions.slice(0, -1),
      ...CLEARED,
    });
  },
  addTightenDeg: (actionId, deg) => {
    const cur = (get().tightenDeg[actionId] ?? 0) + deg;
    set({
      tightenDeg: {
        ...get().tightenDeg,
        [actionId]: cur,
      },
    });
    if (cur >= TIGHTEN_TOTAL_DEG) get().completeAction(actionId);
  },
  parkOrientation: (actionId) => {
    const a = get()
      .available()
      .find((x) => x.actionId === actionId);
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
    set({
      orientationDeg: {
        ...get().orientationDeg,
        [actionId]: cur,
      },
    });
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
    const a = get()
      .available()
      .find((x) => x.actionId === actionId);
    if (!a || (a.type !== "placePart" && a.type !== "combineClusters")) return;
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
    const cur = Math.min(
      1,
      Math.max(0, (get().driveProgress[actionId] ?? 0) + delta),
    );
    set({
      driveProgress: {
        ...get().driveProgress,
        [actionId]: cur,
      },
    });
    if (cur >= 1) {
      get().completeAction(actionId);
      set({
        driveActionId: null,
        driveKind: null,
        driveProgress: {},
        combiningCluster: null,
        ...CLEARED,
      });
    }
  },

  noteBlocked: (actionId) => {
    const s = get();
    if (s.mode !== "free" || !s.settings.softHints || s.settings.focusMode || !s.furniture) return;
    const done = new Set(s.completed);
    const reason = blockReason(s.furniture, actionId, done);
    if (reason)
      set({
        hint: hintText(reason, s.furniture, s.settings.textLevel, openWayCount(s.furniture, done)),
        hintTone: "error",
        hintGroup: null,
      });
  },
  suggestNext: (source = "hint") => {
    const s = get();
    if (!s.furniture) return;
    const f = s.furniture;
    const avail = s.availableForMode();
    if (!avail.length) {
      set({
        hint: "This area is done — switch focus.",
        hintTone: "info",
        hintGroup: null,
        hintGroups: [],
        hintPartId: null,
        hintParts: [],
      });
      return;
    }

    if (source === "hint") {
      const groups = actionableGroups(f, avail);
      const carded = new Set<GroupId>();
      const hintParts: PartId[] = [];
      for (const a of avail) {
        if (!a.partId) continue;
        if (hasTrayCard(f, a)) {
          const g = f.parts[a.partId]?.group;
          if (g) carded.add(g);
        } else if (!hintParts.includes(a.partId)) {
          hintParts.push(a.partId);
        }
      }
      const hintClusters: ClusterId[] = [];
      for (const a of avail) {
        if (!a.partId && a.cluster && !hintClusters.includes(a.cluster)) hintClusters.push(a.cluster);
      }
      const hintTool = s.settings.manualTools
        ? (avail.find((a) => a.tool && a.tool !== "hand")?.tool ?? null)
        : null;
      const partTargets = groups.length;
      const hint =
        hintTool
          ? "Pick a tool from the toolbox."
          : partTargets > 0
            ? partTargets > 1
              ? "Try one of the highlighted parts."
              : "Try the highlighted part."
            : hintClusters.length > 0
              ? hintClusters.length > 1
                ? "Try one of the highlighted sections."
                : "Try the highlighted section."
              : (() => {
                  const t = instructionText(f.instructions, avail[0].actionId, s.settings.textLevel);
                  return t ? `Try: ${t}` : null;
                })();
      set({
        hint,
        hintTone: "info",
        hintGroup: null,
        hintGroups: [...carded],
        hintPartId: null,
        hintParts,
        hintClusters,
        hintTool,
        hintPulse: s.hintPulse + 1,
      });
      return;
    }

    const next = nextAction(f, avail, new Set(s.completed)) ?? avail[0];
    const text = instructionText(f.instructions, next.actionId, s.settings.textLevel);
    const part = next.partId ? f.parts[next.partId] : undefined;
    const group = isPickupType(next.type) && part ? part.group : null;
    const wantsText = !!text && s.profile !== "control";
    set({
      hint: wantsText ? `Try: ${text}` : null,
      hintTone: "info",
      hintGroup: group,
      hintGroups: [],
      hintPartId: next.partId ?? null,
      hintParts: [],
      hintClusters: [],
      hintTool: null,
      hintPulse: s.hintPulse + 1,
    });
  },
  clearHint: () =>
    set({
      hint: null,
      hintGroup: null,
      hintGroups: [],
      hintPartId: null,
      hintClusters: [],
      hintTool: null,
    }),
  clearSpot: () =>
    set({
      hintPartId: null,
      hintParts: [],
    }),

  setSelectedTool: (tool) => set({ selectedTool: tool }),

  beginPickup: (actionId) => {
    const s = get();
    const a = s.furniture?.actions.find((x) => x.actionId === actionId);
    if (!a || !isPickupType(a.type)) return;
    if (s.completed.includes(actionId)) return;
    const legal = s.available().some((x) => x.actionId === actionId);
    if (!legal && s.mode !== "free") return;
    if (!legal) {
      const cluster = actionCluster(s.furniture!, a);
      if (cluster && !clusterStarted(s.furniture!, cluster, new Set(s.completed))) {
        s.noteBlocked(actionId);
        return;
      }
    }
    set({
      ...CLEARED,
      heldActionId: actionId,
      fitState: "held",
    });
  },
  setDragFit: (fitState, matchedActionId) =>
    set({
      fitState,
      matchedActionId,
    }),
  setAimBlocked: (aimBlocked) => set({ aimBlocked }),
  releaseHeld: () => {
    const { heldActionId, fitState, matchedActionId } = get();
    if (!heldActionId) return "recover";
    const ok = fitState === "nearCorrect";
    if (ok) get().completeAction(matchedActionId ?? heldActionId);
    set({
      ...CLEARED,
      ...(ok
        ? {
            missActionId: null,
            missCount: 0,
          }
        : {}),
    });
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

  examinePart: (partId) =>
    set({
      ...CLEARED,
      examine: {
        kind: "part",
        partId,
      },
    }),
  examineCluster: (cluster) =>
    set({
      ...CLEARED,
      examine: {
        kind: "cluster",
        cluster,
      },
    }),
  clearExamine: () => set({ examine: null }),
  noteMiss: (actionId) =>
    set((s) => ({
      missActionId: actionId,
      missCount: s.missActionId === actionId ? s.missCount + 1 : 1,
    })),
  clearMisses: () =>
    set({
      missActionId: null,
      missCount: 0,
    }),
  setMapOpen: (open) => set({ mapOpen: open }),
  setSettingsOpen: (open) => set({ settingsOpen: open }),
  noteActivity: () => {
    const now = Date.now();
    if (now - lastActivityAt < 1_000) return;
    lastActivityAt = now;
    set((s) => ({ activityTick: s.activityTick + 1 }));
  },
  celebrateCluster: (cluster) =>
    set((s) => ({
      celebratingCluster: cluster,
      celebratedClusters: s.celebratedClusters.includes(cluster)
        ? s.celebratedClusters
        : [...s.celebratedClusters, cluster],
    })),
  dismissCelebration: () => set({ celebratingCluster: null }),
  baselineCelebrated: (clusters) =>
    set({
      celebratedClusters: clusters,
      celebratingCluster: null,
    }),
  setMapSeen: (seen) => set({ mapSeen: seen }),
  setDoneDismissed: (v) => set({ doneDismissed: v }),
  setCompleteConfirmed: (v) => set({ completeConfirmed: v }),
  setActiveCluster: (cluster) => set({ activeCluster: cluster }),
  setCombiningCluster: (cluster) => set({ combiningCluster: cluster }),
  setPartBoxes: (boxes) => set({ partBoxes: boxes }),

  setSettings: (patch) => {
    set({ settings: { ...get().settings, ...patch } });
    for (const key of Object.keys(patch)) touched.add(key);
    void persistSettings(get().settings);
  },
  applyProfile: (profile) => {
    const base = settingsForProfile(profile);
    const kept: Partial<AccessibilitySettings> = {};
    for (const key of touched) {
      if (key in get().settings) {
        (kept as Record<string, unknown>)[key] = (get().settings as unknown as Record<string, unknown>)[key];
      }
    }
    const settings = { ...base, ...kept };
    set({
      profile,
      settings,
      mode: PROFILE_MODE[profile],
    });
    void persistSettings(settings);
  },
}));

export const selectFirstDrop = (s: GameState): boolean => {
  const f = s.furniture;
  if (!f || !s.heldActionId) return false;
  const held = f.actions.find((a) => a.actionId === s.heldActionId);
  const cluster =
    s.activeCluster ??
    (held?.partId ? (f.parts[held.partId]?.cluster ?? null) : null);
  const done = new Set(s.completed);
  return !f.actions.some(
    (a) =>
      a.type === "placePart" &&
      a.partId &&
      done.has(a.actionId) &&
      (cluster == null || actionCluster(f, a) === cluster),
  );
};
