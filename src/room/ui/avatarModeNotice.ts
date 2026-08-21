import { create } from "zustand";

interface AvatarModeNoticeState {
  pendingClearPath: boolean;
  pebblePrompt: "needsSpace" | "ready" | null;
  requestClearPath: (ready: boolean) => void;
  markClearPathReady: () => void;
  dismissPebblePrompt: () => void;
  cancelClearPathRequest: () => void;
  completeClearPathRequest: () => void;
}

/** Cross-layer room notice: Settings is a modal above RoomExperience, so a
 * failed Clear Path switch raises the request here, closes Settings, and lets
 * the already-mounted room present it in the same popup system as its guides. */
export const useAvatarModeNotice = create<AvatarModeNoticeState>()((set) => ({
  pendingClearPath: false,
  pebblePrompt: null,
  requestClearPath: (ready) =>
    set({ pendingClearPath: true, pebblePrompt: ready ? "ready" : "needsSpace" }),
  markClearPathReady: () => set({ pebblePrompt: "ready" }),
  // Dismissing the first prompt keeps the request alive while furniture moves.
  dismissPebblePrompt: () => set({ pebblePrompt: null }),
  cancelClearPathRequest: () =>
    set({ pendingClearPath: false, pebblePrompt: null }),
  completeClearPathRequest: () =>
    set({ pendingClearPath: false, pebblePrompt: null }),
}));
