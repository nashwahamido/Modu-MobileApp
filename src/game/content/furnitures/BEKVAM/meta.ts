import { composeFurnitureActions } from "@/src/game/core/composition/composeActions";
import { applyStructure } from "@/src/game/core/model/liaisons";
import { metaCounts } from "@/src/game/core/composition/metaCounts";
import { asFurnitureId } from "@/src/game/core/ids";
import { FurnitureMeta, ThumbSet } from "@/src/game/core/type";
import { AUTHORED_ACTIONS, CLUSTERS, FASTENER_RULES } from "./authored";
import { STRUCTURE_COMPOSED } from "./structure.gen";
import { HARDWARE } from "@/src/game/content/hardware";
import { ALL_PART_IDS, PARTS } from "./parts.gen";

const P = applyStructure(PARTS, STRUCTURE_COMPOSED);
export const ACTIONS = composeFurnitureActions(
  AUTHORED_ACTIONS,
  FASTENER_RULES,
  P,
  HARDWARE,
);

// Hand-authored catalogue art, deliberately NOT the generated render in thumbs.gen.ts: that file is regenerated from the model, so an override placed there is lost on the next gen:thumbs. The asset lives outside the generated tree for the same reason.
// ORDER IS MEANINGFUL: the catalogue's finish carousel opens AND closes on the LAST entry,
// passing through the others on the way. This model opens on cartoon; the resting tile below
// is the same finish, so an idle card and its first animated frame agree.
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