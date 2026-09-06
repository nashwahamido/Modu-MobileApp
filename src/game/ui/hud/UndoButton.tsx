import { StyleSheet } from "react-native";
import { useHudIcon } from "@/src/game/ui/hud/hudIcons";
import { useGameStore } from "@/src/game/core/store";
import { HUD_ICON, IconButtonBare } from "@/src/game/ui/hud/hudChrome";
import { useMirror } from "@/src/game/ui/system/handedness";

export function UndoButton({ onPress }: { onPress?: () => void } = {}) {
  const completedCount = useGameStore((s) => s.completed.length);
  const undoLastAction = useGameStore((s) => s.undoLastAction);
  const m = useMirror();

  const disabled = completedCount === 0;

  return (
    <IconButtonBare
      source={useHudIcon("undo")}
      onPress={onPress ?? undoLastAction}
      disabled={disabled}
      size={HUD_ICON}
      style={m(styles.button)}
      accessibilityLabel="Back one step"
    />
  );
}

export function RedoButton() {
  const undoneCount = useGameStore((s) => s.undoneActions.length);
  const redoLastAction = useGameStore((s) => s.redoLastAction);
  const m = useMirror();

  return (
    <IconButtonBare
      source={require("@/src/assets/ui/icons/icon-redo.png")}
      onPress={redoLastAction}
      disabled={undoneCount === 0}
      size={HUD_ICON}
      style={m(styles.redoButton)}
      accessibilityLabel="Forward one step"
    />
  );
}

const styles = StyleSheet.create({
  button: { position: "absolute", top: 54, left: 14 },
  redoButton: { position: "absolute", top: 54, left: 58 },
});