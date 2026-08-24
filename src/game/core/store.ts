import { create } from "zustand";
import type { TimeOfDayId } from "@/src/room/core/timeOfDay";
import type { RoomBackgroundId } from "@/src/room/ui/roomBackdrops";
// Type-only: the room's backdrop table carries image require()s, and the store must not pull those in.
import { isPickupType } from "@/src/game/core/ids";
import {
  actionableGroups,
  availableActions,
  availableInMode,
  currentStage,
  openWayCount,
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
  Handedness,
  PartBox,
  PartId,
  RenderStyleId,
  ThemeId,
  ToolId,
} from "@/src/game/core/type";
import { blockReason } from "@/src/game/core/evaluation/blockReason";
import { hasTrayCard } from "@/src/game/core/evaluation/trayCard";
import { hintText } from "@/src/game/core/presentation/hintText";
import { instructionText } from "@/src/game/core/presentation/instructions";
import { memberPlaceIdsForLead, componentBlockAtTail } from "@/src/game/core/model/components";
import AsyncStorage from "@react-native-async-storage/async-storage";

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
  /** Per-part world bounds at baked pose, harvested from Filament once the model loads (AssemblyScene). Empty until then — every consumer falls back, so a drag before the harvest simply behaves as it did before joint frames. */
  partBoxes: Record<PartId, PartBox>;
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
  /** The aim is parked on a socket whose contact faces away from the camera (facing gate) — the chip coaches a camera turn instead of hunting silently. */
  aimBlocked: boolean;
  /** Nearest interchangeable socket the held part would snap to. */
  matchedActionId: ActionId | null;
  /** FREE-mode soft hint shown when reaching for a not-yet-available part. */
  hint: string | null;
  /** Why the hint is showing: an "error" is a blocked/wrong move (the toast renders it in the
   *  warning colour and it arrives with the error sound); "info" is a requested suggestion. */
  hintTone: "info" | "error";
  /** Tray group the ? hint points at (a pickup step): the tray flashes that card and scrolls it into view. */
  hintGroup: GroupId | null;
  /** Tray groups the ? hint flashes. Plural and separate from hintGroup, which is Spot's single card: "?" highlights EVERY actionable target rather than picking one. */
  hintGroups: GroupId[];
  /** Scene parts the ? hint marks — actionable groups with no tray card of their own (tighten, insert-press, staged seat, beat). Separate from hintPartId, which is Spot's single spotlight and also drives socket_hint mode. */
  hintParts: PartId[];
  /** Cluster cards the ? hint flashes. At the combine stage every legal action is a partless combineClusters, so groups and parts are both empty and the section is the only thing there is to point at. */
  hintClusters: ClusterId[];
  /** Bumped on every ? press so a repeated hint for the same group re-triggers the flash. */
  hintPulse: number;
  /** The tool the ? hint is pointing at, or null. A tighten will not accept its gesture until that tool is equipped, so "which tool" earns the same flash as "which part". Carries the ID rather than a flag because an OPEN tool tray has to light one specific slot. Null whenever manualTools is off, since ToolBar renders nothing then and a highlight nothing can show is a promise broken. */
  hintTool: ToolId | null;
  clearSpot: () => void;
  /** The part the ? hint points at. Spotlights that part's socket in the scene for as long as the
   *  hint itself lives — clearHint drops both, so the toast's dismiss timer is also the ghost's. */
  hintPartId: PartId | null;
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
  /** Which hour of the day the room's sun is set to. Chosen, not clock-driven: the light's angle is a look the player picks, and every preset is authored to enter through walls the camera can see (see src/room/core/timeOfDay.ts). Also picks which of the three shots (day/sunset/night) roomBackground's photo shows — see timeOfDayPhase. */
  roomTimeOfDay: TimeOfDayId;
  /** Which photo hangs outside the room's window — Settings > General > "Room Background". Independent of roomTimeOfDay: that picks the HOUR shown in whichever background this names. Defaults to "bg7". */
  roomBackground: RoomBackgroundId;
  /** Display theme (backdrop + thumbnails): light | dark | high_contrast. */
  theme: ThemeId;
  /** Which hand drives the build — it MIRRORS the HUD, so the joystick, the trays, the button column and every task control move to the other side. Answered in onboarding's first question and read back at the loading gate (src/app/(onboarding)/loading.tsx). Deliberately out of `settings`: applyProfile replaces that object wholesale, so it would reset on every avatar change. */
  handedness: Handedness;
  /** "Assemble in dark mode": the BUILD screens render dark while the rest of the app stays as it
   *  is. Deliberately separate from `theme` — that one is the whole app's, and a player who wants a
   *  dark workbench is not asking for a dark shop. */
  assembleDark: boolean;

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
  setRoomTimeOfDay: (time: TimeOfDayId) => void;
  setRoomBackground: (background: RoomBackgroundId) => void;
  setTheme: (theme: ThemeId) => void;
  setHandedness: (handedness: Handedness) => void;
  setAssembleDark: (on: boolean) => void;

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
  /** Free-mode next-step help: suggest one doable next step (never forces it). */
  /** `source` is which control asked, and the two are now cleanly split:
   *  - "hint" (the "?" button) SHOWS rather than tells: it highlights every actionable target — tray
   *    cards via hintGroups, card-less scene parts via hintParts — and names none of them. Writing
   *    out one step while several are legal is an arbitrary pick presented as the answer.
   *  - "spot" is a request for a DEMONSTRATION: it plays the ghost into its socket and flashes the
   *    tray card, with NO text in Control (which has "?" for words). On profiles WITHOUT a "?"
   *    button, Spot keeps its text so those players still get a written nudge. */
  suggestNext: (source?: "hint" | "spot") => void;
  clearHint: () => void;

  setSelectedTool: (tool: ToolId | null) => void;

  beginPickup: (actionId: ActionId) => void;
  setDragFit: (fitState: FitState, matchedActionId: ActionId | null) => void;
  setAimBlocked: (aimBlocked: boolean) => void;
  releaseHeld: () => "snap" | "recover";
  /** The action the player keeps failing to place, and how many times in a row they have failed it.
   *  Reset by a successful snap, by moving to a different part, and by clearMisses. A run of these on
   *  ONE action is the difference between fumbling a drag and not being able to see where the part
   *  goes — which is what the recenter prompt is for. */
  missActionId: ActionId | null;
  missCount: number;
  /** Called when a drag ENDS WITHOUT PLACING — the part was set down in float mode, or flew back in
   *  auto-return. Not by releaseHeld: that only runs when a socket matched, so a counter living
   *  there counted successes and never saw a single failure. */
  noteMiss: (actionId: ActionId) => void;
  clearMisses: () => void;
  cancelHeld: () => void;

  examinePart: (partId: PartId) => void;
  examineCluster: (cluster: ClusterId) => void;
  clearExamine: () => void;
  /** The build map (ClusterFocusControl) shown on demand — the pause screen. It opens by
   *  itself when no cluster has been chosen yet; this flag is for reopening it mid-build. */
  mapOpen: boolean;
  setMapOpen: (open: boolean) => void;
  /** The settings panel is open over the build. Lifted out of GameSettings' own useState so the
   *  coaches can see it: a card that pops while the player is reading Settings is talking about a
   *  screen they are not looking at, exactly like the project map. */
  settingsOpen: boolean;
  setSettingsOpen: (open: boolean) => void;
  /** Bumped whenever the player is demonstrably working — including CAMERA-ONLY work, which touches
   *  nothing else in this store. The idle and stuck prompts restart their fuses on it. Throttled by
   *  noteActivity, so a per-frame gesture cannot re-render the HUD sixty times a second. */
  activityTick: number;
  noteActivity: () => void;
  /** The cluster whose celebration card is on screen, or null. Lifted out of ClusterCelebration's own
   *  useState so the coaches can see it — a card popping over the celebration is the same mistake as
   *  one popping over the map. */
  celebratingCluster: ClusterId | null;
  /** Clusters already celebrated for THIS furniture. In the store rather than a component ref so it
   *  survives a remount and a return visit: going back into a finished stage from the project map
   *  must not replay its card. Cleared by loadFurniture and reset. */
  celebratedClusters: ClusterId[];
  celebrateCluster: (cluster: ClusterId) => void;
  dismissCelebration: () => void;
  baselineCelebrated: (clusters: ClusterId[]) => void;
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
  setPartBoxes: (boxes: Record<PartId, PartBox>) => void;

  setSettings: (patch: Partial<AccessibilitySettings>) => void;
  /** Reset settings to a profile's defaults (onboarding / avatar change). */
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

