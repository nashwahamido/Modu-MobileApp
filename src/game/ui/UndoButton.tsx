import { StyleSheet, Text, View } from "react-native";
import { useGameStore } from "@/src/game/core/store";
import { IconButton } from "@/src/game/ui/Button";
import { SPACE, TYPE, useTheme } from "@/src/game/ui/theme";

/** Back one step (↶) and forward again (↷). Forward is only available after an undo — any
 *  new completion clears the redo stack (store.undoneActions).
 *
 *  Both are glyph-only utilities, so they take the SQUARE treatment: in this palette the
 *  circle is reserved for the primary action, and shape alone should tell you which
 *  control matters. Unavailable ones dim rather than disappear — "not yet", not "gone". */
export function UndoButton() {
  const completedCount = useGameStore((s) => s.completed.length);
  const undoneCount = useGameStore((s) => s.undoneActions.length);
  const undoLastAction = useGameStore((s) => s.undoLastAction);
  const redoLastAction = useGameStore((s) => s.redoLastAction);
  const t = useTheme();

  const glyph = (g: string, disabled: boolean) => (
    <Text style={[TYPE.title, { color: disabled ? t.textFaint : t.text }]}>{g}</Text>
  );

  const undoDisabled = completedCount === 0;
  const redoDisabled = undoneCount === 0;

  return (
    <View style={styles.row}>
      <IconButton
        icon={glyph("↶", undoDisabled)}
        onPress={undoLastAction}
        disabled={undoDisabled}
        small
        accessibilityLabel="Back one step"
      />
      <IconButton
        icon={glyph("↷", redoDisabled)}
        onPress={redoLastAction}
        disabled={redoDisabled}
        small
        accessibilityLabel="Forward one step"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    position: "absolute",
    top: 54,
    left: 14,
    flexDirection: "row",
    gap: SPACE.sm,
  },
});
