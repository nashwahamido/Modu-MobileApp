import { useMemo } from "react";
import {
  actionCluster,
  combineReady,
  currentStageForClusterFocus,
  requiresClusterFocus,
} from "@/src/game/core/evaluation/clusters";
import { availableInMode, currentStage } from "@/src/game/core/evaluation/availability";
import { hasTrayCard } from "@/src/game/core/evaluation/trayCard";
import { isStaged, stagedCarriers, stagedMembers } from "@/src/game/core/model/staging";
import { isPickupType } from "@/src/game/core/ids";
import { buildPartActions } from "@/src/game/core/scene/targets";
import { labelFor } from "@/src/game/core/presentation/labels";
import {
  ActionId,
  AssemblyAction,
  AssemblyMode,
  ClusterId,
  Furniture,
  GroupId,
  PartId,
  PartType,
} from "@/src/game/core/type";
import { useGameStore } from "@/src/game/core/store";

/** socket_hint: an unplaced part whose snap or insert socket is currently reachable (same group as the held part). Renders as a glowing ghost at its target position so the player can see all valid drop targets at once. */
export type PartMode =
  | "hidden"
  | "flush"
  | "loose"
  | "held"
  | "socket_hint"
  | "combining"
  | "riding"
  /** Out on the canvas at its sub-assembly rest pose: a staged carrier the player has taken out, and each piece of hardware already pressed into it. Rendered at `stageOffset` from the baked pose until the whole group is carried home. */
  | "staged";

export interface TrayItem {
  label: string;
  group: GroupId;
  /** Representative part for the group (thumbnail source). */
  partId: PartId;
  /** Parts of this kind not yet placed/inserted in the current stage. */
  remaining: number;
  /** Representative action picked up when the card is grabbed (if enabled). */
  action: AssemblyAction | null;
  enabled: boolean;
  kind: PartType;
}

export interface SceneState {
  modes: Record<string, PartMode>;
  /** Action whose part the player is currently holding. */
  heldAction: AssemblyAction | null;
  /** Everything this stage uses, grouped — the inventory column. */
  trayItems: TrayItem[];
  /** Uncompressed inventory before Focus mode chooses a single card. Tutorial gates use this so a required card cannot be filtered out twice. */
  allTrayItems: TrayItem[];
  /** Tighten action currently awaiting the circular gesture. */
  activeTighten: AssemblyAction | null;
  /** 3-phase insertFastener currently awaiting the PRESS gesture (stage → loose). */
  activeInsertPress: AssemblyAction | null;
  /** A staged sub-assembly resting above its seat, ready to be slid in (placePart of a staged carrier) — the prompt, and it persists once grabbed so the slider survives the pickup. */
  stagedSeat: AssemblyAction | null;
  /** Reorient/combine beat currently awaiting the player's swipe. */
  activeBeat: AssemblyAction | null;
}

