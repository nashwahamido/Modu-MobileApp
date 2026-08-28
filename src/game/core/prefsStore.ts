// Display preferences — the look of the app and the room, kept out of the game store because nothing here takes part in an assembly transition. All session state today; see README for which home a preference belongs in.

import { create } from "zustand";
import type { TimeOfDayId } from "@/src/room/core/timeOfDay";
import type { RoomBackgroundId } from "@/src/room/ui/roomBackdrops";
// Type-only: the room's backdrop table carries image require()s, and the store must not pull those in.
import {
  BackdropId,
  Handedness,
  RenderStyleId,
  ThemeId,
} from "@/src/game/core/type";

interface PrefsState {
  renderStyle: RenderStyleId; // 3D look of the scene (own axis, not theme)
  backdrop: BackdropId; // what sits behind the build
  roomTimeOfDay: TimeOfDayId; // which hour the room's sun is set to; also picks which of roomBackground's three shots shows
  roomBackground: RoomBackgroundId; // the photo outside the room's window
  roomAvatarVisible: boolean; // is the companion in the room; off UNMOUNTS it, deliberately (README)
  theme: ThemeId; // display theme: backdrop + thumbnails
  handedness: Handedness; // which hand drives the build; MIRRORS the HUD. Out of `settings` on purpose (README)
  assembleDark: boolean; // dark BUILD screens while the rest of the app stays put

  setRenderStyle: (style: RenderStyleId) => void;
  setBackdrop: (backdrop: BackdropId) => void;
  setRoomTimeOfDay: (time: TimeOfDayId) => void;
  setRoomBackground: (background: RoomBackgroundId) => void;
  setRoomAvatarVisible: (visible: boolean) => void;
  setTheme: (theme: ThemeId) => void;
  setHandedness: (handedness: Handedness) => void;
  setAssembleDark: (on: boolean) => void;
}

// Defaults are argued for in the README; change one there too.
export const usePrefsStore = create<PrefsState>((set) => ({
  renderStyle: "realistic",
  backdrop: "grid",
  roomTimeOfDay: "afternoon",
  roomBackground: "bg7",
  roomAvatarVisible: true,
  theme: "light",
  handedness: "right",
  assembleDark: false,

  setRenderStyle: (renderStyle) => set({ renderStyle }),
  setBackdrop: (backdrop) => set({ backdrop }),
  setRoomTimeOfDay: (roomTimeOfDay) => set({ roomTimeOfDay }),
  setRoomBackground: (roomBackground) => set({ roomBackground }),
  // Not persisted, like the two room prefs above — but the one most likely to read as a bug (README).
  setRoomAvatarVisible: (roomAvatarVisible) => set({ roomAvatarVisible }),
  setTheme: (theme) => set({ theme }),
  setHandedness: (handedness) => set({ handedness }),
  setAssembleDark: (assembleDark) => set({ assembleDark }),
}));
