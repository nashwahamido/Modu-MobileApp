import { useMemo } from "react";
import {
  actionCluster,
  currentStageForClusterFocus,
  requiresClusterFocus,
} from "@/src/game/core/evaluation/clusters";
import { availableInMode, currentStage } from "@/src/game/core/evaluation/availability";
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

/**
 * socket_hint: an unplaced part whose snap or insert socket is currently
 * reachable (same group as the held part). Renders as a glowing ghost
 * at its target position so the player can see all valid drop targets at once.
 */
export type PartMode =
  | "hidden"
  | "flush"
  | "loose"
  | "held"
  | "socket_hint"
  | "combining";

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
    if (a.type !== "placePart" && a.type !== "insertFastener") continue;
    const part = furniture.parts[a.partId];
    const pickable = !heldAction && availableIds.has(a.actionId);
    const draggable = pickable || (!heldAction && mode === "free");
    const isHeld = heldAction?.actionId === a.actionId;
    const label = labelFor(furniture.labels, part.group);
    const g = groups.get(part.group);
    if (g) {
      g.remaining += 1;
      if (isHeld) {
        g.action = a;
      } else if (pickable && !availableIds.has(g.action?.actionId as never)) {
        g.action = a;
      }
      if (draggable) g.enabled = true;
    } else {
      groups.set(part.group, {
        label,
        group: part.group,
        partId: part.partId,
        remaining: 1,
        action: a,
        enabled: draggable,
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
      trayItems = allTray.slice(0, 1);
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
    heldAction?.partId &&
    (heldAction.type === "placePart" || heldAction.type === "insertFastener")
      ? furniture.parts[heldAction.partId].group
      : null;
  const heldIsInsert = heldAction?.type === "insertFastener";

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
    else if (outsideFocus) modes[id] = "hidden";
    else if (!placed) {
      const hintActionId = heldIsInsert ? acts.insert : acts.snap;
      if (
        heldGroup &&
        furniture.parts[id].group === heldGroup &&
        hintActionId &&
        availableIds.has(hintActionId) &&
        hintActionId === matchedActionId
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
  return useMemo(
    () =>
      furniture
        ? deriveSceneState(furniture, completed, heldActionId, activeCluster, matchedActionId, mode, combiningCluster, focusMode)
        : { modes: {}, heldAction: null, trayItems: [], activeTighten: null, activeBeat: null },
    [furniture, completed, heldActionId, activeCluster, matchedActionId, mode, combiningCluster, focusMode],
  );
}
