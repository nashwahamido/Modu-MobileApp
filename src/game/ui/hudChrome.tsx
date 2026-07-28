// All screen-level HUD styling AND the small HUD controls shared by play.tsx and the tutorial fork, in one place so the two HUDs stay pixel-identical. The canonical placements live in hudControlStyles below but are APPLIED by the caller (play as a style prop, tutorial on the wrapping TutorialTarget); look and behavior live here.

import {
  Image,
  Pressable,
  StyleSheet,
  type ImageSourcePropType,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { SPACE } from "@/src/game/ui/theme";
import { SCENE_BACKGROUND } from "@/src/game/scene/lighting";

/** One shared size for every bare HUD icon so they line up on the grid. */
export const HUD_ICON = 30;

/**
 * A HUD icon with NO container chip — just the image, a soft drop shadow so it still lifts
 * off the 3D scene, and a subtle dim on press. Replaces the IconButton/Button chip for
 * icons that should read as bare art rather than as pressable tiles. Touch target is kept
 * generous via hitSlop so losing the chip doesn't shrink the tappable area.
 */
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

/** The hint nudge on the 36px icon-button grid. */
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

export const hudControlStyles = StyleSheet.create({
  // Canonical HUD placements, applied by the caller (play passes them as the style prop, tutorial puts them on the TutorialTarget wrapper so the spotlight measures the right frame).
  // Beside the gear on the 36px grid: gear 36 wide at left:14, +8 gap → 58.
  hintButton: { position: "absolute", left: 58, top: 8 },
  // Its own row, directly under undo (top:54 + 36 + 12 gap); same 36x36 square as the rest of the column.
  recenterButton: { position: "absolute", left: 14, top: 102 },
});

export const hudChrome = {
  // Each screen layers its own backgroundColor on top (play: t.bg, tutorial: SCENE_BACKGROUND).
  root: { flex: 1 },
  sceneWrap: { ...StyleSheet.absoluteFillObject },
  chrome: { position: "absolute" },

  // The row owns the position; the ObjectiveBar is just a flex child of it.
  topRow: {
    position: "absolute",
    // top:3 puts the pause icon's centre on the same line as the settings gear and hint,
    // whose centres sit at 8 + their box height. Tuned so pause reads as level with the
    // top-left grid.
    top: 3,
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: SPACE.sm,
  },

  // HintButton and RecenterButton placements live with the element (hudControlStyles above).

  // The way back to the tray in float mode. PRIMARY: while a part is in the air, this is
  // the one thing the player might need, so it is the one thing that carries the accent.
  // Below Recenter. Only visible in float mode, while a part is in the air.
  putBackButton: { position: "absolute", left: 14, top: 150 },

  // Left edge aligned with Recenter and the gear (all left:14); bottom aligned with the toolbar row (bottom:16).
  joystickZone: { position: "absolute", left: 14, bottom: 16 },
  togglesRow: {
    position: "absolute",
    right: 14,
    bottom: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: SPACE.sm,
    zIndex: 15,
  },
} satisfies Record<string, ViewStyle>;

/** The tutorial fork: the same chrome plus the spotlight's target rectangles (regions TutorialTarget measures for the highlight — the elements themselves render elsewhere). */
export const tutorialChrome = {
  ...hudChrome,
  root: { flex: 1, backgroundColor: SCENE_BACKGROUND },
  rootDark: { backgroundColor: "#17140f" },
  sceneTarget: { flex: 1 },
  assemblyTarget: {
    position: "absolute",
    left: "22%",
    top: "24%",
    width: "50%",
    height: "52%",
  },
  // The pill itself is the shared ObjectiveBar (ui/ObjectiveBar); this just centres it, as in play.tsx.
  objectiveWrap: { position: "absolute", top: 10, alignSelf: "center" },
  partsTrayTarget: {
    position: "absolute",
    right: 10,
    top: 70,
    bottom: 70,
    width: 124,
  },
  toolbarTarget: {
    position: "absolute",
    alignSelf: "center",
    bottom: 16,
    width: 118,
    height: 48,
  },
  toolTarget: {
    position: "absolute",
    right: 150,
    bottom: 28,
    width: 140,
    height: 160,
  },
  undoTarget: {
    position: "absolute",
    top: 54,
    left: 14,
    width: 92,
    height: 36,
  },
  settingsTarget: {
    position: "absolute",
    top: 8,
    left: 92,
    width: 42,
    height: 36,
  },
} satisfies Record<string, ViewStyle>;
