import { applyStructure, buildLiaisons } from "@/src/game/core/model/liaisons";
import { buildInstructions } from "@/src/game/core/presentation/instructions";
import { Furniture, PartDef } from "@/src/game/core/type";
import { assertValidFurniture } from "@/src/game/core/composition/validateFurniture";
import { composeLabels } from "@/src/game/core/composition/composeLabels";
import { HARDWARE } from "@/src/game/data/hardware";
import { toolsUsed } from "@/src/game/data/tools";
import { BEATS, CLUSTERS, LABELS, STRUCTURE } from "./authored";
import { ACTIONS, LACK_META } from "./meta";
import { PARTS } from "./parts.gen";
import { thumbs } from "./thumbs.gen";

const P = PARTS as Record<string, PartDef>;

const PARTS_WITH_STRUCTURE = applyStructure(PARTS, STRUCTURE);
const LIAISONS = buildLiaisons(PARTS_WITH_STRUCTURE);
const LABELS_ALL = composeLabels(LABELS, PARTS_WITH_STRUCTURE, HARDWARE);
const INSTRUCTIONS = buildInstructions(ACTIONS, P, LABELS_ALL, BEATS, CLUSTERS);

const model = require("../../../../assets/models/furnitures/LACK/LACK.glb");
const shadow = require("../../../../assets/models/furnitures/LACK/shadow.glb");

export const LACK: Furniture = {
  meta: LACK_META,
  model,
  shadow,
  parts: PARTS_WITH_STRUCTURE,
  actions: ACTIONS,
  liaisons: LIAISONS,
  clusters: CLUSTERS,
  thumbs,
  tools: toolsUsed(ACTIONS),
  instructions: INSTRUCTIONS,
  labels: LABELS_ALL,
  xpPerStep: 10,
  xpBonusOnComplete: 100,
};

if (typeof __DEV__ === "undefined" || __DEV__) assertValidFurniture(LACK);
