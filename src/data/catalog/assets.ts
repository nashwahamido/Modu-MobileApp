// Catalog asset paths are DERIVED from id + variation — so a rename is ONE place, never authored twice into the DB. Model and thumbnail are COLOCATED in one folder per item, distinguished by extension, so renaming an item id renames a SINGLE storage folder. Everything is in the public `models` bucket; resolve a URL with supabase.storage.from(CATALOG_BUCKET).getPublicUrl(path). These builders stay PURE (no supabase import) so fixtures/tests can use them too.
//
// Layout — folder = id; NO light/dark theme (one image per variation, any UI mode). The subtree segment is the source tag verbatim, and thumbs are JPEG — both VERIFIED against the bucket, which is the authority here (an earlier guess of `buy/` + `.png` matched nothing): room/<built|bought|workshop>/<id>/<variation|'default'>.glb   room placement model room/<built|bought|workshop>/<id>/<variation|'default'>.jpg   its thumbnail (tile picture + picker swatch) room/<built|bought|workshop>/<id>/tile.jpg                    item tile — surfaces; model-items reuse the default variation image assembly/<id>/...                                    assembly build model (built items; separate tree). "workshop" is a testing-status draft, dev builds only — see the ItemSource comment below.
import type { CatalogId } from "../core/types";

export const CATALOG_BUCKET = "models";

// Which item table an item comes from — and, verbatim, the room/<built|bought|workshop>/ subtree it lives in. Matches placeable_items.source, plus "workshop" for a testing-status workshop_drafts row merged in client-side (dev builds only — see listPlaceables/getShopItems in adapters/supabase.ts): a draft's assets sit under room/workshop/<id>/, mirroring the built/bought layout exactly, so no path builder below needed to change to add it.
export type ItemSource = "built" | "bought" | "workshop";

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

// The dedicated catalogue picture a SURFACE item ships. A wallpaper or a floor has no variation axis and so no per-variation render to reuse, which is the whole reason this file exists separately from the thumbs.
//
// Every model-item takes thumbPath at its DEFAULT variation instead — including one-look items like the windows, whose variation is legitimately null and whose picture is default.jpg. A null variation therefore does NOT mean "surface", and a caller must decide between the two on the item's category rather than on the nullness of its variation.
export function tilePath(source: ItemSource, id: CatalogId): string {
  return `${itemDir(source, id)}/tile${IMAGE_EXT}`;
}

// The texture files a SURFACE item ships — a wallpaper or a floor, as opposed to a model-item's GLB. Colocated in the same one-folder-per-item layout as the model and the thumbs, so renaming an item id still renames a single storage folder.
//
// Trim maps are SEPARATE files rather than the slab's reused, because a cornice is separate geometry with its own UV mapping at its own physical scale: reusing the slab's map on it reads as an extruded strip of floor rather than as moulding. Only floor items carry them, and only when the author supplied them — an absent trim map leaves the cornice as authored.
//
// KTX2 rather than JPEG: Filament transcodes Basis-supercompressed textures straight to the device's native GPU format, which is the difference between ~38 MB and ~7 MB of VRAM for a full re-skin. The wire size is roughly a wash.
// The array is the source of truth (also consumed at runtime by surfaceSpec.ts to validate portal-authored jsonb) — SurfaceMap is derived from it so the two can never drift apart.
export const SURFACE_MAPS = ["texture", "normal", "rough", "trim_texture", "trim_normal", "trim_rough"] as const;
export type SurfaceMap = (typeof SURFACE_MAPS)[number];

export function surfaceMapPath(source: ItemSource, id: CatalogId, map: SurfaceMap): string {
  return `${itemDir(source, id)}/${map}.ktx2`;
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

// Assembly-task assets — the separate assembly/<id>/ tree 003_catalog.sql reserved (item_build.assembly_model). Same derived-path discipline as the room tree: rename an id, rename ONE folder. Thumbs are PNG not JPEG because part/cluster thumbs are transparent-film renders (the bundled thumbnail pipeline's output); the room tree's JPEG rule is about photographic tiles and does not apply here.
const assemblyDir = (id: CatalogId): string => `assembly/${id}`;

export const assemblyModelPath = (id: CatalogId): string => `${assemblyDir(id)}/model.glb`;
export const assemblyRecipePath = (id: CatalogId): string => `${assemblyDir(id)}/recipe.json`;
export const assemblyThumbnailPath = (id: CatalogId): string => `${assemblyDir(id)}/thumb.png`;
export const assemblyThumbPath = (id: CatalogId, group: string): string => `${assemblyDir(id)}/thumbs/${group}.png`;
export const assemblyClusterThumbPath = (id: CatalogId, cluster: string): string => `${assemblyDir(id)}/clusters/${cluster}.png`;

// Draft staging prefix for the phase-2b portal lane — declared here so the app and the portal derive the SAME path from day one (the storage RLS policies key on this prefix).
export const workshopAssemblyDir = (id: CatalogId): string => `room/workshop-assembly/${id}`;

// Every ItemSource this codebase can resolve a path for. "workshop" only ever belongs in here when workshopDraftsDevGateOpen() is open for THIS build — see the cache-read note below.
const ALL_ITEM_SOURCES: readonly ItemSource[] = ["built", "bought", "workshop"];

// placeableStore.ts's cache-read filter: a dev build can persist a "workshop" row (a testing-status draft merged into the catalogue client-side) into the SAME AsyncStorage cache key a later showcase or release build will replay before any session exists (hydratePlaceables runs cache-then-network, with no gate check of its own on the read). That build never fetches workshop_drafts, so replaying the row would place an item whose model path (room/workshop/<id>/...) nothing in that build's pipeline was ever meant to serve. Dropping any row whose source is not one this build currently understands turns that into "the item is simply missing" — the same degraded-but-safe outcome an ordinary cache miss produces — rather than a dead storage path or a crash. Generic over the row shape (PlaceableRoomRow in practice) so this stays a plain data-in data-out function, matching every other pure helper in this file.
export function filterKnownSourceRows<T extends { source: string }>(rows: T[], workshopDraftsEnabled: boolean): T[] {
  const known: readonly string[] = workshopDraftsEnabled ? ALL_ITEM_SOURCES : ALL_ITEM_SOURCES.filter((s) => s !== "workshop");
  return rows.filter((r) => known.includes(r.source));
}
