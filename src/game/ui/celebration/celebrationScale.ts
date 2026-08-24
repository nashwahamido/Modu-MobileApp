// How much the celebration overlays grow on a tablet.
//
// The three of them — the build's completion panel, the cluster card and the room's level-up — are
// the same kind of surface: one thing on screen, generous padding, nothing dense, and the player is
// meant to stop and look. That is exactly the shape theme.ts describes as safe to scale, and the
// opposite of the assembly HUD or the catalogue, which are laid out to the point and stay fixed.
//
// TRIMMED BELOW THE APP SCALE, for the same reason the room trims it: these are cards floating over a
// scene rather than pages filling the screen. At the full 1.35 an iPad's completion panel is a slab;
// the point of growing it is that it stays readable at arm's length, not that it claims the display.
//
// One number for all three, deliberately. They appear within seconds of each other — finish a stage,
// finish the build, walk into the room and level up — and three cards at three sizes reads as three
// different apps rather than one moment continuing.
import { useUiScale } from "@/src/game/ui/system/theme";

/** Multiplier on the shared tablet scale. */
const CELEBRATION_TRIM = 0.82;

/**
 * The scale the celebration cards use.
 *
 * PHONES ARE PINNED AT EXACTLY 1, and the guard is what guarantees it: useUiScale returns 1 below a
 * 600dp short side, and multiplying that by a trim would shrink a layout that is already correct.
 * The Math.max is the second guard — a borderline tablet returns only ~1.2, which a trim would pull
 * under 1, and a tablet must never render these smaller than a phone does.
 *
 * On the 1080x810 iPad this comes out at 1.11: enough that a 19pt title reads across a desk, not so
 * much that the panel stops being a card.
 */
export function useCelebrationScale(): number {
  const k = useUiScale();
  return k === 1 ? 1 : Math.max(1, k * CELEBRATION_TRIM);
}