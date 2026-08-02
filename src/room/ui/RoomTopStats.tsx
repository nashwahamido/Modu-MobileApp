// The room hub's top-right cluster: the coins pill and the level/xp pill
import { router } from 'expo-router';
import type { Href } from 'expo-router';
import { StyleSheet, Image, Pressable, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useStyles, useTheme } from "@/src/game/ui/theme";
import type { Theme } from "@/src/game/ui/theme";
import { COIN_ICON, levelIcon } from '../../components/iconAssets';
import { levelProgressFraction } from '../../data/levels';
import { useProfileHud } from '../../hooks/useProfileHud';
import { SCREEN_SIDE_MARGIN, SCREEN_VERTICAL_MARGIN } from '../../hooks/use-safe-insets';

// Pinned to the mockup rather than the theme, so it holds across light/dark
const TEXT_COLOR = '#231F20';
// How far each bar is tucked under its icon, so it reads as flowing out from behind it
const BAR_TUCK = 30;
// Negative = up, A five-point star reads low even when its box is centred
const LEVEL_ICON_NUDGE_Y = -3;
const LEXEND = {
  regular: 'Lexend_400Regular',
  semibold: 'Lexend_600SemiBold',
  bold: 'Lexend_700Bold',
  extrabold: 'Lexend_800ExtraBold',
  black: 'Lexend_900Black',
} as const;

// Stand-in for the level star when a level has no artwork yet
function Placeholder({ size = 28, style }: { size?: number; style?: StyleProp<ViewStyle> }) {
  const t = useTheme();
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        {
          width: size,
          height: size,
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

export function RoomTopStats() {
  const s = useStyles(makeStyles);
  // Immersive mode reports 0 insets, so these floors sit UNDER the design's own offsets
  const insets = useSafeAreaInsets();
  const padTop = 12 + Math.max(insets.top, SCREEN_VERTICAL_MARGIN);
  const padR = 18 + Math.max(insets.right, SCREEN_SIDE_MARGIN);
  // Null until the first fetch lands — an em dash beats a fake number
  const profile = useProfileHud();
  // Reads full at the top of the curve, where xpForNextLevel is null
  const levelPercent = profile
    ? Math.round(levelProgressFraction({ xpIntoLevel: profile.xpIntoLevel, xpForNextLevel: profile.xpForNextLevel }) * 100)
    : 0;
  const star = profile ? levelIcon(profile.level) : null;

  return (
    <View style={[s.topRightGroup, { top: padTop, right: padR }]}>
      <View style={s.currencyGroup}>
        <View style={s.badgeCircle}>
          <Image source={COIN_ICON} style={s.coinIcon} resizeMode="contain" />
        </View>
        <View style={s.currency}>
          <Text style={s.currencyText}>{profile?.coins ?? "–"}</Text>
        </View>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Profile — level ${profile?.level ?? "unknown"}, ${levelPercent}% to next level`}
        style={s.levelGroup}
        onPress={() => router.push("/profile" as Href)}
      >
        <View style={s.badgeCircle}>
          {/* The star art has its number baked in; the fallback draws a real one. */}
          {star ? (
            <Image source={star} style={s.levelIcon} resizeMode="contain" />
          ) : (
            <>
              <Placeholder size={26} />
              <Text style={s.levelNumber}>{profile?.level ?? "–"}</Text>
            </>
          )}
        </View>
        <View style={s.progress}>
          <View style={[s.progressFill, { width: `${levelPercent}%` }]} />
          <Text style={s.progressText}>{levelPercent}%</Text>
        </View>
      </Pressable>
    </View>
  );
}

const makeStyles = (t: Theme) => StyleSheet.create({
  topRightGroup: {
    position: 'absolute',
    zIndex: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 18,
  },
  coinIcon: {
    width: 48,
    height: 48,
  },
  levelIcon: {
    width: 54,
    height: 54,
    transform: [{ translateY: LEVEL_ICON_NUDGE_Y }],
  },
  levelGroup: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  // zIndex: the bar is a later sibling and must emerge from behind the icon
  badgeCircle: {
    zIndex: 2,
    width: 54,
    height: 54,
    alignItems: 'center',
    justifyContent: 'center',
  },
  levelNumber: {
    position: 'absolute',
    color: TEXT_COLOR,
    fontFamily: LEXEND.bold,
    fontSize: 13,
  },
  progress: {
    width: 126,
    height: 21,
    marginLeft: -BAR_TUCK,
    borderRadius: 12,
    backgroundColor: '#DFD7CA',
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Paler than the theme accent, which otherwise merges with the star
  progressFill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: '#BCADCB',
  },
  progressText: {
    width: '100%',
    color: TEXT_COLOR,
    fontFamily: LEXEND.semibold,
    fontSize: 12,
    textAlign: 'center',
  },
  currencyGroup: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  currency: {
    width: 126,
    height: 21,
    marginLeft: -BAR_TUCK,
    borderRadius: 12,
    backgroundColor: '#DFD7CA',
    alignItems: 'center',
    justifyContent: 'center',
  },
  currencyText: {
    color: TEXT_COLOR,
    fontFamily: LEXEND.bold,
    fontSize: 12,
  },
});
