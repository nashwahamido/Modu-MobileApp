// Small HUD controls SHARED by the play screen and the tutorial fork — edit here and both stay in sync. Position comes from the caller (a style prop or a wrapping TutorialTarget); look and behavior live here.
import {
  Image,
  Pressable,
  StyleSheet,
  type ImageSourcePropType,
  type StyleProp,
  type ViewStyle,
} from "react-native";

/**
 * A HUD icon with NO container chip — just the image, a soft drop shadow so it still lifts
 * off the 3D scene, and a subtle dim on press. Replaces the IconButton/Button chip for
 * icons that should read as bare art rather than as pressable tiles. Touch target is kept
 * generous via hitSlop so losing the chip doesn't shrink the tappable area.
 */
/** One shared size for every bare HUD icon so they line up on the grid. */
export const HUD_ICON = 30;

export function IconButtonBare({
  source,
  onPress,
  disabled,
  size = HUD_ICON,
  style,
  accessibilityLabel,
}: {
  source: ImageSourcePropType;
  onPress: () => void;
  disabled?: boolean;
  size?: number;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={12}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: !!disabled }}
      style={({ pressed }) => [
        bareStyles.wrap,
        { opacity: disabled ? 0.4 : pressed ? 0.6 : 1 },
        style,
      ]}
    >
      <Image
        source={source}
        style={[bareStyles.img, { width: size, height: size }]}
        resizeMode="contain"
      />
    </Pressable>
  );
}


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
  return (
    <IconButtonBare
      source={require("@/src/assets/ui/icons/icon-recenter.png")}
      onPress={onPress}
      disabled={!enabled}
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
    <IconButtonBare
      source={require("@/src/assets/ui/icons/icon-hint.png")}
      onPress={onPress}
      style={style}
      accessibilityLabel="Show a hint"
    />
  );
}

const bareStyles = StyleSheet.create({
  wrap: {
    // 36px box centering a 30px icon — the same grid the gear sits on, so settings, undo,
    // recenter, hint and pause all align at left:14 with matching centres and tap targets.
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  img: {
    // Soft drop shadow so the bare icon still lifts off the 3D scene (same family as
    // ELEVATION.card, tuned tighter for a glyph-sized target). On a transparent PNG the
    // shadow follows the icon's alpha, so it hugs the shape rather than a box.
    shadowColor: "#000",
    shadowOpacity: 0.35,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 5,
  },
});