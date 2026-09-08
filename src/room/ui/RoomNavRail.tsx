import {
  useState } from 'react';
import { router } from 'expo-router';
import type { Href } from 'expo-router';
import { StyleSheet,
  Image,
  Text,
  View,
} from "react-native";
import { Pressable } from "@/src/components/Pressable";
import type { ImageSourcePropType, StyleProp, ImageStyle } from 'react-native';
import Animated, { FadeIn, FadeOut, LinearTransition } from 'react-native-reanimated';

import { ChevronIcon } from '../../components/Icons';
import { INVENTORY_ICON, SHOP_ICON, VISIT_FRIENDS_ICON, YOU_ICON } from '../../components/iconAssets';
import { CARD_CHROME, CREAM, useScaledStyles, LEXEND } from '@/src/game/ui/system/theme';
import type { Theme } from '@/src/game/ui/system/theme';
import { useScreenInsets } from '../../hooks/use-safe-insets';
import { useBottomBarScale } from './roomScale';

export const RAIL_STROKE = CARD_CHROME.borderColor;
export const RAIL_STROKE_WIDTH = CARD_CHROME.borderWidth;
export const RAIL_FILL = '#FBFAF3';

const RAIL_LAYOUT = LinearTransition.duration(220);
const RAIL_ITEM_ENTERING = FadeIn.duration(160);
const RAIL_ITEM_EXITING = FadeOut.duration(120);

const RAIL_ICON_SIZE = 40;
const SHOP_ICON_SIZE = 49;
const VISIT_FRIENDS_ICON_SIZE = 47;
const YOU_ICON_SIZE = 45;
const SHOP_ICON_NUDGE_X = -4;
const ICON_SLOT = 44;
const ITEM_WIDTH = 72;
const CHEVRON_SIZE = 26;
const LABEL_LINE_HEIGHT = 13;
const RAIL_PAD_X = 3;

const ACTIVE_DISC_EDGE_GAP = 2;
const ACTIVE_DISC = Math.min(
  ICON_SLOT,
  ITEM_WIDTH + RAIL_PAD_X * 2 - (RAIL_STROKE_WIDTH + ACTIVE_DISC_EDGE_GAP) * 2,
);

export function RoomNavRail({
  onOpenShop,
  onOpenInventory,
  onOpenVisit,
  active,
}: {
  onOpenShop: () => void;
  onOpenInventory: () => void;
  onOpenVisit: () => void;
  active?: 'shop' | 'inventory' | 'friends' | null;
}) {
  const k = useBottomBarScale();
  const s = useScaledStyles(makeStyles, k);
  const safe = useScreenInsets();
  const [railOpen, setRailOpen] = useState(true);
  const [railHeight, setRailHeight] = useState(0);

  const padRight = 14 * k + safe.right;

  return (
    <Animated.View layout={RAIL_LAYOUT} style={[s.wrap, { right: padRight }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={railOpen ? 'Collapse menu' : 'Expand menu'}
        accessibilityState={{ expanded: railOpen }}
        hitSlop={12}
        style={s.chevronButton}
        onPress={() => setRailOpen((open) => !open)}
      >
        <View style={railOpen ? s.chevronUp : s.chevronDown}>
          <ChevronIcon
            shadow
            size={CHEVRON_SIZE * k}
            up
            color={RAIL_FILL}
            outlineColor={RAIL_STROKE}
            outlineWidth={RAIL_STROKE_WIDTH}
          />
        </View>
      </Pressable>

      {railOpen ? (
        <Animated.View
          entering={RAIL_ITEM_ENTERING}
          exiting={RAIL_ITEM_EXITING}
          layout={RAIL_LAYOUT}
          style={s.rail}
          onLayout={(e) => setRailHeight(e.nativeEvent.layout.height)}
        >
          <RailItem
            s={s}
            label="Shop"
            icon={SHOP_ICON}
            iconStyle={s.shopIcon}
            active={active === 'shop'}
            onPress={onOpenShop}
          />
          <RailItem
            s={s}
            label="Inventory"
            icon={INVENTORY_ICON}
            iconStyle={s.railIcon}
            active={active === 'inventory'}
            onPress={onOpenInventory}
          />
          <RailItem
            s={s}
            label="Friends"
            icon={VISIT_FRIENDS_ICON}
            iconStyle={s.friendsIcon}
            active={active === 'friends'}
            onPress={onOpenVisit}
          />
          <RailItem
            s={s}
            label="You"
            icon={YOU_ICON}
            iconStyle={s.youIcon}
            onPress={() => router.push('/profile' as Href)}
          />
        </Animated.View>
      ) : (
        <View style={{ height: railHeight }} pointerEvents="none" />
      )}
    </Animated.View>
  );
}

function RailItem({
  s,
  label,
  icon,
  iconStyle,
  active = false,
  onPress,
}: {
  s: ReturnType<typeof makeStyles>;
  label: string;
  icon: ImageSourcePropType;
  iconStyle: StyleProp<ImageStyle>;
  active?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: active }}
      style={s.item}
      onPress={onPress}
    >
      <View style={s.iconSlot}>
        {active ? <View style={s.activeDisc} /> : null}
        <Image source={icon} style={iconStyle} resizeMode="contain" />
      </View>
      <Text style={s.label} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}>
        {label}
      </Text>
    </Pressable>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    wrap: {
      position: 'absolute',
      zIndex: 14,
      top: 0,
      bottom: 0,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
    },
    rail: {
      alignItems: 'center',
      paddingVertical: 16,
      paddingHorizontal: RAIL_PAD_X,
      borderRadius: 40,
      backgroundColor: RAIL_FILL,
      gap: 14,
      ...CARD_CHROME,
    },
    chevronButton: {
      width: 26,
      height: 26,
      alignItems: 'center',
      justifyContent: 'center',
    },
    chevronUp: {},
    chevronDown: {
      transform: [{ rotate: '180deg' }],
    },
    item: {
      width: ITEM_WIDTH,
      alignItems: 'center',
      justifyContent: 'center',
    },
    iconSlot: {
      width: ICON_SLOT,
      height: ICON_SLOT,
      alignItems: 'center',
      justifyContent: 'center',
    },
    activeDisc: {
      position: 'absolute',
      width: ACTIVE_DISC,
      height: ACTIVE_DISC,
      borderRadius: ACTIVE_DISC / 2,
      backgroundColor: CREAM.navActive,
    },
    label: {
      ...LEXEND.medium,
      fontSize: 10,
      lineHeight: LABEL_LINE_HEIGHT,
      color: CREAM.ink,
      textAlign: 'center',
    },
    railIcon: {
      width: RAIL_ICON_SIZE,
      height: RAIL_ICON_SIZE,
    },
    shopIcon: {
      width: SHOP_ICON_SIZE,
      height: SHOP_ICON_SIZE,
      transform: [{ translateX: SHOP_ICON_NUDGE_X }],
    },
    friendsIcon: {
      width: VISIT_FRIENDS_ICON_SIZE,
      height: VISIT_FRIENDS_ICON_SIZE,
    },
    youIcon: {
      width: YOU_ICON_SIZE,
      height: YOU_ICON_SIZE,
    },
  });
