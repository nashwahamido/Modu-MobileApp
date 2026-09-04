import { AssemblyAction, ClusterDef, ClusterId, PartId } from "@/src/game/core/type";

export interface MetaCounts {
  partCount: number;
  stageCount: number;
  stepCount: number;
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
