// Shared placement state, lifted out of RoomExperience so a route (the Inventory) can start
// placing an item without owning the room's local state. The room subscribes to this store to
// render the draggable furniture; the Inventory calls startPlacing() then navigates to the room.
// The room keeps the view-layer bits (the Animated drag position, pan responder) to itself —
// only the logical placement state lives here.
import { create } from "zustand";

// The one owned item that has a real placeable model today — tapping it drops the Cabinet in.
export const PLACEABLE_ITEM_ID = "shelving-units-wooden";

interface PlacementState {
  // Actively being dragged into position.
  placing: boolean;
  // Committed to the scene (can be re-edited).
  placed: boolean;
  // Which item is in play, or null when nothing is placed.
  itemId: string | null;
  // Bumped on each FRESH start so the room can reset the drag position. Editing does not bump it,
  // so re-editing a placed piece keeps it where the player left it.
  startNonce: number;
  startPlacing: (itemId: string) => void;
  editPlacement: () => void;
  confirmPlacement: () => void;
  removePlacement: () => void;
}

export const usePlacementStore = create<PlacementState>()((set) => ({
  placing: false,
  placed: false,
  itemId: null,
  startNonce: 0,
  startPlacing: (itemId) => set((s) => ({ placing: true, placed: false, itemId, startNonce: s.startNonce + 1 })),
  editPlacement: () => set((s) => (s.placed && !s.placing ? { placing: true } : {})),
  confirmPlacement: () => set({ placing: false, placed: true }),
  removePlacement: () => set({ placing: false, placed: false, itemId: null }),
}));
