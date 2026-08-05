// Demo seed data for the in-memory adapter: a fake "me" plus demo friends, each with a profile and a room. Doubles as demo data (the DEV panel) and test fixtures.
import type { FurnitureId } from "@/src/game/core/type";
import type { LevelRow } from "../levels";
import type { ShopCategory, ShopItem, ShopItemId } from "../shopItems";
import type { BuildCatalogRow, ItemVariant, PlaceableRoomRow } from "../repos";
import type { BuildSave, Friend, Profile, RoomLayout, UserId } from "../types";
import { ROOM_LAYOUT_VERSION } from "../types";

// The fake current user for local/dev runs. Real code derives the id from Supabase auth (useAuth().user.id).
export const DEMO_ME: UserId = "me";
export const DEMO_FRIEND_A: UserId = "friend-astrid";
export const DEMO_FRIEND_B: UserId = "friend-noah";

// Fixed timestamp so seeds stay deterministic (no Date at module load).
const SEED_TS = "2026-01-01T00:00:00.000Z";

export function seedProfiles(): Profile[] {
  return [
    // title (from level), xpIntoLevel/xpForNextLevel (from the level curve), itemsAssembled (from seedCompleted) and likes (from seedRoomLikes) are all derived on read — the values here are placeholders the adapter overwrites.
    // level must agree with xp under seedLevelRows(), the way the reward path keeps them: 340 -> 2, 980 -> 4, 150 -> 1.
    { userId: DEMO_ME, username: "You", avatarMode: "control", level: 2, coins: 120, xp: 340, onboardingCompleted: true, title: null, xpIntoLevel: 0, xpForNextLevel: null, itemsAssembled: 0, likes: 0 },
    { userId: DEMO_FRIEND_A, username: "Astrid", avatarMode: "visual", level: 4, coins: 410, xp: 980, onboardingCompleted: true, title: null, xpIntoLevel: 0, xpForNextLevel: null, itemsAssembled: 0, likes: 0 },
    { userId: DEMO_FRIEND_B, username: "Noah", avatarMode: "momentum", level: 1, coins: 60, xp: 150, onboardingCompleted: true, title: null, xpIntoLevel: 0, xpForNextLevel: null, itemsAssembled: 0, likes: 0 },
  ];
}

// Dev stand-in for the levels table, which is the real source and the place to TUNE levelling — edit it there, not here. This copy exists only so the in-memory adapter can resolve a level and title without a backend; keep it roughly in step, but the table wins. A null title inherits the tier below it.
export function seedLevelRows(): LevelRow[] {
  return [
    { level: 1, xpRequired: 0, title: "an ambitious newbie" },
    { level: 2, xpRequired: 200, title: "a budding builder" },
    { level: 3, xpRequired: 450, title: "a steady hand" },
    { level: 4, xpRequired: 750, title: null },
    { level: 5, xpRequired: 1100, title: "a seasoned builder" },
    { level: 6, xpRequired: 1500, title: null },
    { level: 7, xpRequired: 1950, title: null },
    { level: 8, xpRequired: 2450, title: "a master assembler" },
    { level: 9, xpRequired: 3000, title: null },
    { level: 10, xpRequired: 3600, title: null },
    { level: 11, xpRequired: 4250, title: null },
    { level: 12, xpRequired: 4950, title: null },
  ];
}

export function seedRooms(): RoomLayout[] {
  return [
    { ownerId: DEMO_ME, version: ROOM_LAYOUT_VERSION, placements: [], updatedAt: SEED_TS },
    { ownerId: DEMO_FRIEND_A, version: ROOM_LAYOUT_VERSION, placements: [{ instanceId: "a1", furnitureId: "lack-table", surface: { kind: "floor" }, cell: { x: 6, y: 8 }, rotSteps: 0 }], updatedAt: SEED_TS },
    { ownerId: DEMO_FRIEND_B, version: ROOM_LAYOUT_VERSION, placements: [{ instanceId: "b1", furnitureId: "dalfred-stool", surface: { kind: "floor" }, cell: { x: 14, y: 10 }, rotSteps: 1 }], updatedAt: SEED_TS },
  ];
}

