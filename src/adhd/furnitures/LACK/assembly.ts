// Assembly rules for LACK — the legality DAG.
// Hand-assembly, in real-manual order: set the table top down, screw the four
// bolts into the corners by hand, then attach a leg onto each bolt. Structural
// parts use the "place then twist-to-lock" beat (= screwing by hand); the table
// top is place-on-drop (see index.ts) so it just settles.
import { groupParts } from "@/src/adhd/core/assembly/targets";
import { AssemblyAction, PartDef } from "@/src/adhd/core/type";
import { PARTS } from "./parts.gen";

const P = PARTS as Record<string, PartDef>;
const BOLT_IDS = groupParts(P, "screw115980").map((p) => p.partId);
const LEG_IDS = groupParts(P, "leg").map((p) => p.partId);

// Each leg attaches to one bolt (leg.attach === bolt id).
const boltForLeg = (legId: string) => P[legId].attach as string;

const authored: AssemblyAction[] = [
  // stage 1 — set the table top down (the anchor)
  { actionId: "snap_tableTop", type: "snapPart", stage: 1, partId: "tableTop", requires: [] },

  // stage 2 — screw the four bolts into the corners by hand (any order)
  ...BOLT_IDS.map((b): AssemblyAction => ({
    actionId: `snap_${b}`,
    type: "snapPart",
    stage: 2,
    partId: b,
    requires: ["snap_tableTop"],
  })),

  // stage 3 — attach each leg onto its bolt
  ...LEG_IDS.map((l): AssemblyAction => ({
    actionId: `snap_${l}`,
    type: "snapPart",
    stage: 3,
    partId: l,
    requires: [`snap_${boltForLeg(l)}`],
  })),
];

export const ACTIONS: readonly AssemblyAction[] = authored;
export const ACTION_BY_ID = new Map(ACTIONS.map((a) => [a.actionId, a]));
