import { useEffect, useState } from "react";
import { StyleSheet, Image } from "react-native";

import { tileUrl, variantThumbUrl } from "@/src/data/catalog/urls";
import { defaultVariation, type ItemSource } from "@/src/data/catalog/assets";
import type { CatalogId } from "@/src/data/core/types";
import { useItemVariants } from "@/src/data/catalog/variantStore";
import { FURNITURE_METAS } from "@/src/game/content/furnitures/furnitures";
import type { AssetSrc } from "@/src/game/core/type";
import { chooseThumbArt, pickBundled } from "./thumbArt";

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

const GRID_FINISH: Record<string, string> = {
  "eket-cabinet": "cartoon",
  "lack-table": "white",
};

export function gridVariation(itemId: string): string | undefined {
  return GRID_FINISH[itemId];
}

const BUILT_THUMB_FILL = 0.58;

export function gridThumbFill(itemId: string): number {
  return BUNDLED[itemId] ? BUILT_THUMB_FILL : 1;
}

export interface CatalogThumbProps {
  source: ItemSource;
  itemId: CatalogId;
  variation?: string | null;
  surface?: boolean;
  size: number;
}

export function CatalogThumb({ source, itemId, variation, surface, size }: CatalogThumbProps) {
  const variants = useItemVariants(itemId);
  const shown = variation === undefined ? defaultVariation(variants) : variation;
  const uri = surface ? tileUrl(source, itemId) : variantThumbUrl(source, itemId, shown);
  const [failed, setFailed] = useState<string | null>(null);
  useEffect(() => setFailed(null), [uri]);

  const { exact, standIn } = pickBundled(surface ? undefined : BUNDLED[itemId], shown);
  const remote = uri !== null && failed !== uri ? { uri } : undefined;
  const art = chooseThumbArt<AssetSrc | { uri: string }>(exact, remote, standIn);
  if (!art) return null;

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
  fill: { ...StyleSheet.absoluteFillObject },
});