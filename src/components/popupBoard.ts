// The cream plank that heads every popup over the room — the shop's category row, the inventory's,
// and the friend picker's title — and the geometry that sizes it.
//
// Shared for the reason the overlays' own headers give: anything that must LOOK the same across those
// surfaces is a shared helper, never a number copied into each. The board is the most visible thing
// they have in common, and it is sized by a solve rather than a constant, so a copy would not merely
// drift — it would drift differently on every screen shape.
import type { ImageSourcePropType } from "react-native";

import { GRID_EDGE, PANEL_EDGE } from "./popupInsets";

export const POPUP_BOARD: ImageSourcePropType = require("@/src/assets/ui/icons/cream-panel.png");

/** The PNG's real proportions (2639x355). Height follows width by this, so the panel is never squashed
 *  or stretched. Re-measure if the artwork is re-exported. */
export const BOARD_ASPECT = 2639 / 355;

/** Drawn TALLER than the artwork's own proportion, by this much.
 *
 *  A deliberate distortion, and safe here in a way it would not have been on the wooden plank this
 *  replaced: the panel is a flat cream shape with no grain or detail to skew, so stretching it reads as
 *  a taller panel rather than as squashed artwork. It also needs resizeMode="stretch" at the call site —
 *  `contain` would letterbox the drawing inside the taller box instead of filling it. */
export const BOARD_STRETCH_Y = 1.18;

/** How far the board hangs below the panel's top edge, ON TABLETS ONLY. The panel's own paddingTop is
 *  authored for a phone, where it is most of the panel's height; on a tablet the same 18pt leaves the
 *  plank pinned to the border with the content stranded below it. */
export const BOARD_DROP = 16;

/** How much cream is left between the board's rounded end and the panel's own edge, at the widest.
 *
 *  A CEILING, not the usual case. It exists because the panel CLIPS (overflow: hidden) — a board solved
 *  past its edge does not overhang, it loses its stadium ends to a straight cut — so anything that
 *  widens the board later runs into a rounded stop rather than a square one. */
export const BOARD_EDGE_BREATH = 4;

/** The halo behind text drawn ON the board. RN has no text stroke, so it is the same word repeated
 *  behind itself once per direction; this is the colour those copies take. Cream rather than white:
 *  the point is to lift ink off the plank without ringing it. */
export const BOARD_LABEL_OUTLINE = "#FAF7F2";

/**
 * How far past the tile span the panel runs, by screen shape. TABLETS ONLY.
 *
 * Keyed to the screen's ASPECT rather than to a model, because that is what the problem actually is. A
 * 4:3 tablet (an iPad at 1080x810pt) has a canvas 200pt narrower than a 16:10 one at the same height,
 * and the popup's side inset is a SHARE of the width — so the panel, the tile span and the board all
 * come out proportionally shorter, and the header ends up with more empty space around a smaller panel.
 * The squarer the screen, the more of it the panel takes back.
 *
 * Anchored at the two shapes in use and interpolated between; anything squarer or wider than those is
 * clamped, so an unusual tablet lands on one of the tested ends rather than off the scale.
 */
const BOARD_WIDEN_BY_ASPECT = [
  { aspect: 4 / 3, widen: 1.02 },
  { aspect: 16 / 10, widen: 1.06 },
];

export function tabletBoardWiden(aspect: number): number {
  const [square, wide] = BOARD_WIDEN_BY_ASPECT;
  if (aspect <= square.aspect) return square.widen;
  if (aspect >= wide.aspect) return wide.widen;
  const t = (aspect - square.aspect) / (wide.aspect - square.aspect);
  return square.widen + (wide.widen - square.widen) * t;
}

/**
 * The board's width when it is sized to SPAN THE CONTENT: from the leftmost tile's left edge to the
 * rightmost tile's right edge. Header and content sit inside the same panel padding, so the header's
 * measured width less the grid's own edge padding is that span.
 *
 * @param available the header's measured width
 * @param aspect    the screen's long side over its short side
 */
export function spanBoardWidth(available: number, aspect: number): number {
  return Math.min(
    (available - GRID_EDGE * 2) * tabletBoardWiden(aspect),
    // The panel's inner edge, from the inside: the header sits within the panel's own side padding, so
    // the board may run out over that padding but no further.
    available + (PANEL_EDGE - BOARD_EDGE_BREATH) * 2,
  );
}

/** The board's drawn height for a given width. Never set this independently — the aspect is what keeps
 *  the artwork from skewing, and the stretch above is the one deliberate exception to it. */
export function boardHeight(width: number): number {
  return (width / BOARD_ASPECT) * BOARD_STRETCH_Y;
}
