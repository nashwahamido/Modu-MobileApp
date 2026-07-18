import { applyStructure, buildLiaisons } from "@/src/game/core/model/liaisons";
import { buildInstructions } from "@/src/game/core/presentation/instructions";
import { Furniture, PartDef } from "@/src/game/core/type";
import { assertValidFurniture } from "@/src/game/core/composition/validateFurniture";
import { composeLabels } from "@/src/game/core/composition/composeLabels";
import { HARDWARE } from "@/src/game/data/hardware";
import { toolsUsed } from "@/src/game/data/tools";
import { BEATS, CLUSTERS, GATES, LABELS, PUSH_OPEN, STRUCTURE } from "./authored";
import { ACTIONS, EKET_META } from "./meta";
import { PARTS } from "./parts.gen";
import { clusterThumbs, thumbs } from "./thumbs.gen";

const P = PARTS as Record<string, PartDef>;

const PARTS_WITH_STRUCTURE = applyStructure(PARTS, STRUCTURE);
const LIAISONS = buildLiaisons(PARTS_WITH_STRUCTURE);
const LABELS_ALL = composeLabels(LABELS, PARTS_WITH_STRUCTURE, HARDWARE);
const INSTRUCTIONS = buildInstructions(ACTIONS, P, LABELS_ALL, BEATS, CLUSTERS);

const model = require("../../../../assets/models/furnitures/EKET/EKET.glb");

export const EKET: Furniture = {
  meta: EKET_META,
  model,
  parts: PARTS_WITH_STRUCTURE,
  actions: ACTIONS,
  gates: GATES,
  liaisons: LIAISONS,
  clusters: CLUSTERS,
  thumbs,
  clusterThumbs,
  tools: toolsUsed(ACTIONS),
  instructions: INSTRUCTIONS,
  labels: LABELS_ALL,
  pushOpen: PUSH_OPEN,
  xpPerStep: 10,
  xpBonusOnComplete: 100,
};

if (typeof __DEV__ === "undefined" || __DEV__) assertValidFurniture(EKET);
