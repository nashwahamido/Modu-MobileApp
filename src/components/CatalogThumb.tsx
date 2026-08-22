// One item's picture, for a chosen colour variation. Used by the Shop and Inventory tiles and by the room's colour picker, so all three show the SAME artwork for the same variation.
//
// The picture lives in storage next to the model it depicts (room/<built|bought>/<id>/<variation>.png) — derived, never stored, so a rename moves one folder. Degradation is by how well each source matches the variation being asked for, because a missing image must never leave a hole in a grid:
//   1. the BUNDLED picture OF THAT VARIATION, for built furniture — the app's own art, which is what the player saw on the card they built from
//   2. the per-variation PNG from storage — per-variation by construction, so it is the right answer for any finish the bundle does not ship
//   3. any bundled picture of the item, as a stand-in when storage is missing or 404s
//   4. nothing — the tile's inset well, as before
// The order of 1 and 2 is the one deliberate inversion: storage holds OLDER renders of the four built models, so consulting it first made the inventory and the catalogue disagree about what a LACK looks like. That preference is only earned for a variation the bundle actually depicts — see thumbArt.ts.
import { useEffect, useState } from "react";
import { StyleSheet, Image } from "react-native";

import { tileUrl, variantThumbUrl } from "@/src/data/catalog/urls";
import { defaultVariation, type ItemSource } from "@/src/data/catalog/assets";
import type { CatalogId } from "@/src/data/core/types";
import { useItemVariants } from "@/src/data/catalog/variantStore";
import { FURNITURE_METAS } from "@/src/game/content/furnitures/furnitures";
import type { AssetSrc } from "@/src/game/core/type";
import { chooseThumbArt, pickBundled } from "./thumbArt";

// Bundled fallback art, keyed by catalog id. Built furniture already ships thumbnails for the
// catalogue/build screens; reusing them means the Inventory has pictures even with an empty bucket —
// and, more to the point, that a model looks the SAME in the shop, the inventory and the catalogue.
//
// PER VARIATION, not one picture per item: a build now ships art for each finish it can be built in
// (meta.variantThumbnails), so a white LACK in the inventory can be the white LACK from the
// catalogue rather than the model's default picture standing in for every colour.
const BUNDLED: Record<string, { default: AssetSrc; byVariation: Record<string, AssetSrc> }> =
  Object.fromEntries(
    FURNITURE_METAS.map((meta) => [
      meta.id,
      {
        default: meta.thumbnail.light,
        byVariation: Object.fromEntries(
          Object.entries(meta.variantThumbnails ?? {}).map(([finish, set]) => [finish, set.light]),
        ),
      },
    ]),
  );


/**
 * The finish each BUILT model wears in a GRID — the shop and the inventory.
 *
 * A grid tile is a portrait of the item, not of a finish the player has chosen, so it needs one
 * agreed face per model. Left to the catalog row's own default it was "wooden" for all four, which
 * put four near-identical wood renders in a row and made the models hard to tell apart at tile size.
 * These are picked for legibility instead: EKET reads best in cartoon, LACK in white.
 *
 * Anything not listed — every bought item, and the two built models with no strong preference —
 * resolves to undefined, which is the model's own default variation rather than any finish.
 */
const GRID_FINISH: Record<string, string> = {
  "eket-cabinet": "cartoon",
  "lack-table": "white",
};

/** The variation a grid tile should show for an item, or undefined to follow the item's own default.
 *
 *  UNDEFINED, NOT NULL. To CatalogThumb below, an explicit null is a positive claim — "this item has a
 *  single model, at the 'default' path segment" — not an absence of opinion. Returning it for every
 *  item without a listed finish pointed the whole grid at room/<source>/<id>/default.png, which a
 *  multi-variation item does not have: MALM's picture is white.png, and its tile went blank. */
export function gridVariation(itemId: string): string | undefined {
  return GRID_FINISH[itemId];
}

/** How much of the well a grid thumbnail may use, as a fraction of its height.
 *
 *  ONLY THE BUILT MODELS SHRINK. Their art is the assembly pipeline's own render, framed tight —
 *  72% to 95% of its canvas — where a bought item's storage render already carries its own air. So
 *  the four ran to the edges of their wells while everything around them sat comfortably inside, and
 *  a grid of both read as two different sizes of picture. Backing the built four off is what puts
 *  them in the same band; doing it to everything just made the whole grid smaller and kept the
 *  mismatch.
 *
 *  Keyed off BUNDLED — the same table that decides an item HAS bundled art — so "is this a built
 *  model" is answered in one place and a fifth furniture needs no edit here. */
const BUILT_THUMB_FILL = 0.58;

export function gridThumbFill(itemId: string): number {
  return BUNDLED[itemId] ? BUILT_THUMB_FILL : 1;
}

export interface CatalogThumbProps {
  source: ItemSource;
  itemId: CatalogId;
  // The variation to show. OMIT it to follow the item's default, which resolves REACTIVELY — a grid that renders before item_variants lands still repaints on the item's real default once it does. Passing null explicitly means the same thing as no default at all: the single 'default' model.
  variation?: string | null;
  // A wallpaper or a floor, whose picture is its own tile image rather than a per-variation render. It cannot be inferred here: a surface and a one-look model-item like a window BOTH resolve to a null variation, so the caller — which knows the category — has to say.
  surface?: boolean;
  // Rendered box; the art is contained inside it, never cropped.
  size: number;
}

export function CatalogThumb({ source, itemId, variation, surface, size }: CatalogThumbProps) {
  const variants = useItemVariants(itemId);
  const shown = variation === undefined ? defaultVariation(variants) : variation;
  const uri = surface ? tileUrl(source, itemId) : variantThumbUrl(source, itemId, shown);
  // Which uri failed, not a bare boolean: switching colour must retry the new one rather than inherit the previous colour's failure.
  const [failed, setFailed] = useState<string | null>(null);
  useEffect(() => setFailed(null), [uri]);

  // A surface has no bundle to consider at all: a wallpaper's picture is its own tile image, and no built furniture is a surface.
  const { exact, standIn } = pickBundled(surface ? undefined : BUNDLED[itemId], shown);
  // Narrowed rather than tested as a boolean, so the non-null uri travels into the source object.
  const remote = uri !== null && failed !== uri ? { uri } : undefined;
  const art = chooseThumbArt<AssetSrc | { uri: string }>(exact, remote, standIn);
  if (!art) return null;

  // A surface IS its picture — a wallpaper or a floor is a tiling swatch with no silhouette, so it fills the frame and crops. Everything else is an object photographed against nothing, and must be contained or it loses its edges.
  return (
    <Image
      source={art}
      style={surface ? styles.fill : [styles.art, { width: size, height: size }]}
      resizeMode={surface ? "cover" : "contain"}
      onError={() => setFailed(uri)}
    />
  );
}

const styles = StyleSheet.create({
  art: { backgroundColor: "transparent" },
  // Fills whatever box the caller gave it; cover crops the overflow rather than squashing it
  fill: { ...StyleSheet.absoluteFillObject },
});