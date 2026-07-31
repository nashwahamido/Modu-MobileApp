// The room's placeable-item catalog: everything the grid needs to place, validate, and render an
// item. Keyed by the DB's kebab ids (placeable_items.id) — the id that gets PERSISTED in layouts —
// never by the assembly engine's FurnitureId.
//
// The catalog is DB-DRIVEN: placeable_items carries each item's measured size + base offset (see
// migration 003_catalog.sql), and registerPlaceables() feeds those rows in (placeableStore syncs them,
// cache-then-network). The BUILT set is also baked in below as the offline fallback — those items
// ship bundled models, so a first launch with no network still places what it can render. Bought
// items exist only via the DB rows; their models live in storage (room/bought/...).
//
// Dimensions are MEASURED from the GLBs (world AABB after node transforms), not typed in. The
// furniture is authored in real-world meters, and since 2026-07-29 the shell is TOO — it was
// rescaled against real-size furniture, so shell-units ARE meters and the world factor is 1.
// The factor stays in the code path so proportions between pieces remain governed by ONE number:
// a stool is still stool-sized next to a cabinet — per-item hand-tuned scales (the old sceneScale)
// stay dead, and if a future shell ever ships off-scale again only this constant moves.
import { create } from "zustand";

import { modelPath, type ItemSource } from "../../data/catalogAssets";
import { catalogUrl } from "../../data/catalogUrls";
import type { PlaceableRoomRow } from "../../data/repos";
import type { AssetSrc } from "../../game/core/type";
import type { PlaceableItemDef } from "./grid";
import { ROOM_SHELL, WALL_CELL_SIZE } from "./roomShell";

export type RoomItemModel = {
  def: PlaceableItemDef;
  source: ItemSource;
  // Measured world-AABB size in authored meters, at rotSteps 0 (x = width, z = depth).
  size: { x: number; y: number; z: number };
  // Lift from the model's origin to its base: -worldMinY. 0 for base-origin models; EKET is
  // authored centred and needs half its height.
  baseOffsetY: number;
};

const CELL = ROOM_SHELL.cellSize;

// Shell-units per furniture-meter. 1 since the shell went true-scale; see the header note. If the
// shell is ever re-exported off-scale, set the measured ratio here and re-derive the footprints.
export const FURNITURE_WORLD_SCALE = 1;

// footprint = ceil(size × FURNITURE_WORLD_SCALE / cellSize) per axis — the cells a piece claims at
// its rendered size. ceil, so collision may over-claim a sliver but never lets two pieces touch.
// The epsilon keeps an exact multiple (0.75 × 1.6 / 0.5 = 2.4 → 3, but 0.5 × 1.6 / 0.5 = 1.6 → 2)
// from gaining a phantom cell to float error.
const cells = (meters: number): number => Math.ceil((meters * FURNITURE_WORLD_SCALE) / CELL - 1e-9);

// Wall footprints round to the NEAREST fine cell, unlike the floor's ceil: a window's footprint IS
// its hole, and a hole smaller than the glazing shows wall through the glass — while one slightly
// larger than the frame just reads as a plaster reveal. Same rule as scripts/fix_window_anchors.py.
const wallCells = (meters: number): number => Math.max(1, Math.round(meters / WALL_CELL_SIZE));

// category routes the SURFACE: 'window' rows hang on walls with a hole-sized footprint; everything
// else (including rows cached before category existed) stands on the floor.
function toModel(row: PlaceableRoomRow): RoomItemModel {
  const def: PlaceableItemDef =
    row.category === "win"
      ? {
          itemId: row.id,
          footprint: { w: wallCells(row.size.x), d: 1 },
          wallHeightCells: wallCells(row.size.y),
          allowedSurfaces: ["wall"],
          opensWall: true,
        }
      : {
          itemId: row.id,
          footprint: { w: cells(row.size.x), d: cells(row.size.z) },
          allowedSurfaces: ["floor"],
        };
  return { def, source: row.source, size: row.size, baseOffsetY: row.baseOffsetY };
}

// The baked-in BUILT set: sizes mirror the DB seed (003_catalog.sql) the same way seed.ts does, so
// offline placement matches what the catalog will say once it loads.
const BUNDLED_ROWS: PlaceableRoomRow[] = [
  { id: "dalfred-stool", source: "built", category: "fur", size: { x: 0.5, y: 0.79, z: 0.5 }, baseOffsetY: 0.007 },
  { id: "lack-table", source: "built", category: "fur", size: { x: 0.55, y: 0.45, z: 0.55 }, baseOffsetY: 0 },
  { id: "eket-cabinet", source: "built", category: "fur", size: { x: 0.37, y: 0.35, z: 0.75 }, baseOffsetY: 0.175 },
  { id: "bekvam-stool", source: "built", category: "fur", size: { x: 0.39, y: 0.5, z: 0.43 }, baseOffsetY: 0 },
];

