import { StyleSheet } from "react-native";
import { useHudIcon } from "@/src/game/ui/hud/hudIcons";
import { useGameStore } from "@/src/game/core/store";
import { HUD_ICON, IconButtonBare } from "@/src/game/ui/hud/hudChrome";

/** Back one step. Disabled dims rather than disappears — "not yet", not "gone". */
export function UndoButton({ onPress }: { onPress?: () => void } = {}) {
  const completedCount = useGameStore((s) => s.completed.length);
  const undoLastAction = useGameStore((s) => s.undoLastAction);

  const disabled = completedCount === 0;

  return (
    <IconButtonBare
      source={useHudIcon("undo")}
      onPress={onPress ?? undoLastAction}
      disabled={disabled}
      size={HUD_ICON}
      style={styles.button}
      accessibilityLabel="Back one step"
    />
  );
}

/** Forward one step after an undo. Kept separate so tutorial and other screens
 * can opt into the pair without changing the existing Undo-only HUD. */
export function RedoButton() {
  const undoneCount = useGameStore((s) => s.undoneActions.length);
  const redoLastAction = useGameStore((s) => s.redoLastAction);

  return (
    <IconButtonBare
      source={require("@/src/assets/ui/icons/icon-redo.png")}
      onPress={redoLastAction}
      disabled={undoneCount === 0}
      size={HUD_ICON}
      style={styles.redoButton}
      accessibilityLabel="Forward one step"
    />
  );
}

const styles = StyleSheet.create({
  // Same left edge and 36px grid as the gear above and Recenter below.
  button: { position: "absolute", top: 54, left: 14 },
  redoButton: { position: "absolute", top: 54, left: 58 },
});