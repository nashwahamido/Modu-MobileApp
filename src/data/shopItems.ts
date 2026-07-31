// The shop VIEW-MODEL: what a purchasable item is, and how the two catalogue surfaces (Shop and
// Inventory) filter and sort one. No data lives here — the rows come from item_buy through the repo
// seam, and the in-memory stand-in is seedShopItems() in adapters/seed.ts with every other fixture.
export type ShopCategory = "fur" | "wall" | "floor" | "deco" | "win";

export type ShopItemId = string;

export interface ShopItem {
  id: ShopItemId;
  name: string;
  category: ShopCategory;
  // Price in coins (the same currency as Profile.coins).
  price: number;
  // Minimum user level required to purchase. 1 = no restriction. Below it, the store shows the item locked.
  minLevel: number;
}

// The tab order shown in the store — "all" first, then the categories from the mock.
// Not exported: CATEGORY_FILTERS below is the list every caller actually wants.
const SHOP_CATEGORIES: ShopCategory[] = ["fur", "wall", "floor", "deco", "win"];

// A category tab value, including the "all" tab that shows everything.
export type CategoryFilter = ShopCategory | "all";
export const CATEGORY_FILTERS: CategoryFilter[] = ["all", ...SHOP_CATEGORIES];

// Display labels for the tabs — the ids are short (fur/deco/wall/floor); the tabs show these.
export const CATEGORY_LABELS: Record<CategoryFilter, string> = {
  all: "All",
  fur: "Furniture",
  wall: "Wallpaper",
  floor: "Floor",
  deco: "Decorations",
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

