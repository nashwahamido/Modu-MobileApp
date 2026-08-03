import { create } from "zustand";
import type { TimeOfDayId } from "@/src/room/core/timeOfDay";
// Type-only: the room's backdrop table carries image require()s, and the store must not pull those in.
import type { RoomBackdropId } from "@/src/room/ui/roomBackdrops";
import { isPickupType } from "@/src/game/core/ids";
import {
  availableActions,
  availableInMode,
  currentStage,
} from "@/src/game/core/evaluation/availability";
// Setting TYPES live in accessibility.ts; their defaults + the profiles in profile.ts.
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
  BackdropId,
  ClusterId,
  Furniture,
  GroupId,
  PartId,
  RenderStyleId,
  ThemeId,
  ToolId,
} from "@/src/game/core/type";
import { blockReason } from "@/src/game/core/evaluation/blockReason";
import { hintText } from "@/src/game/core/presentation/hintText";
import { instructionText } from "@/src/game/core/presentation/instructions";
import { memberPlaceIdsForLead, componentBlockAtTail } from "@/src/game/core/model/components";

/** Total clockwise rotation to fully tighten a fastener, in degrees. */
export const TIGHTEN_TOTAL_DEG = 720;
/** Mallet taps to drive a tool-secured part flush. */
export const MALLET_TAPS = 5;
/** Demo rotation needed to accept an orientation correction, in degrees. */
export const ORIENTATION_TOTAL_DEG = 180;
/** Taps to press a push-fit part home (PressControl). */
export const PRESS_TAPS = 4;

export type { AccessibilitySettings } from "@/src/game/core/accessibility";

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
  /** Tray group the ? hint points at (a pickup step): the tray flashes that card and scrolls it into view. */
  hintGroup: GroupId | null;
  /** Bumped on every ? press so a repeated hint for the same group re-triggers the flash. */
  hintPulse: number;
  /** Accumulated tighten rotation per tighten-action id, in degrees. */
  tightenDeg: Record<ActionId, number>;
  /** Snap action parked at the socket, waiting for orientation correction. */
  orientationActionId: ActionId | null;
  /** Accumulated orientation correction per snap-action id, in degrees. */
  orientationDeg: Record<ActionId, number>;
  /** placePart parked at its seat awaiting a slide/press DRIVE gesture (null = none). Parallel to the orientation/screw park, but for the linear gestures: a slider glided in, a push-fit pressed home. */
  driveActionId: ActionId | null;
  driveKind: "slide" | "press" | "screw" | null;
  /** Normalized 0..1 drive progress per parked action id (SlideControl adds a  drag fraction; PressControl adds 1/PRESS_TAPS per tap). */
  driveProgress: Record<ActionId, number>;
  /** Tool the player holds when `settings.manualTools` is on (sticky across steps). */
  selectedTool: ToolId | null;

  settings: AccessibilitySettings;
  /** The last-applied onboarding profile (the settings picker shows/sets it). */
  profile: ProfileId;
  /** How the assembly task is gated: free | plan | guide. */
  mode: AssemblyMode;
  /** 3D render style for the scene: realistic | cozy | cartoon (own axis, not theme). */
  renderStyle: RenderStyleId;
  /** Scene background: clean | studio | dot (independent of the model look). */
  backdrop: BackdropId;
  /** Backdrop behind the room diorama. Its own axis (and its own image set, src/room/ui/roomBackdrops): the room is a place you live in, the build scene is a task, so they are dressed separately. */
  roomBackdrop: RoomBackdropId;
  /** Which hour of the day the room's sun is set to. Chosen, not clock-driven: the light's angle is a look the player picks, and every preset is authored to enter through walls the camera can see (see src/room/core/timeOfDay.ts). */
  roomTimeOfDay: TimeOfDayId;
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
  setRoomBackdrop: (backdrop: RoomBackdropId) => void;
  setRoomTimeOfDay: (time: TimeOfDayId) => void;
  setTheme: (theme: ThemeId) => void;

  completeAction: (id: ActionId) => void;
  /** Undo history for redo: actions undone since the last new completion. */
  undoneActions: ActionId[];
  undoLastAction: () => void;
  /** Re-apply the most recently undone action (only while nothing new was completed since — completing anything clears the redo stack). */
  redoLastAction: () => void;
  addTightenDeg: (actionId: ActionId, deg: number) => void;
  parkOrientation: (actionId: ActionId) => void;
  addOrientationDeg: (actionId: ActionId, deg: number) => void;
  /** Park a placePart for a linear DRIVE (slide glide / press push). */
  parkDrive: (actionId: ActionId, kind: "slide" | "press" | "screw") => void;
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
  /** The build map (ClusterFocusControl) shown on demand — the pause screen. It opens by
   *  itself when no cluster has been chosen yet; this flag is for reopening it mid-build. */
  mapOpen: boolean;
  setMapOpen: (open: boolean) => void;
  /** The build map has been shown once for this furniture. Single-cluster builds open it as
   *  an intro; this is what stops it reappearing every time the player returns. */
  mapSeen: boolean;
  setMapSeen: (seen: boolean) => void;
  /** The finished-build screen has been dismissed. Without it, undoing from that screen
   *  would re-show it the instant the step was redone. */
  doneDismissed: boolean;
  setDoneDismissed: (v: boolean) => void;
  /** The build is finished but the player has NOT yet tapped "Complete": they can still orbit
   *  and inspect the model. The finished-build screen waits on this so the last look isn't
   *  snatched away the instant the final part lands. */
  completeConfirmed: boolean;
  setCompleteConfirmed: (v: boolean) => void;

  setActiveCluster: (cluster: ClusterId | null) => void;
  setCombiningCluster: (cluster: ClusterId | null) => void;

  setSettings: (patch: Partial<AccessibilitySettings>) => void;
  /** Reset settings to a profile's defaults (onboarding / avatar change). */
  applyProfile: (profile: ProfileId) => void;
}