export function deriveSceneState(
  furniture: Furniture,
  completed: readonly ActionId[],
  heldActionId: ActionId | null,
  activeCluster: ClusterId | null = null,
  matchedActionId: ActionId | null = null,
  mode: AssemblyMode = "free",
  focusMode = false,
  /** The part Spot is pointing at. Shows that ONE socket's ghost with nothing held — a parameter
   *  rather than a store read so this stays a pure function the tests can drive. */
  hintPartId: PartId | null = null,
): SceneState {
  const done = new Set(completed);
  const actionById = new Map(furniture.actions.map((a) => [a.actionId, a]));
  const partActions = buildPartActions(furniture.actions);

  const heldAction = heldActionId ? (actionById.get(heldActionId) ?? null) : null;
  const focusRequired = requiresClusterFocus(furniture);
  const available = availableInMode(furniture, done, mode, activeCluster);
  const effectiveCluster =
    mode === "strict" && available[0]
      ? (actionCluster(furniture, available[0]) ?? activeCluster)
      : activeCluster;
  const availableIds = new Set(available.map((a) => a.actionId));
  const stage = focusRequired
    ? currentStageForClusterFocus(furniture, done, effectiveCluster)
    : currentStage(furniture.actions, done);

  // An untouched cluster (none of its parts picked up yet) shows only its LEGAL cards as grabbable — free mode's grab-anything is suspended so each cluster's opening move (its seed, or a staged carrier) is unmistakable; from that cluster's first pickup on, normal per-mode rules resume.
  const startedClusters = new Set<ClusterId>();
  for (const a of furniture.actions) {
    if (a.partId && isPickupType(a.type) && done.has(a.actionId)) {
      startedClusters.add(furniture.parts[a.partId].cluster);
    }
  }

  const groups = new Map<string, TrayItem>();
  for (const a of furniture.actions) {
    if (focusRequired && (!effectiveCluster || actionCluster(furniture, a) !== effectiveCluster)) {
      continue;
    }
    if (!a.partId || done.has(a.actionId)) continue;
    if (mode !== "free" && a.stage !== stage) continue;
    // One definition of card-eligibility, shared with the focus-mode decision below and with the store's ? highlight — see hasTrayCard for which pickup types are excluded and why.
    if (!hasTrayCard(furniture, a)) continue;
    const part = furniture.parts[a.partId];
    const comp = furniture.components?.byBody[a.partId];
    const compLabel = comp ? furniture.components!.label[comp] : undefined;
    const pickable = !heldAction && availableIds.has(a.actionId);
    const draggable =
      pickable ||
      (!heldAction && mode === "free" && startedClusters.has(part.cluster));
    const isHeld = heldAction?.actionId === a.actionId;
    const label = compLabel ? compLabel.standard : labelFor(furniture.labels, part.group);
    const g = groups.get(part.group);
    if (g) {
      g.remaining += 1;
      if (isHeld) {
        g.action = a;
      } else if (pickable && !availableIds.has(g.action?.actionId as never)) {
        g.action = a;
      }
      // isHeld: a floating part (releaseBehavior "float") stays re-grabbable from its card — don't render it disabled.
      if (draggable || isHeld) g.enabled = true;
    } else {
      groups.set(part.group, {
        label,
        group: part.group,
        partId: part.partId,
        remaining: 1,
        action: a,
        enabled: draggable || isHeld,
        kind: part.type,
      });
    }
  }
  const allTray = [...groups.values()];
  // Guided mode leads, so the cards the player can actually use come first — authored order is the right default in free mode, where reordering the tray would railroad a player who is deliberately building their own way. Sorted on availableIds, NOT on `enabled`: enabled also covers free mode's grab-anything cards, and trusting it here is what put a LEG at the top of focus mode while the only legal step was a bolt. Stable sort, so everything keeps its authored order within the actionable and non-actionable halves.
  const guidedOrder =
    mode !== "free"
      ? [...allTray].sort(
          (a, b) =>
            Number(!!b.action && availableIds.has(b.action.actionId)) -
            Number(!!a.action && availableIds.has(a.action.actionId)),
        )
      : allTray;
  let trayItems = guidedOrder;
  if (focusMode && allTray.length > 0) {
    if (heldAction?.partId) {
      const heldG = furniture.parts[heldAction.partId].group;
      const only = allTray.filter((t) => t.group === heldG);
      trayItems = only.length ? only : allTray.slice(0, 1);
    } else if (available[0] && !hasTrayCard(furniture, available[0])) {
      // The next step is an on-canvas gesture (tighten, insert-press, staged seat, beat) and has no card of its own. Focus mode's single card must BE the next step, so showing the next PICKUP here would present a later part as the current one. PartsTray renders nothing for an empty list.
      trayItems = [];
    } else {
      // ACTUALLY actionable, not merely enabled: in free mode `enabled` also covers grab-anything cards (any part in a started cluster is draggable), so the old `find(t => t.enabled)` handed focus mode a LEG while the only legal step was a bolt — the exact failure the comment below was written to prevent, with the wrong predicate. Fall back to enabled, then to the first card, so a state with nothing available still shows something rather than nothing.
      trayItems = [
        allTray.find((t) => t.action && availableIds.has(t.action.actionId)) ??
          allTray.find((t) => t.enabled) ??
          allTray[0],
      ];
    }
  }
  const firstTighten = available.find((a) => a.type === "tightenFastener") ?? null;
  const activeTighten = !heldAction ? firstTighten : null;
  // 3-phase insert: the dowel is already out on the canvas at its stage pose, so its "insert" is a PRESS gesture (not a tray pickup) — surface it like a tighten.
  const firstInsertPress =
    available.find(
      (a) => a.type === "insertFastener" && !!(a.partId && furniture.parts[a.partId]?.insertStage),
    ) ?? null;
  const activeInsertPress = !heldAction ? firstInsertPress : null;
  // A finished staged sub-assembly seats by sliding straight down (stage sits above target). Prompt when its place is available; once the slider grabs it (held), keep pointing at it so the control survives the pickup.
  const isStagedPlace = (a: AssemblyAction | null): boolean =>
    !!a && a.type === "placePart" && !!a.partId && isStaged(furniture.parts[a.partId]);
  const stagedSeat = isStagedPlace(heldAction)
    ? heldAction
    : (!heldAction
        ? (available.find((a) => a.type === "placePart" && a.partId && isStaged(furniture.parts[a.partId])) ?? null)
        : null);
  const activeBeat = !heldAction
    ? (available.find((a) => a.type === "reorient" || a.type === "combineClusters") ?? null)
    : null;
  // every combine done, not merely one — a single finished combine used to reveal the whole assembly and end the stage
  const combineActions = furniture.actions.filter((a) => a.type === "combineClusters");
  const combineDone =
    combineActions.length > 0 && combineActions.every((a) => done.has(a.actionId));
  const showAllClusters =
    combineDone || (activeBeat ? actionCluster(furniture, activeBeat) == null : false);
  // At the combine stage every not-yet-combined cluster is PRE-MOUNTED in "combining" mode (its entities stay out of the scene until its card is dragged — PartModel toggles membership). Mounting ~60 filament entities inside an active gesture is what froze the cluster drag-out.
  const pendingCombineClusters = new Set<ClusterId>(
    combineReady(furniture, done)
      ? combineActions
          .filter((a) => !done.has(a.actionId) && a.cluster)
          .map((a) => a.cluster!)
      : [],
  );

  const heldGroup =
    heldAction?.partId && isPickupType(heldAction.type)
      ? furniture.parts[heldAction.partId].group
      : null;
  const heldIsInsert = heldAction?.type === "insertFastener";
  // Socket ghosts, by what is in hand — this used to be the `ghostStyle` dev setting, and it is now decided by the part. A fastener group is a field of near-identical holes and the player is choosing WHICH one, so every open socket of the group is ghosted at once. A structural part is big, its sockets are few and far apart, and a scene full of translucent panels reads as clutter — so only the proximity-matched one shows. The ghost component colors matched vs unmatched.
  const showAllGroupSockets =
    !!heldAction?.partId && furniture.parts[heldAction.partId].type === "fastener";
  // When the held part is a multi-body component's LEAD, its unplaced sibling bodies ride along with it (see PartModel's "riding" case) instead of popping in only on release; already-placed siblings (a re-drag after undo) fall through to their normal placed modes below.
  const heldComponentId = heldAction?.partId ? furniture.components?.byBody[heldAction.partId] : undefined;
  const ridingComponent =
    heldComponentId && furniture.components?.lead[heldComponentId] === heldAction?.partId
      ? heldComponentId
      : undefined;
  // Carrying a finished sub-assembly home: the hardware already pressed into it rides the same live drag offset, exactly as a component's sibling bodies do. One riding set covers both, so a staged part that ALSO leads a component needs no extra case.
  const ridingStaged = new Set<PartId>(
    heldAction?.type === "placePart" && heldAction.partId && isStaged(furniture.parts[heldAction.partId])
      ? stagedMembers(furniture, heldAction.partId, done)
      : [],
  );
  // Everything currently resting at a staging offset, whoever it belongs to.
  const stagedOut = new Set<PartId>(
    stagedCarriers(furniture.parts).flatMap((c) => stagedMembers(furniture, c, done)),
  );

  const modes: Record<string, PartMode> = {};
  for (const id of Object.keys(furniture.parts) as PartId[]) {
    const acts = partActions[id] ?? {};
    const placed = acts.insert
      ? done.has(acts.insert)
      : acts.snap
        ? done.has(acts.snap)
        : false;
    // a cluster whose own combine is complete stays standing in the scene while later combines run
    const combinedIn = combineActions.some(
      (a) => a.cluster === furniture.parts[id].cluster && done.has(a.actionId),
    );
    const outsideFocus =
      focusRequired &&
      !showAllClusters &&
      !combinedIn &&
      (!effectiveCluster || furniture.parts[id].cluster !== effectiveCluster);

    if (pendingCombineClusters.has(furniture.parts[id].cluster)) {
      modes[id] = "combining";
    } else if (heldAction?.partId === id) modes[id] = "held";
    else if (ridingComponent && furniture.components?.byBody[id] === ridingComponent && !placed) modes[id] = "riding";
    else if (ridingStaged.has(id)) modes[id] = "riding";
    else if (stagedOut.has(id)) modes[id] = "staged";
    else if (outsideFocus) modes[id] = "hidden";
    else if (!placed) {
      const hintActionId = heldIsInsert ? acts.insert : acts.snap;
      // Spot, with nothing held. The path below needs a heldGroup, which is exactly what a player standing still and asking for help does not have.
      //
      // Snap OR insert: a screw is the part whose motion the player can least guess, so it is the one that most needs the demo. Inserts were excluded while the ghost rendered at its park pose — a glowing copy off the side of the assembly read as the model jumping — but the demo now drives the pose itself, from demoApproach down to the seat, so that reason is spent.
      //
      // Staged parts stay out: their real target is shifted by stageShiftFor, and a demo that ignores that shift would fly the ghost into the socket the sub-assembly has not reached yet.
      const spotAction = acts.snap ?? acts.insert;
      if (
        hintPartId === id &&
        spotAction &&
        availableIds.has(spotAction) &&
        !stagedOut.has(id) &&
        !furniture.parts[id].stageOffset
      ) {
        modes[id] = "socket_hint";
      } else if (
        heldGroup &&
        furniture.parts[id].group === heldGroup &&
        hintActionId &&
        availableIds.has(hintActionId) &&
        (showAllGroupSockets || hintActionId === matchedActionId)
      ) {
        modes[id] = "socket_hint";
      } else {
        modes[id] = "hidden";
      }
    }
    else if (acts.tighten && !done.has(acts.tighten)) modes[id] = "loose";
    else modes[id] = "flush";
  }
  return {
    modes,
    heldAction,
    trayItems,
    allTrayItems: allTray,
    activeTighten,
    activeInsertPress,
    stagedSeat,
    activeBeat,
  };
}

export function useSceneState(): SceneState {
  const furniture = useGameStore((s) => s.furniture);
  const completed = useGameStore((s) => s.completed);
  const heldActionId = useGameStore((s) => s.heldActionId);
  const activeCluster = useGameStore((s) => s.activeCluster);
  const matchedActionId = useGameStore((s) => s.matchedActionId);
  const hintPartId = useGameStore((s) => s.hintPartId);
  const mode = useGameStore((s) => s.mode);
  const focusMode = useGameStore((s) => s.settings.focusMode);
  return useMemo(
    () =>
      furniture
        ? deriveSceneState(furniture, completed, heldActionId, activeCluster, matchedActionId, mode, focusMode, hintPartId)
        : { modes: {}, heldAction: null, trayItems: [], allTrayItems: [], activeTighten: null, activeInsertPress: null, stagedSeat: null, activeBeat: null },
    [furniture, completed, heldActionId, activeCluster, matchedActionId, mode, focusMode, hintPartId],
  );
}