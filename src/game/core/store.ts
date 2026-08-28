// Game state control

import { create } from "zustand";
import AsyncStorage from "@react-native-async-storage/async-storage";

//type
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
import { isPickupType } from "@/src/game/core/ids";
import {
  memberPlaceIdsForLead,
  componentBlockAtTail,
} from "@/src/game/core/model/components";

// player setting
import { AccessibilitySettings } from "@/src/game/core/accessibility";
import {
  PROFILE_MODE,
  ProfileId,
  settingsForProfile,
} from "@/src/game/core/profile";

// player assemble state
import {
  actionCluster,
  clusterStarted,
} from "@/src/game/core/evaluation/clusters";
import {
  actionableGroups,
  availableActions,
  availableInMode,
  currentStage,
  nextAction,
  openWayCount,
} from "@/src/game/core/evaluation/availability";

// rules - evaluation
import { FitState } from "@/src/game/core/geometry/fit";
import { blockReason } from "@/src/game/core/evaluation/blockReason";
import { hasTrayCard } from "@/src/game/core/evaluation/trayCard";

// presentation
import { hintText } from "@/src/game/core/presentation/hintText";
import { instructionText } from "@/src/game/core/presentation/instructions";

// --------------- some constants for non pick-up actions
export const TIGHTEN_TOTAL_DEG = 720; // Total clockwise rotation to fully tighten a [fastener]. degrees
export const MALLET_TAPS = 5; // tap amount for Mallet
export const ORIENTATION_TOTAL_DEG = 180; //Total clockwise rotation to fully tighten a [part]. degrees
export const PRESS_TAPS = 4; //tap amount for hand press

// --------------- some types defined for states
// What the player is looking at -> determine camera pivot
export type ExamineTarget =
  | { kind: "part"; partId: PartId }
  | { kind: "cluster"; cluster: ClusterId };
// socket is blocked in viewport. reason being camera angle or zoom-in value
export type AimBlock = "camera" | "zoom";

interface GameState {
  furniture: Furniture | null; // The furniture currently being assembled (loaded when chosen)
  partBoxes: Record<PartId, PartBox>; // per-part world bounds at baked pose, from the furniture's boxes.gen (derive-boxes.mts). Empty = consumers fall back to the visual-centre clamp

  // ------ action state
  completed: ActionId[]; // Completed action ids
  heldActionId: ActionId | null; // Part picked up via long-press
  examine: ExamineTarget | null; // Item being examined
  activeCluster: ClusterId | null;
  combiningCluster: ClusterId | null; // Cluster picked up via long-press
  matchedActionId: ActionId | null;

  // ---- moving state
  fitState: FitState; // -> fitchip
  aimBlocked: AimBlock | null; // why the aim is blocked
  // Nearest socket the held part would snap to.

  // ----- hint btn
  hint: string | null; // TEXT - free-mode hint shown when reaching for a not-yet-available part.
  hintTone: "info" | "error"; // shown by request or prompted by wrong step

  hintGroups: GroupId[]; // accompanying hint ?: all available part cards flash + scroll to view
  hintClusters: ClusterId[]; // accompanying hint ?: all available cluster cards flash
  hintParts: PartId[]; // accompanying hint: card-less parts for (tighten, insert-press, staged seat, beat)
  hintTool: ToolId | null; // The tool the ? hint is pointing at, or null whenever manualTools is off

  // ---- spot btn
  hintGroup: GroupId | null; // accompanying spot: show the right part cards flashes + scroll to view (one step)
  hintPartId: PartId | null; // accompanying spot: shows ghost preview (so part-specific not group).

  hintPulse: number; //Bumped on every ? press so a repeated hint for the same group re-triggers the flash

  // ----- fires after the hint timer (2800ms) -> depends on hintPulse
  clearSpot: () => void;

  // ---- tightening fastener states
  tightenDeg: Record<ActionId, number>; // Accumulated tighten rotation per tighten-action id, in degrees (when you have several screws to tighten)
  // ---- screwing structural part states
  orientationActionId: ActionId | null; // Accumulated orientation correction per snap-action id, in degrees.
  orientationDeg: Record<ActionId, number>;
  // ---- driving (slide/press) structural part states
  driveActionId: ActionId | null;
  driveKind: "slide" | "press" | "screw" | null;
  // SlideControl adds a drag fraction; PressControl adds 1/PRESS_TAPS per tap).
  driveProgress: Record<ActionId, number>;

  selectedTool: ToolId | null; // Tool the player holds when settings.manualTools is on (return to tray after each use)

  // ------ setting state
  settings: AccessibilitySettings; // The last-applied onboarding profile (the settings picker shows/sets it).
  profile: ProfileId; // How the assembly task is gated: free | guide.
  mode: AssemblyMode;

