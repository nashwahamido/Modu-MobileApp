import type { AssetSrc, RenderStyleId } from "../game/core/type";

export type RoomFurnitureId = "DALFRED" | "LACK";

export type RoomFurnitureDefinition = {
  id: RoomFurnitureId;
  displayName: string;
  model: AssetSrc;
  styleModels?: Partial<Record<RenderStyleId, AssetSrc>>;
  sceneScale: number;
  footprint: {
    width: number;
    depth: number;
  };
};

// Room-only presentation metadata. Assembly instructions stay in game/content;
// this catalog owns only the finished models and their placement dimensions.
const DALFRED_MODEL = require("../assets/models/furnitures/DALFRED/DALFRED.glb");
const LACK_MODEL = require("../assets/models/furnitures/LACK/LACK.glb");
const LACK_COZY_MODEL = require("../assets/models/furnitures/LACK/LACK_cozy.glb");
const LACK_CARTOON_MODEL = require("../assets/models/furnitures/LACK/LACK_cartoon.glb");

const ROOM_FURNITURE: Record<RoomFurnitureId, RoomFurnitureDefinition> = {
  DALFRED: {
    id: "DALFRED",
    displayName: "DALFRED Stool",
    model: DALFRED_MODEL,
    sceneScale: 0.28,
    footprint: { width: 0.08, depth: 0.075 },
  },
  LACK: {
    id: "LACK",
    displayName: "LACK Table",
    model: LACK_MODEL,
    styleModels: {
      realistic: LACK_MODEL,
      cozy: LACK_COZY_MODEL,
      cartoon: LACK_CARTOON_MODEL,
    },
    sceneScale: 0.25,
    footprint: { width: 0.14, depth: 0.1 },
  },
};

export function getRoomFurnitureDefinition(
  itemId: string | null | undefined,
): RoomFurnitureDefinition | null {
  if (!itemId) return null;
  const normalized = itemId.toUpperCase() as RoomFurnitureId;
  return ROOM_FURNITURE[normalized] ?? null;
}

export function getRoomFurnitureModel(
  furniture: RoomFurnitureDefinition,
  renderStyle: RenderStyleId = "realistic",
): AssetSrc {
  return furniture.styleModels?.[renderStyle] ?? furniture.model;
}
