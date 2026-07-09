// Composer: assembles LACK's generated facts + authored data + rules into a
// single Furniture object, derives the counts, and self-validates so a
// malformed build fails at load instead of mid-play.
import { Furniture } from "@/src/adhd/core/type";
import { assertValidFurniture } from "@/src/adhd/core/validateFurniture";
import { ACTIONS } from "./assembly";
import { GATES } from "./gates";
import { INSTRUCTIONS } from "./instruction";
import { LABELS } from "./parts.authored";
import { ALL_PART_IDS, PARTS } from "./parts.gen";

// assets — the combined LACK GLB (whole_* named entities at baked poses).
const model = require("@/src/adhd/assets/models/furniture-models/LACK/LACK.glb");
// Cozy style variant: olive-glossy top/legs, metal bolts, no outline.
const MODEL_COZY = require("@/src/adhd/assets/models/furniture-models/LACK/LACK_cozy.glb");
// Cartoonish style variant: clementine matte top/legs, metal bolts, dark toon outline.
const MODEL_CARTOON = require("@/src/adhd/assets/models/furniture-models/LACK/LACK_cartoon.glb");
// Placeholder: meta.thumbnail is only used by a furniture picker (GameScreen
// never renders it), so it points at the model file to avoid a separate PNG
// asset. Swap to a real preview PNG later.
const thumbnail = require("@/src/adhd/assets/models/furniture-models/LACK/LACK.glb");

// Per-part 3D preview thumbnails for the inventory tray, keyed by part group.
const THUMB_TABLETOP = require("@/src/adhd/assets/images/thumb_tableTop.png");
const THUMB_LEG = require("@/src/adhd/assets/images/thumb_leg.png");
const THUMB_SCREW = require("@/src/adhd/assets/images/thumb_screw.png");

// The table top is a flat surface you just set down — no twist-to-lock. Every
// other part (the legs) keeps the screw-in-by-hand twist.
const PARTS_TUNED = {
  ...PARTS,
  tableTop: { ...PARTS.tableTop, placeOnDrop: true },
};

const stageCount = new Set(ACTIONS.map((a) => a.stage)).size;

export const LACK: Furniture = {
  meta: {
    id: "LACK",
    name: "Lack Table",
    thumbnail,
    difficulty: 1,
    partCount: ALL_PART_IDS.length,
    stageCount,
    stepCount: ACTIONS.length,
  },
  model,
  // Per-style table looks.
  styleModels: {
    realistic: model,
    cozy: MODEL_COZY,
    cartoonish: MODEL_CARTOON,
  },
  parts: PARTS_TUNED,
  actions: ACTIONS,
  gates: GATES,
  thumbs: { tableTop: THUMB_TABLETOP, leg: THUMB_LEG, screw115980: THUMB_SCREW },
  instructions: INSTRUCTIONS,
  labels: LABELS,
  xpPerStep: 10,
  xpBonusOnComplete: 100,
};

// Fail loudly in development if the action graph is malformed.
if (typeof __DEV__ === "undefined" || __DEV__) assertValidFurniture(LACK);