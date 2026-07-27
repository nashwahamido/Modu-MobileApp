// All screen-level HUD styling AND the small HUD controls shared by play.tsx and the tutorial fork, in one place so the two HUDs stay pixel-identical. The canonical placements live in hudControlStyles below but are APPLIED by the caller (play as a style prop, tutorial on the wrapping TutorialTarget); look and behavior live here.

import { StyleSheet, type StyleProp, type ViewStyle } from "react-native";
import { Button, IconButton } from "@/src/game/ui/Button";
import { RecenterIcon } from "@/src/game/ui/Icons";
import { SPACE, useTheme } from "@/src/game/ui/theme";
import { SCENE_BACKGROUND } from "@/src/game/scene/lighting";

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
    <Button label="?" small style={[hudControlStyles.square, style]} onPress={onPress} />
  );
}

export const hudControlStyles = StyleSheet.create({
  square: { width: 36, minWidth: 36, paddingHorizontal: 0 },

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
    top: 10,
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
