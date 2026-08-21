//  room hub's top-right cluster: the coins pill and the level/xp pill
import { router } from 'expo-router';
import type { Href } from 'expo-router';
import { StyleSheet, Image, Pressable, Text, View } from "react-native";
import { CARD_CHROME, CREAM, useFixedStyles, LEXEND } from "@/src/game/ui/system/theme";
import type { Theme } from "@/src/game/ui/system/theme";
import { COIN_ICON, STAR_ICON, XP_ICON, levelIcon } from '../../components/iconAssets';
import { levelProgressFraction } from '../../data/player/levels';
import { useProfileHud } from '../../hooks/useProfileHud';
import { useScreenInsets } from '../../hooks/use-safe-insets';

const BAR_TUCK = 30;
const LEVEL_ICON_NUDGE_Y = 0;
const BAR_HEIGHT = 23;
const COIN_COVER = 16;
const XP_BADGE_INSET = 1.5;
const XP_BADGE_SIZE = BAR_HEIGHT - XP_BADGE_INSET * 2;

// The edge and shadow both bars share. Taken from the catalogue cards, so the room's chrome and the
// build screen's tiles read as the same material.
const BAR_SKIN = CARD_CHROME;

export function RoomTopStats() {
  const s = useFixedStyles(makeStyles);
  const safe = useScreenInsets();
  const padTop = 12 + safe.top;
  const padR = 18 + safe.right;
  const profile = useProfileHud();
  const levelPercent = profile
    ? Math.round(levelProgressFraction({ xpIntoLevel: profile.xpIntoLevel, xpForNextLevel: profile.xpForNextLevel }) * 100)
    : 0;
  const star = profile ? levelIcon(profile.level) : null;
  const xpLabel = profile
    ? profile.xpForNextLevel === null
      ? "Max"
      : `${profile.xpIntoLevel}/${profile.xpForNextLevel}`
    : "–";
  return (
    <View style={[s.topRightGroup, { top: padTop, right: padR }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Profile — level ${profile?.level ?? "unknown"}, ${levelPercent}% to next level`}
        style={s.levelGroup}
        onPress={() => router.push("/profile" as Href)}
      >
        <View style={s.badgeCircle}>
          <Image source={star ?? STAR_ICON} style={s.levelIcon} resizeMode="contain" />
          {star ? null : <Text style={s.levelNumber}>{profile?.level ?? "–"}</Text>}
        </View>
        <View style={s.progress}>
          <View style={[s.progressFill, { width: `${levelPercent}%` }]} />
          <Text style={s.progressText}>{xpLabel}</Text>
          <Image source={XP_ICON} style={s.xpBadge} resizeMode="contain" />
        </View>
      </Pressable>
      <View style={s.currencyGroup}>
        <View style={s.badgeCircle}>
          <Image source={COIN_ICON} style={s.coinIcon} resizeMode="contain" />
        </View>
        <View style={s.currency}>
          <Text style={s.currencyText}>{profile?.coins ?? "–"}</Text>
        </View>
      </View>
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
    width: 54,
    height: 54,
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

  badgeCircle: {
    zIndex: 2,
    width: 54,
    height: 54,
    alignItems: 'center',
    justifyContent: 'center',
  },

  levelNumber: {
    position: 'absolute',
    color: '#FBFAF3',
    ...LEXEND.bold,
    fontSize: 13,
    transform: [{ translateY: LEVEL_ICON_NUDGE_Y }],
  },
  progress: {
    width: 126,
    height: BAR_HEIGHT,
    marginLeft: -BAR_TUCK,
    borderRadius: BAR_HEIGHT / 2,
    backgroundColor: '#FBFAF3',
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    ...BAR_SKIN,
  },
  progressFill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: '#CCC0D9',
  },
  progressText: {
    width: '100%',
    paddingRight: XP_BADGE_SIZE + XP_BADGE_INSET + 4,
    color: CREAM.ink,
    ...LEXEND.medium,
    fontSize: 12,
    textAlign: 'right',
  },
  xpBadge: {
    position: 'absolute',
    right: XP_BADGE_INSET,
    width: XP_BADGE_SIZE,
    height: XP_BADGE_SIZE,
  },
  currencyGroup: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  currency: {
    width: 82,
    paddingLeft: COIN_COVER,
    height: BAR_HEIGHT,
    marginLeft: -BAR_TUCK,
    borderRadius: BAR_HEIGHT / 2,
    backgroundColor: '#FBFAF3',
    alignItems: 'center',
    justifyContent: 'center',
    ...BAR_SKIN,
  },
  currencyText: {
    color: CREAM.ink,
    ...LEXEND.medium,
    fontSize: 12,
  },
});
