import { Pressable, StyleSheet, Text } from "react-native";
import { useGameStore } from "@/src/game/core/store";

/** Top-left ctrl button (Nashwa placement — the undo/reset row under the
 *  points chip) that steps back to the previous step. Nashwa's ctrl-button
 *  treatment: ↶ glyph in a bordered 42×36 chip, theme-aware. */
export function UndoButton() {
  const completedCount = useGameStore((s) => s.completed.length);
  const undoLastAction = useGameStore((s) => s.undoLastAction);
  const dark = useGameStore((s) => s.theme === "dark");

  const disabled = completedCount === 0;
  return (
    <Pressable
      style={[styles.btn, dark && styles.btnDark, disabled && styles.btnIdle]}
      onPress={() => {
        if (!disabled) undoLastAction();
      }}
      disabled={disabled}
      hitSlop={8}
      accessibilityLabel="Back one step"
    >
      <Text style={[styles.text, dark && styles.textDark]}>↶</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    position: "absolute",
    top: 54,
    left: 14,
    width: 42,
    height: 36,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.85)",
    borderWidth: 1,
    borderColor: "rgba(60,50,40,0.15)",
  },
  btnDark: {
    backgroundColor: "rgba(22,30,44,0.86)",
    borderColor: "rgba(255,255,255,0.18)",
  },
  btnIdle: { opacity: 0.4 },
  text: { fontSize: 18, fontWeight: "700", color: "#2e2a24" },
  textDark: { color: "#eef1f6" },
});
