// The room hub's top-right cluster: the coins pill and the level/xp pill
import { router } from 'expo-router';
import type { Href } from 'expo-router';
import { StyleSheet, Image, Pressable, Text, View } from "react-native";
import { CREAM, useStyles, LEXEND } from "@/src/game/ui/system/theme";
import type { Theme } from "@/src/game/ui/system/theme";
import { COIN_ICON, STAR_ICON } from '../../components/iconAssets';
import { levelProgressFraction } from '../../data/player/levels';
import { useProfileHud } from '../../hooks/useProfileHud';
import { useScreenInsets } from '../../hooks/use-safe-insets';

// How far each bar is tucked under its icon, so it reads as flowing out from behind it
const BAR_TUCK = 30;
// Negative = up, A five-point star reads low even when its box is centred
const LEVEL_ICON_NUDGE_Y = -3;

export function RoomTopStats() {
  const s = useStyles(makeStyles);
  // Immersive mode reports 0 insets, so these floors sit UNDER the design's own offsets
  const safe = useScreenInsets();
  const padTop = 12 + safe.top;
  const padR = 18 + safe.right;
  // Null until the first fetch lands — an em dash beats a fake number
  const profile = useProfileHud();
  // Reads full at the top of the curve, where xpForNextLevel is null
  const levelPercent = profile
    ? Math.round(levelProgressFraction({ xpIntoLevel: profile.xpIntoLevel, xpForNextLevel: profile.xpForNextLevel }) * 100)
    : 0;
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
          <Image source={STAR_ICON} style={s.levelIcon} resizeMode="contain" />
          <Text style={s.levelNumber}>{profile?.level ?? "–"}</Text>
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
    width: 46,
    height: 46,
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
  // Absolute, so it centres on the star. Carries the star's own nudge, or the number would sit low against a shape that has been lifted
  levelNumber: {
    position: 'absolute',
    color: '#FBFAF3',
    ...LEXEND.bold,
    fontSize: 13,
    transform: [{ translateY: LEVEL_ICON_NUDGE_Y }],
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
    color: CREAM.ink,
    ...LEXEND.semibold,
    fontSize: 11,
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
    color: CREAM.ink,
    ...LEXEND.bold,
    fontSize: 12,
  },
});
