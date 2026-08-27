// How long a vertical drag track may be ON THIS SCREEN, and where every drag control's wrap sits.
//
// The four sliders were authored at a flat 220pt track. That was measured against a tablet: on a phone in landscape the HUD is only ~330pt tall once the safe-area insets are taken off, and 220 of track plus its caption plus the wrap's own bottom offset does not fit between the toggles row and the objective bar — the track ran under the auto / Focus / Spot chips at the bottom and its caption pill collided with the bar at the top. Shortening the track for everyone would have made it a worse control on the device it fits on, so the length is computed instead: 220 wherever there is room for 220, less where there is not.
//
// THE LENGTH IS ALSO THE GESTURE'S SCALE — every one of these controls divides the finger's travel by it — so a shorter track means a shorter drag, not a slower one. That is the behaviour we want: the drag still runs the length of the thing the player can see.

import { useWindowDimensions } from "react-native";

import { useHudInsets } from "@/src/hooks/use-safe-insets";
import { TASK_CONTROL_BOTTOM } from "@/src/game/ui/hud/hudChrome";

/** The authored length, and the most the track is ever given — a tablet has room for more, but a drag control that keeps growing with the screen stops being one thumb's worth of travel. */
export const TRACK_MAX = 220;
/** The floor. Below this the track is too short to read as a track at all, so a truly tiny screen gets an overlap rather than a stub. */
export const TRACK_MIN = 128;

/** The caption pill above the track, plus the wrap's 8pt gap. */
const CAPTION_BLOCK = 30;
/** Kept clear at the top for the objective bar (top:8, ~40 tall) plus a little air. */
const TOP_ROW_CLEARANCE = 56;

/**
 * The track length to draw and to divide the drag by.
 *
 * `max` is for a control that wants to be shorter than the family even where there is room — the keyhole lock shove is a short travel and looks wrong on a full-length track.
 */
export function useTrackLength(max: number = TRACK_MAX): number {
  const { width, height } = useWindowDimensions();
  const hud = useHudInsets();
  // Landscape only (app.config.ts locks it), so the vertical is the window's SHORT side — reading `height` directly would give the long side for the frame or two around a rotation.
  const usable = Math.min(width, height) - hud.top - hud.bottom;
  const room = usable - TASK_CONTROL_BOTTOM - CAPTION_BLOCK - TOP_ROW_CLEARANCE;
  return Math.round(Math.max(TRACK_MIN, Math.min(max, room)));
}
