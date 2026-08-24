// How much the room's HUD grows on a tablet.
//
// The app already has a shared scale (useUiScale in game/ui/system/theme.ts): 1 on phones, and on a
// tablet the smaller of short/360 and long/800, capped at 1.75. That is the ceiling every screen
// agrees on. This trims it for the room, which is a diorama you look INTO — its chrome frames the
// scene rather than being the screen, so it wants to grow noticeably LESS than a full-page layout
// like onboarding does.
//
// PHONES ARE UNTOUCHED, and the guard below is what guarantees it: useUiScale returns exactly 1 under
// a 600dp short side, and multiplying that by a trim would SHRINK a layout that is already correct.
//
// It is deliberately device-independent: nothing here names a tablet model. A Tab A8 (1280x800dp)
// lands at 1.20, an iPad Air 3 (1112x834) at 1.04, a 12.9" iPad Pro at 1.28 — each from its own
// screen, so a tablet nobody has tested on still gets a sensible size.
import { useWindowDimensions } from "react-native";

import { useUiScale } from "@/src/game/ui/system/theme";

/** Multiplier on the shared tablet scale. 1 = follow it exactly; lower = a smaller room HUD. */
const ROOM_UI_TRIM = 0.75;

export function useRoomScale(): number {
  return trim(useUiScale(), ROOM_UI_TRIM);
}

/**
 * The bottom bar's own trim, ON TOP of the room's.
 *
 * It is the one surface that grows in BOTH directions at once: five items on a row, so the scale
 * widens it as much as it heightens it, and it ends up claiming a band across the whole screen. The
 * pills and discs opposite are small and isolated, and want the full room scale — so this is a
 * per-surface adjustment rather than a reason to trim everything.
 *
 * This one is allowed BELOW 1 — the bar is deliberately smaller on a tablet than on a phone. That is
 * the opposite of what the clamp in `trim` protects against, and it is intentional here rather than a
 * mistake: a phone's bar spans a 800dp screen, and the same bar on a 1280dp one has half again as
 * much room to sit in, so it can be relatively slimmer and still be an easy target. Phones are still
 * pinned at exactly 1 by the guard below.
 */
const BOTTOM_BAR_TRIM = 0.95;

/**
 * The coins and level pills, which take a touch MORE than the rest of the HUD.
 *
 * They carry the only live numbers on the screen — a balance and a level — and they sit in the top
 * corner against the scene rather than on a panel, which is the least forgiving place to read small
 * type. The discs opposite are pictures and do not need it.
 */
const TOP_STATS_LIFT = 1.1;

export function useTopStatsScale(): number {
  const k = useRoomScale();
  // The phone guard is the shape test itself: it is false below a 600dp short side, so a phone's
  // exact 1 goes through untouched — see useSquareTablet.
  const square = useSquareTablet();
  return (k === 1 ? 1 : k * TOP_STATS_LIFT) * (square ? TOP_STATS_SQUARE_LIFT : 1);
}

/**
 * The left column — settings, the ceiling light, the hour — a touch above the room's baseline too.
 *
 * Three discs stacked against the scene, each a single tap target with nothing around it to lend it
 * scale. At the baseline they read as small controls parked in a corner of a large screen.
 */
const LEFT_COLUMN_LIFT = 1.12;

export function useLeftColumnScale(): number {
  const k = useRoomScale();
  return k === 1 ? 1 : k * LEFT_COLUMN_LIFT;
}

/**
 * THE SQUARISH-TABLET LIFTS, one per surface, on top of everything above.
 *
 * The shared scale clamps on the LONG side as well as the short one (min of short/360 and long/800),
 * and a 4:3 tablet is the shape that clamp bites hardest on: a 1080x810dp panel has a generous short
 * side but a long side barely over the 800 the clamp measures against, so it lands near 1.0 — and the
 * trims above then hold it there. The result is HUD drawn at phone size in a tablet-sized room.
 *
 * A 16:10 tablet does not have this problem: its long side runs well past 800, so it earns its scale
 * from the clamp and needs nothing here. Hence lifts keyed to the screen's SHAPE rather than bigger
 * trims, which would inflate every tablet to fix one.
 *
 * One constant per surface rather than a single shared number, for the same reason the trims above
 * are separate: these are tuned by eye against different things — a bar spanning the screen, a pair of
 * pills read at a glance — and a shape fix is no reason to fuse them.
 */
const BOTTOM_BAR_SQUARE_LIFT = 1.15;
const TOP_STATS_SQUARE_LIFT = 1.15;

/** Below this short side the device is a phone; matches TABLET_MIN_SHORT_DP elsewhere in the app. */
const TABLET_MIN_SHORT_DP = 600;

/** Squarer than this counts as a 4:3 tablet. 4:3 is 1.333 and 16:10 is 1.6, so the bar sits between
 *  the two — it catches an iPad-shaped screen (and the 1260x1620 @264ppi panel, which is 1.286) and
 *  leaves every widescreen tablet exactly as it was. */
const SQUARE_MAX_ASPECT = 1.4;

/** Is this one of those screens? False on every phone, so a caller can apply its lift unconditionally. */
function useSquareTablet(): boolean {
  const { width, height } = useWindowDimensions();
  const short = Math.min(width, height);
  const long = Math.max(width, height);
  return short >= TABLET_MIN_SHORT_DP && long / short <= SQUARE_MAX_ASPECT;
}

export function useBottomBarScale(): number {
  const k = useRoomScale();
  // Phones are still pinned at exactly 1: the shape test is false there, so this multiplies the
  // phone's 1 by 1. The rail and the standalone assemble button share this hook and are the PHONE
  // layout, which is why the guard has to live in the test rather than at the call site.
  const square = useSquareTablet();
  return (k === 1 ? 1 : k * BOTTOM_BAR_TRIM) * (square ? BOTTOM_BAR_SQUARE_LIFT : 1);
}

/**
 * Applies a trim without ever dropping BELOW the phone size.
 *
 * Two ways that could happen, and both are real: a phone returns exactly 1, so trimming it would
 * shrink a layout that is already correct; and a borderline tablet — a 600dp short side with a 960dp
 * long side — returns only 1.2, which two trims would pull under 1. A tablet must never render the
 * room smaller than a phone does.
 */
function trim(k: number, factor: number): number {
  return k === 1 ? 1 : Math.max(1, k * factor);
}
