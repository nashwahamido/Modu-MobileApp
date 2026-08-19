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
// ORDER IS MEANINGFUL: the catalogue's finish carousel opens on the LAST entry and settles on
// the first (the resting tile). Each model opens on a different finish — cartoon here — so a
// grid of cards animating at once doesn't show the same picture four times.
const CATALOGUE_THUMBS: Record<string, ThumbSet> = {
  wooden: { light: require("../../../../assets/thumbnails/catalogue/EKET-wooden.png") },
  white: { light: require("../../../../assets/thumbnails/catalogue/EKET-white.png") },
  cozy: { light: require("../../../../assets/thumbnails/catalogue/EKET-cozy.png") },
  cartoon: { light: require("../../../../assets/thumbnails/catalogue/EKET-cartoon.png") },
};

export const EKET_META: FurnitureMeta = {
  id: asFurnitureId("eket-cabinet"),
  thumbnail: CATALOGUE_THUMBS.wooden,
  variantThumbnails: CATALOGUE_THUMBS,
  ...metaCounts(ALL_PART_IDS, ACTIONS, CLUSTERS),
};