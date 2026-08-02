// Stand-ins for shop art that has not been delivered yet
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import Svg, { Line } from "react-native-svg";

import { useTheme } from "@/src/game/ui/theme";

/** The room HUD's placeholder square, so both surfaces degrade the same way*/
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

/** plaveholdr - crossed rectangle */
export function ImagePlaceholder({
  width,
  height,
  style,
}: {
  width: number;
  height: number;
  style?: StyleProp<ViewStyle>;
}) {
  const t = useTheme();
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[placeholderStyles.well, { width, height, borderColor: t.border }, style]}
    >
      <Svg width={width} height={height}>
        <Line x1={0} y1={0} x2={width} y2={height} stroke={t.borderStrong} strokeWidth={1} />
        <Line x1={width} y1={0} x2={0} y2={height} stroke={t.borderStrong} strokeWidth={1} />
      </Svg>
    </View>
  );
}

const placeholderStyles = StyleSheet.create({
  well: {
    borderWidth: 1,
    overflow: "hidden",
  },
});
