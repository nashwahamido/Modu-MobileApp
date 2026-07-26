// Shared placement state, lifted out of RoomExperience so a route can start placing an item without owning the room's local state. The room subscribes to this store to render the draggable furniture; the room keeps the view-layer bits (the Animated drag position, pan responder) to itself and only the logical placement state lives here.
// DORMANT: startPlacing() currently has no callers. The Inventory used to call it for one hardcoded id, which was dropped along with the placeholder sprite — placement comes back when items have real per-item room models.
import { create } from "zustand";

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
  // Back to a blank room. Used when switching accounts, so one player's placement never carries into the next.
  reset: () => void;
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
  // startNonce is deliberately NOT rewound — it only ever needs to differ from its last value.
  reset: () => set({ placing: false, placed: false, itemId: null }),
}));
