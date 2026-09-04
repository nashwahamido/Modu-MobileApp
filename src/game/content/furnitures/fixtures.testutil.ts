import type { FastenerMap } from "@/src/game/core/type";
// Composed furniture for tests: the same pipeline each furniture's index.ts runs, minus the GLB and thumbnail requires. Not named *.test.ts on purpose — `npm test` globs that pattern and would try to execute this as a test file.
import { composeFurnitureActions } from "@/src/game/core/composition/composeActions";
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

import { COMPOSED } from "./composed";
import * as LACK from "./LACK/authored";
import { PARTS as LACK_PARTS } from "./LACK/parts.gen";
import * as EKET from "./EKET/authored";
import { PARTS as EKET_PARTS } from "./EKET/parts.gen";
import * as DALFRED from "./DALFRED/authored";
import { PARTS as DALFRED_PARTS } from "./DALFRED/parts.gen";

export interface AuthoredExports {
  AUTHORED_ACTIONS: readonly DraftAction[];
  FASTENERS: FastenerMap;
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
  /** The furniture's COMPOSED structure (structure.gen.ts) — its STRUCTURE with any JOINTS already lowered in. Passed rather than looked up by `id`, because `id` here is the furniture id ("eket-cabinet") and the composed table is keyed by folder; defaulting to m.STRUCTURE would silently drop a migrated part's joins, which is the exact failure this argument exists to prevent. */
  composed: StructureOverlay,
): Furniture {
  const parts = applyStructure(raw, composed);
  const actions = composeFurnitureActions(
    m.AUTHORED_ACTIONS,
    m.FASTENERS,
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

export const LACK_FIXTURE = fixture("lack-table", LACK as AuthoredExports, LACK_PARTS, COMPOSED.LACK);
export const EKET_FIXTURE = fixture("eket-cabinet", EKET as AuthoredExports, EKET_PARTS, COMPOSED.EKET);
export const DALFRED_FIXTURE = fixture("dalfred-stool", DALFRED as AuthoredExports, DALFRED_PARTS, COMPOSED.DALFRED);