export function seedFriends(): Record<UserId, Friend[]> {
  return {
    [DEMO_ME]: [{ userId: DEMO_FRIEND_A, since: SEED_TS }, { userId: DEMO_FRIEND_B, since: SEED_TS }],
    [DEMO_FRIEND_A]: [{ userId: DEMO_ME, since: SEED_TS }],
    [DEMO_FRIEND_B]: [{ userId: DEMO_ME, since: SEED_TS }],
  };
}

// No in-progress builds at seed: saves accrue at runtime as the user assembles. Seeding fake ActionIds here would not match a freshly composed furniture.
export function seedBuilds(): BuildSave[] {
  return [];
}

// Dev stand-in for the item_build catalogue rows the picker displays. The real source is item_build joined to furniture_types; keep this roughly in step, but the table wins.
export function seedBuildCatalog(): BuildCatalogRow[] {
  return [
    { id: "dalfred-stool", name: "DALFRED Stool", brand: "IKEA", type: "Table & Chair", durationMin: 10 },
    { id: "lack-table", name: "LACK Table", brand: "IKEA", type: "Table & Chair", durationMin: 8 },
    { id: "eket-cabinet", name: "EKET Cabinet", brand: "IKEA", type: "Shelf & Cabinet", durationMin: 35 },
    { id: "bekvam-stool", name: "BEKVÄM Stool", brand: "IKEA", type: "Other", durationMin: 15 },
  ];
}

// Dev stand-in for the item_build catalog rows the inventory displays. The real source is item_build (see the furniture_catalog migration) — these names mirror it, so dev and prod show the same text. Rename in the DB, not here.
export function seedBuiltItems(): Record<FurnitureId, { name: string; category: ShopCategory }> {
  return {
    "eket-cabinet": { name: "EKET Cabinet", category: "fur" },
    "bekvam-stool": { name: "BEKVÄM Stool", category: "fur" },
    "dalfred-stool": { name: "DALFRED Stool", category: "fur" },
    "lack-table": { name: "LACK Table", category: "fur" },
  };
}

// Completed furniture per user — the source of the derived itemsAssembled count.
export function seedCompleted(): Record<UserId, FurnitureId[]> {
  return {
    [DEMO_ME]: ["lack-table"],
    [DEMO_FRIEND_A]: ["lack-table", "dalfred-stool", "eket-cabinet", "bekvam-stool"],
    [DEMO_FRIEND_B]: [],
  };
}

// The purchasable catalog — the in-memory mirror of the item_buy seed in migration 003_catalog.sql. Ids, prices and min_levels are copied from it verbatim: this is the stand-in players see when EXPO_PUBLIC_DATA_BACKEND is not "supabase", so it is only useful insofar as it matches the real thing. (It had drifted to a disjoint set — shelving-units-wooden / bed-slattum-white — which meant the demo inventory silently rendered fewer items than it claimed to own.)
// NOTE: the wall/floor/deco tabs are legitimately empty here — that is the catalog's state (windows arrived with 010_windows.sql; surfaces still have no rows), not a gap in the fixture.
export function seedShopItems(): ShopItem[] {
  return [
    { id: "malm-chest", name: "MALM Chest", category: "fur", price: 150, minLevel: 1 },
    { id: "neiden-bedframe", name: "NEIDEN Bedframe", category: "fur", price: 120, minLevel: 1 },
    { id: "rosentorp-table", name: "ROSENTORP Table", category: "fur", price: 100, minLevel: 1 },
    { id: "window-wc-narrow", name: "Narrow WC Window", category: "win", price: 60, minLevel: 1 },
    { id: "window-double-hung", name: "Double-Hung Window", category: "win", price: 80, minLevel: 1 },
    { id: "window-pvc-single", name: "PVC Single Window", category: "win", price: 90, minLevel: 1 },
    { id: "window-sash", name: "Victorian Sash Window", category: "win", price: 120, minLevel: 1 },
    { id: "window-wood-classic", name: "Classic Wood Window", category: "win", price: 140, minLevel: 1 },
  ];
}

// Shop items each user already owns — the checkmarks in the shop grid, and the contents of their inventory. Ids MUST exist in seedShopItems above: the inventory renders by filtering the catalogue down to owned ids, so an id with no catalogue row is silently dropped rather than shown. "me" owns two to match the mock (the two ticked cards), leaving one still buyable.
export function seedInventory(): Record<UserId, ShopItemId[]> {
  return {
    [DEMO_ME]: ["malm-chest", "rosentorp-table"],
    [DEMO_FRIEND_A]: ["malm-chest", "neiden-bedframe", "rosentorp-table"],
    [DEMO_FRIEND_B]: [],
  };
}

