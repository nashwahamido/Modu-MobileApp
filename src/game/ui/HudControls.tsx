// Small HUD controls SHARED by the play screen and the tutorial fork — edit here and both stay in sync. Position comes from the caller (a style prop or a wrapping TutorialTarget); look and behavior live here.
import { StyleSheet, type StyleProp, type ViewStyle } from "react-native";
import { Button, IconButton } from "@/src/game/ui/Button";
import { RecenterIcon } from "@/src/game/ui/Icons";
import { useTheme } from "@/src/game/ui/theme";

/** Recenter re-frames the camera on the build, so it is disabled until there IS a build — on an empty canvas it just jumps the view for no visible reason. */
export function RecenterButton({
  enabled,
  onPress,
  style,
}: {
  enabled: boolean;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  const t = useTheme();
  return (
    <IconButton
      icon={<RecenterIcon color={enabled ? t.text : t.textFaint} />}
      onPress={onPress}
      disabled={!enabled}
      small
      style={style}
      accessibilityLabel="Recenter the view"
    />
  );
}

/** The "?" hint nudge on the 36px icon-button grid. paddingHorizontal is zeroed because Button's own padding would otherwise widen it past the square. */
export function HintButton({
  onPress,
  style,
}: {
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Button label="?" small style={[styles.square, style]} onPress={onPress} />
  );
}

const styles = StyleSheet.create({
  square: { width: 36, minWidth: 36, paddingHorizontal: 0 },
});
