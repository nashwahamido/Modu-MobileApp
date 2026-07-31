import { StyleSheet } from "react-native";
import { useGameStore } from "@/src/game/core/store";
import { HUD_ICON, IconButtonBare } from "@/src/game/ui/hudChrome";

/** Back one step. Disabled dims rather than disappears — "not yet", not "gone". */
export function UndoButton() {
  const completedCount = useGameStore((s) => s.completed.length);
  const undoLastAction = useGameStore((s) => s.undoLastAction);

  const disabled = completedCount === 0;

  return (
    <IconButtonBare
      source={require("@/src/assets/ui/icons/icon-undo.png")}
      onPress={undoLastAction}
      disabled={disabled}
      size={HUD_ICON}
      style={styles.button}
      accessibilityLabel="Back one step"
    />
  );
}

const styles = StyleSheet.create({
  // Same left edge and 36px grid as the gear above and Recenter below.
  button: { position: "absolute", top: 54, left: 14 },
});