import {
  action,
  FastenerRule,
} from "@/src/game/core/composition/composeActions";
import { applyStructure, StructureOverlay } from "@/src/game/core/model/liaisons";
import { groupParts } from "@/src/game/core/scene/targets";
import { lowerFasteners, withFastenerFacts, type FastenerMap } from "@/src/game/core/model/fasteners";
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

// part name in part tray
export const LABELS = {
  tableTop: { standard: "Table top", simple: "Top" },
  leg: { standard: "Leg" },
} as LabelMap;

// clusters
export const CLUSTERS = {
  whole: { id: "whole", label: "Table" },
} as Record<ClusterId, ClusterDef>;


const STRUCTURE_BASE = {
  tableTop: { seed: true },
} as StructureOverlay;

export const FASTENERS: FastenerMap = {
  bolt115980: { home: "liaison", role: "connector", preload: { completesOn: "tighten", counterpartMountsBy: "screw" } },
} as unknown as FastenerMap;

const LOWERED = lowerFasteners(FASTENERS, applyStructure(P, STRUCTURE_BASE));

export const STRUCTURE: StructureOverlay = withFastenerFacts(STRUCTURE_BASE, LOWERED);

export const FASTENER_RULES: FastenerRule[] = LOWERED.rules;

const LEG_IDS = groupParts(P, asGroupId("leg")).map((p) => p.partId);
export const AUTHORED_ACTIONS: DraftAction[] = [
  action({ type: "placePart", stage: 1, partId: "tableTop", requires: [] }),
  ...LEG_IDS.map((leg) =>
    action({ type: "placePart", stage: 1, partId: leg, requires: [] }),
  ),
]; 


export const BEATS = {} as InstructionSet;