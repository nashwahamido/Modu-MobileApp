// demo data for the in-memory adapter
import type { FurnitureId } from "@/src/game/core/type";
import { asFurnitureId } from "@/src/game/core/ids";
import type { LevelRow } from "../player/levels";
import type { ShopCategory, ShopItem, ShopItemId } from "../shop/items";
import type { SurfaceMap } from "../catalog/assets";
import type {
  BuildCatalogRow,
  ItemVariant,
  PlaceableRoomRow,
} from "../core/repos";
import type {
  BuildSave,
  Friend,
  Profile,
  RoomLayout,
  UserId,
} from "../core/types";
import { ROOM_LAYOUT_VERSION } from "../core/types";
import {
  STARTER_ROOM_ITEM_IDS,
  createStarterRoomPlacements,
} from "../room/initialLayout";

// the fake current user
export const DEMO_ME: UserId = "me";
export const DEMO_FRIEND_A: UserId = "friend-astrid";
export const DEMO_FRIEND_B: UserId = "friend-noah";

// a fixed timestamp
const SEED_TS = "2026-01-01T00:00:00.000Z";

export function seedProfiles(): Profile[] {
  return [
    {
      userId: DEMO_ME,
      username: "You",
      avatarMode: "control",
      level: 2,
      coins: 120,
      xp: 340,
      onboardingCompleted: true,
      mapCoachSeen: false,
      title: null,
      xpIntoLevel: 0,
      xpForNextLevel: null,
      itemsAssembled: 0,
      likes: 0,
    },
    {
      userId: DEMO_FRIEND_A,
      username: "Astrid",
      avatarMode: "visual",
      level: 4,
      coins: 410,
      xp: 980,
      onboardingCompleted: true,
      mapCoachSeen: true,
      title: null,
      xpIntoLevel: 0,
      xpForNextLevel: null,
      itemsAssembled: 0,
      likes: 0,
    },
    {
      userId: DEMO_FRIEND_B,
      username: "Noah",
      avatarMode: "momentum",
      level: 1,
      coins: 60,
      xp: 150,
      onboardingCompleted: true,
      mapCoachSeen: true,
      title: null,
      xpIntoLevel: 0,
      xpForNextLevel: null,
      itemsAssembled: 0,
      likes: 0,
    },
  ];
}

// the levels table
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
    {
      ownerId: DEMO_ME,
      version: ROOM_LAYOUT_VERSION,
      placements: createStarterRoomPlacements(),
      updatedAt: SEED_TS,
    },
    {
      ownerId: DEMO_FRIEND_A,
      version: ROOM_LAYOUT_VERSION,
      placements: [
        {
          instanceId: "a1",
          furnitureId: "lack-table",
          surface: { kind: "floor" },
          cell: { x: 6, y: 8 },
          rotSteps: 0,
        },
      ],
      updatedAt: SEED_TS,
    },
    {
      ownerId: DEMO_FRIEND_B,
      version: ROOM_LAYOUT_VERSION,
      placements: [
        {
          instanceId: "b1",
          furnitureId: "dalfred-stool",
          surface: { kind: "floor" },
          cell: { x: 14, y: 10 },
          rotSteps: 1,
        },
      ],
      updatedAt: SEED_TS,
    },
  ];
}

export function seedFriends(): Record<UserId, Friend[]> {
  return {
    [DEMO_ME]: [
      { userId: DEMO_FRIEND_A, since: SEED_TS },
      { userId: DEMO_FRIEND_B, since: SEED_TS },
    ],
    [DEMO_FRIEND_A]: [{ userId: DEMO_ME, since: SEED_TS }],
    [DEMO_FRIEND_B]: [{ userId: DEMO_ME, since: SEED_TS }],
  };
}

// no saves - only during session
export function seedBuilds(): BuildSave[] {
  return [];
}

