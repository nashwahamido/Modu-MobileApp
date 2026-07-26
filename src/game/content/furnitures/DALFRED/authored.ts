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

// combine overlay: the base is the seed and seats first; the seat assembly (pole + top) then joins onto it travelling straight DOWN (−Y), its pole THREADING into the base's centre ring — driveMotion "screw" hands the drive to the dial, which spins the whole seat about the axis as it sinks. parkBackoff 0.15 lifts the parked seat clearly above the base (the pole's cap sits at y≈0.455, the base ring at y≈0.549) before the drive.
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

export const STRUCTURE: StructureOverlay = {
  leg_1: { seed: true, unstable: true },
  leg_2: { seed: true, unstable: true },
  leg_3: { seed: true, unstable: true },
  leg_4: { seed: true, unstable: true },
  circleUpp: { seed: true },
  circleDown: { seed: true },
  ringRail: { unstable: true },
  // dropped in from ABOVE: the sleeve SLIDES down through circleUpp's centre hole until its top flange (y=0.577) lands on the plate's top face (y=0.570) — the flange can't pass the hole, so this is its only insertion direction. The scene renders model space (upright) throughout, so the from-above slide works mid-build with no reorient beat. parkBackoff must clear the full 9.6cm sleeve above the plate; the press default parked it inside the plate stack (the reported collision).
  supportPin: { slideJoins: [asPartId("circleUpp")], placeDir: [0, -1, 0] as const, parkBackoff: 0.12 },
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
  // no requires: the slide frontier (slideJoins circleUpp) is the real gate — the pin needs the top plate up to have a hole to drop through. Cluster reorient beats were cut 2026-07-23; the combine beat is the standing-up moment now.
  action({ type: "placePart", stage: 2, partId: "supportPin", requires: [] }),

  action({ type: "placePart", stage: 3, partId: "seat", requires: [] }),
  action({ type: "placePart", stage: 3, partId: "seatPlate", requires: ["place_seat"] }),
  action({ type: "placePart", stage: 3, partId: "pole", requires: ["place_seatPlate"] }),

  // ── combine: seat the base (seed drop), then lower the seat onto it; finish. combine_seat's dependence on combine_base is DERIVED from the CLUSTERS slideJoins overlay — do not hand-write it here. ──
  action({ actionId: "combine_base", type: "combineClusters", stage: 4, cluster: "base", requires: [] }),
  action({ actionId: "combine_seat", type: "combineClusters", stage: 4, cluster: "seat", requires: [] }),
  action({ actionId: "finishing_checks", type: "reorient", stage: 4, requires: ["combine_seat"] }),
];

export const BEATS = {
  combine_base: {
    text: "Set the base down in place.",
    simpleText: "Place the base.",
  },
  combine_seat: {
    text: "Set the seat's pole into the base and screw it clockwise until it sits tight.",
    simpleText: "Screw the seat onto the base.",
  },
  finishing_checks: {
    text: "Give the seat a spin and a gentle press to check it feels solid.",
    simpleText: "Check the stool feels solid.",
  },
} as InstructionSet;