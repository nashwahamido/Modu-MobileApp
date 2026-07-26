// Catalog asset paths are DERIVED from id + variation — so a rename is ONE place, never authored
// twice into the DB. Model and thumbnail are COLOCATED in one folder per item, distinguished by
// extension, so renaming an item id renames a SINGLE storage folder. Everything is in the public
// `models` bucket; resolve a URL with supabase.storage.from(CATALOG_BUCKET).getPublicUrl(path). These
// builders stay PURE (no supabase import) so fixtures/tests can use them too.
//
// Layout — folder = id; NO light/dark theme (one image per variation, any UI mode):
//   room/<built|buy>/<id>/<variation|'default'>.glb   room placement model
//   room/<built|buy>/<id>/<variation|'default'>.png    its thumbnail (picker swatch)
//   room/<built|buy>/<id>/tile.png                     item tile — surfaces; model-items reuse the default variation .png
//   assembly/<id>/...                                  assembly build model (built items; separate tree)
import type { CatalogId } from "./types";

export const CATALOG_BUCKET = "models";

// Which item table an item comes from — selects the room/<built|buy>/ subtree. Matches placeable_items.source.
export type ItemSource = "built" | "bought";

// null/undefined variation = the item has a single model (no variation axis) → the 'default' segment.
const seg = (variation?: string | null): string => variation ?? "default";

// The one folder that holds an item's placement model + thumbs.
const itemDir = (source: ItemSource, id: CatalogId): string =>
  `room/${source === "built" ? "built" : "buy"}/${id}`;

// Room placement model for a variation.
export function modelPath(source: ItemSource, id: CatalogId, variation?: string | null): string {
  return `${itemDir(source, id)}/${seg(variation)}.glb`;
}

// Per-variation thumbnail — colocated with the model, same base name, .png extension.
export function thumbPath(source: ItemSource, id: CatalogId, variation?: string | null): string {
  return `${itemDir(source, id)}/${seg(variation)}.png`;
}

// The catalogue tile. Model-items reuse the DEFAULT variation's thumb (pass it in); a surface (no
// variation) falls back to a dedicated tile.png in its folder.
export function tilePath(source: ItemSource, id: CatalogId, defaultVariation?: string | null): string {
  return defaultVariation != null ? thumbPath(source, id, defaultVariation) : `${itemDir(source, id)}/tile.png`;
}

// The assembly build model (built items) — used once the model moves to storage. Separate tree.
export function assemblyModelPath(id: CatalogId): string {
  return `assembly/${id}`;
}

// A variant as the picker needs it to resolve the default. The default is the item_variants row with
// is_default = true (exactly one per item, enforced by a partial unique index).
export interface VariantRef {
  variation: string | null;
  isDefault: boolean;
}

// The default variation for an item: the is_default row, else the first, else null (a surface).
export function defaultVariation(variants: VariantRef[]): string | null {
  return (variants.find((v) => v.isDefault) ?? variants[0])?.variation ?? null;
}
