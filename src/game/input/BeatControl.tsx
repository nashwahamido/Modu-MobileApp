import * as Haptics from "expo-haptics";
import { useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { instructionText } from "@/src/game/core/presentation/instructions";
import { AssemblyAction } from "@/src/game/core/type";
import { useGameStore } from "@/src/game/core/store";
import type { DriverRegistry } from "@/src/game/scene/offsetDriver";
import { runPushOpen } from "@/src/game/scene/pushOpen";

/** How far (px) the swipe must travel in the beat's direction. */
const SWIPE_PX = 80;

/** Swipe direction per beat: up = lift/stand, down = lower/press. */
const BEAT_DIRECTION: Record<string, "up" | "down"> = {
  combine_assemblies: "down",
  finishing_checks: "down",
};

const HINTS: Record<"up" | "down", { arrow: string; verb: string }> = {
  up: { arrow: "↑", verb: "Swipe up" },
  down: { arrow: "↓", verb: "Swipe down" },
};

/** Player-facing control for reorient/combine beats: a card the player swipes in the indicated direction. Beats are symbolic (parts stay at their baked poses; the free camera makes a literal flip unnecessary — user decision) — EXCEPT the push-open beat: when the furniture authors a PushOpenSpec matching this action, the swipe plays the telescoping open/close of each drawer before completing. */
export function BeatControl({
  action,
  pushDrivers,
  onSwipeStart,
}: {
  action: AssemblyAction;
  pushDrivers?: DriverRegistry;
  onSwipeStart?: () => void;
}) {
  const direction = BEAT_DIRECTION[action.actionId] ?? "up";
  const fired = useRef(false);
  const started = useRef(false);
  const [playing, setPlaying] = useState(false);
  const [cardOffset, setCardOffset] = useState(0);
  const settings = useGameStore((s) => s.settings);
  const furniture = useGameStore((s) => s.furniture);
  const title = furniture ? instructionText(furniture.instructions, action.actionId, settings.textLevel) : "";
  const pushOpen =
    furniture?.pushOpen && furniture.pushOpen.beatActionId === action.actionId && pushDrivers
      ? furniture.pushOpen
      : null;

  const pan = Gesture.Pan()
    .runOnJS(true)
    .onBegin(() => {
      if (!playing) {
        fired.current = false;
        started.current = false;
        setCardOffset(0);
      }
    })
    .onUpdate((e) => {
      if (fired.current || playing) return;
      const travel = direction === "up" ? -e.translationY : e.translationY;
      const forwardTravel = Math.max(0, travel);
      setCardOffset(
        (direction === "up" ? -1 : 1) * Math.min(forwardTravel, SWIPE_PX * 1.35),
      );
      if (forwardTravel > 6 && !started.current) {
        started.current = true;
        onSwipeStart?.();
      }
      if (travel >= SWIPE_PX) {
        fired.current = true;
        if (pushOpen && pushDrivers) {
          setPlaying(true);
          runPushOpen(pushOpen, pushDrivers, () =>
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium),
          ).then(() => {
            setPlaying(false);
            useGameStore.getState().completeAction(action.actionId);
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          });
          return;
        }
        // Let the card finish moving out while the camera returns home. The
        // short delay keeps the gesture visible before this control unmounts.
        setCardOffset((direction === "up" ? -1 : 1) * SWIPE_PX * 1.8);
        setTimeout(() => {
          useGameStore.getState().completeAction(action.actionId);
        }, 140);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      }
    })
    .onFinalize(() => {
      if (!fired.current && !playing) setCardOffset(0);
    });

  const hint = HINTS[direction];
  return (
    <View style={styles.wrap} pointerEvents="box-none">
      <GestureDetector gesture={pan}>
        <View
          style={[
            styles.card,
            playing && styles.cardPlaying,
            { transform: [{ translateY: cardOffset }] },
          ]}
        >
          <Text style={styles.arrow}>{playing ? "⇆" : hint.arrow}</Text>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.hint}>
            {playing ? "checking the drawers…" : `${hint.verb} to continue`}
          </Text>
        </View>
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "flex-end",
    justifyContent: "flex-end",
    paddingRight: 56,
    paddingBottom: 54,
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
  cardPlaying: { borderColor: "#37c871" },
  arrow: { fontSize: 36, color: "#e8842c", fontWeight: "700" },
  title: {
    fontSize: 15,
    fontWeight: "700",
    color: "#2e2a24",
    textAlign: "center",
  },
  hint: { fontSize: 12, color: "#6b6257", fontWeight: "600" },
});
