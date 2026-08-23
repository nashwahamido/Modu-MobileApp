// The companion's head as a TILE BESIDE a card, not an avatar inside one.
//
// This is the tutorial's own shape (tutorial/MascotGuideOverlay's `mascotPortrait`), lifted out so
// the build screen's prompts can wear it without a third copy of the same eight properties — the
// rule at the top of theme.ts: deliberate twins stay in step through a shared piece, never through a
// value pasted into both.
//
// The glow is what makes it read as a portrait rather than a cropped photo: white at the centre
// falling to cream at the rim, so the head sits in a pool of light. SVG because React Native has no
// radial gradient primitive — the same reason the hint toast draws its own.
import { Image, StyleSheet, View, type ImageSourcePropType } from "react-native";
import Svg, { Defs, RadialGradient, Rect, Stop } from "react-native-svg";

import { type Theme, useFixedStyles } from "@/src/game/ui/system/theme";

/** The tutorial's size, and the default here so the two match without either naming a number. */
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
          {/* The id is scoped per rendered SVG, so two portraits on screen at once do not collide. */}
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
      // Only the corners the gradient's square Rect cannot reach — matched to its OUTER stop.
      backgroundColor: "#EADFCB",
      overflow: "hidden",
      alignItems: "center",
      justifyContent: "center",
    },
    // OVER 100%, same as the tutorial's tile and the hint toast's: the head art carries its own
    // padding, so filling the frame exactly still leaves the face small. The tile crops the overflow.
    art: { width: "124%", height: "124%" },
  });