import * as Haptics from "expo-haptics";
import { useRef } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { instructionText } from "@/src/adhd/core/presentation/instructions";
import { AssemblyAction } from "@/src/adhd/core/type";
import { useGameStore } from "@/src/adhd/core/store";

/** How far (px) the swipe must travel in the beat's direction. */
const SWIPE_PX = 80;

/** Swipe direction per beat: up = lift/stand, down = lower/press. */
const BEAT_DIRECTION: Record<string, "up" | "down"> = {
  reorient_upright: "up",
  combine_assemblies: "down",
  finishing_checks: "down",
};

const HINTS: Record<"up" | "down", { arrow: string; verb: string }> = {
  up: { arrow: "↑", verb: "Swipe up" },
  down: { arrow: "↓", verb: "Swipe down" },
};

/**
 * Player-facing control for reorient/combine beats: a card the player swipes
 * in the indicated direction. Beats are symbolic (parts stay at their baked
 * poses; the free camera makes a literal flip unnecessary — user decision).
 */
export function BeatControl({ action }: { action: AssemblyAction }) {
  const direction = BEAT_DIRECTION[action.actionId] ?? "up";
  const fired = useRef(false);
  const settings = useGameStore((s) => s.settings);
  const furniture = useGameStore((s) => s.furniture);
  const title = furniture ? instructionText(furniture.instructions, action.actionId, settings.textLevel) : "";

  const pan = Gesture.Pan()
    .runOnJS(true)
    .onBegin(() => {
      fired.current = false;
    })
    .onUpdate((e) => {
      if (fired.current) return;
      const travel = direction === "up" ? -e.translationY : e.translationY;
      if (travel >= SWIPE_PX) {
        fired.current = true;
        useGameStore.getState().completeAction(action.actionId);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      }
    });

  const hint = HINTS[direction];
  return (
    <View style={styles.wrap} pointerEvents="box-none">
      <GestureDetector gesture={pan}>
        <View style={styles.card}>
          <Text style={styles.arrow}>{hint.arrow}</Text>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.hint}>{hint.verb} to continue</Text>
        </View>
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  card: {
    backgroundColor: "rgba(255,255,255,0.92)",
    borderRadius: 18,
    borderWidth: 2,
    borderColor: "#e8842c",
    paddingHorizontal: 26,
    paddingVertical: 18,
    alignItems: "center",
    gap: 6,
    maxWidth: 320,
  },
  arrow: { fontSize: 36, color: "#e8842c", fontWeight: "700" },
  title: {
    fontSize: 15,
    fontWeight: "700",
    color: "#2e2a24",
    textAlign: "center",
  },
  hint: { fontSize: 12, color: "#6b6257", fontWeight: "600" },
});
