// One item's picture, for a chosen colour variation. Used by the Shop and Inventory tiles and by the
// room's colour picker, so all three show the SAME artwork for the same variation.
//
// The picture lives in storage next to the model it depicts (room/<built|bought>/<id>/<variation>.png) —
// derived, never stored, so a rename moves one folder. Three-step degradation, because a missing image
// must never leave a hole in a grid:
//   1. the per-variation PNG from storage
//   2. the BUNDLED assembly thumbnail, for built furniture (it ships in the app, so it is always there)
//   3. nothing — the tile's inset well, as before
import { useEffect, useState } from "react";
import { StyleSheet, Image } from "react-native";

import { variantThumbUrl } from "@/src/data/catalogUrls";
import { defaultVariation, type ItemSource } from "@/src/data/catalogAssets";
import type { CatalogId } from "@/src/data/types";
import { useItemVariants } from "@/src/data/variantStore";
import { FURNITURE_METAS } from "@/src/game/content/furnitures/furnitures";

// Bundled fallback art, keyed by catalog id. Built furniture already ships a thumbnail for the
// catalogue/build screens; reusing it means the Inventory has pictures even with an empty bucket.
const BUNDLED: Record<string, number> = Object.fromEntries(
  FURNITURE_METAS.map((meta) => [meta.id, meta.thumbnail.light]),
);

export interface CatalogThumbProps {
  source: ItemSource;
  itemId: CatalogId;
  // The variation to show. OMIT it to follow the item's default, which resolves REACTIVELY — a grid that
  // renders before item_variants lands still repaints on the item's real default once it does. Passing
  // null explicitly means the same thing as no default at all: the single 'default' model.
  variation?: string | null;
  // Rendered box; the art is contained inside it, never cropped.
  size: number;
}

export function CatalogThumb({ source, itemId, variation, size }: CatalogThumbProps) {
  const variants = useItemVariants(itemId);
  const shown = variation === undefined ? defaultVariation(variants) : variation;
  const uri = variantThumbUrl(source, itemId, shown);
  // Which uri failed, not a bare boolean: switching colour must retry the new one rather than inherit
  // the previous colour's failure.
  const [failed, setFailed] = useState<string | null>(null);
  useEffect(() => setFailed(null), [uri]);

  const remoteOk = uri !== null && failed !== uri;
  const bundled = BUNDLED[itemId];
  if (!remoteOk && bundled === undefined) return null;

  return (
    <Image
      source={remoteOk ? { uri } : bundled}
      style={[styles.art, { width: size, height: size }]}
      resizeMode="contain"
      onError={() => setFailed(uri)}
    />
  );
}

const styles = StyleSheet.create({
  art: { backgroundColor: "transparent" },
});
