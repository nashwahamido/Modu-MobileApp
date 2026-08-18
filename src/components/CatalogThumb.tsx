// One item's picture, for a chosen colour variation. Used by the Shop and Inventory tiles and by the room's colour picker, so all three show the SAME artwork for the same variation.
//
// The picture lives in storage next to the model it depicts (room/<built|bought>/<id>/<variation>.png) — derived, never stored, so a rename moves one folder. Three-step degradation, because a missing image must never leave a hole in a grid:
//   1. the per-variation PNG from storage
//   2. the BUNDLED assembly thumbnail, for built furniture (it ships in the app, so it is always there)
//   3. nothing — the tile's inset well, as before
import { useEffect, useState } from "react";
import { StyleSheet, Image } from "react-native";

import { tileUrl, variantThumbUrl } from "@/src/data/catalog/urls";
import { defaultVariation, type ItemSource } from "@/src/data/catalog/assets";
import type { CatalogId } from "@/src/data/core/types";
import { useItemVariants } from "@/src/data/catalog/variantStore";
import { FURNITURE_METAS } from "@/src/game/content/furnitures/furnitures";
import type { AssetSrc } from "@/src/game/core/type";

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

/** The bundled picture for one item in one variation: the matching finish if this build ships it,
 *  else the model's own thumbnail. undefined = not a built furniture, so there is no bundle. */
function bundledArt(itemId: string, variation: string | null | undefined): AssetSrc | undefined {
  const entry = BUNDLED[itemId];
  if (!entry) return undefined;
  return (variation ? entry.byVariation[variation] : undefined) ?? entry.default;
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

  const remoteOk = uri !== null && failed !== uri;
  const bundled = bundledArt(itemId, shown);
  // BUILT furniture prefers its BUNDLED picture over storage. Everywhere else storage wins, because
  // a bought item or a wallpaper has no bundle to fall back on — but a built model's catalogue art
  // ships with the app and is the picture the player has already seen on the card they built from.
  // Storage holds older renders of the same four models, so leaving it first meant the inventory and
  // the catalogue disagreed about what a LACK looks like.
  const preferBundled = bundled !== undefined && !surface;
  if (!remoteOk && bundled === undefined) return null;
  const showBundled = preferBundled || !remoteOk;

  return (
    <Image
      source={showBundled ? bundled : { uri }}
      style={[styles.art, { width: size, height: size }]}
      resizeMode="contain"
      onError={() => setFailed(uri)}
    />
  );
}

const styles = StyleSheet.create({
  art: { backgroundColor: "transparent" },
});