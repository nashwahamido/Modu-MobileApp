// The beat between the last part landing and the completion screen. The build is done, but instead of the summary snapping up immediately, this pulsing button appears and the player keeps full camera control — they can orbit the finished piece and admire it. Tapping it sets completeConfirmed, which is what actually reveals BuildComplete. Same "don't snatch the last look away" reasoning as the cluster celebration waiting for a tap.
import {
  useEffect,
  useRef } from "react";
import { Animated,
  Easing,
  StyleSheet,
  Text,
} from "react-native";
import { Pressable } from "@/src/components/Pressable";
import * as Haptics from "expo-haptics";
import { useGameStore } from "@/src/game/core/store";
import { useSafeInsets } from "@/src/hooks/use-safe-insets";

export function FinishBuildButton() {
  const furniture = useGameStore((s) => s.furniture);
  const completed = useGameStore((s) => s.completed);
  const dismissed = useGameStore((s) => s.doneDismissed);
  const confirmed = useGameStore((s) => s.completeConfirmed);
  const setConfirmed = useGameStore((s) => s.setCompleteConfirmed);
  const safe = useSafeInsets();

  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(pulse, {
        toValue: 1,
        duration: 1400,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  const total = furniture?.actions.length ?? 0;
  const isDone = total > 0 && completed.length >= total;
  // Only in the gap: done, not yet confirmed, not dismissed back into the build.
  if (!isDone || confirmed || dismissed) return null;

  return (
    <Pressable
      onPress={() => {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setConfirmed(true);
      }}
      style={[styles.wrap, { bottom: 24 + safe.raw.bottom }]}
      accessibilityRole="button"
      accessibilityLabel="Finish and see your reward"
    >
      {/* Halo swelling out of the button — the same attract-the-eye pulse as the socket cues. */}
      <Animated.View
        pointerEvents="none"
        style={[
          styles.halo,
          {
            opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.6, 0] }),
            transform: [
              { scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.18] }) },
            ],
          },
        ]}
      />
      <Text style={styles.label}>Complete</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    alignSelf: "center",
    zIndex: 25,
    paddingHorizontal: 34,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#A97480",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.25,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  halo: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 24,
    borderWidth: 3,
    borderColor: "#A97480",
  },
  label: { color: "#FBF8F3", fontSize: 16, fontWeight: "800", letterSpacing: 0.5 },
});