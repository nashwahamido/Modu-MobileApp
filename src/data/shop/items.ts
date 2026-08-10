// The shop VIEW-MODEL: what a purchasable item is, and how the two catalogue surfaces (Shop and Inventory) filter and sort one. No data lives here — the rows come from item_buy through the repo seam, and the in-memory stand-in is seedShopItems() in adapters/seed.ts with every other fixture. Mirrors item_categories in the DB — adding one here without the matching migration row will fail the category_id foreign key on insert.
import type { ItemSource, SurfaceMap } from "../catalog/assets";
import { parseSurfaceSpec } from "./surfaceSpec";

export type ShopCategory = "fur" | "wall" | "floor" | "deco" | "win" | "lit";

// A surface item covers the room rather than standing in it: no model, no placement grid, no variations. The two categories were already here for the shop's tabs; this is the predicate that lets the Inventory tell a tap that starts a placement from a tap that repaints the room.
export function isSurfaceCategory(category: ShopCategory): category is "floor" | "wall" {
  return category === "floor" || category === "wall";
}

// What a surface item needs beyond its texture files. Authored in Modu-Portal at upload time and carried on the item row, because none of it can be derived from the images: tiling is the map's PHYSICAL scale ("this plank map is 2 m wide"), and edgeColor is a design choice about the plinth even when a sensible default is the base colour's average.
export interface SurfaceItemSpec {
  // Applied as baseColorUvMatrix on the slab or the walls.
  tiling: { scale: [number, number]; offset: [number, number] };
  // The FloorEdge tint. Floor items only, and the ONLY baseColorFactor a surface item ever writes — the plinth never fades, so nothing else owns its factor, which is exactly why the cornice takes a texture instead.
  edgeColor?: [number, number, number];
  // The cornice's own scale, which is not the wall's: a cornice is separate geometry with its own UV mapping, and reusing the wall's tiling on it reads as an extruded strip of wallpaper. Wall items only — the cornice sits at the wall/ceiling junction and follows the wallpaper, not the floor.
  trimTiling?: { scale: [number, number]; offset: [number, number] };
  // Exactly the maps the portal PUBLISHED. It omits a normal or roughness map whose variance is below threshold — a smooth plaster wall's roughness map is near-uniform and costs a download and 1.4 MB of VRAM to say nothing. Listing them here is what stops the loader chasing a 404 for every absent map.
  maps: SurfaceMap[];
}

export type ShopItemId = string;

export interface ShopItem {
  id: ShopItemId;
  name: string;
  category: ShopCategory;
  // Price in coins (the same currency as Profile.coins).
  price: number;
  // Minimum user level required to purchase. 1 = no restriction. Below it, the store shows the item locked.
  minLevel: number;
  // Owned by every player without an ownership row (migration 018), which is how the two "room as designed" surface items reach the inventory. Ownership is a property of the ITEM here rather than a row per player: storing it per player would be N x M rows expressing a constant, and would go stale the first time a signup path forgot to write them. listOwned unions these in. Absent means false.
  granted?: boolean;
  // Present exactly when isSurfaceCategory(category) — tiling/edge/trim/map manifest for a floor or wall item. Undefined for every other category, and for a surface row whose portal-authored data has not landed yet.
  surface?: SurfaceItemSpec;
  // Which room/<source>/ subtree this item's assets live under. Absent means "bought", which is what every row from item_buy is and was the hardcoded assumption at every call site before workshop drafts existed. A dev build merges testing drafts whose assets sit under room/workshop/, so a consumer that assumes "bought" builds a URL into the wrong subtree and 404s on a texture the data layer served correctly — which reads as a broken upload rather than as a missing field.
  source?: ItemSource;
}

// The tab order shown in the store — "all" first, then the categories from the mock.
// Not exported: CATEGORY_FILTERS below is the list every caller actually wants.
const SHOP_CATEGORIES: ShopCategory[] = ["fur", "wall", "floor", "deco", "win", "lit"];

// The tabs without the "all" filter, for the room's shop popup.
export const SHOP_CATEGORY_TABS: ShopCategory[] = SHOP_CATEGORIES;

// A category tab value, including the "all" tab that shows everything.
export type CategoryFilter = ShopCategory | "all";
export const CATEGORY_FILTERS: CategoryFilter[] = ["all", ...SHOP_CATEGORIES];

// Display labels for the tabs — the ids are short (fur/deco/wall/floor); the tabs show these.
export const CATEGORY_LABELS: Record<CategoryFilter, string> = {
  all: "All",
  fur: "Furniture",
  wall: "Wallpapers",
  floor: "Floors",
  deco: "Decorations",
  lit: "Lighting",
  win: "Windows",
};

// Sort modes offered by the catalogue chrome, and their short pill labels.
export type ShopSort = "name" | "priceAsc" | "priceDesc";
// Not exported: the cycle order is nextSort's business, and SORT_LABELS is what the UI renders.
const SHOP_SORTS: ShopSort[] = ["name", "priceAsc", "priceDesc"];
export const SORT_LABELS: Record<ShopSort, string> = {
  name: "A–Z",
  priceAsc: "Price ↑",
  priceDesc: "Price ↓",
};

