// Each furniture's COMPOSED structure — its authored STRUCTURE with any JOINTS already lowered in (structure.gen.ts) — keyed by furniture id.
// Exists for the callers that rebuild a furniture generically: a test looping over the corpus has the id in hand, not the module, and `applyStructure(raw, COMPOSED[id])` is the whole recipe. Before this, every such caller had to remember to pass JOINTS and JOINT_GEOMETRY alongside STRUCTURE, and forgetting silently dropped a migrated part's joins instead of failing — which is exactly how nine tests went red the first time EKET migrated.
// A furniture's own index.ts/meta.ts import their structure.gen directly; this table is for the generic path.
import type { StructureOverlay } from "@/src/game/core/model/liaisons";

import { STRUCTURE_COMPOSED as LACK } from "./LACK/structure.gen";
import { STRUCTURE_COMPOSED as BEKVAM } from "./BEKVAM/structure.gen";
import { STRUCTURE_COMPOSED as DALFRED } from "./DALFRED/structure.gen";
import { STRUCTURE_COMPOSED as EKET } from "./EKET/structure.gen";

export const COMPOSED: Record<string, StructureOverlay> = { LACK, BEKVAM, DALFRED, EKET };