  // ------ fires when a new furniture task si open
  loadFurniture: (f: Furniture) => void;
  reset: () => void;

  // ------------------------- State Queries —--------------------

  // ---- legality
  available: () => AssemblyAction[]; // What the current MODE offers the player right now (tray/scene read this).
  availableForMode: () => AssemblyAction[];

  stage: () => number;
  progress: () => { completedCount: number; totalCount: number };
  completeAction: (id: ActionId) => void;

  undoneActions: ActionId[]; // Undo history for redo: actions undone since the last new completion.
  undoLastAction: () => void;
  redoLastAction: () => void; // canceled: Re-apply the most recently undone action

  addTightenDeg: (actionId: ActionId, deg: number) => void;
  parkOrientation: (actionId: ActionId) => void;
  addOrientationDeg: (actionId: ActionId, deg: number) => void;

  parkDrive: (actionId: ActionId, kind: "slide" | "press" | "screw") => void; // Park a placePart for a linear DRIVE (slide glide / press push).
  advanceDrive: (actionId: ActionId, delta: number) => void; // Advance a parked drive by a normalized fraction; completed at ≥1.

  noteBlocked: (actionId: ActionId) => void; // Reaching for a not-yet-available part in free mode → set a gentle nudge.

  suggestNext: (source?: "hint" | "spot") => void;
  clearHint: () => void;

  setSelectedTool: (tool: ToolId | null) => void;

  beginPickup: (actionId: ActionId) => void;
  setDragFit: (fitState: FitState, matchedActionId: ActionId | null) => void;
  setAimBlocked: (aimBlocked: AimBlock | null) => void;

  releaseHeld: () => void; // snap or return to tray

  noteMiss: (actionId: ActionId) => void; // Called when a drag ENDS WITHOUT PLACING — the part was set down in float mode, or flew back in auto-return
  missActionId: ActionId | null;
  missCount: number; //Recenter prompt: The action the player keeps failing to do, and how many times in a row they have failed it. Reset by a successful snap
  clearMisses: () => void; //reset missCount
  cancelHeld: () => void;

  examinePart: (partId: PartId) => void;
  examineCluster: (cluster: ClusterId) => void;
  clearExamine: () => void;

  mapOpen: boolean; // The build map. It opens by itself when no cluster has been chosen yet
  setMapOpen: (open: boolean) => void;

  settingsOpen: boolean; // The settings panel
  setSettingsOpen: (open: boolean) => void;

  activityTick: number; // bumped when player do sth (including camera control) -> for detect in activity. at most one bump per second
  noteActivity: () => void;

  celebratingCluster: ClusterId | null; // cluster finished card popping out
  celebratedClusters: ClusterId[]; // Clusters already celebrated for this furniture. going back into a finished stage from the project map must not replay its card.
  celebrateCluster: (cluster: ClusterId) => void;
  dismissCelebration: () => void;
  baselineCelebrated: (clusters: ClusterId[]) => void; // marks clusters as

  mapSeen: boolean; // The build map has been shown once for this furniture (for one-cluster furniture so it doesn''t show again)
  setMapSeen: (seen: boolean) => void;

  doneDismissed: boolean; // The finished-build screen has been dismissed.
  setDoneDismissed: (v: boolean) => void;

  completeConfirmed: boolean; // The build is finished but the player has NOT yet tapped "Complete": they can still orbit and inspect the model.
  setCompleteConfirmed: (v: boolean) => void;

  setActiveCluster: (cluster: ClusterId | null) => void;
  setCombiningCluster: (cluster: ClusterId | null) => void;
  setMode: (mode: AssemblyMode) => void;
  setSettings: (patch: Partial<AccessibilitySettings>) => void;
  // Reset settings to a profile's defaults (onboarding / avatar change).
  applyProfile: (profile: ProfileId) => void;
}

// --------------- what every interaction boundary resets: the held part, the aim, and all hint marks
const CLEARED = {
  heldActionId: null,
  examine: null,
  fitState: "idle" as FitState,
  aimBlocked: null as AimBlock | null,
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

// --------------- settings persistence

// `applyProfile` rewrites every default, and the loading gate calls it on every app start. Remembering WHICH KEYS were touched, not the whole object. Restored by `hydrateSettings`, called once at app start.
const SETTINGS_KEY = "modu.settings.v1";
const TOUCHED_KEY = "modu.settings.touched.v1";

const touched = new Set<string>();

const RETIRED_SETTINGS = new Set<string>(["dragPlane", "lightingPreset"]); // delete later

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

//Load the player's own settings back over the current defaults. Call once at app start, the gate reads the saved onboarding mode and calls applyProfile, which needs `touched` populated to know what to keep.
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
    // Only the touched keys are laid back down. Anything else in the blob is a default from an older release, and the current default is the better answer.
    const kept: Record<string, unknown> = {};
    for (const key of touched) {
      if (key in saved) kept[key] = (saved as Record<string, unknown>)[key];
    }
    useGameStore.setState((state) => ({
      settings: {
        ...state.settings,
        ...(kept as Partial<AccessibilitySettings>),
      },
    }));
  } catch {
    // A corrupt blob is not worth failing a launch over — the defaults are always valid.
  }
}

