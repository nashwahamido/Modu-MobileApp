import { ActionId, ClusterId, Furniture, PartDef, PartId } from "@/src/game/core/type";

/** Distinct cluster ids present in a furniture's parts. */
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
  T extends { partId?: PartId; cluster?: ClusterId },
>(
  f: Furniture,
  actions: readonly T[],
  activeCluster: ClusterId | null,
): T[] {
  if (!requiresClusterFocus(f)) return [...actions];
  if (!activeCluster) return [];
  return actions.filter((action) => {
    const cluster = actionCluster(f, action);
    return cluster == null || cluster === activeCluster;
  });
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

/** Lowest stage among a cluster's still-incomplete actions (Infinity if done).
 *  Drives PLAN mode: an action is offered only at its cluster's current stage. */
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

/** Complete when every action whose part belongs to the cluster is done.
 *  Actions without a partId (combine, finishing beats) belong to no cluster,
 *  so a cluster can't depend on the very combine that consumes it. */
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

/** A combineClusters action is ready when all (prerequisite) clusters are
 *  complete. Uses authored ClusterDef ids when present, else the clusters
 *  derived from parts. Single-combine furniture = "all clusters"; multi-combine
 *  would reference specific clusters per action (future). */
export function combineReady(
  f: Furniture,
  done: ReadonlySet<ActionId>,
): boolean {
  const ids = f.clusters
    ? (Object.keys(f.clusters) as ClusterId[])
    : clustersOf(f.parts);
  return ids.every((cid) => clusterComplete(f, cid, done));
}
