import {
  action,
  FastenerRule,
  tightenActionIds,
} from "@/src/game/core/composition/composeActions";
import { applyStructure, StructureOverlay } from "@/src/game/core/model/liaisons";
import type { JointDef } from "@/src/game/core/model/joints";
import { groupParts } from "@/src/game/core/scene/targets";
import { lowerFasteners, withFastenerFacts, type FastenerMap } from "@/src/game/core/model/fasteners";
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

//clusters
export const CLUSTERS = {
  base: { id: "base", label: "Base", seed: true },
  seat: {
    id: "seat",
    label: "Seat",
    slideJoins: ["base"],
    placeDir: [0, -1, 0] as const,
    parkBackoff: 0.15,
    driveMotion: "screw",
  },
} as Record<ClusterId, ClusterDef>;

const STRUCTURE_BASE: StructureOverlay = {
  leg_1: { seed: true, unstable: true },
  leg_2: { seed: true, unstable: true },
  leg_3: { seed: true, unstable: true },
  leg_4: { seed: true, unstable: true },
  circleUpp: { seed: true },
  circleDown: { seed: true },
  ringRail: { unstable: true },
  //no v gate
  screw100212_1: { noVisibilityGate: true },
  screw100212_2: { noVisibilityGate: true },
  screw100212_3: { noVisibilityGate: true },
  screw100212_4: { noVisibilityGate: true },
  screw108443_1: { noVisibilityGate: true },
  screw108443_3: { noVisibilityGate: true },
  cap107675_1: { noVisibilityGate: true },

  supportPin: { placeDir: [0, -1, 0] as const, parkBackoff: 0.12 },
  seat: { seed: true },
  seatPlate: { seed: true, unstable: true },
  pole: {
    directJoins: [asPartId("seatPlate")],
    screwJoins: [asPartId("supportPin")],
    tool: "mallet",
  },
} as StructureOverlay;


export const JOINTS: JointDef[] = [
  { kind: "slide", a: asPartId("supportPin"), b: asPartId("circleUpp"), mover: asPartId("supportPin") },
  { kind: "slide", a: asPartId("supportPin"), b: asPartId("circleDown"), mover: asPartId("supportPin"), gates: false },
];

export const FASTENERS: FastenerMap = {
  screw105251: { home: "liaison", role: "securer" },
  screw100212: { home: "liaison", role: "securer" },
  screw105298: { home: "liaison", role: "securer" },
  screw108443: { home: "liaison", role: "securer" },
  cap107675: { home: "part" },
} as unknown as FastenerMap;

const LOWERED = lowerFasteners(FASTENERS, applyStructure(P, STRUCTURE_BASE));

export const STRUCTURE: StructureOverlay = withFastenerFacts(STRUCTURE_BASE, LOWERED);

export const FASTENER_RULES: FastenerRule[] = LOWERED.rules;

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

  action({ type: "placePart", stage: 3, partId: "seat", requires: [] }),
  action({
    type: "placePart",
    stage: 3,
    partId: "seatPlate",
    requires: ["place_seat"],
  }),
  action({
    type: "placePart",
    stage: 3,
    partId: "pole",
    requires: ["place_seatPlate"],
  }),

  action({
    actionId: "combine_base",
    type: "combineClusters",
    stage: 4,
    cluster: "base",
    requires: [],
  }),
  action({
    actionId: "combine_seat",
    type: "combineClusters",
    stage: 4,
    cluster: "seat",
    requires: [],
  }),
];

// complementary steps / instrution overwrite
export const BEATS = {
  combine_base: {
    text: "Set the base down in place.",
    simpleText: "Place the base.",
  },
  combine_seat: {
    text: "Set the seat's pole into the base and screw it.",
    simpleText: "Screw the seat onto the base.",
  },
} as InstructionSet;