// --------------- the store
// Module-local, not state: noteActivity throttles on it and nothing renders from it.
let lastActivityAt = 0;

export const useGameStore = create<GameState>()((set, get) => ({
  // ----- the build being played
  furniture: null,
  partBoxes: {},
  completed: [],
  undoneActions: [],

  // ----- interaction: held part, aim, hints. CLEARED supplies every field an interaction boundary resets
  ...CLEARED,
  hintPulse: 0,
  activeCluster: null,
  combiningCluster: null,
  missActionId: null as ActionId | null,
  missCount: 0,

  // ----- gesture progress (tighten / orientation / drive) + the equipped tool
  tightenDeg: {},
  orientationActionId: null,
  orientationDeg: {},
  driveActionId: null,
  driveKind: null,
  driveProgress: {},
  selectedTool: null,

  // ----- HUD surfaces
  mapOpen: false,
  mapSeen: false,
  settingsOpen: false,
  activityTick: 0,
  celebratingCluster: null as ClusterId | null,
  celebratedClusters: [] as ClusterId[],
  doneDismissed: false,
  completeConfirmed: false,

  // ----- player settings
  // Initial settings = the "control" profile (not raw defaults), so the store always matches its declared profile.
  settings: settingsForProfile("control"),
  profile: "control",
  mode: "free",

  // --------------- load / reset
  loadFurniture: (f) =>
    set({
      furniture: f,
      mode: f.meta.mode ?? get().mode, // A furniture (EKET) may pin the mode its build opens in (meta.mode), outranking the profile mode this store was left in. a resumed build's own mode lands right after, via applyBuild, so a player who switched mid-build gets their switch back rather than this.
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

      partBoxes: f.boxes ?? {}, // this must be replaced wholesale on every load. Empty when a furniture ships no boxes.gen — every consumer falls back to the visual-centre clamp.
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

  // --------------- reads: what is legal, what the mode offers, where we are
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

  // --------------- completing, undo, redo
  completeAction: (id) => {
    const s = get();
    if (s.completed.includes(id)) return;
    if (!s.available().some((a) => a.actionId === id)) return;

    const members = memberPlaceIdsForLead(s.furniture?.components, id); // a component lead drags its sibling bodies in with it

    const finished = s.furniture?.actions.find((a) => a.actionId === id); // the player decides which tool each step needs, so the choice is asked every time rather than once per build
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
      ? componentBlockAtTail(
          s.furniture.components,
          s.furniture.actions,
          completed,
        )
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
      orientationActionId: removed.includes(s.orientationActionId as ActionId)
        ? null
        : s.orientationActionId,
      driveActionId: removed.includes(s.driveActionId as ActionId)
        ? null
        : s.driveActionId,
      driveKind: removed.includes(s.driveActionId as ActionId)
        ? null
        : s.driveKind,
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
  // --------------- gesture progress: each control feeds its park until the action completes
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
    if (!a || (a.type !== "placePart" && a.type !== "combineClusters")) return; // a combineClusters with an authored slide overlay parks and drives like a sliding part — the whole cluster is the mover
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

  // --------------- hints: "?" shows every target, Spot demonstrates one
  noteBlocked: (actionId) => {
    const s = get();
    if (
      s.mode !== "free" ||
      !s.settings.softHints ||
      s.settings.focusMode ||
      !s.furniture
    )
      return; // no hints for theses
    const done = new Set(s.completed);

    // blockReason stays the GATE and runs first: a null reason means the action is not actually blocked, and that case must stay silent. Asking the count first would start firing the generic line
    const reason = blockReason(s.furniture, actionId, done);
    if (reason)
      set({
        hint: hintText(
          reason,
          s.furniture,
          s.settings.textLevel,
          openWayCount(s.furniture, done),
        ),
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

    // "?" (Hint) highlights every actionable target and prompts generic line: with several moves legal. The count is by GROUP so eight legal tightens of one screw read as a single target.
    if (source === "hint") {
      const groups = actionableGroups(f, avail);
      // an action is highlighted on the tray if it has a card
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
      /// Partless actions have no part for either loop above to point at — the combine stage is all of them today. Their cards live in the cluster tray, so the section is the target.
      const hintClusters: ClusterId[] = [];
      for (const a of avail) {
        if (!a.partId && a.cluster && !hintClusters.includes(a.cluster))
          hintClusters.push(a.cluster);
      }
      // A tool-using step is gated on equipping the tool first
      const hintTool = s.settings.manualTools
        ? (avail.find((a) => a.tool && a.tool !== "hand")?.tool ?? null)
        : null;
      const partTargets = groups.length;
      const hint = hintTool
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
                const t = instructionText(
                  f.instructions,
                  avail[0].actionId,
                  s.settings.textLevel,
                );
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

    // nextAction, not avail[0]
    const next =
      nextAction(
        f,
        avail,
        new Set(s.completed),
        s.driveActionId ?? s.orientationActionId,
      ) ?? avail[0];
    const text = instructionText(
      f.instructions,
      next.actionId,
      s.settings.textLevel,
    );
    // A pickup step  — lets the tray flash it and scroll it into view.
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
  // Drop the spotlight and the ? scene marks
  clearSpot: () => set({ hintPartId: null, hintParts: [] }),

  // --------------- tool
  setSelectedTool: (tool) => set({ selectedTool: tool }),

  // --------------- pickup and drag
  beginPickup: (actionId) => {
    const s = get();
    const a = s.furniture?.actions.find((x) => x.actionId === actionId);
    // stagePart is aspecial tray pickup: taking a sub-assembly carrier out of the box is the same gesture as placing it, just with a different resting target
    if (!a || !isPickupType(a.type)) return;
    if (s.completed.includes(actionId)) return;
    const legal = s.available().some((x) => x.actionId === actionId);
    if (!legal && s.mode !== "free") return;
    // An untouched cluster refuses illegal pickups even in free mode, so its greyed opening-state cards never lift — the soft hint explains the opening move instead.
    if (!legal) {
      const cluster = actionCluster(s.furniture!, a);
      if (
        cluster &&
        !clusterStarted(s.furniture!, cluster, new Set(s.completed))
      ) {
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
    if (!heldActionId) return;
    const ok = fitState === "nearCorrect";
    if (ok) get().completeAction(matchedActionId ?? heldActionId);
    // ONLY the success side: the drag calls this on the matched branch alone, so a failed drag never arrives here
    set({ ...CLEARED, ...(ok ? { missActionId: null, missCount: 0 } : {}) });
  },
  noteMiss: (actionId) =>
    set((s) => ({
      missActionId: actionId,
      missCount: s.missActionId === actionId ? s.missCount + 1 : 1,
    })),
  clearMisses: () => set({ missActionId: null, missCount: 0 }),
  cancelHeld: () =>
    set({
      orientationActionId: null,
      orientationDeg: {},
      driveActionId: null,
      driveKind: null,
      driveProgress: {},
      ...CLEARED,
    }),

  // --------------- examine (look only, no assembly)
  examinePart: (partId) =>
    set({ ...CLEARED, examine: { kind: "part", partId } }),
  examineCluster: (cluster) =>
    set({ ...CLEARED, examine: { kind: "cluster", cluster } }),
  clearExamine: () => set({ examine: null }),
  // --------------- HUD surfaces: map, settings panel, activity, celebration
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
  // Marks what is already finished as celebrated without showing anything — used when a build is first loaded or resumed, so old wins do not replay.
  baselineCelebrated: (clusters) =>
    set({ celebratedClusters: clusters, celebratingCluster: null }),
  setMapSeen: (seen) => set({ mapSeen: seen }),
  setDoneDismissed: (v) => set({ doneDismissed: v }),
  setCompleteConfirmed: (v) => set({ completeConfirmed: v }),
  // --------------- cluster focus
  setActiveCluster: (cluster) => set({ activeCluster: cluster }),
  setCombiningCluster: (cluster) => set({ combiningCluster: cluster }),

  // --------------- player settings
  setSettings: (patch) => {
    set({ settings: { ...get().settings, ...patch } });
    // key the player has touched, remembered
    for (const key of Object.keys(patch)) touched.add(key);
    void persistSettings(get().settings);
  },
  applyProfile: (profile) => {
    // The profile's defaults, with the player's own choices laid back over the top.
    const base = settingsForProfile(profile);
    const kept: Partial<AccessibilitySettings> = {};
    for (const key of touched) {
      if (key in get().settings) {
        (kept as Record<string, unknown>)[key] = (
          get().settings as unknown as Record<string, unknown>
        )[key];
      }
    }
    const settings = { ...base, ...kept };
    set({ profile, settings, mode: PROFILE_MODE[profile] });
    void persistSettings(settings);
  },
}));

// --------------- selectors
// The "first part" case: a part is held AND the cluster it belongs to has no structural part placed yet. The very first drop drop on a centre ring instead of aiming at a socket ghost.
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