// catalogue
export function seedBuildCatalog(): BuildCatalogRow[] {
  return [
    {
      id: asFurnitureId("dalfred-stool"),
      name: "DALFRED Stool",
      brand: "IKEA",
      type: "Table & Chair",
      durationMin: 10,
      assemblyModel: null,
      xpPerStep: 6,
      xpBonusOnComplete: 0,
    },
    {
      id: asFurnitureId("lack-table"),
      name: "LACK Table",
      brand: "IKEA",
      type: "Table & Chair",
      durationMin: 8,
      assemblyModel: null,
      xpPerStep: 6,
      xpBonusOnComplete: 0,
    },
    {
      id: asFurnitureId("eket-cabinet"),
      name: "EKET Cabinet",
      brand: "IKEA",
      type: "Shelf & Cabinet",
      durationMin: 35,
      assemblyModel: null,
      xpPerStep: 6,
      xpBonusOnComplete: 0,
    },
    {
      id: asFurnitureId("bekvam-stool"),
      name: "BEKVÄM Stool",
      brand: "IKEA",
      type: "Other",
      durationMin: 15,
      assemblyModel: null,
      xpPerStep: 6,
      xpBonusOnComplete: 0,
    },
  ];
}

// inventory
export function seedBuiltItems(): Record<
  FurnitureId,
  { name: string; category: ShopCategory }
> {
  return {
    "eket-cabinet": { name: "EKET Cabinet", category: "fur" },
    "bekvam-stool": { name: "BEKVÄM Stool", category: "fur" },
    "dalfred-stool": { name: "DALFRED Stool", category: "fur" },
    "lack-table": { name: "LACK Table", category: "fur" },
  } as Record<FurnitureId, { name: string; category: ShopCategory }>;
}

// completed furniture per user
export function seedCompleted(): Record<UserId, FurnitureId[]> {
  return {
    [DEMO_ME]: [asFurnitureId("lack-table")],
    [DEMO_FRIEND_A]: [
      "lack-table",
      "dalfred-stool",
      "eket-cabinet",
      "bekvam-stool",
    ].map(asFurnitureId),
    [DEMO_FRIEND_B]: [],
  };
}

// the purchasable catalog
const HERRINGBONE_MAPS: SurfaceMap[] = ["texture", "normal", "rough"];
const CREAM_PLASTER_MAPS: SurfaceMap[] = [
  "texture",
  "normal",
  "rough",
  "trim_texture",
  "trim_normal",
  "trim_rough",
];

export function seedShopItems(): ShopItem[] {
  return [
    {
      id: "herringbone-parquet",
      name: "Herringbone Parquet",
      category: "floor",
      price: 0,
      minLevel: 1,
      granted: true,
      surface: {
        tiling: { scale: [5.1, 5], offset: [0, -4] },
        edgeColor: [0.36, 0.22, 0.11],
        maps: HERRINGBONE_MAPS,
      },
    },
    {
      id: "cream-plaster",
      name: "Cream Plaster",
      category: "wall",
      price: 0,
      minLevel: 1,
      granted: true,
      surface: {
        tiling: { scale: [1, 1], offset: [0, 0] },
        trimTiling: { scale: [1, 1], offset: [0, 0] },
        maps: CREAM_PLASTER_MAPS,
      },
    },
    {
      id: "malm-chest",
      name: "MALM Chest",
      category: "fur",
      price: 150,
      minLevel: 1,
    },
    {
      id: "neiden-bedframe",
      name: "NEIDEN Bedframe",
      category: "fur",
      price: 120,
      minLevel: 1,
    },
    {
      id: "rosentorp-table",
      name: "ROSENTORP Table",
      category: "fur",
      price: 100,
      minLevel: 1,
    },
    {
      id: "window-wc-narrow",
      name: "Narrow WC Window",
      category: "win",
      price: 60,
      minLevel: 1,
    },
    {
      id: "window-double-hung",
      name: "Double-Hung Window",
      category: "win",
      price: 80,
      minLevel: 1,
    },
    {
      id: "window-pvc-single",
      name: "PVC Single Window",
      category: "win",
      price: 90,
      minLevel: 1,
    },
    {
      id: "window-sash",
      name: "Victorian Sash Window",
      category: "win",
      price: 120,
      minLevel: 1,
    },
    {
      id: "window-wood-classic",
      name: "Classic Wood Window",
      category: "win",
      price: 140,
      minLevel: 1,
    },
    {
      id: "painting-nature",
      name: "Nature Painting",
      category: "deco",
      price: 60,
      minLevel: 1,
    },
    {
      id: "sofa-modular",
      name: "Modular Sofa",
      category: "fur",
      price: 200,
      minLevel: 1,
    },
  ];
}

// the ticks in the shop grid, and the contents of each user's inventory
// ids MUST exist in seedShopItems above — the inventory filters to owned ids, so one with no row is silently dropped
export function seedInventory(): Record<UserId, ShopItemId[]> {
  return {
    [DEMO_ME]: [...STARTER_ROOM_ITEM_IDS],
    [DEMO_FRIEND_A]: ["malm-chest", "neiden-bedframe", "rosentorp-table"],
    [DEMO_FRIEND_B]: [],
  };
}

