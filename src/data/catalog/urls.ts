// the DERIVED catalog paths (assets.ts) as fetchable URLs — split out so THAT module stays importable by node:test
// a public bucket, so no signing or expiry; the client resolves LAZILY since config/supabase.ts throws on missing env vars
import { CATALOG_BUCKET, surfaceMapPath, thumbPath, tilePath, type ItemSource, type SurfaceMap } from "./assets";
import type { CatalogId } from "../core/types";

let resolver: ((path: string) => string) | null = null;
let resolverFailed = false;

// memoised. null when Supabase is not configured — callers then fall back to bundled art
function getResolver(): ((path: string) => string) | null {
  if (resolver || resolverFailed) return resolver;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { supabase } = require("../../config/supabase") as typeof import("../../config/supabase");
    resolver = (path: string) => supabase.storage.from(CATALOG_BUCKET).getPublicUrl(path).data.publicUrl;
  } catch {
    resolverFailed = true;
  }
  return resolver;
}

// public URL for any path in the catalog bucket, or null when storage is unreachable
export function catalogUrl(path: string): string | null {
  return getResolver()?.(path) ?? null;
}

// no variantModelUrl here: getRoomItemVariantUrl (room/core/placeableItems.ts) must read the catalog first for the subtree

// the per-variation thumbnail — the picker swatch, and the tile picture for a model item
export function variantThumbUrl(source: ItemSource, id: CatalogId, variation?: string | null): string | null {
  return catalogUrl(thumbPath(source, id, variation));
}

// a surface item's catalogue picture — a wallpaper or floor has no variation render to stand in for it
export function tileUrl(source: ItemSource, id: CatalogId): string | null {
  return catalogUrl(tilePath(source, id));
}

// null when storage is unreachable — the caller then keeps the shell as authored rather than rendering a blank wall
export function surfaceMapUrl(source: ItemSource, id: CatalogId, map: SurfaceMap): string | null {
  return catalogUrl(surfaceMapPath(source, id, map));
}
