// The room hub's navigation: shop / inventory / visit friends / you, as a column down the RIGHT edge.
//
// A rail rather than a bar across the bottom, because the room is a landscape diorama: the scene's
// interest is in the middle and along the floor, and a full-width band across the bottom covers the
// part of the room the player is looking at. A column costs one narrow strip of a wide screen instead.
//
// Assemble is NOT here. It is the one action rather than a place to go, and it lives on its own at the
// other corner (RoomAssembleButton) so it is never one of five equal choices.
import { useState } from 'react';
import { router } from 'expo-router';
import type { Href } from 'expo-router';
import { StyleSheet, Image, Pressable, Text, View } from 'react-native';
import type { ImageSourcePropType, StyleProp, ImageStyle } from 'react-native';
import Animated, { FadeIn, FadeOut, LinearTransition } from 'react-native-reanimated';

import { ChevronIcon } from '../../components/Icons';
import { INVENTORY_ICON, SHOP_ICON, VISIT_FRIENDS_ICON, YOU_ICON } from '../../components/iconAssets';
import { CARD_CHROME, CREAM, useScaledStyles, LEXEND } from '@/src/game/ui/system/theme';
import type { Theme } from '@/src/game/ui/system/theme';
import { useScreenInsets } from '../../hooks/use-safe-insets';
import { useBottomBarScale } from './roomScale';

// The rail's outline and fill, shared with the assemble button so the two read as one set of chrome
export const RAIL_STROKE = CARD_CHROME.borderColor;
export const RAIL_STROKE_WIDTH = CARD_CHROME.borderWidth;
export const RAIL_FILL = '#FBFAF3';

const RAIL_LAYOUT = LinearTransition.duration(220);
const RAIL_ITEM_ENTERING = FadeIn.duration(160);
const RAIL_ITEM_EXITING = FadeOut.duration(120);

// The icons are SOLVED, not picked, because equal boxes do NOT make equal-looking icons: each PNG
// fills its own canvas differently (the cart draws 70% of its height, the avatar 75%, the cabinet 86%,
// the friends 90%), and `contain` scales the whole canvas — transparent margins included. So each box
// is sized so the DRAWN part lands at the same 34pt height. Re-solve with
// box = 34 * max(canvasW, canvasH) / drawnH if any of these files is re-exported.
const RAIL_ICON_SIZE = 40;
const SHOP_ICON_SIZE = 49;
const VISIT_FRIENDS_ICON_SIZE = 47;
const YOU_ICON_SIZE = 45;
// Negative = left. The cart's basket carries the mass, so a centred box reads right of centre
const SHOP_ICON_NUDGE_X = -4;
// Fixed, so resizing an icon never moves its label. The icons overflow it — their transparent margin
// does, at least — and that is fine: this anchors the LABEL, it does not clip the art.
const ICON_SLOT = 44;
// Wide enough for the longest label on one line at this type size, and no wider — the widest word
// alone sets how much of the room the rail covers.
const ITEM_WIDTH = 72;
const CHEVRON_SIZE = 26;
const LABEL_LINE_HEIGHT = 13;

export function RoomNavRail({
  onOpenShop,
  onOpenInventory,
  onOpenVisit,
}: {
  onOpenShop: () => void;
  onOpenInventory: () => void;
  onOpenVisit: () => void;
}) {
  const k = useBottomBarScale();
  // The sheet takes the SAME k as the hand-scaled values below — see useScaledStyles.
  const s = useScaledStyles(makeStyles, k);
  const safe = useScreenInsets();
  const [railOpen, setRailOpen] = useState(true);
  // The rail's height, remembered from the last time it was open. Collapsed, a spacer of exactly that
  // height stands in for it — otherwise the wrap (which centres its children on the screen) would
  // re-centre around the chevron alone and the arrow would jump to the middle of the screen. Measured
  // rather than hardcoded: the rail's height follows its four items, its type and the tablet scale.
  const [railHeight, setRailHeight] = useState(0);

  // The design offset scales; the device inset does not — an inset is a physical clearance
  const padRight = 14 * k + safe.right;

  return (
    <Animated.View layout={RAIL_LAYOUT} style={[s.wrap, { right: padRight }]}>
      {/* Above the rail, pointing at it: the arrow opens what it points into and closes what it points out of */}
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
            onPress={onOpenShop}
          />
          <RailItem
            s={s}
            label="Inventory"
            icon={INVENTORY_ICON}
            iconStyle={s.railIcon}
            onPress={onOpenInventory}
          />
          <RailItem
            s={s}
            label="Friends"
            icon={VISIT_FRIENDS_ICON}
            iconStyle={s.friendsIcon}
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
        // Holds the arrow's place. Not interactive and not visible — it exists so the group's height,
        // and therefore the chevron's position, is the same open or closed.
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
  onPress,
}: {
  s: ReturnType<typeof makeStyles>;
  label: string;
  icon: ImageSourcePropType;
  iconStyle: StyleProp<ImageStyle>;
  onPress: () => void;
}) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} style={s.item} onPress={onPress}>
      <View style={s.iconSlot}>
        <Image source={icon} style={iconStyle} resizeMode="contain" />
      </View>
      {/* One line, always: the longest label is what sets the rail's width, and letting it wrap would
          make that one item taller than the other three and break the even spacing down the column. */}
      <Text style={s.label} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}>
        {label}
      </Text>
    </Pressable>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    // Centred on the screen's height, so the rail reads as a fixture of the right edge rather than as
    // something hanging from a corner. The chevron is a sibling, so it sits outside the rail's border.
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
      paddingHorizontal: 3,
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
    // The glyph points up when the rail is open (tap to close) and down when it is not
    chevronUp: {},
    chevronDown: {
      transform: [{ rotate: '180deg' }],
    },
    item: {
      width: ITEM_WIDTH,
      alignItems: 'center',
      justifyContent: 'center',
    },
    // Fixed height, so every label sits on the same line no matter how tall its icon draws
    iconSlot: {
      height: ICON_SLOT,
      alignItems: 'center',
      justifyContent: 'center',
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
