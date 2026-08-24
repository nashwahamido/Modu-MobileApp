// Where the shop's and the inventory's panels sit on the screen.
//
// Shared, because the two popups are twins: they open on the same surface, in the same place, and a
// difference between them reads as a bug. The rule they follow is the one the overlays' own headers
// set out — anything that must LOOK the same is a shared helper, never a number copied into both.
//
// PHONES KEEP THE AUTHORED INSETS EXACTLY. On a phone the panel is meant to fill the screen with a
// margin; there is no room for anything else. A tablet is the opposite problem: the same fixed 62pt
// margin on a 1280dp screen leaves a panel that spans nearly the whole display, and a four-column
// grid inside it blows the tiles up to a size nothing needs. So the tablet insets are PROPORTIONAL —
// a share of the screen rather than a count of points — which keeps the panel the same shape on any
// tablet instead of tracking one model's dimensions.
import { useWindowDimensions } from "react-native";

import { useScreenInsets } from "@/src/hooks/use-safe-insets";

/** Below this short side the device is a phone; matches TABLET_MIN_SHORT_DP in game/ui/system/theme.ts. */
const TABLET_MIN_SHORT_DP = 600;

/** The authored phone insets. */
const PHONE_SIDE = 62;
const PHONE_VERTICAL = 18;

/** The tablet insets, as a share of each axis. Bigger = a smaller panel. */
const TABLET_VERTICAL_FRACTION = 0.08;

/**
 * The tablet SIDE inset, as a share of the width, per screen shape. Bigger = a narrower panel.
 *
 * Keyed to the screen's aspect for the same reason the category board's width is: a 16:10 tablet has
 * 200-odd points of width a 4:3 one does not, and the inset is a SHARE of that width — so the squarer
 * the screen, the less panel is left once both margins are taken, and the shorter everything measured
 * from it comes out. A 4:3 tablet (1080x810pt) therefore keeps more of its width than a 16:10 one.
 *
 * Anchored at the two shapes in use and interpolated between; anything squarer or wider is clamped to
 * the nearer end, so an unusual tablet lands on a tested value rather than off the scale.
 */
const TABLET_SIDE_BY_ASPECT = [
  { aspect: 4 / 3, side: 0.13 },
  { aspect: 16 / 10, side: 0.16 },
];

function tabletSideFraction(aspect: number): number {
  const [square, wide] = TABLET_SIDE_BY_ASPECT;
  if (aspect <= square.aspect) return square.side;
  if (aspect >= wide.aspect) return wide.side;
  const t = (aspect - square.aspect) / (wide.aspect - square.aspect);
  return square.side + (wide.side - square.side) * t;
}

/**
 * The grid's side padding inside the panel — where the leftmost tile starts and the rightmost ends.
 *
 * Shared, because the wooden board is sized to match that span: with the number living in each overlay
 * the board could only guess at it, and the two would drift the moment one grid was retuned.
 */
export const GRID_EDGE = 22;

/**
 * The panel's own side padding — the gap between the panel's rounded edge and anything inside it.
 *
 * Shared for the same reason GRID_EDGE is: the category board is allowed to run PAST the grid, and the
 * only thing stopping it running past the panel is this number. The panel clips (overflow: hidden), so
 * a board wider than its own padding allows loses its rounded ends to a straight cut.
 */
export const PANEL_EDGE = 22;

export interface PopupInsets {
  padTop: number;
  padSide: number;
  padBottom: number;
}

export function usePopupInsets(): PopupInsets {
  const safe = useScreenInsets();
  const { width, height } = useWindowDimensions();
  const tablet = Math.min(width, height) >= TABLET_MIN_SHORT_DP;

  const aspect = Math.max(width, height) / Math.min(width, height);
  const side = tablet ? Math.round(width * tabletSideFraction(aspect)) : PHONE_SIDE;
  const vertical = tablet ? Math.round(height * TABLET_VERTICAL_FRACTION) : PHONE_VERTICAL;

  return {
    // safe.side, not left or right: the panel is centred, so both edges take the LARGER inset or it sits off-centre
    padTop: vertical + safe.top,
    padSide: side + safe.side,
    padBottom: vertical + safe.bottom,
  };
}
