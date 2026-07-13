import {
  expandFastenerRules,
  withOrder,
} from "@/src/game/core/composition/composeActions";
import { applyStructure } from "@/src/game/core/model/liaisons";
import { metaCounts } from "@/src/game/core/composition/metaCounts";
import { FurnitureMeta, ThumbSet } from "@/src/game/core/type";
import { AUTHORED_ACTIONS, FASTENER_RULES, META, STRUCTURE } from "./authored";
import { HARDWARE } from "@/src/game/data/hardware";
import { ALL_PART_IDS, PARTS } from "./parts";

// MALM reuses LACK's furniture preview. Light-only (no dark thumbnails); the UI
// falls back to light for dark themes via pickThumb.
const thumbnail = {
  light: require("../../../../assets/thumbnails/furnitures/LACK/light/LACK.png"),
} satisfies ThumbSet;

const P = applyStructure(PARTS, STRUCTURE);
export const ACTIONS = withOrder(
  [...AUTHORED_ACTIONS, ...expandFastenerRules(FASTENER_RULES, P, HARDWARE)],
  P,
);

export const MALM_META: FurnitureMeta = {
  id: "MALM",
  name: META.name,
  thumbnail,
  brand: META.brand,
  category: META.category,
  difficulty: META.difficulty,
  duration: META.duration,
  link: META.link,
  ...metaCounts(ALL_PART_IDS, ACTIONS),
  engineOnly: true,
};
