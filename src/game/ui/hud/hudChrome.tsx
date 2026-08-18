// All screen-level HUD styling AND the small HUD controls shared by play.tsx and the tutorial fork, in one place so the two HUDs stay pixel-identical. The canonical placements live in hudControlStyles below but are APPLIED by the caller (play as a style prop, tutorial on the wrapping TutorialTarget); look and behavior live here.

import {
  Image,
  Pressable,
  StyleSheet,
  type ImageSourcePropType,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { ELEVATION, RADIUS, SPACE, useTheme } from "@/src/game/ui/system/theme";
import { useHudIcon } from "@/src/game/ui/hud/hudIcons";
import { GrainOverlay } from "@/src/game/ui/system/Button";
import { SCENE_BACKGROUND } from "@/src/game/scene/lighting";

/** One shared size for every bare HUD icon so they line up on the grid. */
// 24 inside the 36 chip: the art was nearly filling its container, which read as heavy against the scene. The chip size is unchanged, so the grid and the tap targets hold.
export const HUD_ICON = 24;

/**
 * A HUD icon inside a container chip — surface fill, hairline border, rounded corners, the
 * clay grain, and a card shadow, so it reads as a pressable tile matching the app's other
 * buttons. Dims on press. The 30px icon sits centred in a 36px chip.
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
  const t = useTheme();
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
        {
          backgroundColor: t.surface,
          borderColor: t.border,
          opacity: disabled ? 0.4 : pressed ? 0.6 : 1,
        },
        ELEVATION.card,
        style,
      ]}
    >
      <GrainOverlay radius={RADIUS.control} />
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
      source={useHudIcon("recenter")}
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
      accessibilityLabel="Spot the next part"
    />
  );
}

const bareStyles = StyleSheet.create({
  wrap: {
    // 36px chip centring a 30px icon — the same grid the gear sits on, so settings, undo, recenter, hint and pause all align at left:14 with matching centres and tap targets.
    width: 36,
    height: 36,
    borderRadius: RADIUS.control,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    // Clip the clay grain to the chip's rounded corners without clipping the card shadow — the GrainOverlay self-clips, so the Pressable itself must NOT set overflow:hidden.
  },
  img: {},
});

export const hudControlStyles = StyleSheet.create({
  // Canonical HUD placements, applied by the caller (play passes them as the style prop, tutorial puts them on the TutorialTarget wrapper so the spotlight measures the right frame). Beside the gear on the 36px grid: gear 36 wide at left:14, +8 gap → 58.
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
    // top:3 puts the pause icon's centre on the same line as the settings gear and hint, whose centres sit at 8 + their box height. Tuned so pause reads as level with the top-left grid.
    top: 3,
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: SPACE.sm,
  },

  // HintButton and RecenterButton placements live with the element (hudControlStyles above).

  // The way back to the tray in float mode. PRIMARY: while a part is in the air, this is the one thing the player might need, so it is the one thing that carries the accent. Below Recenter. Only visible in float mode, while a part is in the air.
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
  // Must match PartsTray's own `column` (right:14, top:70, bottom:70, width:86) so the spotlight frames the tray exactly, not a larger box around it.
  partsTrayTarget: {
    position: "absolute",
    right: 14,
    top: 70,
    bottom: 70,
    width: 86,
  },
  toolTarget: {
    position: "absolute",
    // Match TightenControl exactly (right:220, bottom:120, 144×144).
    // Keeping this in the same HUD coordinate space makes the tutorial spotlight surround the purple clockwise dial instead of its old area.
    right: 220,
    bottom: 120,
    width: 144,
    height: 144,
  },
  // Match BeatControl's bottom-right swipe card. This target exists only for
  // tutorial spotlight measurement; the shared task control stays unchanged.
  beatControlTarget: {
    position: "absolute",
    right: 56,
    bottom: 54,
    width: 320,
    height: 142,
  },
  undoTarget: {
    position: "absolute",
    top: 54,
    left: 14,
    width: 36,
    height: 36,
  },
  // Match the real gear in GameSettings (left:14, top:8, 36×36). left:92 pointed the spotlight at the hint slot instead of the gear.
  settingsTarget: {
    position: "absolute",
    top: 8,
    left: 14,
    width: 36,
    height: 36,
  },
} satisfies Record<string, ViewStyle>;