// The celebration rain, shared. Lives here rather than inside BuildComplete because the catalogue plays the same effect on an already-assembled model — one confetti, so the two cannot drift apart in colour, count or pace.
import { useEffect, useMemo } from "react";
import { ACCENT_LIGHT } from "@/src/game/ui/system/theme";
import { StyleSheet, useWindowDimensions, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
} from "react-native-reanimated";

const CONFETTI_COLORS = ["#A97480", ACCENT_LIGHT, "#CCA16C", "#7D8B6E", "#F3EFE8"];
const CONFETTI_COUNT = 26;

/** One falling scrap. Sways as it drops and spins on the way down — a piece that only translates
 *  reads as a falling brick, and the sway is most of what sells it as paper. */
function ConfettiPiece({
  left, size, color, delay, duration, drift, fall,
}: { left: number; size: number; color: string; delay: number; duration: number; drift: number; fall: number }) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = withDelay(delay, withRepeat(withTiming(1, { duration, easing: Easing.linear }), 3, false));
  }, [delay, duration, t]);
  const anim = useAnimatedStyle(() => ({
    // Hidden before it starts, and fading over the last fifth so it never pops out of existence mid-screen.
    opacity: t.value === 0 ? 0 : 1 - Math.max(0, (t.value - 0.8) / 0.2),
    transform: [
      { translateY: -40 + t.value * fall },
      { translateX: Math.sin(t.value * Math.PI * 3) * drift },
      { rotate: `${t.value * 540}deg` },
    ],
  }));
  return (
    <Animated.View
      style={[
        { position: "absolute", top: 0, left, width: size, height: size * 0.6, borderRadius: 1, backgroundColor: color },
        anim,
      ]}
    />
  );
}

/** The celebration, once the result has finished assembling itself on screen. The spread is derived
 *  from the index rather than Math.random: a re-render must not reshuffle scraps that are mid-fall. */
export function ConfettiRain({
  delay,
  width: widthProp,
  height: heightProp,
  count = CONFETTI_COUNT,
  size = 1,
}: {
  delay: number;
  /** The box to rain INSIDE. Defaults to the window, which is the full-screen celebration; pass a
   *  card's measured size to keep the fall within it. */
  width?: number;
  height?: number;
  count?: number;
  /** Scales the scraps and their drift. A card-sized burst needs smaller paper than a screen-sized
   *  one, or 26 pieces at full size read as debris rather than confetti. */
  size?: number;
}) {
  const win = useWindowDimensions();
  const width = widthProp ?? win.width;
  const height = heightProp ?? win.height;
  const pieces = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({
        // Pixels, not a percent string: RN types `left` as DimensionValue, which takes a number or a `${number}%` template literal — a plain string is not assignable to it.
        left: (((i * 37) % 100) / 100) * width,
        size: (6 + (i % 3) * 3) * size,
        color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
        delay: delay + (i % 9) * 120,
        duration: 2000 + (i % 5) * 280,
        drift: ((i % 5) - 2) * 16 * size,
      })),
    [count, delay, size, width],
  );
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {pieces.map((p, i) => (
        <ConfettiPiece key={i} {...p} fall={height + 60} />
      ))}
    </View>
  );
}