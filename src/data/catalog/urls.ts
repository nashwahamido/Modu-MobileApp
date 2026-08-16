// Turns the DERIVED catalog paths (catalogAssets.ts) into fetchable URLs in the public `models` bucket. Split from catalogAssets so THAT module stays pure — fixtures and node:test import the path builders without ever constructing a Supabase client.
//
// Public bucket, so a plain public URL: no signing, no expiry, cacheable by the image/GLB loaders. The client is resolved LAZILY and defensively: src/config/supabase.ts throws when the env vars are missing, and a missing thumbnail must degrade to "no picture", never take a screen down with it.
import { CATALOG_BUCKET, surfaceMapPath, thumbPath, tilePath, type ItemSource, type SurfaceMap } from "./assets";
import type { CatalogId } from "../core/types";

let resolver: ((path: string) => string) | null = null;
let resolverFailed = false;

// One lazy require of the client, memoized. Returns null when Supabase is not configured at all (in-memory backend with no env) — callers then fall back to bundled art.
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

// Public URL for any path in the catalog bucket, or null when storage is unreachable.
export function catalogUrl(path: string): string | null {
  return getResolver()?.(path) ?? null;
}

// No variantModelUrl here: the room's model URL is not a plain path-to-URL call. getRoomItemVariantUrl (room/core/placeableItems.ts) has to answer "bundled or storage?" first — a BUILT item with no colour picked resolves to null so the caller uses its bundle — and that decision belongs with the catalog it reads, not with this module's URL builders.

// The per-variation thumbnail — the picker swatch, and the tile picture for a model-item.
export function variantThumbUrl(source: ItemSource, id: CatalogId, variation?: string | null): string | null {
  return catalogUrl(thumbPath(source, id, variation));
}

// A surface item's own catalogue picture — the grid tile for a wallpaper or a floor, which has no variation render to stand in for it.
export function tileUrl(source: ItemSource, id: CatalogId): string | null {
  return catalogUrl(tilePath(source, id));
}

// One texture map of a surface item, or null when storage is unreachable — in which case the caller keeps the shell as authored rather than rendering a blank wall.
export function surfaceMapUrl(source: ItemSource, id: CatalogId, map: SurfaceMap): string | null {
  return catalogUrl(surfaceMapPath(source, id, map));
}