// The next sort in the cycle — powers the single tap-to-cycle sort pill.
export function nextSort(sort: ShopSort): ShopSort {
  return SHOP_SORTS[(SHOP_SORTS.indexOf(sort) + 1) % SHOP_SORTS.length];
}

// Apply the category filter and sort to a list of items — shared by the Shop and Inventory so both view the catalogue the same way.
export function viewCatalogue<T extends { category: ShopCategory; name: string; price?: number }>(
  items: T[],
  category: CategoryFilter,
  sort: ShopSort,
): T[] {
  const filtered =
    category === "all" ? items : items.filter((i) => i.category === category);
  return [...filtered].sort((a, b) =>
    sort === "name"
      ? a.name.localeCompare(b.name)
      : sort === "priceAsc"
        ? (a.price ?? 0) - (b.price ?? 0)
        : (b.price ?? 0) - (a.price ?? 0),
  );
}


// One item_buy row, as Postgrest hands it back. Loose on purpose: the query selects `*`, so a column the live schema does not have yet is simply absent rather than fatal.
export interface ShopItemRow {
  id: string;
  name: string;
  category_id: string;
  price: number;
  min_level: number;
  granted?: boolean;
  item_surfaces?: unknown;
}

// Row -> ShopItem. Extracted out of the Supabase adapter and made pure so it can be tested at all: this mapper silently dropped `granted` for the whole life of migration 018, which made listOwned's `.filter((i) => i.granted)` match nothing and left every granted item un-owned, invisible in the inventory and impossible to apply. Nothing failed loudly because the column WAS selected and the type DID declare the field — only the mapper omitted it — and the in-memory adapter implements granted correctly, so every test kept passing. A bug that only exists on one side of an adapter boundary needs a test on that side.
export function toShopItem(r: ShopItemRow): ShopItem {
  const category = r.category_id as ShopCategory;
  // Postgrest hands back a to-one embed as an object, but returns an ARRAY when it cannot prove the relation is to-one. Both shapes are accepted so a schema-cache quirk degrades to the authored look rather than to a silently surface-less catalogue.
  const row = Array.isArray(r.item_surfaces) ? r.item_surfaces[0] : r.item_surfaces;
  const surface = isSurfaceCategory(category) ? parseSurfaceSpec(row) : undefined;
  return {
    id: r.id,
    name: r.name,
    category,
    price: r.price,
    minLevel: r.min_level,
    // Absent reads as false, matching the column's own default and the type's documented "Absent means false".
    granted: r.granted === true,
    // Every row from item_buy is, by definition, a bought item — the source is not a column, it IS which table the row came from.
    source: "bought",
    ...(surface ? { surface } : {}),
  };
}

// One workshop_drafts row (status='testing'), as Postgrest hands it back for the dev-only merge into the shop/inventory catalogue — see getShopItems in adapters/supabase.ts, and workshopDraftsDevGateOpen (catalog/workshopDraftsGate.ts) for the gate that decides whether this merge runs at all. Loose like ShopItemRow, for the same reason: the query selects `*`.
export interface WorkshopSurfaceDraftRow {
  id: string;
  name: string;
  category_id: string;
  price: number;
  min_level: number;
  granted?: boolean | null;
  // NULL on a MODEL draft — workshop_drafts_kind_shape (019_workshop_kinds.sql) guarantees this is null exactly when size_x is present. This is the fact workshopSurfaceDraftsToShopItems filters on.
  size_x: number | null;
  // Shaped exactly like item_surfaces' own columns (scale_x, scale_y, ..., trim_offset_y — see 019_workshop_kinds.sql's publish_workshop_draft), which is why parseSurfaceSpec can read it unmodified.
  surface?: unknown;
}

// Model and surface drafts share one workshop_drafts table; only a surface draft belongs in the SHOP — a model draft has no ShopItem at all, it is placed straight from the room's own catalogue (see workshopDraftToPlaceableRoomRow, core/repos.ts). Filtered on size_x rather than on category_id membership in ('floor','wall'), for the same reason workshopModelDraftsToPlaceableRoomRows filters the other table's rows on size instead of category: the DB constraint guarantees the size/kind pairing, where a hand-maintained category list here would just be a second copy of that fact that could drift from it.
export function workshopSurfaceDraftsToShopItems(rows: WorkshopSurfaceDraftRow[]): ShopItem[] {
  return rows
    .filter((r) => r.size_x == null)
    .map((r) => {
      const category = r.category_id as ShopCategory;
      const surface = parseSurfaceSpec(r.surface);
      return {
        id: r.id,
        name: r.name,
        category,
        price: r.price,
        minLevel: r.min_level,
        granted: r.granted === true,
        // A draft's assets sit under room/workshop/, not room/bought/ — this is the field that keeps a consumer from building a URL into the published subtree for something that has not been published.
        source: "workshop" as const,
        ...(surface ? { surface } : {}),
      };
    });
}
