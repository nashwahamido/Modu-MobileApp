import { applyStructure, buildLiaisons } from "@/src/game/core/model/liaisons";
import { buildComponents } from "@/src/game/core/model/components";
import { buildInstructions } from "@/src/game/core/presentation/instructions";
import { Furniture, PartDef } from "@/src/game/core/type";
import { assertValidFurniture } from "@/src/game/core/composition/validateFurniture";
import { composeLabels } from "@/src/game/core/composition/composeLabels";
import { HARDWARE } from "@/src/game/content/hardware";
import { toolsUsed } from "@/src/game/content/tools";
import { BEATS, CLUSTERS, COMPONENTS, GATES, LABELS, PUSH_OPEN, STRUCTURE } from "./authored";
import { ACTIONS, EKET_META } from "./meta";
import { PARTS } from "./parts.gen";
import { BOXES } from "./boxes.gen";
import { SWEEP } from "./sweep.gen";
import { clusterThumbs, thumbs } from "./thumbs.gen";
import { CLUSTER_VARIANT_THUMBS } from "./clusterVariants";

const PARTS_WITH_STRUCTURE = applyStructure(PARTS, STRUCTURE);
const LIAISONS = buildLiaisons(PARTS_WITH_STRUCTURE);
const COMPONENTS_IDX = buildComponents(COMPONENTS, PARTS_WITH_STRUCTURE);
const LABELS_ALL = composeLabels(LABELS, PARTS_WITH_STRUCTURE, HARDWARE);
// the STRUCTURED parts, not the raw generated ones: step text keys off authored fields (a staged carrier's stageOffset picks the "pick the sub-assembly back up" wording), which only exist after applyStructure
const INSTRUCTIONS = buildInstructions(
  ACTIONS,
  PARTS_WITH_STRUCTURE as Record<string, PartDef>,
  LABELS_ALL,
  BEATS,
  CLUSTERS,
);

const model = require("../../../../assets/models/furnitures/EKET/EKET.glb");
// Per-style looks. Same node names as the base model — the scene swaps the whole model by
// renderStyle via furniture.styleModels, and parts are keyed by node name, so the three files must
// agree. Generated from the base by repainting its non-metal materials flat (LACK is the
// hand-authored original of this pattern).
const MODEL_COZY = require("../../../../assets/models/furnitures/EKET/EKET_cozy.glb");
const MODEL_CARTOON = require("../../../../assets/models/furnitures/EKET/EKET_cartoon.glb");

export const EKET: Furniture = {
  meta: EKET_META,
  model,
  styleModels: {
    realistic: model,
    cozy: MODEL_COZY,
    cartoon: MODEL_CARTOON,
  },
  parts: PARTS_WITH_STRUCTURE,
  boxes: BOXES,
  sweep: SWEEP,
  actions: ACTIONS,
  gates: GATES,
  liaisons: LIAISONS,
  components: COMPONENTS_IDX,
  clusters: CLUSTERS,
  thumbs,
  clusterThumbs,
  clusterVariantThumbs: CLUSTER_VARIANT_THUMBS,
  tools: toolsUsed(ACTIONS),
  instructions: INSTRUCTIONS,
  labels: LABELS_ALL,
  pushOpen: PUSH_OPEN,
  xpPerStep: 10,
  xpBonusOnComplete: 100,
};

if (typeof __DEV__ === "undefined" || __DEV__) assertValidFurniture(EKET);