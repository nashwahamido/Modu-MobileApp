import { Pressable, StyleSheet, Text, View } from "react-native";
import { useGameStore } from "@/src/game/core/store";

/** Top-left ctrl row (Nashwa placement — under the points chip): back one step (↶) and forward again (↷). Forward is only available after an undo — any new completion clears the redo stack (store.undoneActions). Nashwa's ctrl-button treatment: glyph in a bordered 42×36 chip, theme-aware. */
export function UndoButton() {
  const completedCount = useGameStore((s) => s.completed.length);
  const undoneCount = useGameStore((s) => s.undoneActions.length);
  const undoLastAction = useGameStore((s) => s.undoLastAction);
  const redoLastAction = useGameStore((s) => s.redoLastAction);
  const dark = useGameStore((s) => s.theme === "dark");

  const undoDisabled = completedCount === 0;
  const redoDisabled = undoneCount === 0;
  return (
    <View style={styles.row}>
      <Pressable
        style={[styles.btn, dark && styles.btnDark, undoDisabled && styles.btnIdle]}
        onPress={undoLastAction}
        disabled={undoDisabled}
        hitSlop={8}
        accessibilityLabel="Back one step"
      >
        <Text style={[styles.text, dark && styles.textDark]}>↶</Text>
      </Pressable>
      <Pressable
        style={[styles.btn, dark && styles.btnDark, redoDisabled && styles.btnIdle]}
        onPress={redoLastAction}
        disabled={redoDisabled}
        hitSlop={8}
        accessibilityLabel="Forward one step"
      >
        <Text style={[styles.text, dark && styles.textDark]}>↷</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    position: "absolute",
    top: 54,
    left: 14,
    flexDirection: "row",
    gap: 8,
  },
  btn: {
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