// the variants
export function seedItemVariants(): ItemVariant[] {
  const v = (
    itemId: string,
    variation: string | null,
    isDefault = false,
  ): ItemVariant => ({ itemId, variation, isDefault });
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
    v("window-wc-narrow", null, true),
    v("window-double-hung", null, true),
    v("window-pvc-single", null, true),
    v("window-sash", null, true),
    v("window-wood-classic", null, true),
    v("painting-nature", null, true),
    v("sofa-modular", null, true),
  ];
}

//room placements
export function seedPlaceableItems(): PlaceableRoomRow[] {
  return [
    {
      id: "dalfred-stool",
      source: "built",
      category: "fur",
      size: { x: 0.5, y: 0.79, z: 0.5 },
      baseOffsetY: 0.007,
      mount: "floor",
    },
    {
      id: "lack-table",
      source: "built",
      category: "fur",
      size: { x: 0.55, y: 0.45, z: 0.55 },
      baseOffsetY: 0,
      mount: "floor",
    },
    {
      id: "eket-cabinet",
      source: "built",
      category: "fur",
      size: { x: 0.37, y: 0.35, z: 0.75 },
      baseOffsetY: 0.175,
      mount: "floor",
    },
    {
      id: "bekvam-stool",
      source: "built",
      category: "fur",
      size: { x: 0.39, y: 0.5, z: 0.43 },
      baseOffsetY: 0,
      mount: "floor",
    },
    {
      id: "malm-chest",
      source: "bought",
      category: "fur",
      size: { x: 0.804, y: 1.004, z: 0.483 },
      baseOffsetY: 0,
      mount: "floor",
    },
    {
      id: "neiden-bedframe",
      source: "bought",
      category: "fur",
      size: { x: 0.96, y: 0.647, z: 1.95 },
      baseOffsetY: 0,
      mount: "floor",
    },
    {
      id: "rosentorp-table",
      source: "bought",
      category: "fur",
      size: { x: 1.101, y: 0.751, z: 1.101 },
      baseOffsetY: 0,
      mount: "floor",
    },
    {
      id: "window-wc-narrow",
      source: "bought",
      category: "win",
      size: { x: 0.504, y: 1.251, z: 0.165 },
      baseOffsetY: 0,
      mount: "wall",
      opensWall: true,
    },
    {
      id: "window-double-hung",
      source: "bought",
      category: "win",
      size: { x: 0.73, y: 1.04, z: 0.107 },
      baseOffsetY: 0,
      mount: "wall",
      opensWall: true,
    },
    {
      id: "window-pvc-single",
      source: "bought",
      category: "win",
      size: { x: 1.005, y: 1.256, z: 0.167 },
      baseOffsetY: 0,
      mount: "wall",
      opensWall: true,
    },
    {
      id: "window-sash",
      source: "bought",
      category: "win",
      size: { x: 1.061, y: 1.262, z: 0.218 },
      baseOffsetY: 0,
      mount: "wall",
      opensWall: true,
    },
    {
      id: "window-wood-classic",
      source: "bought",
      category: "win",
      size: { x: 1.239, y: 1.231, z: 0.349 },
      baseOffsetY: 0,
      mount: "wall",
      opensWall: true,
    },
    {
      id: "painting-nature",
      source: "bought",
      category: "deco",
      size: { x: 0.8, y: 0.6, z: 0.05 },
      baseOffsetY: 0,
      mount: "wall",
    },
    {
      id: "sofa-modular",
      source: "bought",
      category: "fur",
      size: { x: 1.9, y: 0.75, z: 1.275 },
      baseOffsetY: 0,
      mount: "floor",
      footprintMask: "XXXXXXXX/XXXXXXXX/XXXXXXXX/.....XXX/.....XXX/.....XX.",
    },
  ];
}

// likes per user
export function seedRoomLikes(): Record<UserId, UserId[]> {
  const likers = (n: number): UserId[] =>
    Array.from({ length: n }, (_, i) => `liker-${i}`);
  return {
    [DEMO_ME]: likers(4),
    [DEMO_FRIEND_A]: likers(12),
    [DEMO_FRIEND_B]: likers(1),
  };
}
