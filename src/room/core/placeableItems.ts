// The room's placeable-item catalog. Keyed by the DB's kebab ids — the id PERSISTED in layouts — never by the assembly engine's FurnitureId.
// DB-driven: placeable_items carries each item's measured size and base offset, fed in by registerPlaceables. The BUILT set is baked in below so a first launch with no network can still validate a placement — the MODELS come from storage either way, so a piece is measurable before it is drawable.
// Dimensions are MEASURED from the GLBs, not typed in. Furniture and shell are both authored in real metres, so the world factor is 1 — it stays in the path so ONE number governs proportions between pieces if a shell ever ships off-scale.
import { create } from "zustand";

import { modelPath, type ItemSource } from "../../data/catalog/assets";
import { catalogUrl } from "../../data/catalog/urls";
import type { PlaceableRoomRow, RoomItemLight } from "../../data/core/repos";
import type { Footprint, PlaceableItemDef } from "./grid";
import { ROOM_SHELL, TOP_CELL_SIZE, WALL_CELL_SIZE } from "./roomShell";

export type RoomItemModel = {
  def: PlaceableItemDef;
  source: ItemSource;
  // Measured world-AABB size in authored meters, at rotSteps 0 (x = width, z = depth).
  size: { x: number; y: number; z: number };
  // Lift from the model's origin to its base, -worldMinY. 0 for base-origin models; EKET is authored centred and needs half its height.
  baseOffsetY: number;
  // Lighting only, from item_lights. Undefined means the piece emits nothing. One or two entries — a point and a spot at once — ordered point-then-spot.
  lights?: RoomItemLight[];
};

const CELL = ROOM_SHELL.cellSize;

// Shell-units per furniture-metre, 1 since the shell went true-scale. If it is ever re-exported off-scale, set the measured ratio here and re-derive the footprints.
export const FURNITURE_WORLD_SCALE = 1;

// The cells a piece claims at its rendered size. ceil, so collision may over-claim a sliver but never lets two pieces touch; the epsilon keeps an exact multiple from gaining a phantom cell to float error.
const cells = (meters: number): number => Math.ceil((meters * FURNITURE_WORLD_SCALE) / CELL - 1e-9);

// The same rule at the finer top pitch, computed from the measured SIZE again rather than by scaling `footprint` — scaling compounds `cells`' own ceil.
// A 0.26m item is 2 floor cells, which scaled gives 4 fine cells (0.5m), against the 3 (0.375m) deriving straight from size gives. Every item gets one, wall items included.
const topCells = (meters: number): number => Math.ceil((meters * FURNITURE_WORLD_SCALE) / TOP_CELL_SIZE - 1e-9);

// Wall footprints round to the NEAREST fine cell, unlike the floor's ceil: a window's footprint IS its hole, and one smaller than the glazing shows wall through the glass while one larger just reads as a plaster reveal.
// Frames get the same tight rounding, since every wall-mounted row shares one footprint rule. Same rule as scripts/fix_window_anchors.py.
const wallCells = (meters: number): number => Math.max(1, Math.round(meters / WALL_CELL_SIZE));

// mount/onTop/opensWall route placement, not category: floor and wall are mutually exclusive, onTop is orthogonal, and opensWall is meaningful only on a wall.
// category has exactly one job left — whether a piece EMITS light. A lamp is ordinary furniture carrying a bulb, so 'lit' never touches allowedSurfaces.
// The light's NUMBERS come from row.lights, not the category. A 'lit' row with no light row degrades quietly to ordinary furniture, which is what the audit query exists to catch.
// A mask disagreeing with its footprint is a seeding mistake: warn and fall back to the solid rect, which can only over-claim. Every edge row/column must hold an 'X', or the bbox that bounds checks use lies about the piece's extent.
function sanitizedMask(joined: string | undefined, footprint: Footprint): readonly string[] | undefined {
  if (!joined) return undefined;
  const rows = joined.split("/");
  const ok =
    rows.length === footprint.d &&
    rows.every((row) => row.length === footprint.w && /^[X.]+$/.test(row)) &&
    rows[0].includes("X") &&
    rows[footprint.d - 1].includes("X") &&
    rows.some((row) => row[0] === "X") &&
    rows.some((row) => row[footprint.w - 1] === "X");
  if (!ok) {
    console.warn("[room] footprint mask does not match footprint; using solid rect", joined, footprint);
    return undefined;
  }
  return rows;
}

