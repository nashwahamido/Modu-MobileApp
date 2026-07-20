import {
  action,
  FastenerRule,
  tightenActionIds,
} from "@/src/game/core/composition/composeActions";
import { StructureOverlay } from "@/src/game/core/model/liaisons";
import { groupParts } from "@/src/game/core/scene/targets";
import { asGroupId, asPartId } from "@/src/game/core/ids";
import {
  ClusterDef,
  ClusterId,
  DraftAction,
  InstructionSet,
  LabelMap,
} from "@/src/game/core/type";
import { PARTS } from "./parts.gen";

const P = PARTS;

export const META = {
  // IKEA product names are always set in caps.
  name: "DALFRED Stool",
  brand: "IKEA",
  category: "Table & Chair",
  difficulty: 2,
  duration: 10,
  link: "https://www.ikea.com/ie/en/p/dalfred-bar-stool-birch-80613091/#content",
} as const;

export const LABELS = {
  leg: { standard: "Leg" },
  circleUpp: { standard: "Top plate", simple: "Top circle" },
  circleDown: { standard: "Bottom plate", simple: "Bottom circle" },
  ringRail: { standard: "Ring rail", simple: "Round bar" },
  supportPin: { standard: "Support pin", simple: "Center pin" },
  pole: { standard: "Pole" },
  seat: { standard: "Seat" },
  seatPlate: { standard: "Seat plate", simple: "Plate" },
} as LabelMap;

export const CLUSTERS = {
  base: { id: "base", label: "Base" },
  seat: { id: "seat", label: "Seat" },
} as Record<ClusterId, ClusterDef>;

export const STRUCTURE: StructureOverlay = {
  leg_1: { seed: true, unstable: true },
  leg_2: { seed: true, unstable: true },
  leg_3: { seed: true, unstable: true },
  leg_4: { seed: true, unstable: true },
  circleUpp: { seed: true },
  circleDown: { seed: true },
  ringRail: { unstable: true },
  supportPin: {},
  seat: { seed: true },
  seatPlate: { seed: true, unstable: true },
  pole: {
    directJoins: [asPartId("seatPlate")],
    screwJoins: [asPartId("supportPin")],
    tool: "mallet",
  },
} as StructureOverlay;

//     tool/label/motion come from the global catalogue (data/hardware.ts).
export const FASTENER_RULES: FastenerRule[] = [
  { group: asGroupId("screw105251"), stage: 1 },
  { group: asGroupId("screw100212"), stage: 2 },
  { group: asGroupId("screw105298"), stage: 2 },
  { group: asGroupId("screw108443"), stage: 3 },
  { group: asGroupId("cap107675"), stage: 3 },
];

const LEG_IDS = groupParts(P, asGroupId("leg")).map((p) => p.partId);
export const AUTHORED_ACTIONS: DraftAction[] = [
  action({ type: "placePart", stage: 1, partId: "circleUpp", requires: [] }),
  ...LEG_IDS.map((leg) =>
    action({ type: "placePart", stage: 1, partId: leg, requires: [] }),
  ),
  action({ type: "placePart", stage: 1, partId: "circleDown", requires: [] }),
  action({
    type: "placePart",
    stage: 2,
    partId: "ringRail",
    requires: tightenActionIds(P, asGroupId("screw105251")),
  }),
  action({ type: "placePart", stage: 2, partId: "supportPin", requires: [] }),
  action({ actionId: "reorient_upright", type: "reorient", stage: 2, cluster: "base", requires: [] }),

  action({ type: "placePart", stage: 3, partId: "seat", requires: [] }),
  action({ type: "placePart", stage: 3, partId: "seatPlate", requires: ["place_seat"] }),
  action({ type: "placePart", stage: 3, partId: "pole", requires: ["place_seatPlate"] }),

  action({ actionId: "combine_assemblies", type: "combineClusters", stage: 4, cluster: "seat", requires: [] }),
  action({ actionId: "finishing_checks", type: "reorient", stage: 4, requires: ["combine_assemblies"] }),
];

export const BEATS = {
  combine_assemblies: {
    text: "Combine the seat with the base.",
    simpleText: "Put the seat on the base.",
  },
  finishing_checks: {
    text: "Give the seat a spin and a gentle press to check it feels solid.",
    simpleText: "Check the stool feels solid.",
  },
} as InstructionSet;