// The room's placeable-item catalog: everything the grid needs to place, validate, and render an
// item. Keyed by the DB's kebab ids (placeable_items.id) — the id that gets PERSISTED in layouts —
// never by the assembly engine's FurnitureId.
//
// Dimensions are MEASURED from the GLBs (world AABB after node transforms), not typed in. The
// furniture is authored in real-world meters; the room shell is authored OVERSIZED — its window is
// 2.7 m wide (real ~1.7), its floor-to-cornice wall 3.9 m (real ~2.5), both ≈ 1.6× real. Real-meter
// furniture in that shell reads doll-sized, so every piece is scaled by the ONE factor that
// converts furniture-meters into shell-units. Proportions between pieces stay true: a stool is
// still stool-sized next to a cabinet — per-item hand-tuned scales (the old sceneScale) stay dead.
import type { ItemSource } from "../../data/catalogAssets";
import { variantModelUrl } from "../../data/catalogUrls";
import type { AssetSrc } from "../../game/core/type";
import type { PlaceableItemDef } from "./grid";
import { ROOM_SHELL } from "./roomShell";

export type RoomItemModel = {
  def: PlaceableItemDef;
  // Measured world-AABB size in authored meters, at rotSteps 0 (x = width, z = depth).
  size: { x: number; y: number; z: number };
  // Lift from the model's origin to its base: -worldMinY. 0 for base-origin models; EKET is
  // authored centred and needs half its height.
  baseOffsetY: number;
};

const CELL = ROOM_SHELL.cellSize;

// How much bigger than real life the shell is authored (window/wall ratios above). If the shell is
// re-exported at true scale, set to 1 and re-derive the footprints.
export const FURNITURE_WORLD_SCALE = 1.6;

// footprint = ceil(size × FURNITURE_WORLD_SCALE / cellSize) per axis — the cells a piece claims at
// its rendered size. ceil, so collision may over-claim a sliver but never lets two pieces touch.
const ITEMS: Record<string, RoomItemModel> = {
  "dalfred-stool": {
    def: { itemId: "dalfred-stool", footprint: { w: 2, d: 2 }, allowedSurfaces: ["floor"] },
    size: { x: 0.5, y: 0.79, z: 0.5 },
    baseOffsetY: 0.007,
  },
  "lack-table": {
    def: { itemId: "lack-table", footprint: { w: 2, d: 2 }, allowedSurfaces: ["floor"] },
    size: { x: 0.55, y: 0.45, z: 0.55 },
    baseOffsetY: 0,
  },
  "eket-cabinet": {
    def: { itemId: "eket-cabinet", footprint: { w: 2, d: 3 }, allowedSurfaces: ["floor"] },
    size: { x: 0.37, y: 0.35, z: 0.75 },
    baseOffsetY: 0.175,
  },
  "bekvam-stool": {
    def: { itemId: "bekvam-stool", footprint: { w: 2, d: 2 }, allowedSurfaces: ["floor"] },
    size: { x: 0.39, y: 0.5, z: 0.43 },
    baseOffsetY: 0,
  },
};

// Model assets resolve LAZILY, inside a function: a top-level require() of a .glb only works
// under Metro, and this module must stay importable by node:test, which pins the numbers above.
const MODEL_SOURCES: Record<string, () => AssetSrc> = {
  /* eslint-disable @typescript-eslint/no-require-imports */
  "dalfred-stool": () => require("../../assets/models/furnitures/DALFRED/DALFRED.glb"),
  "lack-table": () => require("../../assets/models/furnitures/LACK/LACK.glb"),
  "eket-cabinet": () => require("../../assets/models/furnitures/EKET/EKET.glb"),
  "bekvam-stool": () => require("../../assets/models/furnitures/BEKVAM/BEKVAM.glb"),
  /* eslint-enable @typescript-eslint/no-require-imports */
};

// The BUNDLED model — one look per item, no colour axis. Kept as the fallback for every path below:
// it ships in the app, so it renders offline and while a remote variant is still downloading.
export function getRoomItemModelSource(itemId: string): AssetSrc | null {
  return MODEL_SOURCES[itemId]?.() ?? null;
}

// Which room/<built|bought>/ subtree an item's assets live in. Acquisition decides it, and only BUILDABLE
// furniture ships a bundled model — so the bundle IS the built set, and this needs no round trip. The one
// rule, used by every path that derives a storage path from a room item id.
export function roomItemSource(itemId: string): ItemSource {
  return itemId in MODEL_SOURCES ? "built" : "bought";
}

// The model for a specific colour, from storage (room/<built|bought>/<id>/<variation>.glb). Null when the
// item has no colour axis, when storage is unreachable, or when the item is not a known placeable —
// callers then use the bundled model above.
export function getRoomItemVariantUrl(itemId: string, variation: string | null | undefined): string | null {
  if (!variation || !ITEMS[itemId]) return null;
  return variantModelUrl(roomItemSource(itemId), itemId, variation);
}

// No assembly→room id map: FurnitureId already IS the kebab catalog id on this branch, so a
// finished build's meta.id can be handed straight to startPlacing. Items with no room model
// ("tutorial") simply miss this catalog and are refused by the store.
export function getRoomItem(itemId: string | null | undefined): RoomItemModel | null {
  if (!itemId) return null;
  return ITEMS[itemId] ?? null;
}

// The grid's def table, in the shape canPlace/buildOccupancy consume.
export const ROOM_ITEM_DEFS: ReadonlyMap<string, PlaceableItemDef> = new Map(
  Object.values(ITEMS).map((item) => [item.def.itemId, item.def]),
);

// Uniform render scale: the world factor, guarded so a hand-edited footprint can never make a
// piece spill outside its claimed cells. With ceil-derived footprints the guard never binds.
// Footprint is at rotSteps 0; rotation permutes cells and model together, so the fit is
// rotation-invariant.
export function fitScale(item: RoomItemModel): number {
  return Math.min(
    FURNITURE_WORLD_SCALE,
    (item.def.footprint.w * CELL) / item.size.x,
    (item.def.footprint.d * CELL) / item.size.z,
  );
}
