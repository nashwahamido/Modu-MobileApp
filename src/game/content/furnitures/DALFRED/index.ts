import { applyStructure, buildLiaisons } from "@/src/game/core/model/liaisons";
import { buildInstructions } from "@/src/game/core/presentation/instructions";
import { Furniture, PartDef } from "@/src/game/core/type";
import { assertValidFurniture } from "@/src/game/core/composition/validateFurniture";
import { composeLabels } from "@/src/game/core/composition/composeLabels";
import { HARDWARE } from "@/src/game/content/hardware";
import { toolsUsed } from "@/src/game/content/tools";
import { audio } from "./audio.gen";
import { BEATS, CLUSTERS, LABELS, STRUCTURE } from "./authored";
import { ACTIONS, DALFRED_META } from "./meta";
import { PARTS } from "./parts.gen";
import { SWEEP } from "./sweep.gen";
import { clusterThumbs, thumbs } from "./thumbs.gen";
import { CLUSTER_VARIANT_THUMBS } from "./clusterVariants";

const P = PARTS as Record<string, PartDef>;

const PARTS_WITH_STRUCTURE = applyStructure(PARTS, STRUCTURE);
const LIAISONS = buildLiaisons(PARTS_WITH_STRUCTURE);
const LABELS_ALL = composeLabels(LABELS, PARTS_WITH_STRUCTURE, HARDWARE);
const INSTRUCTIONS = buildInstructions(ACTIONS, P, LABELS_ALL, BEATS, CLUSTERS);

const model = require("../../../../assets/models/furnitures/DALFRED/DALFRED.glb");
// Per-style looks. Same node names as the base model — the scene swaps the whole model by
// renderStyle via furniture.styleModels, and parts are keyed by node name, so the three files must
// agree. Generated from the base by repainting its non-metal materials flat (LACK is the
// hand-authored original of this pattern).
const MODEL_COZY = require("../../../../assets/models/furnitures/DALFRED/DALFRED_cozy.glb");
const MODEL_CARTOON = require("../../../../assets/models/furnitures/DALFRED/DALFRED_cartoon.glb");

export const DALFRED: Furniture = {
  meta: DALFRED_META,
  model,
  styleModels: {
    realistic: model,
    cozy: MODEL_COZY,
    cartoon: MODEL_CARTOON,
  },
  parts: PARTS_WITH_STRUCTURE,
  sweep: SWEEP,
  actions: ACTIONS,
  liaisons: LIAISONS,
  clusters: CLUSTERS,
  thumbs,
  clusterThumbs,
  clusterVariantThumbs: CLUSTER_VARIANT_THUMBS,
  audio,
  tools: toolsUsed(ACTIONS),
  instructions: INSTRUCTIONS,
  labels: LABELS_ALL,
  xpPerStep: 10,
  xpBonusOnComplete: 100,
};

if (typeof __DEV__ === "undefined" || __DEV__) assertValidFurniture(DALFRED);