/**
 * The settings the player has changed by hand, and where they are kept.
 *
 * `applyProfile` rewrites every default, and the loading gate calls it on every app start — so
 * without this a deliberate choice survives only until the app is next opened. Remembering WHICH
 * KEYS were touched, rather than the whole object, means a profile can still move its own defaults
 * between releases and only the player's actual decisions are protected.
 *
 * Fire-and-forget: a write that fails costs a preference at next launch, which is not worth blocking
 * a settings toggle for. Restored by `hydrateSettings`, called once at app start.
 */
const SETTINGS_KEY = "modu.settings.v1";
const TOUCHED_KEY = "modu.settings.touched.v1";

const touched = new Set<string>();

async function persistSettings(settings: AccessibilitySettings): Promise<void> {
  try {
    await AsyncStorage.multiSet([
      [SETTINGS_KEY, JSON.stringify(settings)],
      [TOUCHED_KEY, JSON.stringify([...touched])],
    ]);
  } catch {
    // Losing a preference is a small cost; a crashed settings screen is not.
  }
}

/**
 * Load the player's own settings back over the current defaults.
 *
 * Call ONCE at app start, and BEFORE the loading gate applies a profile — the gate reads the saved
 * onboarding mode and calls applyProfile, which needs `touched` populated to know what to keep.
 */
