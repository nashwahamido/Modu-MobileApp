import {
  action,
  FastenerRule,
  tightenActionIds,
} from "@/src/game/core/composition/composeActions";
import { StructureOverlay } from "@/src/game/core/model/liaisons";
import type { JointDef } from "@/src/game/core/model/joints";
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
  // The four ring-rail screws opt OUT of the sightline gate, same reason as BEKVAM's dowels: each drives through a splayed leg into the rail, and a leg is a 35mm stick inside a box the gate treats as solid — its own fat blocks the sightline to a head sitting on its surface.
  screw100212_1: { noVisibilityGate: true },
  screw100212_2: { noVisibilityGate: true },
  screw100212_3: { noVisibilityGate: true },
  screw100212_4: { noVisibilityGate: true },
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

//     tool/label/motion come from the global catalogue (data/hardware.ts).
/** Joints stated as ENTITIES rather than per-part arrays (core/model/joints.ts).
 * The circleDown joint is NEW, and it is not bookkeeping: structuralSweep.furniture.test.ts has carried it as a finding since 2026-08-24 — "supportPin tip rests inside circleDown's bore, a REAL coaxial contact the flat authoring never names". Undeclared, that contact looked like a THIRD-PARTY obstruction in every corridor, which is why the pin's travel could not be derived: circleDown blocked both signs while having no right to. Declaring it makes it a partner, and a partner's body is what the park math handles by construction.
 * It adds a Γ edge, so unlike the other migrations this one is NOT byte-equal: the pin now needs circleDown placed before it. The authored order already satisfies that (circleDown is a stage-1 seed, the pin is stage 2); what changes is FREE mode, where the pin could previously be dropped into a bore that was not there yet. */
export const JOINTS: JointDef[] = [
  { kind: "slide", a: asPartId("supportPin"), b: asPartId("circleUpp"), mover: asPartId("supportPin") },
  { kind: "slide", a: asPartId("supportPin"), b: asPartId("circleDown"), mover: asPartId("supportPin"), gates: false },
];

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
  // The ceremonial `finishing_checks` beat was REMOVED 2026-08-19 — it moved no part, so it was a
  // swipe card standing between the player and a finished build. The last real assembly step is
  // the last step now.
];

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