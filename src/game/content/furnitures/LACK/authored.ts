import {
  action,
  FastenerRule,
} from "@/src/game/core/composition/composeActions";
import { StructureOverlay } from "@/src/game/core/model/liaisons";
import { groupParts } from "@/src/game/core/scene/targets";
import { asGroupId } from "@/src/game/core/ids";
import {
  ClusterDef,
  ClusterId,
  DraftAction,
  InstructionSet,
  LabelMap,
} from "@/src/game/core/type";
import { PARTS } from "./parts.gen";

const P = PARTS;

// part name in part tray
export const LABELS = {
  tableTop: { standard: "Table top", simple: "Top" },
  leg: { standard: "Leg" },
} as LabelMap;

// clusters
export const CLUSTERS = {
  whole: { id: "whole", label: "Table" },
} as Record<ClusterId, ClusterDef>;


export const STRUCTURE = {
  tableTop: { seed: true },
} as StructureOverlay;

export const FASTENER_RULES: FastenerRule[] = [
  {
    group: asGroupId("bolt115980"),
  },
];

const LEG_IDS = groupParts(P, asGroupId("leg")).map((p) => p.partId);
export const AUTHORED_ACTIONS: DraftAction[] = [
  action({ type: "placePart", stage: 1, partId: "tableTop", requires: [] }),
  ...LEG_IDS.map((leg) =>
    action({ type: "placePart", stage: 1, partId: leg, requires: [] }),
  ),
]; 


export const BEATS = {} as InstructionSet;