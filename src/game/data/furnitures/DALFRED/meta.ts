import {
  expandFastenerRules,
  withOrder,
} from "@/src/game/core/composition/composeActions";
import { applyStructure } from "@/src/game/core/model/liaisons";
import { metaCounts } from "@/src/game/core/composition/metaCounts";
import { FurnitureMeta } from "@/src/game/core/type";
import { AUTHORED_ACTIONS, FASTENER_RULES, META, STRUCTURE } from "./authored";
import { HARDWARE } from "@/src/game/data/hardware";
import { ALL_PART_IDS, PARTS } from "./parts.gen";
import { thumbnail } from "./thumbs.gen";

const P = applyStructure(PARTS, STRUCTURE);
export const ACTIONS = withOrder(
  [...AUTHORED_ACTIONS, ...expandFastenerRules(FASTENER_RULES, P, HARDWARE)],
  P,
);

export const DALFRED_META: FurnitureMeta = {
  id: "DALFRED",
  name: META.name,
  thumbnail,
  brand: META.brand,
  category: META.category,
  difficulty: META.difficulty,
  duration: META.duration,
  link: META.link,
  ...metaCounts(ALL_PART_IDS, ACTIONS),
};
