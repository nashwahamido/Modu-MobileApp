// Shop catalog reference data: the purchasable items, same for everyone (like avatars / level_titles).
// A shop item is bought with coins and, once owned, appears in the player's inventory.
// Keep DEFAULT_SHOP_ITEMS in sync with the shop_items seed in the shop/inventory migration.
export type ShopCategory = "furniture" | "wallpapers" | "floors" | "decorations" | "windows";

export type ShopItemId = string;

export interface ShopItem {
  id: ShopItemId;
  name: string;
  category: ShopCategory;
  // Price in coins (the same currency as Profile.coins).
  price: number;
}

// The tab order shown in the store — "all" first, then the categories from the mock.
export const SHOP_CATEGORIES: ShopCategory[] = ["furniture", "wallpapers", "floors", "decorations", "windows"];

// A category tab value, including the "all" tab that shows everything.
export type CategoryFilter = ShopCategory | "all";
export const CATEGORY_FILTERS: CategoryFilter[] = ["all", ...SHOP_CATEGORIES];

// Sort modes offered by the catalogue chrome, and their short pill labels.
export type ShopSort = "name" | "priceAsc" | "priceDesc";
export const SHOP_SORTS: ShopSort[] = ["name", "priceAsc", "priceDesc"];
export const SORT_LABELS: Record<ShopSort, string> = { name: "A–Z", priceAsc: "Price ↑", priceDesc: "Price ↓" };

// The next sort in the cycle — powers the single tap-to-cycle sort pill.
export function nextSort(sort: ShopSort): ShopSort {
  return SHOP_SORTS[(SHOP_SORTS.indexOf(sort) + 1) % SHOP_SORTS.length];
}

// Apply the category filter and sort to a list of items — shared by the Shop and Inventory so both view the catalogue the same way.
export function viewCatalogue(items: ShopItem[], category: CategoryFilter, sort: ShopSort): ShopItem[] {
  const filtered = category === "all" ? items : items.filter((i) => i.category === category);
  return [...filtered].sort((a, b) =>
    sort === "name" ? a.name.localeCompare(b.name) : sort === "priceAsc" ? a.price - b.price : b.price - a.price,
  );
}

// Canonical catalog. Mirror of the shop_items rows seeded in the migration.
export const DEFAULT_SHOP_ITEMS: ShopItem[] = [
  { id: "shelving-units-wooden", name: "Shelving Units Wooden", category: "furniture", price: 150 },
  { id: "bed-slattum-white", name: "Bed Slattum White", category: "furniture", price: 150 },
  { id: "table", name: "Table", category: "furniture", price: 150 },
  { id: "chair", name: "Chair", category: "furniture", price: 150 },
  { id: "shelves", name: "Shelves", category: "furniture", price: 150 },
  { id: "kids-desk", name: "Kids Desk", category: "furniture", price: 150 },
  { id: "stool-black-adjustable", name: "Stool Black Adjustable", category: "furniture", price: 150 },
  { id: "sofa-navy", name: "Sofa Navy", category: "furniture", price: 150 },
  { id: "cream-wallpaper", name: "Cream Wallpaper", category: "wallpapers", price: 80 },
  { id: "oak-floor", name: "Oak Floor", category: "floors", price: 90 },
  { id: "round-rug", name: "Round Rug", category: "decorations", price: 60 },
  { id: "classic-window", name: "Classic Window", category: "windows", price: 120 },
];