function toModel(row: PlaceableRoomRow): RoomItemModel {
  // Every def carries topFootprint, even a wall item's, which is simply never read — occupiedFootprint consults it only for a "furniture" surface.
  // Measured off contactSize where the row has one, not `size`: a full bounding box makes anything wider above the surface than on it — an open laptop, a lamp with a shade — claim top cells it never touches.
  // It changes nothing else. `footprint` below stays on `size`, because a floor item's collision really is its widest extent, and the piece still renders at `size` via fitScale.
  const topSize = row.contactSize ?? { x: row.size.x, z: row.size.z };
  const topFootprint: Footprint = { w: topCells(topSize.x), d: topCells(topSize.z) };
  // `onTop` is APPENDED to the required `mount`, never a replacement, so every item has at least one surface — which is what lets startPlacing answer "where does this ghost open" with a complete two-way branch.
  const allowedSurfaces = [row.mount, ...(row.onTop ? (["furniture"] as const) : [])];
  // A lamp may carry a point AND a spot. Singular `light` is read as a one-element fallback purely for a STALE CACHE: placeableStore persists this mapped shape, so the first launch after an update reads rows the previous build named `light`.
  // The network sync replaces them moments later; without this a saved room's lamps go dark for those seconds. Not a DB concern — repos.ts already normalised both shapes.
  const cached = (row as PlaceableRoomRow & { light?: RoomItemLight }).light;
  const lights = row.lights ?? (cached != null ? [cached] : undefined);
  const def: PlaceableItemDef =
    row.mount === "wall"
      ? {
          itemId: row.id,
          footprint: { w: wallCells(row.size.x), d: 1 },
          topFootprint,
          wallHeightCells: wallCells(row.size.y),
          allowedSurfaces,
          opensWall: row.opensWall === true,
        }
      : (() => {
          const footprint = { w: cells(row.size.x), d: cells(row.size.z) };
          const mask = sanitizedMask(row.footprintMask, footprint);
          return {
            itemId: row.id,
            footprint,
            topFootprint,
            ...(mask ? { mask } : {}),
            ...(row.topSurface ? { hostsTop: true } : {}),
            allowedSurfaces,
            emitsLight: row.category === "lit" && lights != null,
          };
        })();
  return { def, source: row.source, size: row.size, baseOffsetY: row.baseOffsetY, lights };
}

// The baked-in BUILT set: sizes mirror the DB seed, so offline placement matches what the catalog says once it loads.
const BUNDLED_ROWS: PlaceableRoomRow[] = [
  { id: "dalfred-stool", source: "built", category: "fur", size: { x: 0.5, y: 0.79, z: 0.5 }, baseOffsetY: 0.007, mount: "floor" },
  { id: "lack-table", source: "built", category: "fur", size: { x: 0.55, y: 0.45, z: 0.55 }, baseOffsetY: 0, mount: "floor" },
  { id: "eket-cabinet", source: "built", category: "fur", size: { x: 0.37, y: 0.35, z: 0.75 }, baseOffsetY: 0.175, mount: "floor" },
  { id: "bekvam-stool", source: "built", category: "fur", size: { x: 0.39, y: 0.5, z: 0.43 }, baseOffsetY: 0, mount: "floor" },
];

const toItems = (rows: PlaceableRoomRow[]): Record<string, RoomItemModel> =>
  Object.fromEntries(rows.map((row) => [row.id, toModel(row)]));

interface RoomCatalogState {
  items: Record<string, RoomItemModel>;
}

// A store, not a plain Map, so screens that GATE on placeability re-render when the DB rows land mid-session. Store actions read it non-reactively.
export const useRoomCatalogStore = create<RoomCatalogState>()(() => ({
  items: toItems(BUNDLED_ROWS),
}));