const CLEARED = {
  heldActionId: null,
  examine: null,
  fitState: "idle" as FitState,
  matchedActionId: null,
  hint: null,
  hintGroup: null,
};

export const useGameStore = create<GameState>()((set, get) => ({
  furniture: null,
  completed: [],
  undoneActions: [],
  hintPulse: 0,
  ...CLEARED,
  activeCluster: null,
  combiningCluster: null,
  mapOpen: false,
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
  // Initial settings = the "control" profile (not raw defaults), so the store always matches its declared profile.
  settings: settingsForProfile("control"),
  profile: "control",
  mode: "free",
  renderStyle: "realistic",
  backdrop: "studio",
  // Daytime: the room set now offers photos only (no "clear"), and day is the neutral one to open on.
  roomBackdrop: "day",
  // Afternoon: the longest warm pool of the day, and the look the room was tuned against.
  roomTimeOfDay: "afternoon",
  // Light by default. The palette (ui/theme.ts) was designed against the dark reference,
  // but light is the safer default for a study: it survives a bright room, a projector,
  // and a participant's own phone brightness, none of which we control. Dark and
  // high-contrast are the SAME product in different light — same three accent hues, same
  // meanings — so switching costs nothing but the setting.
  theme: "light",

  loadFurniture: (f) =>
    set({
      furniture: f,
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
  setMode: (mode) => set({ mode }),
  setRenderStyle: (renderStyle) => set({ renderStyle }),
  setBackdrop: (backdrop) => set({ backdrop }),
  setRoomBackdrop: (roomBackdrop) => set({ roomBackdrop }),
  setRoomTimeOfDay: (roomTimeOfDay) => set({ roomTimeOfDay }),
  setTheme: (theme) => set({ theme }),

  completeAction: (id) => {
    const s = get();
    if (s.completed.includes(id)) return;
    if (!s.available().some((a) => a.actionId === id)) return;
    // a component lead drags its sibling bodies in with it (one gesture, one card = one placement)
    const members = memberPlaceIdsForLead(s.furniture?.components, id);
    set({ completed: [...s.completed, id, ...members], undoneActions: [] });
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
    // re-cascade: redoing a component lead re-adds its siblings too
    const members = memberPlaceIdsForLead(s.furniture?.components, next);
    set({
      completed: [...s.completed, next, ...members],
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
    const a = get()
      .available()
      .find((x) => x.actionId === actionId);
    // a combineClusters with an authored slide overlay parks and drives exactly like a sliding part — the whole cluster is the mover
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
    set({ driveProgress: { ...get().driveProgress, [actionId]: cur } });
    if (cur >= 1) {
      get().completeAction(actionId);
      set({
        driveActionId: null,
        driveKind: null,
        driveProgress: {},
        // a cluster combine drive ends here — release the combining render mode too (no-op for part slides)
        combiningCluster: null,
        ...CLEARED,
      });
    }
  },

  noteBlocked: (actionId) => {
    const s = get();
    if (s.mode !== "free" || !s.settings.softHints || !s.furniture) return;
    const reason = blockReason(s.furniture, actionId, new Set(s.completed));
    if (reason)
      set({ hint: hintText(reason, s.furniture, s.settings.textLevel), hintGroup: null });
  },
  suggestNext: () => {
    const s = get();
    if (!s.furniture) return;
    const next = s.availableForMode()[0];
    if (!next) {
      set({ hint: "This area is done — switch focus.", hintGroup: null });
      return;
    }
    const text = instructionText(
      s.furniture.instructions,
      next.actionId,
      s.settings.textLevel,
    );
    // A pickup hint also names a tray card — flag its group so the tray can flash it and scroll it into view.
    const part = next.partId ? s.furniture.parts[next.partId] : undefined;
    const group = isPickupType(next.type) && part ? part.group : null;
    set({
      hint: text ? `Try: ${text}` : null,
      hintGroup: text ? group : null,
      hintPulse: s.hintPulse + 1,
    });
  },
  clearHint: () => set({ hint: null, hintGroup: null }),

  setSelectedTool: (tool) => set({ selectedTool: tool }),

  beginPickup: (actionId) => {
    const s = get();
    const a = s.furniture?.actions.find((x) => x.actionId === actionId);
    // stagePart is a tray pickup like the other two — taking a sub-assembly carrier out of the box is the same gesture as placing it, just with a different resting target
    if (!a || !isPickupType(a.type)) return;
    if (s.completed.includes(actionId)) return;
    const legal = s.available().some((x) => x.actionId === actionId);
    if (!legal && s.mode !== "free") return;
    // An untouched cluster refuses illegal pickups even in free mode, so its greyed opening-state cards never lift — the soft hint explains the opening move instead.
    if (!legal) {
      const cluster = actionCluster(s.furniture!, a);
      if (cluster && !clusterStarted(s.furniture!, cluster, new Set(s.completed))) {
        s.noteBlocked(actionId);
        return;
      }
    }
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

  examinePart: (partId) =>
    set({ ...CLEARED, examine: { kind: "part", partId } }),
  examineCluster: (cluster) =>
    set({ ...CLEARED, examine: { kind: "cluster", cluster } }),
  clearExamine: () => set({ examine: null }),
  setMapOpen: (open) => set({ mapOpen: open }),
  setMapSeen: (seen) => set({ mapSeen: seen }),
  setDoneDismissed: (v) => set({ doneDismissed: v }),
  setCompleteConfirmed: (v) => set({ completeConfirmed: v }),
  setActiveCluster: (cluster) => set({ activeCluster: cluster }),
  setCombiningCluster: (cluster) => set({ combiningCluster: cluster }),

  setSettings: (patch) => set({ settings: { ...get().settings, ...patch } }),
  applyProfile: (profile) =>
    set({
      profile,
      settings: settingsForProfile(profile),
      mode: PROFILE_MODE[profile],
    }),
}));

/** The "first part" case: a part is held AND the cluster it belongs to has no structural part placed yet. The very first drop gets a simplified UX — drop on a centre ring instead of aiming at a socket ghost. Shared by the scene, the drag, and the centre-ring overlay so they agree. */
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