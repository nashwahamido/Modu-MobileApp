import { AssemblyAction, PartId } from "@/src/game/core/type";

export interface MetaCounts {
  /** Every part INSTANCE, fasteners included (each screw counts). */
  partCount: number;
  stageCount: number;
  stepCount: number;
}

export function metaCounts(
  allPartIds: readonly PartId[],
  actions: readonly AssemblyAction[],
): MetaCounts {
  return {
    partCount: allPartIds.length,
    stageCount: new Set(actions.map((a) => a.stage)).size,
    stepCount: actions.length,
  };
}
