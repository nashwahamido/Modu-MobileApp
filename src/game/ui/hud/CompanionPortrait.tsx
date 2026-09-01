import { Image, StyleSheet, View, type ImageSourcePropType } from "react-native";
import Svg, { Defs, RadialGradient, Rect, Stop } from "react-native-svg";

import { type Theme, useFixedStyles } from "@/src/game/ui/system/theme";

export const PORTRAIT_SIZE = 88;

export function CompanionPortrait({
  source,
  size = PORTRAIT_SIZE,
  accessibilityLabel,
}: {
  source: ImageSourcePropType;
  size?: number;
  accessibilityLabel?: string;
}) {
  const s = useFixedStyles(makeStyles);
  return (
    <View style={[s.tile, { width: size, height: size }]}>
      <Svg style={StyleSheet.absoluteFill} pointerEvents="none">
        <Defs>
          <RadialGradient id="companionglow" cx="50%" cy="45%" r="65%">
            <Stop offset="0" stopColor="#FFFFFF" />
            <Stop offset="1" stopColor="#EADFCB" />
          </RadialGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#companionglow)" />
      </Svg>
      <Image
        source={source}
        style={s.art}
        resizeMode="cover"
        accessibilityRole="image"
        accessibilityLabel={accessibilityLabel}
      />
    </View>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    tile: {
      borderRadius: 16,
      borderWidth: 3,
      borderColor: t.surface,
      backgroundColor: "#EADFCB",
      overflow: "hidden",
      alignItems: "center",
      justifyContent: "center",
    },
    art: { width: "124%", height: "124%" },
  });