import { StyleSheet, Text, View } from "react-native";
import { FitState } from "@/src/game/core/geometry/fit";
import { screwSpinInfo } from "@/src/game/core/evaluation/engagement";
import { useGameStore } from "@/src/game/core/store";

const LOOK: Record<FitState, { color: string; label: string } | null> = {
  idle: null,
  held: { color: "#4a90d9", label: "Find the spot" },
  nearCorrect: { color: "#37c871", label: "Drop it!" },
  nearRotation: { color: "#e8842c", label: "Almost — drop to settle" },
  wrongTarget: { color: "#d95757", label: "Belongs elsewhere" },
};

/** Color+text fit feedback near the objective bar (in-scene glow comes in M4). */
export function FitChip() {
  const fitState = useGameStore((s) => s.fitState);
  const orientationActionId = useGameStore((s) => s.orientationActionId);
  const driveKind = useGameStore((s) => s.driveKind);
  const driveActionId = useGameStore((s) => s.driveActionId);
  const furniture = useGameStore((s) => s.furniture);
  const completed = useGameStore((s) => s.completed);

  let look = LOOK[fitState];
  if (driveKind === "slide") {
    look = { color: "#37c871", label: "Slide it into the groove" };
  } else if (driveKind === "press") {
    const tool = furniture?.actions.find((a) => a.actionId === driveActionId)?.tool;
    const struck = tool === "mallet" || tool === "hammer";
    look = {
      color: "#37c871",
      label: struck ? "Tap it in with the mallet" : "Press it into place",
    };
  } else if (orientationActionId) {
    const action = furniture?.actions.find((a) => a.actionId === orientationActionId);
    const screwing =
      !!furniture &&
      !!action?.partId &&
      !!screwSpinInfo(furniture, action, new Set(completed));
    look = screwing
      ? { color: "#37c871", label: "Turn to screw it in" }
      : { color: "#e8842c", label: "Turn to line it up" };
  }

  if (!look) return null;
  return (
    <View
      style={[styles.chip, { backgroundColor: look.color }]}
      pointerEvents="none"
    >
      <Text style={styles.text}>{look.label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    position: "absolute",
    top: 52,
    alignSelf: "center",
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 14,
  },
  text: { color: "#fff", fontWeight: "700", fontSize: 13 },
});