// Adopt the catalog's rows, with the baked-in built rows as a floor under them: a partial fetch must never strand an already-placed piece unplaceable for want of its dimensions.
export function registerPlaceables(rows: PlaceableRoomRow[]): void {
  useRoomCatalogStore.setState({ items: { ...toItems(BUNDLED_ROWS), ...toItems(rows) } });
}

// The BUILT set as ids, answering ONE question: which room/<source>/ subtree an id the catalog has not sent yet lives in.
// Reading it off a bundled-model map coupled the classification to an asset table that no longer exists, and the room reclassified every built item as bought.
const BUILT_ITEM_IDS = new Set(["dalfred-stool", "lack-table", "eket-cabinet", "bekvam-stool"]);

// Which subtree an item's assets live in. The catalog row is the authority; for an id it does not know yet, acquisition decides.
export function roomItemSource(itemId: string): ItemSource {
  const item = useRoomCatalogStore.getState().items[itemId];
  if (item) return item.source;
  return BUILT_ITEM_IDS.has(itemId) ? "built" : "bought";
}

// The storage path of the model to load. A path, not a URL, so node:test can pin the routing without a Supabase client.
// EVERY room model comes from storage, built and bought alike — no bundled room GLB, no source-dependent branch.
// The bundle this replaces pointed built items at their ASSEMBLY GLB, every panel and screw its own mesh: EKET is 66.9MB against a 0.29MB storage variant, a 230× cost to draw a closed cabinet.
// Emptying it left behind the BRANCH that fed it, which returned null for a built item with no colour picked and rendered nothing — the normal path, since startPlacing passes no variation.
// If a bundled room model is ever wanted again it must be a SMALL per-item GLB, and it belongs in variantModel's fallback, not a branch here that hides the storage path.
export function getRoomItemStoragePath(itemId: string, variation: string | null | undefined): string | null {
  const item = useRoomCatalogStore.getState().items[itemId];
  // The one remaining null: an id the room cannot place has no subtree, and a guessed path would 404 at load.
  if (!item) return null;
  return modelPath(item.source, itemId, variation ?? null);
}

// The same decision as a fetchable URL — null also when storage is unreachable (no Supabase env).
export function getRoomItemVariantUrl(itemId: string, variation: string | null | undefined): string | null {
  const path = getRoomItemStoragePath(itemId, variation);
  return path === null ? null : catalogUrl(path);
}

// No assembly→room id map: FurnitureId already IS the kebab catalog id, so a finished build's meta.id goes straight to startPlacing. Items with no room model miss this catalog and are refused.
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

// The grid's def table, in the shape canPlace/buildOccupancy consume. Rebuilt only when the registry changes — validate() runs per drag event and must not allocate per call.
let defsCache: { items: Record<string, RoomItemModel>; map: Map<string, PlaceableItemDef> } | null = null;
export function roomItemDefs(): ReadonlyMap<string, PlaceableItemDef> {
  const items = useRoomCatalogStore.getState().items;
  if (defsCache?.items !== items) {
    defsCache = { items, map: new Map(Object.values(items).map((item) => [item.def.itemId, item.def])) };
  }
  return defsCache.map;
}

// Uniform render scale: the world factor, guarded so a hand-edited footprint cannot make a piece spill outside its claimed cells — with ceil-derived footprints the guard never binds.
// Footprint is at rotSteps 0, and rotation permutes cells and model together, so the fit is rotation-invariant.
export function fitScale(item: RoomItemModel): number {
  // Wall items are exempt: their footprint is a HOLE rounded to the NEAREST cell, deliberately allowed to be smaller than the glazing.
  // The guard below assumes a ceil-derived footprint that always contains the piece, which is backwards here — it would shrink the model below its hole and show wall through the glass.
  if (!item.def.allowedSurfaces.includes("floor")) return FURNITURE_WORLD_SCALE;
  return Math.min(
    FURNITURE_WORLD_SCALE,
    (item.def.footprint.w * CELL) / item.size.x,
    (item.def.footprint.d * CELL) / item.size.z,
  );
}
