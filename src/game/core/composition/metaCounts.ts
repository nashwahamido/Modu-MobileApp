import { AssemblyAction, ClusterDef, ClusterId, PartId } from "@/src/game/core/type";

export interface MetaCounts {
  /** Every part INSTANCE, fasteners included (each screw counts). */
  partCount: number;
  stageCount: number;
  stepCount: number;
  /** Every AUTHORED cluster, not just the ones the build map offers as a choice — this is the recipe's shape, so a single-cluster piece like LACK reports 1 rather than 0. */
  clusterCount: number;
}

export function metaCounts(
  allPartIds: readonly PartId[],
  actions: readonly AssemblyAction[],
  clusters: Record<ClusterId, ClusterDef> | undefined,
): MetaCounts {
  return {
    partCount: allPartIds.length,
    stageCount: new Set(actions.map((a) => a.stage)).size,
    stepCount: actions.length,
    clusterCount: Object.keys(clusters ?? {}).length,
  };
}
