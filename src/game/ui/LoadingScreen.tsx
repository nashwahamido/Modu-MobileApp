import { useEffect } from "react";
import { StyleSheet, Text, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { RADIUS, SPACE, TYPE, useTheme } from "@/src/game/ui/theme";

/**
 * Standalone full-screen loading page shown while the furniture GLB streams in. Opaque
 * (covers the still-empty scene AND the HUD) so it reads as its own screen, not an overlay.
 *
 * Layout is roughed in for the planned art pass:
 *   ┌── avatar slot ──┐   ← drop the avatar animation in here (Lottie / Rive / sprite).
 *   │  (placeholder)  │      Keep the AVATAR container; replace its children.
 *   └─────────────────┘
 *        Loading…          ← caption
 *   [▓▓▓▓▓░░░░░░]          ← progress bar (FAUX — see below)
 *
 * The bar is FAUX on purpose: react-native-filament's useModel reports only loading/loaded,
 * with no byte progress. It eases toward 90% and the whole screen unmounts (the parent stops
 * rendering it) the moment the model is loaded, so it never has to fake a 100% frame. The
 * animation runs on the UI thread (reanimated), so it stays smooth even if JS is busy loading.
 */
export function LoadingScreen({ label = "Loading…" }: { label?: string }) {
  const t = useTheme();
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withTiming(1, {
      duration: 3500,
      easing: Easing.out(Easing.cubic),
    });
  }, [progress]);

  const fillStyle = useAnimatedStyle(() => ({
    width: progress.value * (BAR_WIDTH * 0.9), // asymptote at 90% of the track
  }));

  return (
    <View style={[styles.fill, { backgroundColor: t.bg }]}>
      {/* ─────────── AVATAR SLOT ───────────
          Replace the placeholder <Text> below with the avatar animation. Keep this
          container so the layout/sizing stays put. */}
      <View
        style={[styles.avatar, { borderColor: t.border, backgroundColor: t.surface }]}
      >
        <Text style={[styles.avatarHint, { color: t.text }]}>avatar</Text>
      </View>

      <Text style={[styles.label, { color: t.text }]}>{label}</Text>

      {/* ─────────── PROGRESS BAR (faux) ─────────── */}
      <View style={[styles.track, { backgroundColor: t.surfaceInset }]}>
        <Animated.View
          style={[styles.fillBar, { backgroundColor: t.accent }, fillStyle]}
        />
      </View>
    </View>
  );
}

const BAR_WIDTH = 220;

const styles = StyleSheet.create({
  fill: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    gap: SPACE.lg,
    // Above the scene AND the HUD chrome.
    zIndex: 100,
  },
  avatar: {
    width: 140,
    height: 140,
    borderRadius: RADIUS.panel,
    borderWidth: 2,
    borderStyle: "dashed",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarHint: { ...TYPE.body, opacity: 0.4 },
  label: { ...TYPE.body },
  track: {
    width: BAR_WIDTH,
    height: 6,
    borderRadius: 3,
    overflow: "hidden",
  },
  fillBar: {
    height: "100%",
    borderRadius: 3,
  },
});
