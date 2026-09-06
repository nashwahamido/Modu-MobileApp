// How long a vertical drag track may be ON THIS SCREEN, and where every drag control's wrap sits.

import { useWindowDimensions } from "react-native";

import { useHudInsets } from "@/src/hooks/use-safe-insets";
import { TASK_CONTROL_BOTTOM } from "@/src/game/ui/hud/hudChrome";

// The authored length, and the most the track is ever given — a tablet has room for more, but a drag control that keeps growing with the screen stops being one thumb's worth of travel.
export const TRACK_MAX = 220;
// The floor. Below this the track is too short to read as a track at all, so a truly tiny screen gets an overlap rather than a stub.
export const TRACK_MIN = 128;

// The caption pill above the track, plus the wrap's 8pt gap.
const CAPTION_BLOCK = 30;
// Kept clear at the top for the objective bar (top:8, ~40 tall) plus a little air.
const TOP_ROW_CLEARANCE = 56;

//
// The track length to draw and to divide the drag by.
//
// `max` is for a control that wants to be shorter than the family even where there is room — the keyhole lock shove is a short travel and looks wrong on a full-length track.
export function useTrackLength(max: number = TRACK_MAX): number {
  const { width, height } = useWindowDimensions();
  const hud = useHudInsets();
  // Landscape only (app.json locks it), so the vertical is the window's SHORT side — reading `height` directly would give the long side for the frame or two around a rotation.
  const usable = Math.min(width, height) - hud.top - hud.bottom;
  const room = usable - TASK_CONTROL_BOTTOM - CAPTION_BLOCK - TOP_ROW_CLEARANCE;
  return Math.round(Math.max(TRACK_MIN, Math.min(max, room)));
}
