import { StyleSheet, Text } from "react-native";
import { useGameStore } from "@/src/game/core/store";
import { IconButton } from "@/src/game/ui/Button";
import { TYPE, useTheme } from "@/src/game/ui/theme";

/** Back one step (↶).
 *
 *  Redo was removed: it sat here permanently greyed out, because it only lights up in the
 *  narrow window between an undo and the next completion — any new step clears the redo
 *  stack. A control that is disabled almost all of the time is noise in a HUD this tight,
 *  and it cost a slot next to the one button people actually reach for. `redoLastAction`
 *  is untouched in the store if it ever needs a home again.
 *
 *  Glyph-only, so it takes the SQUARE treatment: in this palette the circle is reserved for
 *  the primary action, and shape alone should say which control matters. Disabled dims
 *  rather than disappears — "not yet", not "gone". */
export function UndoButton() {
  const completedCount = useGameStore((s) => s.completed.length);
  const undoLastAction = useGameStore((s) => s.undoLastAction);
  const t = useTheme();

  const disabled = completedCount === 0;

  return (
    <IconButton
      icon={
        <Text style={[TYPE.title, { color: disabled ? t.textFaint : t.text }]}>
          ↶
        </Text>
      }
      onPress={undoLastAction}
      disabled={disabled}
      small
      style={styles.button}
      accessibilityLabel="Back one step"
    />
  );
}

const styles = StyleSheet.create({
  // Same left edge and 36px grid as the gear above and Recenter below.
  button: { position: "absolute", top: 54, left: 14 },
});