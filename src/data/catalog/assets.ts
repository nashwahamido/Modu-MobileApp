// Catalog asset paths are DERIVED from id + variation — so a rename is ONE place, never authored twice into the DB. Model and thumbnail are COLOCATED in one folder per item, distinguished by extension, so renaming an item id renames a SINGLE storage folder. Everything is in the public `models` bucket; resolve a URL with supabase.storage.from(CATALOG_BUCKET).getPublicUrl(path). These builders stay PURE (no supabase import) so fixtures/tests can use them too.
//
// Layout — folder = id; NO light/dark theme (one image per variation, any UI mode). The subtree segment is the source tag verbatim, and thumbs are JPEG — both VERIFIED against the bucket, which is the authority here (an earlier guess of `buy/` + `.png` matched nothing): room/<built|bought>/<id>/<variation|'default'>.glb   room placement model room/<built|bought>/<id>/<variation|'default'>.jpg   its thumbnail (tile picture + picker swatch) room/<built|bought>/<id>/tile.jpg                    item tile — surfaces; model-items reuse the default variation image assembly/<id>/...                                    assembly build model (built items; separate tree)
import type { CatalogId } from "../core/types";

export const CATALOG_BUCKET = "models";

// Which item table an item comes from — and, verbatim, the room/<built|bought>/ subtree it lives in. Matches placeable_items.source.
export type ItemSource = "built" | "bought";

// One extension for every catalog image, in ONE place: the uploads are JPEG (photographic renders, and far smaller than PNG at this size). Change it here if that ever changes.
const IMAGE_EXT = ".jpg";

// null/undefined variation = the item has a single model (no variation axis) → the 'default' segment.
const seg = (variation?: string | null): string => variation ?? "default";

// The one folder that holds an item's placement model + thumbs. The source tag IS the segment.
const itemDir = (source: ItemSource, id: CatalogId): string => `room/${source}/${id}`;

// Room placement model for a variation.
export function modelPath(source: ItemSource, id: CatalogId, variation?: string | null): string {
  return `${itemDir(source, id)}/${seg(variation)}.glb`;
}

// Per-variation thumbnail — colocated with the model, same base name, image extension.
export function thumbPath(source: ItemSource, id: CatalogId, variation?: string | null): string {
  return `${itemDir(source, id)}/${seg(variation)}${IMAGE_EXT}`;
}

// The catalogue tile. Model-items reuse the DEFAULT variation's thumb (pass it in); a surface (no variation) falls back to a dedicated tile image in its folder.
export function tilePath(source: ItemSource, id: CatalogId, defaultVariation?: string | null): string {
  return defaultVariation != null ? thumbPath(source, id, defaultVariation) : `${itemDir(source, id)}/tile${IMAGE_EXT}`;
}


// A variant as the picker needs it to resolve the default. The default is the item_variants row with is_default = true (exactly one per item, enforced by a partial unique index).
export interface VariantRef {
  variation: string | null;
  isDefault: boolean;
}

// The default variation for an item: the is_default row, else the first, else null (a surface).
export function defaultVariation(variants: VariantRef[]): string | null {
  return (variants.find((v) => v.isDefault) ?? variants[0])?.variation ?? null;
}
