import { useMemo } from "react";
import {
  actionCluster,
  currentStageForClusterFocus,
  requiresClusterFocus,
} from "@/src/game/core/evaluation/clusters";
import { availableInMode, currentStage } from "@/src/game/core/evaluation/availability";
import { isNonLeadBody } from "@/src/game/core/model/components";
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
  /** Tighten action currently awaiting the circular gesture. */
  activeTighten: AssemblyAction | null;
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
  combiningCluster: ClusterId | null = null,
  focusMode = false,
  /** Static-socket ghosts: hint EVERY available same-group socket, not just the proximity-matched one (the ghost component colors matched vs unmatched). */
  showAllGroupSockets = false,
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

  const groups = new Map<string, TrayItem>();
  for (const a of furniture.actions) {
    if (focusRequired && (!effectiveCluster || actionCluster(furniture, a) !== effectiveCluster)) {
      continue;
    }
    if (!a.partId || done.has(a.actionId)) continue;
    if (mode !== "free" && a.stage !== stage) continue;
    // stagePart earns a card of its own (fetching the carrier out of the box). A staged carrier then keeps its card for the SEATING gesture too: the part is out on the canvas by then, but the canvas re-grab path only re-takes a part that is still logically held, so the card is what makes "pick the finished sub-assembly back up" work through the proven pickup path rather than a second, untested one. Its prompt (presentation/instructions.ts) says pick it back up, not take a new one out.
    if (!isPickupType(a.type)) continue;
    const part = furniture.parts[a.partId];
    // a non-lead component body never gets its own card — the lead's card stands for the whole component
    if (isNonLeadBody(furniture.components, a.partId)) continue;
    const comp = furniture.components?.byBody[a.partId];
    const compLabel = comp ? furniture.components!.label[comp] : undefined;
    const pickable = !heldAction && availableIds.has(a.actionId);
    const draggable = pickable || (!heldAction && mode === "free");
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
  let trayItems = allTray;
  if (focusMode && allTray.length > 0) {
    if (heldAction?.partId) {
      const heldG = furniture.parts[heldAction.partId].group;
      const only = allTray.filter((t) => t.group === heldG);
      trayItems = only.length ? only : allTray.slice(0, 1);
    } else {
      // The one card shown must be ACTIONABLE: the first group with an enabled action, not just the first group in authored order (which could be a stability-blocked leg while the next legal step is a bolt).
      trayItems = [allTray.find((t) => t.enabled) ?? allTray[0]];
    }
  }
  const firstTighten = available.find((a) => a.type === "tightenFastener") ?? null;
  const activeTighten = !heldAction ? firstTighten : null;
  const activeBeat = !heldAction
    ? (available.find((a) => a.type === "reorient" || a.type === "combineClusters") ?? null)
    : null;
  const combineDone = furniture.actions.some(
    (a) => a.type === "combineClusters" && done.has(a.actionId),
  );
  const showAllClusters =
    combineDone || (activeBeat ? actionCluster(furniture, activeBeat) == null : false);

  const heldGroup =
    heldAction?.partId && isPickupType(heldAction.type)
      ? furniture.parts[heldAction.partId].group
      : null;
  const heldIsInsert = heldAction?.type === "insertFastener";
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
    const outsideFocus =
      focusRequired &&
      !showAllClusters &&
      (!effectiveCluster || furniture.parts[id].cluster !== effectiveCluster);

    if (combiningCluster && furniture.parts[id].cluster === combiningCluster) {
      modes[id] = "combining";
    } else if (heldAction?.partId === id) modes[id] = "held";
    else if (ridingComponent && furniture.components?.byBody[id] === ridingComponent && !placed) modes[id] = "riding";
    else if (ridingStaged.has(id)) modes[id] = "riding";
    else if (stagedOut.has(id)) modes[id] = "staged";
    else if (outsideFocus) modes[id] = "hidden";
    else if (!placed) {
      const hintActionId = heldIsInsert ? acts.insert : acts.snap;
      if (
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
  return { modes, heldAction, trayItems, activeTighten, activeBeat };
}

export function useSceneState(): SceneState {
  const furniture = useGameStore((s) => s.furniture);
  const completed = useGameStore((s) => s.completed);
  const heldActionId = useGameStore((s) => s.heldActionId);
  const activeCluster = useGameStore((s) => s.activeCluster);
  const matchedActionId = useGameStore((s) => s.matchedActionId);
  const mode = useGameStore((s) => s.mode);
  const combiningCluster = useGameStore((s) => s.combiningCluster);
  const focusMode = useGameStore((s) => s.settings.focusMode);
  const staticSockets = useGameStore((s) => s.settings.ghostStyle === "staticSockets");
  return useMemo(
    () =>
      furniture
        ? deriveSceneState(furniture, completed, heldActionId, activeCluster, matchedActionId, mode, combiningCluster, focusMode, staticSockets)
        : { modes: {}, heldAction: null, trayItems: [], activeTighten: null, activeBeat: null },
    [furniture, completed, heldActionId, activeCluster, matchedActionId, mode, combiningCluster, focusMode, staticSockets],
  );
}
