// How much the celebration overlays grow on a tablet.
//
// The three of them — the build's completion panel, the cluster card and the room's level-up — are
// the same kind of surface: one thing on screen, generous padding, nothing dense, and the player is
// meant to stop and look. That is exactly the shape theme.ts describes as safe to scale, and the
// opposite of the assembly HUD or the catalogue, which are laid out to the point and stay fixed.
//
// NO LONGER TRIMMED. It was, at 0.82, on the reading that these are cards floating over a scene the
// way the room's HUD frames one — and that is not what any of the three does: each dims the whole
// screen behind itself first (BuildComplete's SCRIM, the other two over t.scrim), so there is no live
// scene left for them to keep out of the way of. At 0.82 they came out at 1.11 on a 4:3 iPad, which
// is a phone-sized card in the middle of a tablet, and visibly smaller than the project map and the
// settings panel that bracket them in the same session.
//
// One number for all three, deliberately. They appear within seconds of each other — finish a stage,
// finish the build, walk into the room and level up — and three cards at three sizes reads as three
// different apps rather than one moment continuing.
//
// It stays a named multiplier rather than becoming a bare re-export: this is the dial for how much
// presence these three have, and the day one of them reads as a slab, it is the number to turn.
import { useUiScale } from "@/src/game/ui/system/theme";

/** Multiplier on the shared tablet scale. 1 = follow it exactly. */
const CELEBRATION_TRIM = 1;

/**
 * The scale the celebration cards use.
 *
 * PHONES ARE PINNED AT EXACTLY 1, and the guard is what guarantees it: useUiScale returns 1 below a
 * 600dp short side, and multiplying that by a trim would shrink a layout that is already correct.
 * The Math.max is the second guard, and it is kept even at a trim of 1 — it costs nothing and it is
 * what stops a future trim from quietly rendering these smaller on a tablet than on a phone.
 *
 * On the 1080x810 iPad this comes out at 1.35, and 1.60 on a 1280x800 tablet — the shared ceiling,
 * which already clamps on the long side, so a card laid out to 520dp still has room around it.
 */
export function useCelebrationScale(): number {
  const k = useUiScale();
  return k === 1 ? 1 : Math.max(1, k * CELEBRATION_TRIM);
}