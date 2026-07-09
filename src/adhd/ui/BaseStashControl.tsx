import * as Haptics from "expo-haptics";
import { useMemo } from "react";
import { Pressable, StyleSheet, Text } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { useGameStore } from "@/src/adhd/core/store";

/** Leftward drag distance (px) that counts as "pulled back into the scene". */
const RESTORE_DRAG_PX = 50;

/**
 * Tray entry shown only during the seat build (stage 3): lets the player set
 * the finished base cluster (legs + ring) aside so it doesn't block the view,
 * then pull it back. Tap to stash; once stashed, drag the chip left into the
 * scene to restore it. The base never hides on its own.
 *
 * Maps to the generic `activeCluster` store field: stashed === activeCluster
 * === "base".
 */
export function BaseStashControl() {
  const stage = useGameStore((s) => s.stage());
  const activeCluster = useGameStore((s) => s.activeCluster);
  const stashed = activeCluster === "base";
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const style = useAnimatedStyle(() => ({
    transform: [{ translateX: tx.value }, { translateY: ty.value }],
  }));

  const pan = useMemo(
    () =>
      Gesture.Pan()
        .runOnJS(true)
        .onUpdate((e) => {
          tx.value = e.translationX;
          ty.value = e.translationY;
        })
        .onEnd((e) => {
          if (e.translationX < -RESTORE_DRAG_PX) {
            useGameStore.getState().setActiveCluster(null);
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          }
          tx.value = withSpring(0);
          ty.value = withSpring(0);
        }),
    [tx, ty],
  );

  if (stage !== 3) return null;

  if (!stashed) {
    return (
      <Pressable
        style={[styles.card, styles.stashCard]}
        onPress={() => {
          useGameStore.getState().setActiveCluster("base");
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        }}
      >
        <Text style={styles.glyph}>⤓</Text>
        <Text style={styles.label} numberOfLines={2}>
          Set base aside
        </Text>
      </Pressable>
    );
  }

  return (
    <GestureDetector gesture={pan}>
      <Animated.View style={[styles.card, styles.stashedCard, style]}>
        <Text style={styles.glyph}>⊞</Text>
        <Text style={styles.label} numberOfLines={1}>
          Leg base
        </Text>
        <Text style={styles.hint}>← drag to scene</Text>
      </Animated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "rgba(255,255,255,0.92)",
    borderRadius: 12,
    borderWidth: 1.5,
    paddingVertical: 8,
    paddingHorizontal: 8,
    alignItems: "center",
    gap: 3,
  },
  stashCard: { borderColor: "#b8741a", borderStyle: "dashed" },
  stashedCard: { borderColor: "#37c871" },
  glyph: { fontSize: 22, color: "#b8741a", fontWeight: "700" },
  label: {
    fontSize: 11,
    fontWeight: "700",
    color: "#2e2a24",
    textAlign: "center",
  },
  hint: { fontSize: 9, fontWeight: "600", color: "#37871f" },
});
