// the shop view-model
// the categories mirror item_categories — adding one without the migration row fails the category_id FK
import type { ItemSource, SurfaceMap } from "../catalog/assets";
import { parseSurfaceSpec } from "./surfaceSpec";

export type ShopCategory = "fur" | "wall" | "floor" | "deco" | "win" | "lit";

export function isSurfaceCategory(
  category: ShopCategory,
): category is "floor" | "wall" {
  return category === "floor" || category === "wall";
}
export interface SurfaceItemSpec {
  tiling: { scale: [number, number]; offset: [number, number] };
  edgeColor?: [number, number, number]; // the FloorEdge tint, floor items only
  trimTiling?: { scale: [number, number]; offset: [number, number] }; // the cornice's own scale, not the wall's
  maps: SurfaceMap[];
}

export type ShopItemId = string;

export interface ShopItem {
  id: ShopItemId;
  name: string;
  category: ShopCategory;
  price: number;
  minLevel: number;
  granted?: boolean; // owned by every player without an ownership row (default items)
  surface?: SurfaceItemSpec;
  source?: ItemSource;
}

// the tab order shown in the store
const SHOP_CATEGORIES: ShopCategory[] = [
  "fur",
  "wall",
  "floor",
  "deco",
  "win",
  "lit",
];

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

// both surfaces ask for "name" today; the price orders stay because sort is the catalogue's vocabulary
export type ShopSort = "name" | "priceAsc" | "priceDesc";

// filter and sort, shared by the Shop and the Inventory so both view the catalogue the same way
export function viewCatalogue<
  T extends { category: ShopCategory; name: string; price?: number },
>(items: T[], category: CategoryFilter, sort: ShopSort): T[] {
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

// one item_buy row
export interface ShopItemRow {
  id: string;
  name: string;
  category_id: string;
  price: number;
  min_level: number;
  granted?: boolean;
  item_surfaces?: unknown;
}

export function toShopItem(r: ShopItemRow): ShopItem {
  const category = r.category_id as ShopCategory;
  // Postgrest returns a to-one embed as an object, or an array when it cannot prove the relation is to-one
  const row = Array.isArray(r.item_surfaces)
    ? r.item_surfaces[0]
    : r.item_surfaces;
  const surface = isSurfaceCategory(category)
    ? parseSurfaceSpec(row)
    : undefined;
  return {
    id: r.id,
    name: r.name,
    category,
    price: r.price,
    minLevel: r.min_level,
    // absent reads as false
    granted: r.granted === true,
    // every item_buy row is a bought item — source says which table the row came from
    source: "bought",
    ...(surface ? { surface } : {}),
  };
}

// one testing draft for the dev-only merge
export interface WorkshopDraftShopRow {
  id: string;
  name: string;
  category_id: string;
  price: number;
  min_level: number;
  granted?: boolean | null;
  // null on a surface draft
  size_x: number | null;
  surface?: unknown;
}

// every testing draft becomes a ShopItem, model and surface alike
export function workshopDraftsToShopItems(
  rows: WorkshopDraftShopRow[],
): ShopItem[] {
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
