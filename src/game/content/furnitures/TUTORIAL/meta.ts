import {
  expandFastenerRules,
  withOrder,
} from "@/src/game/core/composition/composeActions";
import { metaCounts } from "@/src/game/core/composition/metaCounts";
import { applyStructure } from "@/src/game/core/model/liaisons";
import { FurnitureMeta } from "@/src/game/core/type";
import { HARDWARE } from "@/src/game/content/hardware";
import {
  FASTENER_RULES,
  FINISHING_ACTION,
  META,
  PLACEMENT_ACTIONS,
  STRUCTURE,
} from "./authored";
import { ALL_PART_IDS, PARTS } from "./parts.gen";
import { thumbnail } from "./thumbs.gen";

const P = applyStructure(PARTS, STRUCTURE);
export const ACTIONS = withOrder(
  [
    ...PLACEMENT_ACTIONS,
    ...expandFastenerRules(FASTENER_RULES, P, HARDWARE),
    FINISHING_ACTION,
  ],
  P,
);

export const TUTORIAL_META: FurnitureMeta = {
  id: "TUTORIAL",
  name: META.name,
  thumbnail,
  brand: META.brand,
  category: META.category,
  difficulty: META.difficulty,
  duration: META.duration,
  ...metaCounts(ALL_PART_IDS, ACTIONS),
  engineOnly: true,
};
