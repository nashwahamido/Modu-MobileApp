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

function ConfettiPiece({
  left, size, color, delay, duration, drift, fall,
}: { left: number; size: number; color: string; delay: number; duration: number; drift: number; fall: number }) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = withDelay(delay, withRepeat(withTiming(1, { duration, easing: Easing.linear }), 3, false));
  }, [delay, duration, t]);
  const anim = useAnimatedStyle(() => ({
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

export function ConfettiRain({
  delay,
  width: widthProp,
  height: heightProp,
  count = CONFETTI_COUNT,
  size = 1,
}: {
  delay: number;
  width?: number;
  height?: number;
  count?: number;
  size?: number;
}) {
  const win = useWindowDimensions();
  const width = widthProp ?? win.width;
  const height = heightProp ?? win.height;
  const pieces = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({
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