import { composeFurnitureActions } from "@/src/game/core/composition/composeActions";
import { applyStructure } from "@/src/game/core/model/liaisons";
import { metaCounts } from "@/src/game/core/composition/metaCounts";
import { FurnitureMeta } from "@/src/game/core/type";
import { AUTHORED_ACTIONS, CLUSTERS, FASTENER_RULES, STRUCTURE } from "./authored";
import { HARDWARE } from "@/src/game/content/hardware";
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
  id: "dalfred-stool",
  thumbnail,
  ...metaCounts(ALL_PART_IDS, ACTIONS, CLUSTERS),
};