export async function hydrateSettings(): Promise<void> {
  try {
    const [[, rawSettings], [, rawTouched]] = await AsyncStorage.multiGet([
      SETTINGS_KEY,
      TOUCHED_KEY,
    ]);
    if (rawTouched) {
      for (const key of JSON.parse(rawTouched) as string[]) touched.add(key);
    }
    if (!rawSettings) return;
    const saved = JSON.parse(rawSettings) as Partial<AccessibilitySettings>;
    // Only the touched keys are laid back down. Anything else in the blob is a default from an older
    // release, and the current default is the better answer.
    const kept: Record<string, unknown> = {};
    for (const key of touched) {
      if (key in saved) kept[key] = (saved as Record<string, unknown>)[key];
    }
    useGameStore.setState((state) => ({
      settings: { ...state.settings, ...(kept as Partial<AccessibilitySettings>) },
    }));
  } catch {
    // A corrupt blob is not worth failing a launch over — the defaults are always valid.
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
  // Initial settings = the "control" profile (not raw defaults), so the store always matches its declared profile.
  settings: settingsForProfile("control"),
  profile: "control",
  mode: "free",
  renderStyle: "realistic",
  backdrop: "grid",
  // Afternoon: the longest warm pool of the day, and the look the room was tuned against.
  roomTimeOfDay: "afternoon",
  roomBackground: "bg7",
  // Light by default. The palette (ui/theme.ts) was designed against the dark reference, but light is the safer default for a study: it survives a bright room, a projector, and a participant's own phone brightness, none of which we control. Dark and high-contrast are the SAME product in different light — same three accent hues, same meanings — so switching costs nothing but the setting.
  theme: "light",
  // RIGHT by default, because the HUD was authored right-handed and that is what every screenshot, spotlight offset and tuned margin in the build assumes. A left-hander gets the mirror from their own answer to onboarding's first question; nobody gets it by accident.
  handedness: "right",
  assembleDark: false,

  loadFurniture: (f) =>
    set({
      furniture: f,
      // A furniture may pin the mode its build OPENS in (meta.mode), outranking the profile mode this store was left in. Only the opening value: a resumed build's own mode lands right after, via applyBuild, so a player who switched mid-build gets their switch back rather than this.
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
      // Cleared HERE only: part ids collide across furnitures (`leg_1` is both a LACK leg and a DALFRED leg), so a stale map would hand the drag the previous model's geometry until the next harvest lands. The other reset paths keep the same loaded model, where the boxes are still valid and dropping them would disable the feature mid-session for nothing.
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
  setMode: (mode) => set({ mode }),
  setRenderStyle: (renderStyle) => set({ renderStyle }),
  setBackdrop: (backdrop) => set({ backdrop }),
  setRoomTimeOfDay: (roomTimeOfDay) => set({ roomTimeOfDay }),
  setRoomBackground: (roomBackground) => set({ roomBackground }),
  setTheme: (theme) => set({ theme }),
  setAssembleDark: (assembleDark) => set({ assembleDark }),

  completeAction: (id) => {
    const s = get();
    if (s.completed.includes(id)) return;
    if (!s.available().some((a) => a.actionId === id)) return;
    // a component lead drags its sibling bodies in with it (one gesture, one card = one placement)
    const members = memberPlaceIdsForLead(s.furniture?.components, id);
    // Manual tools means the player decides which tool each step needs, so the choice is asked EVERY time rather than once per build — an equipped tool that survives its own step turns the setting into a one-off prompt. Only a real tool clears: a hand step equips nothing, so completing one must not throw away a pick made for the step after it.
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
    // Focus mode already shows only the current part and action, so an error toast on top of a deliberately quiet screen is noise.
    if (s.mode !== "free" || !s.settings.softHints || s.settings.focusMode || !s.furniture) return;
    const done = new Set(s.completed);
    // blockReason stays the GATE and runs first: a null reason means the action is not actually blocked, and that case must stay silent. Asking the way-count first would start firing the generic line at legal grabs.
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
      set({ hint: "This area is done — switch focus.", hintTone: "info", hintGroup: null, hintGroups: [], hintPartId: null, hintParts: [] });
      return;
    }

    // "?" (Hint) SHOWS rather than tells. It highlights every actionable target and names none of them: with several moves legal, writing out one of them is an arbitrary pick presented as the answer. The count is by GROUP so eight legal tightens of one screw read as a single target.
    if (source === "hint") {
      const groups = actionableGroups(f, avail);
      // A group is highlighted on the TRAY if any of its available actions earns a card, and in the SCENE otherwise — tightens, insert-presses, staged seats and beats have no card, and "tighten these eight screws" is a real state where every available action is card-less.
      const carded = new Set<GroupId>();
      for (const a of avail) {
        if (a.partId && hasTrayCard(f, a)) {
          const g = f.parts[a.partId]?.group;
          if (g) carded.add(g);
        }
      }
      const hintParts: PartId[] = [];
      for (const a of avail) {
        if (!a.partId) continue;
        const g = f.parts[a.partId]?.group;
        if (g && !carded.has(g)) hintParts.push(a.partId);
      }
      // A partless action names no part, so nothing above can point at it. The combine stage is entirely partless — that is where the toast used to claim a highlight that did not exist — and its cards live in the cluster tray, so the section IS the target.
      const hintClusters: ClusterId[] = [];
      for (const a of avail) {
        if (!a.partId && a.cluster && !hintClusters.includes(a.cluster)) hintClusters.push(a.cluster);
      }
      // A tool-using step is gated on equipping the tool first, so the tool bar is part of the answer. Gated on manualTools because ToolBar renders nothing without it — see the field's own note.
      const hintTool = s.settings.manualTools
        ? (avail.find((a) => a.tool && a.tool !== "hand")?.tool ?? null)
        : null;
      const partTargets = groups.length;
      const hint =
        // A tool-using step is blocked on equipping the tool, not on finding the part — nothing can happen until the tool is in hand — so naming the tool outranks the part/section wording below, and the part just keeps glowing in the scene as secondary information.
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
              // Nothing carries a part OR a cluster (a bare verify or reorient step): there is nothing to show, so tell — the same concrete line Spot uses. Never claim a highlight that does not exist.
              : (() => {
                  const t = instructionText(f.instructions, avail[0].actionId, s.settings.textLevel);
                  return t ? `Try: ${t}` : null;
                })();
      set({
        hint,
        // Guidance the player asked for, not a correction — the bubble stays cream, never the warning red.
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

    // Spot is the DEMONSTRATION: the ghost travels into its socket (hintPartId) and the tray flashes
    // the card to pick up (hintGroup) — the two halves of "which part, and where". No text in Control,
    // which has "?" for the words; kept on profiles without a "?" button so they still get a nudge.
    const next = avail[0];
    const text = instructionText(f.instructions, next.actionId, s.settings.textLevel);
    // A pickup step also names a tray card — its group lets the tray flash it and scroll it into view.
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
  clearHint: () => set({ hint: null, hintGroup: null, hintGroups: [], hintPartId: null, hintClusters: [], hintTool: null }),
  /** Drop the spotlight and the ? scene marks WITHOUT touching the toast. These are one-shots: they
   *  have to end on their own timer, not on the toast's, because a hint with no text never mounts a
   *  toast and would leave the markers lit for the rest of the build. */
  clearSpot: () => set({ hintPartId: null, hintParts: [] }),

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
  setAimBlocked: (aimBlocked) => set({ aimBlocked }),
  releaseHeld: () => {
    const { heldActionId, fitState, matchedActionId } = get();
    if (!heldActionId) return "recover";
    const ok = fitState === "nearCorrect";
    if (ok) get().completeAction(matchedActionId ?? heldActionId);
    // ONLY the success side is handled here. This function runs when a socket matched, so its
    // "recover" return means something else — see noteMiss for where a failed drag is actually
    // counted. A snap clears the run, so a player who gets it on the third go starts the next part
    // clean.
    set({ ...CLEARED, ...(ok ? { missActionId: null, missCount: 0 } : {}) });
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
  // A run is counted PER ACTION, and only while it stays the same one: putting a part down to try a
  // different one is a change of plan, not a fourth failure at the same socket.
  noteMiss: (actionId) =>
    set((s) => ({
      missActionId: actionId,
      missCount: s.missActionId === actionId ? s.missCount + 1 : 1,
    })),
  clearMisses: () => set({ missActionId: null, missCount: 0 }),
  setMapOpen: (open) => set({ mapOpen: open }),
  setSettingsOpen: (open) => set({ settingsOpen: open }),
  noteActivity: () => {
    // AT MOST ONCE A SECOND. Orbiting fires onUpdate every frame, and the only consumers are timers
    // measured in tens of seconds — a bump per frame would buy nothing and re-render the HUD
    // continuously for the whole gesture.
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
  // Marks what is ALREADY finished as celebrated without showing anything — used when a build is
  // first loaded or resumed, so old wins do not replay.
  baselineCelebrated: (clusters) =>
    set({ celebratedClusters: clusters, celebratingCluster: null }),
  setMapSeen: (seen) => set({ mapSeen: seen }),
  setDoneDismissed: (v) => set({ doneDismissed: v }),
  setCompleteConfirmed: (v) => set({ completeConfirmed: v }),
  setActiveCluster: (cluster) => set({ activeCluster: cluster }),
  setCombiningCluster: (cluster) => set({ combiningCluster: cluster }),
  setPartBoxes: (boxes) => set({ partBoxes: boxes }),

  setSettings: (patch) => {
    set({ settings: { ...get().settings, ...patch } });
    // EVERY key the player has touched, remembered. Not the whole settings object: a profile is
    // allowed to move its own defaults between releases, and a snapshot of every value would freeze
    // whatever they happened to be on the day this player first opened the app.
    for (const key of Object.keys(patch)) touched.add(key);
    void persistSettings(get().settings);
  },
  setHandedness: (handedness) => set({ handedness }),
  applyProfile: (profile) => {
    // The profile's defaults, WITH the player's own choices laid back over the top.
    //
    // This used to replace `settings` outright, and the loading gate calls it on every app start —
    // so a toggle the player changed lived until they next opened the app and then quietly went
    // back. Handedness was moved out of `settings` for exactly this reason; the rest of the object
    // needed the same protection rather than the same escape hatch.
    //
    // Only KEYS THE PLAYER HAS TOUCHED survive. Switching profile still does what it says — it
    // rewrites every default — but it cannot undo a deliberate choice, and a preference stays until
    // it is changed back by hand.
    const base = settingsForProfile(profile);
    const kept: Partial<AccessibilitySettings> = {};
    for (const key of touched) {
      if (key in get().settings) {
        (kept as Record<string, unknown>)[key] = (get().settings as unknown as Record<string, unknown>)[key];
      }
    }
    const settings = { ...base, ...kept };
    set({ profile, settings, mode: PROFILE_MODE[profile] });
    void persistSettings(settings);
  },
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