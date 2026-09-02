import type { CatalogId } from "../core/types";

export const CATALOG_BUCKET = "models";

// which item table an item comes from
export type ItemSource = "built" | "bought" | "workshop";

// one extension for every catalog image — it has an alpha channel
const IMAGE_EXT = ".png";

// null/undefined variation -> default
const seg = (variation?: string | null): string => variation ?? "default";

const itemDir = (source: ItemSource, id: CatalogId): string =>
  `room/${source}/${id}`;

// room placement model for a variation
export function modelPath(
  source: ItemSource,
  id: CatalogId,
  variation?: string | null,
): string {
  return `${itemDir(source, id)}/${seg(variation)}.glb`;
}

// per-variation thumbnail
export function thumbPath(
  source: ItemSource,
  id: CatalogId,
  variation?: string | null,
): string {
  return `${itemDir(source, id)}/${seg(variation)}${IMAGE_EXT}`;
}

export function tilePath(source: ItemSource, id: CatalogId): string {
  return `${itemDir(source, id)}/tile${IMAGE_EXT}`;
}

// the texture files a SURFACE item ships. trim maps are SEPARATE files, and KTX2 rather than JPEG
export const SURFACE_MAPS = [
  "texture",
  "normal",
  "rough",
  "trim_texture",
  "trim_normal",
  "trim_rough",
] as const;
export type SurfaceMap = (typeof SURFACE_MAPS)[number];

export function surfaceMapPath(
  source: ItemSource,
  id: CatalogId,
  map: SurfaceMap,
): string {
  return `${itemDir(source, id)}/${map}.ktx2`;
}

export interface VariantRef {
  variation: string | null;
  isDefault: boolean;
}

export function defaultVariation(variants: VariantRef[]): string | null {
  return (variants.find((v) => v.isDefault) ?? variants[0])?.variation ?? null;
}

// assembly-task assets
// thumbs are PNG not JPEG: part/cluster thumbs are transparent-film renders
const assemblyDir = (id: CatalogId): string => `assembly/${id}`;

export const assemblyModelPath = (id: CatalogId): string =>
  `${assemblyDir(id)}/model.glb`;
export const assemblyRecipePath = (id: CatalogId): string =>
  `${assemblyDir(id)}/recipe.json`;
export const assemblyThumbnailPath = (id: CatalogId): string =>
  `${assemblyDir(id)}/thumb.png`;
export const assemblyThumbPath = (id: CatalogId, group: string): string =>
  `${assemblyDir(id)}/thumbs/${group}.png`;
export const assemblyClusterThumbPath = (
  id: CatalogId,
  cluster: string,
): string => `${assemblyDir(id)}/clusters/${cluster}.png`;

// workshop draft items dir
export const workshopAssemblyDir = (id: CatalogId): string =>
  `room/workshop-assembly/${id}`;

// every ItemSource this codebase can resolve a path for
const ALL_ITEM_SOURCES: readonly ItemSource[] = ["built", "bought", "workshop"];

// placeableStore.ts's cache-read filter
export function filterKnownSourceRows<T extends { source: string }>(
  rows: T[],
  workshopDraftsEnabled: boolean,
): T[] {
  const known: readonly string[] = workshopDraftsEnabled
    ? ALL_ITEM_SOURCES
    : ALL_ITEM_SOURCES.filter((s) => s !== "workshop");
  return rows.filter((r) => known.includes(r.source));
}
