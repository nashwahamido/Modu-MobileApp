// The room's placeable-item catalog: everything the grid needs to place, validate, and render an item. Keyed by the DB's kebab ids (placeable_items.id) — the id that gets PERSISTED in layouts — never by the assembly engine's FurnitureId.
//
// The catalog is DB-DRIVEN: placeable_items carries each item's measured size + base offset (see migration 003_catalog.sql), and registerPlaceables() feeds those rows in (placeableStore syncs them, cache-then-network). The BUILT set is also baked in below (BUNDLED_ROWS) so a first launch with no network still knows those items' dimensions and can validate a placement — their MODELS are not bundled and come from storage like everything else, so the piece is measurable before it is drawable.
//
// Dimensions are MEASURED from the GLBs (world AABB after node transforms), not typed in. The furniture is authored in real-world meters, and since 2026-07-29 the shell is TOO — it was rescaled against real-size furniture, so shell-units ARE meters and the world factor is 1. The factor stays in the code path so proportions between pieces remain governed by ONE number: a stool is still stool-sized next to a cabinet — per-item hand-tuned scales (the old sceneScale) stay dead, and if a future shell ever ships off-scale again only this constant moves.
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
  // Lift from the model's origin to its base: -worldMinY. 0 for base-origin models; EKET is authored centred and needs half its height.
  baseOffsetY: number;
  // Only for lighting (category 'lit'), from item_lights via the placeable_items view. Undefined means the piece emits nothing — true of every item but a lamp.
  light?: RoomItemLight;
};

const CELL = ROOM_SHELL.cellSize;

// Shell-units per furniture-meter. 1 since the shell went true-scale; see the header note. If the shell is ever re-exported off-scale, set the measured ratio here and re-derive the footprints.
export const FURNITURE_WORLD_SCALE = 1;

// footprint = ceil(size × FURNITURE_WORLD_SCALE / cellSize) per axis — the cells a piece claims at its rendered size. ceil, so collision may over-claim a sliver but never lets two pieces touch. The epsilon keeps an exact multiple (0.75 × 1.6 / 0.5 = 2.4 → 3, but 0.5 × 1.6 / 0.5 = 1.6 → 2) from gaining a phantom cell to float error.
const cells = (meters: number): number => Math.ceil((meters * FURNITURE_WORLD_SCALE) / CELL - 1e-9);

// topFootprint = ceil(size × FURNITURE_WORLD_SCALE / TOP_CELL_SIZE) per axis — the SAME rule as `cells` above, just at the finer top pitch, and deliberately computed from the measured SIZE again rather than by scaling `footprint`. Scaling would compound `cells`' own ceil: a 0.26 m item is ceil(0.26/0.25) = 2 floor cells, and scaling that by the ×2 subdivision gives 4 fine cells (0.5 m) — a real over-claim, since deriving straight from size gives ceil(0.26/0.125) = 3 (0.375 m), the tight answer. Every item gets one, wall items included (see PlaceableItemDef.topFootprint), even though a window's is never read.
const topCells = (meters: number): number => Math.ceil((meters * FURNITURE_WORLD_SCALE) / TOP_CELL_SIZE - 1e-9);

// Wall footprints round to the NEAREST fine cell, unlike the floor's ceil: for a window this footprint IS its hole, and a hole smaller than the glazing shows wall through the glass while one slightly larger than the frame just reads as a plaster reveal — and a non-opening wall item (a frame) gets the same tight rounding for consistency, since every mount:'wall' row shares one footprint rule now (migration 021), not just the ones that cut holes. Same rule as scripts/fix_window_anchors.py.
const wallCells = (meters: number): number => Math.max(1, Math.round(meters / WALL_CELL_SIZE));