// The colour/finish axis per item — the in-memory mirror of the item_variants seed in migration 003_catalog.sql, copied verbatim for the same reason seedShopItems is: this is what the picker offers when the backend is not "supabase", so it is only useful insofar as it matches the real table.
// Exactly one is_default per item id, like the partial unique index enforces.
export function seedItemVariants(): ItemVariant[] {
  const v = (itemId: string, variation: string | null, isDefault = false): ItemVariant => ({ itemId, variation, isDefault });
  return [
    v("eket-cabinet", "black", true),
    v("eket-cabinet", "white"),
    v("eket-cabinet", "wooden"),
    v("bekvam-stool", "white", true),
    v("bekvam-stool", "black"),
    v("bekvam-stool", "wooden"),
    v("dalfred-stool", "birch", true),
    v("dalfred-stool", "black"),
    v("lack-table", "wooden", true),
    v("lack-table", "black"),
    v("lack-table", "white"),
    v("malm-chest", "white", true),
    v("malm-chest", "wooden"),
    v("neiden-bedframe", "wooden", true),
    v("rosentorp-table", "black", true),
    v("rosentorp-table", "white"),
    // Windows: single model each, no colour axis — null variation = the 'default' path segment.
    v("window-wc-narrow", null, true),
    v("window-double-hung", null, true),
    v("window-pvc-single", null, true),
    v("window-sash", null, true),
    v("window-wood-classic", null, true),
  ];
}

// Room-placement metadata per item — the in-memory mirror of the size seeds in migration 003_catalog.sql, copied verbatim like seedShopItems is. Sizes are measured world-AABB extents in authored meters; tutorial has no room model, so it has no row here.
export function seedPlaceableItems(): PlaceableRoomRow[] {
  return [
    { id: "dalfred-stool", source: "built", category: "fur", size: { x: 0.5, y: 0.79, z: 0.5 }, baseOffsetY: 0.007 },
    { id: "lack-table", source: "built", category: "fur", size: { x: 0.55, y: 0.45, z: 0.55 }, baseOffsetY: 0 },
    { id: "eket-cabinet", source: "built", category: "fur", size: { x: 0.37, y: 0.35, z: 0.75 }, baseOffsetY: 0.175 },
    { id: "bekvam-stool", source: "built", category: "fur", size: { x: 0.39, y: 0.5, z: 0.43 }, baseOffsetY: 0 },
    { id: "malm-chest", source: "bought", category: "fur", size: { x: 0.804, y: 1.004, z: 0.483 }, baseOffsetY: 0 },
    { id: "neiden-bedframe", source: "bought", category: "fur", size: { x: 0.96, y: 0.647, z: 1.95 }, baseOffsetY: 0 },
    { id: "rosentorp-table", source: "bought", category: "fur", size: { x: 1.101, y: 0.751, z: 1.101 }, baseOffsetY: 0 },
    // Windows (010_windows.sql): wall items — size x = width, y = height, z = depth out of the wall.
    { id: "window-wc-narrow", source: "bought", category: "win", size: { x: 0.504, y: 1.251, z: 0.165 }, baseOffsetY: 0 },
    { id: "window-double-hung", source: "bought", category: "win", size: { x: 0.73, y: 1.04, z: 0.107 }, baseOffsetY: 0 },
    { id: "window-pvc-single", source: "bought", category: "win", size: { x: 1.005, y: 1.256, z: 0.167 }, baseOffsetY: 0 },
    { id: "window-sash", source: "bought", category: "win", size: { x: 1.061, y: 1.262, z: 0.218 }, baseOffsetY: 0 },
    { id: "window-wood-classic", source: "bought", category: "win", size: { x: 1.239, y: 1.231, z: 0.349 }, baseOffsetY: 0 },
  ];
}

// Likers per room owner — the source of the derived likes count. Ids are synthetic.
export function seedRoomLikes(): Record<UserId, UserId[]> {
  const likers = (n: number): UserId[] => Array.from({ length: n }, (_, i) => `liker-${i}`);
  return {
    [DEMO_ME]: likers(4),
    [DEMO_FRIEND_A]: likers(12),
    [DEMO_FRIEND_B]: likers(1),
  };
}