const toItems = (rows: PlaceableRoomRow[]): Record<string, RoomItemModel> =>
  Object.fromEntries(rows.map((row) => [row.id, toModel(row)]));

interface RoomCatalogState {
  items: Record<string, RoomItemModel>;
}

// A zustand store (not a plain Map) so screens that GATE on placeability — the inventory's "tap to
// place" — re-render when the DB rows land mid-session. Store actions read it non-reactively.
export const useRoomCatalogStore = create<RoomCatalogState>()(() => ({
  items: toItems(BUNDLED_ROWS),
}));

// Adopt the catalog's rows. The bundled built set stays as a floor under the DB — a row list that
// lost an item (or a partial fetch) must never strand an already-placed bundled piece invisible.
export function registerPlaceables(rows: PlaceableRoomRow[]): void {
  useRoomCatalogStore.setState({ items: { ...toItems(BUNDLED_ROWS), ...toItems(rows) } });
}

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

// The BUNDLED model — one look per item, no colour axis. Only BUILT furniture ships one; a bought
// item resolves null, and its callers must wait for the storage variant instead of falling back.
export function getRoomItemModelSource(itemId: string): AssetSrc | null {
  return MODEL_SOURCES[itemId]?.() ?? null;
}

// Which room/<built|bought>/ subtree an item's assets live in. The catalog row is the authority;
// for an id the catalog does not know (yet), acquisition still decides it — only buildable
// furniture ships a bundled model, so the bundle IS the built set.
export function roomItemSource(itemId: string): ItemSource {
  const item = useRoomCatalogStore.getState().items[itemId];
  if (item) return item.source;
  return itemId in MODEL_SOURCES ? "built" : "bought";
}

// The storage path of the model to load (room/<built|bought>/<id>/<variation|'default'>.glb). Null
// when the caller should use the bundled model instead: unknown items always, and BUILT items with
// no colour picked (their bundle is the default look, no round trip needed). A BOUGHT item has no
// bundle, so even with no colour axis it resolves to its 'default' segment in storage.
// Pure (a path, not a URL), so node:test can pin the routing without a Supabase client.
export function getRoomItemStoragePath(itemId: string, variation: string | null | undefined): string | null {
  const item = useRoomCatalogStore.getState().items[itemId];
  if (!item) return null;
  if (!variation && item.source === "built") return null;
  return modelPath(item.source, itemId, variation ?? null);
}

// The same decision as a fetchable URL — null also when storage is unreachable (no Supabase env).
export function getRoomItemVariantUrl(itemId: string, variation: string | null | undefined): string | null {
  const path = getRoomItemStoragePath(itemId, variation);
  return path === null ? null : catalogUrl(path);
}

// No assembly→room id map: FurnitureId already IS the kebab catalog id on this branch, so a
// finished build's meta.id can be handed straight to startPlacing. Items with no room model
// ("tutorial") simply miss this catalog and are refused by the store.
export function getRoomItem(itemId: string | null | undefined): RoomItemModel | null {
  if (!itemId) return null;
  return useRoomCatalogStore.getState().items[itemId] ?? null;
}

export function getRoomItemDef(itemId: string): PlaceableItemDef | undefined {
  return useRoomCatalogStore.getState().items[itemId]?.def;
}

// Reactive read for render-time gating (inventory's "tap to place"): flips when the catalog loads.
export function useRoomItem(itemId: string | null | undefined): RoomItemModel | null {
  return useRoomCatalogStore((s) => (itemId ? (s.items[itemId] ?? null) : null));
}

// The grid's def table, in the shape canPlace/buildOccupancy consume. Rebuilt only when the
// registry actually changes — validate() runs per drag event and must not allocate per call.
let defsCache: { items: Record<string, RoomItemModel>; map: Map<string, PlaceableItemDef> } | null = null;
export function roomItemDefs(): ReadonlyMap<string, PlaceableItemDef> {
  const items = useRoomCatalogStore.getState().items;
  if (defsCache?.items !== items) {
    defsCache = { items, map: new Map(Object.values(items).map((item) => [item.def.itemId, item.def])) };
  }
  return defsCache.map;
}

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