// mount/onTop/opensWall (placeable_items columns, migration 021) route placement now, not category — floor and wall are mutually exclusive so mount is one nullable choice, onTop is orthogonal (a book stands on a host's top whether that host is on the floor or the wall), and opensWall is meaningful only when mount is 'wall'. category is left with exactly one job: routing whether a piece EMITS light. A lamp is ordinary furniture (mount 'floor', maybe onTop) that happens to carry a bulb, so 'lit' does not touch allowedSurfaces at all and only turns emitsLight on.
//
// The light's NUMBERS do not come from the category, they come from row.light (item_lights, joined in by the placeable_items view — migration 012). A 'lit' row with no light row is a seeding mistake, and it degrades quietly: emitsLight is true but there is nothing to build a light from, so the piece places as ordinary furniture. That is the failure the audit query in 012 exists to catch. A mask that disagrees with its footprint is a seeding mistake; warn and fall back to the solid rect, which can only over-claim, never let pieces intersect. The border rule: every edge row/column must hold an 'X', or the bbox (which bounds checks and clamping still use) lies about the piece's extent.
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
  // Every def carries topFootprint (see PlaceableItemDef) even a wall item's, which allowedSurfaces guarantees is never read for one that has no "furniture" entry: occupiedFootprint only consults topFootprint for a "furniture" surface.
  //
  // Measured off contactSize when the row has one (migration 023), not off `size`. topFootprint is a plain rectangle taken from the model's full bounding box, so anything wider above the surface than on it — an open laptop, a lamp with a shade, a plant with a canopy — claims top cells it never touches; the laptop holds a 3x3 block of a desk for a base that fits in 2x3. contactSize is the piece's own base extent, so this is still "measured from a size" and still lands on whole top cells the same way. It changes NOTHING else: `footprint` below stays on `size` because a floor item's collision really is its widest extent (a shade overhanging a neighbour clips), and the piece still renders at `size` — fitScale reads that, not this.
  const topSize = row.contactSize ?? { x: row.size.x, z: row.size.z };
  const topFootprint: Footprint = { w: topCells(topSize.x), d: topCells(topSize.z) };
  // Floor and wall are mutually exclusive (one `mount`, required since migration 024); standing on a host's top (`onTop`) is orthogonal and is APPENDED to that mount, never a replacement for it. Every item therefore has at least one surface, which is what lets startPlacing answer "where does this ghost open" with a complete two-way branch instead of searching the room for a host and refusing when there is none.
  const allowedSurfaces = [row.mount, ...(row.onTop ? (["furniture"] as const) : [])];
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
            emitsLight: row.category === "lit" && row.light != null,
          };
        })();
  return { def, source: row.source, size: row.size, baseOffsetY: row.baseOffsetY, light: row.light };
}

// The baked-in BUILT set: sizes mirror the DB seed (003_catalog.sql) the same way seed.ts does, so offline placement matches what the catalog will say once it loads.
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

// A zustand store (not a plain Map) so screens that GATE on placeability — the inventory's "tap to place" — re-render when the DB rows land mid-session. Store actions read it non-reactively.
export const useRoomCatalogStore = create<RoomCatalogState>()(() => ({
  items: toItems(BUNDLED_ROWS),
}));

// Adopt the catalog's rows. The baked-in built rows stay as a floor under the DB — a row list that lost an item (or a partial fetch) must never strand an already-placed piece unplaceable for want of its dimensions.
export function registerPlaceables(rows: PlaceableRoomRow[]): void {
  useRoomCatalogStore.setState({ items: { ...toItems(BUNDLED_ROWS), ...toItems(rows) } });
}

// The BUILT set, as ids. It answers ONE question — which room/<source>/ subtree an id the catalog has not sent yet lives in — and nothing else. It used to be read off a bundled-model map on the rule "the bundle IS the built set", which coupled that classification to an asset table that no longer exists; keeping the ids here is what stops the room reclassifying every built item as bought and looking down the wrong subtree.
const BUILT_ITEM_IDS = new Set(["dalfred-stool", "lack-table", "eket-cabinet", "bekvam-stool"]);

