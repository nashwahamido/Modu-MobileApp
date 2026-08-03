// Stand-in for icon art that has not been delivered yet. Lives here rather than in a feature
// folder because the room, the shop and the inventory all degrade the same way
import { View, type StyleProp, type ViewStyle } from "react-native";

import { useTheme } from "@/src/game/ui/theme";

export function IconPlaceholder({
  size = 28,
  width,
  height,
  style,
}: {
  size?: number;
  /** Overrides for art that isn't square - each falls back to `size` */
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
