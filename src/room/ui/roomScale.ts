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
  return k === 1 ? 1 : k * TOP_STATS_LIFT;
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

export function useBottomBarScale(): number {
  const k = useRoomScale();
  return k === 1 ? 1 : k * BOTTOM_BAR_TRIM;
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
