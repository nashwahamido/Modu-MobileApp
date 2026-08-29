// Composed furniture for tests: the same pipeline each furniture's index.ts runs, minus the GLB and thumbnail requires. Not named *.test.ts on purpose — `npm test` globs that pattern and would try to execute this as a test file.
import { composeFurnitureActions, FastenerRule } from "@/src/game/core/composition/composeActions";
import { applyStructure, buildLiaisons, StructureOverlay } from "@/src/game/core/model/liaisons";
import { buildComponents } from "@/src/game/core/model/components";
import { HARDWARE } from "@/src/game/content/hardware";
import type {
  ClusterDef,
  ClusterId,
  ComponentMap,
  DraftAction,
  Furniture,
  Gate,
  LabelMap,
  PartDef,
  PartId,
} from "@/src/game/core/type";

import * as LACK from "./LACK/authored";
import { PARTS as LACK_PARTS } from "./LACK/parts.gen";
import * as EKET from "./EKET/authored";
import { PARTS as EKET_PARTS } from "./EKET/parts.gen";
import * as DALFRED from "./DALFRED/authored";
import { PARTS as DALFRED_PARTS } from "./DALFRED/parts.gen";

export interface AuthoredExports {
  AUTHORED_ACTIONS: readonly DraftAction[];
  FASTENER_RULES: readonly FastenerRule[];
  STRUCTURE: StructureOverlay;
  LABELS: LabelMap;
  CLUSTERS?: Record<ClusterId, ClusterDef>;
  COMPONENTS?: ComponentMap;
  GATES?: Record<string, Gate>;
}

export function fixture(
  id: string,
  m: AuthoredExports,
  raw: Record<PartId, PartDef>,
): Furniture {
  const parts = applyStructure(raw, m.STRUCTURE);
  const actions = composeFurnitureActions(
    m.AUTHORED_ACTIONS,
    m.FASTENER_RULES,
    parts,
    HARDWARE,
    m.CLUSTERS,
  );
  return {
    meta: { id } as Furniture["meta"],
    model: 0,
    parts,
    actions,
    gates: m.GATES,
    liaisons: buildLiaisons(parts),
    components: m.COMPONENTS ? buildComponents(m.COMPONENTS, parts) : undefined,
    clusters: m.CLUSTERS,
    thumbs: {},
    instructions: {},
    labels: m.LABELS,
    xpPerStep: 0,
    xpBonusOnComplete: 0,
  } as Furniture;
}

export const LACK_FIXTURE = fixture("lack-table", LACK as AuthoredExports, LACK_PARTS);
export const EKET_FIXTURE = fixture("eket-cabinet", EKET as AuthoredExports, EKET_PARTS);
export const DALFRED_FIXTURE = fixture("dalfred-stool", DALFRED as AuthoredExports, DALFRED_PARTS);
