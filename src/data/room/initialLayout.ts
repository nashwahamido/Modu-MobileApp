import type { PlacedFurniture, RoomLayout, UserId } from "../core/types";
import { ROOM_LAYOUT_VERSION } from "../core/types";

export const STARTER_ROOM_ITEM_IDS = ["window-wood-classic", "painting-nature", "sofa-modular"] as const;

// Instance ids are the room editor's own `<itemId>#<n>` form, kept verbatim from the layout this was
// authored against: nothing derives meaning from them, they only have to be unique within the room.
export function createStarterRoomPlacements(): PlacedFurniture[] {
  return [
    {
      instanceId: "window-wood-classic#8",
      furnitureId: "window-wood-classic",
      surface: { kind: "wall", wall: "x-min" },
      cell: { x: 11, y: 4 },
      rotSteps: 0,
    },
    {
      instanceId: "painting-nature#2",
      furnitureId: "painting-nature",
      surface: { kind: "wall", wall: "z-max" },
      cell: { x: 4, y: 6 },
      rotSteps: 0,
    },
    {
      instanceId: "sofa-modular#3",
      furnitureId: "sofa-modular",
      surface: { kind: "floor" },
      cell: { x: 12, y: 10 },
      rotSteps: 3,
    },
  ];
}

export function createStarterRoomLayout(ownerId: UserId, updatedAt = new Date().toISOString()): RoomLayout {
  return {
    ownerId,
    version: ROOM_LAYOUT_VERSION,
    placements: createStarterRoomPlacements(),
    updatedAt,
  };
}