// Which room/<built|bought>/ subtree an item's assets live in. The catalog row is the authority; for an id the catalog does not know (yet), acquisition decides it — see BUILT_ITEM_IDS above.
export function roomItemSource(itemId: string): ItemSource {
  const item = useRoomCatalogStore.getState().items[itemId];
  if (item) return item.source;
  return BUILT_ITEM_IDS.has(itemId) ? "built" : "bought";
}

// The storage path of the model to load (room/<built|bought|workshop>/<id>/<variation|'default'>.glb). Pure (a path, not a URL), so node:test can pin the routing without a Supabase client.
//
// EVERY room model comes from storage, built and bought alike — there is no bundled room GLB and no source-dependent branch here any more.
//
// The bundle this replaces pointed each built item at its ASSEMBLY GLB, the model the construction minigame uses with every panel, screw and fastener as its own mesh. None of that geometry is visible on a closed cabinet standing in a room, but all of it was parsed: EKET is 66.9 MB and BEKVAM 40.8 MB against storage variants of 0.29 MB and 0.14 MB — a 230x cost to draw the same object — so the map was emptied. What was left behind was the BRANCH that fed it: a built item with no colour picked returned null here so the caller could load a bundle that no longer existed, and rendered nothing instead. That is the normal path, not an edge case, because startPlacing from the Inventory passes no variation and defaultVariationOf resolves to null for anything the variants store has not loaded yet.
//
// If a bundled room model is ever wanted again it must be a SMALL room-sized GLB per item, never the assembly one — and it belongs in variantModel's fallback, not in a branch here that hides the storage path from the caller.
export function getRoomItemStoragePath(itemId: string, variation: string | null | undefined): string | null {
  const item = useRoomCatalogStore.getState().items[itemId];
  // The one remaining null: an id the room cannot place has no subtree to build a path in, and a guessed one would 404 at load time.
  if (!item) return null;
  return modelPath(item.source, itemId, variation ?? null);
}

// The same decision as a fetchable URL — null also when storage is unreachable (no Supabase env).
export function getRoomItemVariantUrl(itemId: string, variation: string | null | undefined): string | null {
  const path = getRoomItemStoragePath(itemId, variation);
  return path === null ? null : catalogUrl(path);
}

// No assembly→room id map: FurnitureId already IS the kebab catalog id on this branch, so a finished build's meta.id can be handed straight to startPlacing. Items with no room model simply miss this catalog and are refused by the store.
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

// The grid's def table, in the shape canPlace/buildOccupancy consume. Rebuilt only when the registry actually changes — validate() runs per drag event and must not allocate per call.
let defsCache: { items: Record<string, RoomItemModel>; map: Map<string, PlaceableItemDef> } | null = null;
export function roomItemDefs(): ReadonlyMap<string, PlaceableItemDef> {
  const items = useRoomCatalogStore.getState().items;
  if (defsCache?.items !== items) {
    defsCache = { items, map: new Map(Object.values(items).map((item) => [item.def.itemId, item.def])) };
  }
  return defsCache.map;
}

// Uniform render scale: the world factor, guarded so a hand-edited footprint can never make a piece spill outside its claimed cells. With ceil-derived footprints the guard never binds. Footprint is at rotSteps 0; rotation permutes cells and model together, so the fit is rotation-invariant.
export function fitScale(item: RoomItemModel): number {
  // Wall items (windows) are exempt: their footprint is a HOLE sized to the NEAREST wall cell, deliberately allowed to be smaller than the model's own glazing so the cut opening tracks the authored size rather than always overshooting it — the floor spill guard below assumes a ceil-derived footprint that always contains the piece, which is backwards here and would shrink the model below its hole, leaving wall showing through the glass.
  if (!item.def.allowedSurfaces.includes("floor")) return FURNITURE_WORLD_SCALE;
  return Math.min(
    FURNITURE_WORLD_SCALE,
    (item.def.footprint.w * CELL) / item.size.x,
    (item.def.footprint.d * CELL) / item.size.z,
  );
}
