import { composeFurnitureActions } from "@/src/game/core/composition/composeActions";
import { applyStructure } from "@/src/game/core/model/liaisons";
import { metaCounts } from "@/src/game/core/composition/metaCounts";
import { asFurnitureId } from "@/src/game/core/ids";
import { FurnitureMeta, ThumbSet } from "@/src/game/core/type";
import { AUTHORED_ACTIONS, CLUSTERS, FASTENER_RULES, STRUCTURE } from "./authored";
import { HARDWARE } from "@/src/game/content/hardware";
import { ALL_PART_IDS, PARTS } from "./parts.gen";

const P = applyStructure(PARTS, STRUCTURE);
export const ACTIONS = composeFurnitureActions(
  AUTHORED_ACTIONS,
  FASTENER_RULES,
  P,
  HARDWARE,
  CLUSTERS,
);

// Hand-authored catalogue art, deliberately NOT the generated render in thumbs.gen.ts: that file is regenerated from the model, so an override placed there is lost on the next gen:thumbs. The asset lives outside the generated tree for the same reason.
// ORDER IS MEANINGFUL: the catalogue's finish carousel opens AND closes on the LAST entry,
// passing through the others on the way. This model opens on cozy; the resting tile below
// is the same finish, so an idle card and its first animated frame agree.
const CATALOGUE_THUMBS: Record<string, ThumbSet> = {
  wooden: { light: require("../../../../assets/thumbnails/catalogue/DALFRED-wooden.png") },
  black: { light: require("../../../../assets/thumbnails/catalogue/DALFRED-black.png") },
  cartoon: { light: require("../../../../assets/thumbnails/catalogue/DALFRED-cartoon.png") },
  cozy: { light: require("../../../../assets/thumbnails/catalogue/DALFRED-cozy.png") },
};

export const DALFRED_META: FurnitureMeta = {
  id: asFurnitureId("dalfred-stool"),
  thumbnail: CATALOGUE_THUMBS.cozy,
  variantThumbnails: CATALOGUE_THUMBS,
  ...metaCounts(ALL_PART_IDS, ACTIONS, CLUSTERS),
};