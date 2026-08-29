import {
  action,
  FastenerRule,
} from "@/src/game/core/composition/composeActions";
import { StructureOverlay } from "@/src/game/core/model/liaisons";
import { asGroupId } from "@/src/game/core/ids";
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
  backBottomRail: { placeDir: [-1, 0, 0] as const, unstable: true }, // from behind, forward
  frontBottomRail: { placeDir: [1, 0, 0] as const, unstable: true }, // from the front, backward under the step's front edge
  frontTopRail: { placeDir: [1, 0, 0] as const, unstable: true },
  backTopRail: { placeDir: [-1, 0, 0] as const, unstable: true },
  topPlane: { placeDir: [0, -1, 0] as const }, // closes down onto the top rails
  // The two dowels opt OUT of the sightline gate. Each taps into a shallow face-on hole in a side panel, and a 22mm plank's box is fatter than the plank: the fat alone eats the whole (burial + 6mm) threshold, so the gate called them hidden at the ordinary build angles and the tap could not be aimed. Their sockets are on the panel's open inward face — there is nothing standing in front of them to be fooled about.
  dowel101350_1: { noVisibilityGate: true },
  dowel101350_2: { noVisibilityGate: true },
  // NO per-screw toolAnchor here: the head-face contact is a GENERATED model fact now (parts.gen headOffset, emitted by read-parts.mjs from the mesh bounds) — an 11-entry hand copy of it lived here for one session and was deleted when the extractor learned to emit it.
} as StructureOverlay;

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