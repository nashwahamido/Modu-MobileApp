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
  // The four ring-rail screws opt OUT of the sightline gate, same reason as BEKVAM's dowels: each drives through a splayed leg into the rail, and a leg is a 35mm stick inside a box the gate treats as solid — its own fat blocks the sightline to a head sitting on its surface.
  screw100212_1: { noVisibilityGate: true },
  screw100212_2: { noVisibilityGate: true },
  screw100212_3: { noVisibilityGate: true },
  screw100212_4: { noVisibilityGate: true },
  // The seat screws and the pole cap, found by visibilitySweep rather than on device. Same defect: the head sits on the surface of the part its own sibling box swallows. screw108443_1 and _3 drive seat↔seatPlate and read as blocked by the seatPlate they pass through; cap107675_1 caps the pole and reads as blocked by the pole it sits on. Gaps 11-16mm against an 11mm threshold. Only the two screws the sweep names are exempted — _2, _4 and _5 clear it, and an exemption is a hole in the gate, so it is opened per socket rather than per group.
  screw108443_1: { noVisibilityGate: true },
  screw108443_3: { noVisibilityGate: true },
  cap107675_1: { noVisibilityGate: true },
  // dropped in from ABOVE: the sleeve SLIDES down through circleUpp's centre hole until its top flange (y=0.577) lands on the plate's top face (y=0.570) — the flange can't pass the hole, so this is its only insertion direction. The scene renders model space (upright) throughout, so the from-above slide works mid-build with no reorient beat. parkBackoff must clear the full 9.6cm sleeve above the plate; the press default parked it inside the plate stack (the reported collision).
  // supportPin: MIGRATED to JOINTS below. Its travel stays here for now — the derivation knows the axis (Y, through the bore) but not the sign.
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
  // no requires: the slide frontier (slideJoins circleUpp) is the real gate — the pin needs the top plate up to have a hole to drop through. Cluster reorient beats were cut 2026-07-23; the combine beat is the standing-up moment now.
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