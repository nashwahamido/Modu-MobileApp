import { View, type StyleProp, type ViewStyle } from "react-native";

import { useTheme } from "@/src/game/ui/system/theme";

export function IconPlaceholder({
  size = 28,
  width,
  height,
  style,
}: {
  size?: number;
  width?: number;
  height?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const t = useTheme();
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        {
          width: width ?? size,
          height: height ?? size,
          borderRadius: 6,
          backgroundColor: t.surface,
          borderWidth: 1.5,
          borderColor: t.borderStrong,
        },
        style,
      ]}
    />
  );
}
