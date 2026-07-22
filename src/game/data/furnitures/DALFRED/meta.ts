import { composeFurnitureActions } from "@/src/game/core/composition/composeActions";
import { applyStructure } from "@/src/game/core/model/liaisons";
import { metaCounts } from "@/src/game/core/composition/metaCounts";
import { FurnitureMeta } from "@/src/game/core/type";
import { AUTHORED_ACTIONS, CLUSTERS, FASTENER_RULES, META, STRUCTURE } from "./authored";
import { HARDWARE } from "@/src/game/data/hardware";
import { ALL_PART_IDS, PARTS } from "./parts.gen";
import { thumbnail } from "./thumbs.gen";

const P = applyStructure(PARTS, STRUCTURE);
export const ACTIONS = composeFurnitureActions(
  AUTHORED_ACTIONS,
  FASTENER_RULES,
  P,
  HARDWARE,
  CLUSTERS,
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
