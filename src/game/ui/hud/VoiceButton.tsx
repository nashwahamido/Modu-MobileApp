import {
  Image,
  Pressable,
  StyleSheet,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from "react-native";

const soundOn = require("@/src/assets/ui/icons/icon-sound-on.png");
const soundOff = require("@/src/assets/ui/icons/icon-sound-off.png");

type VoiceButtonProps = {
  onPress: PressableProps["onPress"];
  size?: "default" | "small";
  style?: StyleProp<ViewStyle>;
  /** Which glyph to show. Defaults to the "on" speaker; pass playing=false for the muted X. */
  playing?: boolean;
};

export function VoiceButton({
  onPress,
  size = "default",
  style,
  playing = true,
}: VoiceButtonProps) {
  const isSmall = size === "small";

  return (
    <Pressable
      onPress={onPress}
      style={[styles.button, isSmall && styles.smallButton, style]}
    >
      <Image
        source={playing ? soundOn : soundOff}
        resizeMode="contain"
        style={[styles.icon, isSmall && styles.smallIcon]}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderColor: "#d3c8b6",
    borderRadius: 20,
    borderWidth: 1,
    backgroundColor: "#fffef8",
  },
  smallButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
  },
  icon: {
    width: 22,
    height: 22,
  },
  smallIcon: {
    width: 16,
    height: 16,
  },
});