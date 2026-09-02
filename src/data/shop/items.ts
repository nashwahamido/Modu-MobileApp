// the shop VIEW-MODEL: what a purchasable item is, and how the Shop and the Inventory filter and sort one
// no data lives here — rows come from item_buy through the repo seam, with seedShopItems() as the stand-in
// the categories mirror item_categories: adding one without the migration row fails the category_id foreign key
import type { ItemSource, SurfaceMap } from "../catalog/assets";
import { parseSurfaceSpec } from "./surfaceSpec";

export type ShopCategory = "fur" | "wall" | "floor" | "deco" | "win" | "lit";

// a surface item COVERS the room rather than standing in it: no model, no placement grid, no variations
// the predicate that tells a tap starting a placement from a tap repainting the room
export function isSurfaceCategory(category: ShopCategory): category is "floor" | "wall" {
  return category === "floor" || category === "wall";
}

// authored in the portal at upload time because none of it can be derived from the images
// tiling is the map's PHYSICAL scale ("this plank map is 2 m wide"); edgeColor is a design choice about the plinth
export interface SurfaceItemSpec {
  // applied as baseColorUvMatrix on the slab or the walls
  tiling: { scale: [number, number]; offset: [number, number] };
  // the FloorEdge tint, floor items only — the ONLY baseColorFactor a surface item writes, since the plinth never fades
  edgeColor?: [number, number, number];
  // the cornice's own scale, not the wall's — separate geometry, and reusing the wall's reads as extruded wallpaper
  trimTiling?: { scale: [number, number]; offset: [number, number] };
  // exactly the maps the portal PUBLISHED — it omits a near-uniform normal or roughness map rather than ship 1.4 MB
  // listing them is what stops the loader chasing a 404 per absent map
  maps: SurfaceMap[];
}

export type ShopItemId = string;

export interface ShopItem {
  id: ShopItemId;
  name: string;
  category: ShopCategory;
  // price in coins, the same currency as Profile.coins
  price: number;
  // minimum level to purchase, 1 = no restriction. below it the store shows the item locked
  minLevel: number;
  // owned by every player without an ownership row (018), which is how the "room as designed" surfaces reach the inventory
  // ownership of the ITEM, not a row per player: N x M rows to express a constant go stale. absent = false
  granted?: boolean;
  // present exactly when isSurfaceCategory(category) — undefined otherwise, and while portal data has not landed
  surface?: SurfaceItemSpec;
  // which room/<source>/ subtree the assets live under. absent means "bought", the assumption before drafts existed
  // a dev build merges drafts under room/workshop/, so assuming "bought" 404s a texture and reads as a broken upload
  source?: ItemSource;
}

// the tab order shown in the store. not exported: SHOP_CATEGORY_TABS is the list every caller wants
const SHOP_CATEGORIES: ShopCategory[] = ["fur", "wall", "floor", "deco", "win", "lit"];

// the tabs without the "all" filter, for the room's shop popup
export const SHOP_CATEGORY_TABS: ShopCategory[] = SHOP_CATEGORIES;

// a category tab value, including the "all" tab that shows everything
export type CategoryFilter = ShopCategory | "all";

// display labels — the ids are short (fur/deco/wall/floor); the tabs show these
export const CATEGORY_LABELS: Record<CategoryFilter, string> = {
  all: "All",
  fur: "Furniture",
  wall: "Wallpapers",
  floor: "Floors",
  deco: "Decorations",
  lit: "Lighting",
  win: "Windows",
};

// both surfaces ask for "name" today; the price orders stay because sort is the catalogue's vocabulary, not a widget's
export type ShopSort = "name" | "priceAsc" | "priceDesc";

// the category filter and sort — shared by the Shop and the Inventory so both view the catalogue the same way
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


// one item_buy row as Postgrest hands it back — loose on purpose, the query being `*`
export interface ShopItemRow {
  id: string;
  name: string;
  category_id: string;
  price: number;
  min_level: number;
  granted?: boolean;
  item_surfaces?: unknown;
}

// pure so it can be tested at all: it silently dropped `granted` for the whole life of 018
// nothing failed loudly — the column WAS selected, the type DID declare the field, and the fixture got it right
export function toShopItem(r: ShopItemRow): ShopItem {
  const category = r.category_id as ShopCategory;
  // Postgrest returns a to-one embed as an object, or an ARRAY when it cannot prove the relation is to-one
  const row = Array.isArray(r.item_surfaces) ? r.item_surfaces[0] : r.item_surfaces;
  const surface = isSurfaceCategory(category) ? parseSurfaceSpec(row) : undefined;
  return {
    id: r.id,
    name: r.name,
    category,
    price: r.price,
    minLevel: r.min_level,
    // absent reads as false, matching the column's own default
    granted: r.granted === true,
    // every item_buy row is a bought item — the source is not a column, it IS which table the row came from
    source: "bought",
    ...(surface ? { surface } : {}),
  };
}

// one testing draft for the dev-only merge — see getShopItems (adapters/supabase.ts) and workshopDraftsGate.ts
export interface WorkshopDraftShopRow {
  id: string;
  name: string;
  category_id: string;
  price: number;
  min_level: number;
  granted?: boolean | null;
  // NULL on a SURFACE draft, present on a MODEL one — workshop_drafts_kind_shape (019) guarantees the pairing
  size_x: number | null;
  // shaped exactly like item_surfaces' own columns, which is why parseSurfaceSpec reads it unmodified
  surface?: unknown;
}

// EVERY testing draft becomes a ShopItem, model and surface alike
// mapping only surface drafts made model uploads invisible: the Inventory is the room's picker, and it lists ShopItems
// the surface payload attaches on the size_x null branch, not a category list, since the DB already guarantees the pairing
export function workshopDraftsToShopItems(rows: WorkshopDraftShopRow[]): ShopItem[] {
  return rows.map((r) => {
    const category = r.category_id as ShopCategory;
    const surface = r.size_x == null ? parseSurfaceSpec(r.surface) : undefined;
    return {
      id: r.id,
      name: r.name,
      category,
      price: r.price,
      minLevel: r.min_level,
      granted: r.granted === true,
      // a draft's assets sit under room/workshop/, not room/bought/
      source: "workshop" as const,
      ...(surface ? { surface } : {}),
    };
  });
}
