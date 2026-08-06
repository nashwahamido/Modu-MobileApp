// The slide-up-into-the-scene presentation, as one reusable piece of motion.
//
// This is the transition the shop and inventory ROUTES used to get for free.
// They lived in the (presentation) group, which app/_layout presents with `presentation: "modal"`, so the OS slid them up over the scene and dimmed what was behind them. Both surfaces are popups inside the room now — plain conditionally-rendered views — so that motion had to be rebuilt rather than inherited.
//
// The numbers are the ones OverlaySheet had already tuned against the real OS transition, so they live here and it imports them too. Two copies of a feel is worse than two copies of a colour: nobody can diff "smooth".
//
// WHY THE CURVE MATTERS: decelerating on the way in (fast start, gentle settle) is what makes a sheet feel like it was thrown and caught. A linear glide is the single thing that makes a hand-rolled sheet read as cheap, and it is the first thing to check if this ever stops feeling right.
import { useCallback, useEffect, useRef } from "react";
import { Animated, Easing, useWindowDimensions } from "react-native";

export const SLIDE_UP = {
  /** Arriving. Matches the OS modal presentation the (presentation) routes used to get for free. */
  enterMs: 360,
  /** Leaving runs quicker than arriving, as the OS one does — a dismissal should feel lighter than an entrance. */
  exitMs: 260,
  /** Decelerate in: fast start, gentle settle. */
  enterEasing: Easing.out(Easing.cubic),
  /** Accelerate out: the mirror of the entrance, so the sheet drops away rather than drifting. */
  exitEasing: Easing.in(Easing.cubic),
  /** The small in-place nudge a CENTRED dialog uses instead of a full-height travel. */
  centerTravel: 48,
} as const;

/**
 * Drives a bottom-anchored sheet's entrance and exit.
 *
 * Mounting IS opening, so the entrance runs on mount with no call needed. Closing is NOT: call
 * `requestClose` instead of the caller's own `onClose`, and it runs the exit animation first, handing
 * control back only once the sheet is off-screen. That is the whole reason this returns a callback — a
 * conditionally-rendered overlay unmounts the instant its parent's state flips, which kills any exit
 * animation before its first frame.
 *
 * @param onClosed the parent's dismiss handler, called once the sheet has finished leaving
 */
export function useSlideUpPresentation(onClosed: () => void) {
  const { height } = useWindowDimensions();
  const anim = useRef(new Animated.Value(0)).current;
  // Guards a second dismiss: two quick taps on the scrim would otherwise queue two exits and call the parent back twice, with the second call landing after the overlay is already gone.
  const closing = useRef(false);

  useEffect(() => {
    Animated.timing(anim, {
      toValue: 1,
      duration: SLIDE_UP.enterMs,
      easing: SLIDE_UP.enterEasing,
      useNativeDriver: true,
    }).start();
  }, [anim]);

  const requestClose = useCallback(() => {
    if (closing.current) return;
    closing.current = true;
    Animated.timing(anim, {
      toValue: 0,
      duration: SLIDE_UP.exitMs,
      easing: SLIDE_UP.exitEasing,
      useNativeDriver: true,
    }).start(() => {
      // Called on interruption as well as completion, on purpose: an animation cut short must still dismiss, or the overlay is stranded open with no way back out.
      onClosed();
    });
  }, [anim, onClosed]);

  // Travels a full screen height, so the sheet starts genuinely off-screen rather than peeking.
  const translateY = anim.interpolate({ inputRange: [0, 1], outputRange: [height, 0] });

  return {
    /** Put this LAST in the panel's style array, and on anything that should ride up with it. */
    sheetStyle: { opacity: anim, transform: [{ translateY }] },
    /** The dim fades in as the sheet rises, which is what the OS transition does. */
    scrimStyle: { opacity: anim },
    requestClose,
  };
}
