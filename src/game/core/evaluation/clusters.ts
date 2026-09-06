import { ActionId, ClusterId, Furniture, PartDef, PartId } from "@/src/game/core/type";
import { isPickupType } from "@/src/game/core/ids";

// True once any pickup beat of `cluster` is complete
export function clusterStarted(
  f: Furniture,
  cluster: ClusterId,
  done: ReadonlySet<ActionId>,
): boolean {
  return f.actions.some(
    (a) =>
      a.partId &&
      isPickupType(a.type) &&
      done.has(a.actionId) &&
      f.parts[a.partId]?.cluster === cluster,
  );
}

// Distinct cluster ids present in a furniture's parts.
export function clustersOf(parts: Record<PartId, PartDef>): ClusterId[] {
  return [...new Set(Object.values(parts).map((p) => p.cluster))];
}

export function clusterIds(f: Furniture): ClusterId[] {
  return f.clusters
    ? (Object.keys(f.clusters) as ClusterId[])
    : clustersOf(f.parts);
}

export function focusableClusterIds(f: Furniture): ClusterId[] {
  return clusterIds(f).filter((id) => !id.startsWith("whole"));
}

export function requiresClusterFocus(f: Furniture): boolean {
  return focusableClusterIds(f).length > 1;
}

export function clusterLabel(f: Furniture, clusterId: ClusterId): string {
  return f.clusters?.[clusterId]?.label ?? clusterId;
}

export function actionCluster(
  f: Furniture,
  action: { partId?: PartId; cluster?: ClusterId },
): ClusterId | undefined {
  return action.partId ? f.parts[action.partId]?.cluster : action.cluster;
}

export function actionsForClusterFocus<
  T extends { partId?: PartId; cluster?: ClusterId; type?: string },
>(f: Furniture, actions: readonly T[], activeCluster: ClusterId | null): T[] {
  const passes = (action: T): boolean => {
    if (action.type === "combineClusters") return true;
    const cluster = actionCluster(f, action);
    if (!activeCluster) return cluster == null;
    return cluster == null || cluster === activeCluster;
  };
  if (!requiresClusterFocus(f)) return [...actions];
  // No focus is a real state, not an error
  return actions.filter(passes);
}

export function currentStageForClusterFocus(
  f: Furniture,
  done: ReadonlySet<ActionId>,
  activeCluster: ClusterId | null,
): number {
  const focusRequired = requiresClusterFocus(f);
  if (focusRequired && !activeCluster) return 1;
  const candidates = f.actions.filter(
    (action) =>
      !done.has(action.actionId) &&
      (!focusRequired ||
        (activeCluster &&
          (actionCluster(f, action) == null ||
            actionCluster(f, action) === activeCluster))),
  );
  const stages = [...new Set(candidates.map((action) => action.stage))].sort(
    (a, b) => a - b,
  );
  return stages[0] ?? f.actions[f.actions.length - 1]?.stage ?? 1;
}

// Lowest stage among a cluster's still-incomplete actions (Infinity if done).  Drives PLAN mode: an action is offered only at its cluster's current stage.
export function clusterCurrentStage(
  f: Furniture,
  clusterId: ClusterId,
  done: ReadonlySet<ActionId>,
): number {
  const stages = f.actions
    .filter((a) => actionCluster(f, a) === clusterId && !done.has(a.actionId))
    .map((a) => a.stage);
  return stages.length ? Math.min(...stages) : Infinity;
}

// Complete when every action whose part belongs to the cluster is done.  Actions without a partId (combine, finishing beats) belong to no cluster,  so a cluster can't depend on the very combine that consumes it.
export function clusterComplete(
  f: Furniture,
  clusterId: ClusterId,
  done: ReadonlySet<ActionId>,
): boolean {
  return f.actions.every(
    (a) =>
      !a.partId ||
      f.parts[a.partId]?.cluster !== clusterId ||
      done.has(a.actionId),
  );
}

export function clusterPrereqsMet(
  f: Furniture,
  clusterId: ClusterId,
  done: ReadonlySet<ActionId>,
): boolean {
  const requires = f.clusters?.[clusterId]?.requires ?? [];
  return requires.every((requiredCluster) =>
    clusterComplete(f, requiredCluster, done),
  );
}

// Which node of the BUILD MAP the player is on, 1-based: base → seat → combine.
export function buildPhase(
  f: Furniture,
  done: ReadonlySet<ActionId>,
  activeCluster: ClusterId | null,
): { index: number; total: number } {
  const ids = focusableClusterIds(f);

  // A build with no sub-assemblies to choose between (LACK) has no map phases to count, so it falls back to the AUTHORED stage
  if (ids.length === 0) {
    const stages = f.actions.map((a) => a.stage);
    return {
      index: currentStageForClusterFocus(f, done, activeCluster),
      total: stages.length ? Math.max(...stages) : 1,
    };
  }

  const total = ids.length + 1; // the sub-assemblies, plus combining them
  if (combineReady(f, done)) return { index: total, total };
  const i = activeCluster ? ids.indexOf(activeCluster) : -1;
  return { index: i >= 0 ? i + 1 : 1, total };
}

export function combineReady(
  f: Furniture,
  done: ReadonlySet<ActionId>,
): boolean {
  const ids = f.clusters
    ? (Object.keys(f.clusters) as ClusterId[])
    : clustersOf(f.parts);
  return ids.every((cid) => clusterComplete(f, cid, done));
}

// Whether the build map is on screen right now.
export function buildMapVisible(
  f: Furniture | null | undefined,
  done: ReadonlySet<ActionId>,
  state: { activeCluster: ClusterId | null; mapSeen: boolean; mapOpen: boolean },
  overviewOnly = false,
): boolean {
  if (!f) return false;
  if (overviewOnly) return state.mapOpen;
  const mustChoose =
    requiresClusterFocus(f) && !state.activeCluster && !combineReady(f, done);
  const intro = focusableClusterIds(f).length === 0 && !state.mapSeen;
  return mustChoose || intro || state.mapOpen;
}