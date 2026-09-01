import {
  action,
  FastenerRule,
} from "@/src/game/core/composition/composeActions";
import { StructureOverlay } from "@/src/game/core/model/liaisons";
import { asGroupId, asPartId } from "@/src/game/core/ids";
import type { JointDef } from "@/src/game/core/model/joints";
import {
  ClusterDef,
  ClusterId,
  DraftAction,
  InstructionSet,
  LabelMap,
} from "@/src/game/core/type";

export const LABELS = {
  legL: { standard: "Left side panel", simple: "Left side" },
  legR: { standard: "Right side panel", simple: "Right side" },
  step: { standard: "Lower step", simple: "Step" },
  topPlane: { standard: "Top step", simple: "Top" },
  frontTopRail: { standard: "Front top rail", simple: "Rail" },
  backTopRail: { standard: "Back top rail", simple: "Rail" },
  frontBottomRail: { standard: "Front step rail", simple: "Rail" },
  backBottomRail: { standard: "Back bottom rail", simple: "Rail" },
} as LabelMap;

export const CLUSTERS = {
  whole: { id: "whole", label: "Step Stool" },
} as Record<ClusterId, ClusterDef>;

export const STRUCTURE = {
  // WORLD FRAME, measured from parts.gen.ts: +Y = UP (topPlane y=+0.499); FRONT = −X (step x=−0.118, frontBottomRail x=−0.156, backBottomRail x=+0.156); +Z = RIGHT (legR z=+0.183, legL z=−0.183). Every joint comes from the fasteners' attached pairs — no fastener-free contacts, so no directJoins anywhere. placeDir is the direction each part TRAVELS as it seats (park offset is its negation). The two side panels are DISTINCT parts (mirrored, not interchangeable). Legs and step are all seeds — the player picks which starts the build. The dowels are PIN connectors, so the preload locks drive the real BEKVÄM order by themselves: a leg down → tap its dowel → step presses on → tap the other dowel → the other leg presses on — only then do the rails open up. The authored array is one such sequence (legL first). No placeDir on the legs or step: every press here is onto a standing dowel, and pressParkInfo derives the travel from the pin's signed engage axis — the step approaches whichever leg is up, in either build order.
  legL: { seed: true },
  step: { seed: true },
  legR: { seed: true },
  // rails go in AFTER both sides are up (the dowel locks force it), so each travels along X between the standing panels and parks outside its own face rather than inside a side panel
  // All four rails are MIGRATED to JOINTS below. The two BOTTOM rails take their travel from the contact slabs (joints.gen.ts) and state none here.
  backBottomRail: { unstable: true },
  frontBottomRail: { unstable: true },
  // The two TOP rails keep theirs: their derivation abstains, and it is right to. Their slab against a leg is [0.04,0.06,0.02] — thinnest in Z — so a resolved sign would confidently produce a Z travel where the truth is X. The legs are splayed ~5°, so the WORLD-aligned overlap box is thinnest along an axis nothing joins along; the same defect holds legR/step in KNOWN_WRONG_AXIS, and measuring the slab in the parts' own frames (PartBox.obb) is the fix. Until then the authored value stands, which is exactly what the precedence rules are for.
  frontTopRail: { placeDir: [1, 0, 0] as const, unstable: true },
  backTopRail: { placeDir: [-1, 0, 0] as const, unstable: true },
  topPlane: { placeDir: [0, -1, 0] as const }, // closes down onto the top rails
  // The two dowels opt OUT of the sightline gate. Each taps into a shallow face-on hole in a side panel, and a 22mm plank's box is fatter than the plank: the fat alone eats the whole (burial + 6mm) threshold, so the gate called them hidden at the ordinary build angles and the tap could not be aimed. Their sockets are on the panel's open inward face — there is nothing standing in front of them to be fooled about.
  dowel101350_1: { noVisibilityGate: true },
  dowel101350_2: { noVisibilityGate: true },
  // NO per-screw toolAnchor here: the head-face contact is a GENERATED model fact now (parts.gen headOffset, emitted by read-parts.mjs from the mesh bounds) — an 11-entry hand copy of it lived here for one session and was deleted when the extractor learned to emit it.
} as StructureOverlay;

/** Joints stated as ENTITIES rather than per-part arrays (core/model/joints.ts). The kind and the pair are the human's; the travel comes from the contact slab in joints.gen.ts.
 * A SNAP, not a press — measured, not assumed: the rail's edge to the legs is kindless, its screws are securers so no preload path applies, and `placeEngagement` therefore returns "drop". It drops flush and still travels, which is exactly what a snap is. And because screw105215 already makes the Γ edge, lowering emits the travel alone: no join array, no `dropOn` — there is no press edge here to suppress.
 * BOTH legs, not one. The rail spans them and is screwed to each, so it has two joints — satisfied by ONE placement, the way the drawer bottom's three slide joints are one glide. State every joint: a travel direction has to satisfy all of them at once AND miss whatever is already standing, so a joint left unstated is a constraint the derivation never gets to apply. */
export const JOINTS: JointDef[] = [
  // All four rails, every joint each one has: screw105215 ties every rail to BOTH legs, and screw105111 ties the front bottom rail to the step and each top rail to the top plane.
  ...(
    [
      ["frontBottomRail", ["legR", "legL", "step"]],
      ["backBottomRail", ["legR", "legL"]],
      ["frontTopRail", ["legR", "legL", "topPlane"]],
      ["backTopRail", ["legR", "legL", "topPlane"]],
    ] as const
  ).flatMap(([rail, partners]) =>
    partners.map((p): JointDef => ({ kind: "snap", a: asPartId(rail), b: asPartId(p), mover: asPartId(rail) })),
  ),
];

export const FASTENER_RULES: FastenerRule[] = [
  // the global catalogue, data/hardware.ts.
  { group: asGroupId("dowel101350"), stage: 1 },
  { group: asGroupId("screw105215"), stage: 1 },
  // stage 2 with the top: screws 1–2 drive up into the topPlane, so their inserts need it placed; screw 3 (step ↔ front rail) just waits alongside its group
  { group: asGroupId("screw105111"), stage: 2 },
];

const place = (partId: string, stage: number) =>
  action({ type: "placePart", stage, partId, requires: [] });

export const AUTHORED_ACTIONS: DraftAction[] = [
  // ── stage 1: the frame. Dowel preload locks interleave the taps: legL → dowel → step → dowel → legR ──
  place("legL", 1),
  place("step", 1),
  place("legR", 1),
  place("backBottomRail", 1),
  place("frontBottomRail", 1),
  place("frontTopRail", 1),
  place("backTopRail", 1),
  // ── stage 2: top on, everything screwed home, stand it up ──
  place("topPlane", 2),
]; 

// The ceremonial `finishing_checks` beat was REMOVED 2026-08-19. It moved no part — the pieces
// were already at their baked poses and the free camera makes a literal flip unnecessary — so it
// was a swipe card standing between the player and a finished build. The last real assembly step
// is the last step now. Its instruction copy went with it.
export const BEATS = {} as InstructionSet;