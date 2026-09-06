import {
  Image,
  Pressable,
  StyleSheet,
  type ImageSourcePropType,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { ELEVATION, RADIUS, SPACE, useTheme } from "@/src/game/ui/system/theme";
import { useMirroredTable } from "@/src/game/ui/system/handedness";
import { useGameStore } from "@/src/game/core/store";
import { useHudIcon } from "@/src/game/ui/hud/hudIcons";
import { GrainOverlay } from "@/src/game/ui/system/Button";
import { SCENE_BACKGROUND } from "@/src/game/scene/lighting";
import { playSfx } from "@/src/game/audio/sfx";

export const TASK_CONTROL_BOTTOM = 72;

export const HUD_ICON = 24;

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
      onPress={() => {
        playSfx("click");
        onPress();
      }}
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

export function SpokenStepsButton({ style }: { style?: StyleProp<ViewStyle> }) {
  const profile = useGameStore((s) => s.profile);
  const audio = useGameStore((s) => s.settings.audio);
  const setSettings = useGameStore((s) => s.setSettings);
  const icon = useHudIcon(audio ? "soundOn" : "soundOff");
  if (profile !== "visual") return null;
  return (
    <IconButtonBare
      source={icon}
      onPress={() => setSettings({ audio: !audio })}
      size={24}
      style={style}
      accessibilityLabel={audio ? "Turn spoken steps off" : "Turn spoken steps on"}
    />
  );
}

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
    width: 36,
    height: 36,
    borderRadius: RADIUS.control,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  img: {},
});

export const hudControlStyles = StyleSheet.create({
  hintButton: { position: "absolute", left: 58, top: 8 },
  spokenStepsButton: { position: "absolute", left: 102, top: 8 },
  recenterButton: { position: "absolute", left: 14, top: 102 },
});

export const hudChrome = {
  root: { flex: 1 },
  sceneWrap: { ...StyleSheet.absoluteFillObject },
  chrome: { position: "absolute" },

  topRow: {
    position: "absolute",
    top: 8,
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: SPACE.sm,
  },

  putBackButton: { position: "absolute", left: 14, top: 150 },

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
  objectiveWrap: { position: "absolute", top: 8, alignSelf: "center" },
  partsTrayTarget: {
    position: "absolute",
    right: 14,
    top: 70,
    bottom: 70,
    width: 86,
  },
  toolTarget: {
    position: "absolute",
    right: 220,
    bottom: 120,
    width: 144,
    height: 144,
  },
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
  undoRecenterTarget: {
    position: "absolute",
    top: 54,
    left: 14,
    width: 36,
    height: 102 + 36 - 54,
  },
  settingsTarget: {
    position: "absolute",
    top: 8,
    left: 14,
    width: 36,
    height: 36,
  },
} satisfies Record<string, ViewStyle>;

export function useHudChrome(): typeof hudChrome {
  return useMirroredTable(hudChrome);
}

export function useHudControlStyles(): typeof hudControlStyles {
  return useMirroredTable(hudControlStyles);
}

export function useTutorialChrome(): typeof tutorialChrome {
  return useMirroredTable(tutorialChrome);
}