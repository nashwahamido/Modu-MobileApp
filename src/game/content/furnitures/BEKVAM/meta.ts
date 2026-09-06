import { composeFurnitureActions } from "@/src/game/core/composition/composeActions";
import { applyStructure } from "@/src/game/core/model/liaisons";
import { metaCounts } from "@/src/game/core/composition/metaCounts";
import { asFurnitureId } from "@/src/game/core/ids";
import { FurnitureMeta, ThumbSet } from "@/src/game/core/type";
import { AUTHORED_ACTIONS, CLUSTERS, FASTENERS } from "./authored";
import { STRUCTURE_COMPOSED } from "./structure.gen";
import { HARDWARE } from "@/src/game/content/hardware";
import { ALL_PART_IDS, PARTS } from "./parts.gen";

const P = applyStructure(PARTS, STRUCTURE_COMPOSED);
export const ACTIONS = composeFurnitureActions(
  AUTHORED_ACTIONS,
  FASTENERS,
  P,
  HARDWARE,
);

const CATALOGUE_THUMBS: Record<string, ThumbSet> = {
  wooden: { light: require("../../../../assets/thumbnails/catalogue/BEKVAM-wooden.png") },
  cozy: { light: require("../../../../assets/thumbnails/catalogue/BEKVAM-cozy.png") },
  cartoon: { light: require("../../../../assets/thumbnails/catalogue/BEKVAM-cartoon.png") },
  black: { light: require("../../../../assets/thumbnails/catalogue/BEKVAM-black.png") },
};

export const BEKVAM_META: FurnitureMeta = {
  id: asFurnitureId("bekvam-stool"),
  thumbnail: CATALOGUE_THUMBS.black,
  variantThumbnails: CATALOGUE_THUMBS,
  ...metaCounts(ALL_PART_IDS, ACTIONS, CLUSTERS),
};