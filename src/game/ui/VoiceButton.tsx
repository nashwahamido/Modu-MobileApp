import {
  Image,
  Pressable,
  StyleSheet,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from "react-native";

const voiceIcon = require("../../assets/images/ui/icons/voice.jpg");

type VoiceButtonProps = {
  onPress: PressableProps["onPress"];
  size?: "default" | "small";
  style?: StyleProp<ViewStyle>;
};

export function VoiceButton({
  onPress,
  size = "default",
  style,
}: VoiceButtonProps) {
  const isSmall = size === "small";

  return (
    <Pressable
      onPress={onPress}
      style={[styles.button, isSmall && styles.smallButton, style]}
    >
      <Image
        source={voiceIcon}
        style={[styles.icon, isSmall && styles.smallIcon]}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    borderColor: "#d3c8b6",
    borderRadius: 22,
    borderWidth: 1,
    backgroundColor: "#fffef8",
  },
  smallButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
  },
  icon: {
    width: 28,
    height: 28,
    borderRadius: 14,
  },
  smallIcon: {
    width: 22,
    height: 22,
    borderRadius: 11,
  },
});
