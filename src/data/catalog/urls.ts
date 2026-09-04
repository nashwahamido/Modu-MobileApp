// a public bucket, so no signing; the client resolves lazily. config/supabase.ts throws on missing env vars
import {
  CATALOG_BUCKET,
  surfaceMapPath,
  thumbPath,
  tilePath,
  type ItemSource,
  type SurfaceMap,
} from "./assets";
import type { CatalogId } from "../core/types";

let resolver: ((path: string) => string) | null = null;
let resolverFailed = false;

// memoised. null when Supabase is not configured — callers then fall back to bundled art
function getResolver(): ((path: string) => string) | null {
  if (resolver || resolverFailed) return resolver;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { supabase } =
      require("../../config/supabase") as typeof import("../../config/supabase");
    resolver = (path: string) =>
      supabase.storage.from(CATALOG_BUCKET).getPublicUrl(path).data.publicUrl;
  } catch {
    resolverFailed = true;
  }
  return resolver;
}

export function catalogUrl(path: string): string | null {
  return getResolver()?.(path) ?? null;
}

export function variantThumbUrl(
  source: ItemSource,
  id: CatalogId,
  variation?: string | null,
): string | null {
  return catalogUrl(thumbPath(source, id, variation));
}

export function tileUrl(source: ItemSource, id: CatalogId): string | null {
  return catalogUrl(tilePath(source, id));
}

// null when storage is unreachable — the caller keeps the shell as authored
export function surfaceMapUrl(
  source: ItemSource,
  id: CatalogId,
  map: SurfaceMap,
): string | null {
  return catalogUrl(surfaceMapPath(source, id, map));
}
