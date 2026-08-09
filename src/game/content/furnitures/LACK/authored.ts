import {
  action,
  FastenerRule,
  tightenActionIds,
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

export const LABELS = {
  tableTop: { standard: "Table top", simple: "Top" },
  leg: { standard: "Leg" },
} as LabelMap;

export const CLUSTERS = {
  whole: { id: "whole", label: "Table" },
} as Record<ClusterId, ClusterDef>;

export const STRUCTURE = {
  // The tabletop is the fixed starting surface. Legs only become available after it is placed, so tutorial and regular LACK builds share the same tabletop-first assembly order.
  tableTop: { seed: true },
} as StructureOverlay;

export const FASTENER_RULES: FastenerRule[] = [
  // The double-ended bolt is driven into the tabletop first. Once tightened, its missing endpoint unlocks the matching leg, which slides onto it.
  {
    group: asGroupId("bolt115980"),
    stage: 1,
    // No tool override. The resolution chain is rule.tool -> HARDWARE[group].tool -> part.tool, and
    // the hardware catalogue already calls this one "spun in by hand" — the override here was
    // putting an allen key in the toolbox, in the scene, and in the tightening gesture for a bolt
    // that is turned with fingers.
  },
];

const LEG_IDS = groupParts(P, asGroupId("leg")).map((p) => p.partId);
export const AUTHORED_ACTIONS: DraftAction[] = [
  action({ type: "placePart", stage: 1, partId: "tableTop", requires: [] }),
  ...LEG_IDS.map((leg) =>
    action({ type: "placePart", stage: 1, partId: leg, requires: [] }),
  ),
  action({
    actionId: "finishing_checks",
    type: "reorient",
    stage: 2,
    requires: tightenActionIds(P, asGroupId("bolt115980")),
  }),
];

export const BEATS = {
  finishing_checks: {
    text: "Turn the table the right way up and check it stands level.",
    simpleText: "Stand the table up.",
  },
} as InstructionSet;