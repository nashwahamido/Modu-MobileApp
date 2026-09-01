import {
  action,
  FastenerRule,
} from "@/src/game/core/composition/composeActions";
import { applyStructure, StructureOverlay } from "@/src/game/core/model/liaisons";
import { lowerFasteners, withFastenerFacts, type FastenerMap } from "@/src/game/core/model/fasteners";
import { PARTS } from "./parts.gen";
import { asGroupId, asPartId } from "@/src/game/core/ids";
import type { JointDef } from "@/src/game/core/model/joints";
import {
  ClusterDef,
  ClusterId,
  DraftAction,
  InstructionSet,
  LabelMap,
} from "@/src/game/core/type";

// part name in part tray
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

const STRUCTURE_BASE = {
  legL: { seed: true },
  step: { seed: true },
  legR: { seed: true },
  backBottomRail: { unstable: true },
  frontBottomRail: { unstable: true },

  frontTopRail: { placeDir: [1, 0, 0] as const, unstable: true },
  backTopRail: { placeDir: [-1, 0, 0] as const, unstable: true },
  topPlane: { placeDir: [0, -1, 0] as const }, // closes down onto the top rails

  //temp fixes - disable visibility gate
  dowel101350_1: { noVisibilityGate: true },
  dowel101350_2: { noVisibilityGate: true },
  screw105111_1: { noVisibilityGate: true },
  screw105111_2: { noVisibilityGate: true },
  screw105111_3: { noVisibilityGate: true },
} as StructureOverlay;


export const JOINTS: JointDef[] = [
  ...(
    [
      ["frontBottomRail", ["legR", "legL", "step"]],
      ["backBottomRail", ["legR", "legL"]],
      ["frontTopRail", ["legR", "legL", "topPlane"]],
      ["backTopRail", ["legR", "legL", "topPlane"]],
    ] as const
  ).flatMap(([rail, partners]) =>
    partners.map(
      (p): JointDef => ({
        kind: "snap",
        a: asPartId(rail),
        b: asPartId(p),
        mover: asPartId(rail),
      }),
    ),
  ),
];

export const FASTENERS: FastenerMap = {
  dowel101350: { home: "liaison", role: "connector", preload: { completesOn: "insert", counterpartMountsBy: "press" } },
  screw105215: { home: "liaison", role: "securer" },
  screw105111: { home: "liaison", role: "securer" },
} as unknown as FastenerMap;

const LOWERED = lowerFasteners(FASTENERS, applyStructure(PARTS, STRUCTURE_BASE));

export const STRUCTURE: StructureOverlay = withFastenerFacts(STRUCTURE_BASE, LOWERED);

export const FASTENER_RULES: FastenerRule[] = LOWERED.rules;

const place = (partId: string, stage: number) =>
  action({ type: "placePart", stage, partId, requires: [] });

// only structral parts
export const AUTHORED_ACTIONS: DraftAction[] = [
  place("legL", 1),
  place("step", 1),
  place("legR", 1),
  place("backBottomRail", 1),
  place("frontBottomRail", 1),
  place("frontTopRail", 1),
  place("backTopRail", 1),
  place("topPlane", 2),
]; 

// complementary steps / instrution overwrite
export const BEATS = {} as InstructionSet;