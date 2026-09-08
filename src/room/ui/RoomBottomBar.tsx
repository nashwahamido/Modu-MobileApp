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
import Animated, { FadeIn, FadeOut, LinearTransition } from "react-native-reanimated";
import Svg, { Circle, Path } from "react-native-svg";
import { ChevronIcon } from '../../components/Icons';
import { ASSEMBLE_ICON, INVENTORY_ICON, SHOP_ICON, VISIT_FRIENDS_ICON, YOU_ICON } from '../../components/iconAssets';
import { CARD_CHROME, CREAM, useScaledStyles, LEXEND } from "@/src/game/ui/system/theme";
import { useBottomBarScale } from './roomScale';
import type { Theme } from "@/src/game/ui/system/theme";
import { useScreenInsets } from '../../hooks/use-safe-insets';


const BAR_STROKE = CARD_CHROME.borderColor;
const BAR_STROKE_WIDTH = CARD_CHROME.borderWidth;
const BAR_FILL = '#FBFAF3';
const BAR_HEIGHT = 64;

const BAR_SHADOW = CARD_CHROME;

const BAR_LAYOUT= LinearTransition.duration(220);
const BAR_ITEM_ENTERING = FadeIn.duration(160);
const BAR_ITEM_EXITING = FadeOut.duration(120);


const BAR_ICON_SIZE = 40;
const SHOP_ICON_SIZE = 49;
const VISIT_FRIENDS_ICON_SIZE = 47;
const ASSEMBLE_SPREAD = 12;
const BAR_GAP= 30 - ASSEMBLE_SPREAD / 2;
const YOU_ICON_SIZE= 45;
const SHOP_ICON_NUDGE_X = -4;
const ICON_SLOT = 44;
const ASSEMBLE_LIFT = 16;

const ASSEMBLE_DISC_FILL = '#D4CED9';

const ASSEMBLE_COLLAR_SIZE = 68;
const ASSEMBLE_BUTTON_SIZE = 55;
const ASSEMBLE_ICON_SIZE = 76;
const ASSEMBLE_ICON_NUDGE_Y = -7;
const ASSEMBLE_CENTRE_OPEN = -ASSEMBLE_LIFT + ASSEMBLE_BUTTON_SIZE / 2;
const ASSEMBLE_CENTRE_CLOSED = ASSEMBLE_BUTTON_SIZE / 2;
const CHEVRON_SIZE = 26;
const BAR_LABEL_LINE_HEIGHT = 13;
const BAR_LABEL_GAP= 0;
const ASSEMBLE_LABEL_TOP = BAR_LABEL_GAP + (ICON_SLOT - (ASSEMBLE_BUTTON_SIZE - ASSEMBLE_LIFT));
const ASSEMBLE_WRAP_HEIGHT =
  ASSEMBLE_BUTTON_SIZE - ASSEMBLE_LIFT + ASSEMBLE_LABEL_TOP + BAR_LABEL_LINE_HEIGHT;

const ICON_SLOT_TOP = (BAR_HEIGHT - (ICON_SLOT + BAR_LABEL_GAP + BAR_LABEL_LINE_HEIGHT)) / 2;
const ACTIVE_DISC_EDGE_GAP = 2;
const ACTIVE_DISC = Math.min(
  ICON_SLOT,
  ICON_SLOT + 2 * (ICON_SLOT_TOP - BAR_STROKE_WIDTH - ACTIVE_DISC_EDGE_GAP),
);

const ASSEMBLE_COLLAR_ARC = (() => {
  const r = ASSEMBLE_COLLAR_SIZE / 2;
  const barTop = -(BAR_HEIGHT - ASSEMBLE_WRAP_HEIGHT) / 2 + BAR_STROKE_WIDTH / 2;
  const rise = Math.min(ASSEMBLE_CENTRE_OPEN - barTop, r);
  const half = Math.acos(rise / r);
  const dx = r * Math.sin(half);
  const leftX = r - dx;
  const rightX = r + dx;
  const y = r - rise;
  return `M ${leftX} ${y} A ${r} ${r} 0 0 1 ${rightX} ${y}`;
})();

export function RoomBottomBar({
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
  const padL = 22 * k + safe.left;
  const padBottom = 10 * k + safe.bottom;
  const [barOpen, setBarOpen] = useState(true);

  return (
    <Animated.View
      layout={BAR_LAYOUT}
      style={[
        s.bottomBarWrap,
        { bottom: padBottom },
        barOpen ? s.bottomBarWrapOpen : [s.bottomBarWrapClosed, { left: padL }],
      ]}
    >
      {barOpen ? (
        <Animated.View entering={BAR_ITEM_ENTERING} exiting={BAR_ITEM_EXITING} layout={BAR_LAYOUT}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Collapse menu"
            accessibilityState={{ expanded: true }}
            hitSlop={12}
            style={s.chevronButton}
            onPress={() => setBarOpen(false)}
          >
            <View style={s.chevronRight}>
              <ChevronIcon size={CHEVRON_SIZE * k} up color={BAR_FILL} outlineColor={BAR_STROKE} outlineWidth={BAR_STROKE_WIDTH} />
            </View>
          </Pressable>
        </Animated.View>
      ) : null}

      <Animated.View layout={BAR_LAYOUT} style={[s.bottomBar, !barOpen && s.bottomBarClosed]}>
        {barOpen ? (
          <Animated.View entering={BAR_ITEM_ENTERING} exiting={BAR_ITEM_EXITING} layout={BAR_LAYOUT}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Shop"
              accessibilityState={{ selected: active === 'shop' }}
              style={s.barItem}
              onPress={onOpenShop}
            >
              <View style={s.iconSlot}>
                {active === 'shop' ? <View style={s.activeDisc} /> : null}
                <Image source={SHOP_ICON} style={s.shopIcon} resizeMode="contain" />
              </View>
              <Text style={s.barLabel}>Shop</Text>
            </Pressable>
          </Animated.View>
        ) : null}

        {barOpen ? (
          <Animated.View entering={BAR_ITEM_ENTERING} exiting={BAR_ITEM_EXITING} layout={BAR_LAYOUT}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Inventory"
              accessibilityState={{ selected: active === 'inventory' }}
              style={s.barItem}
              onPress={onOpenInventory}
            >
              <View style={s.iconSlot}>
                {active === 'inventory' ? <View style={s.activeDisc} /> : null}
                <Image source={INVENTORY_ICON} style={s.barIcon} resizeMode="contain" />
              </View>
              <Text style={s.barLabel}>Inventory</Text>
            </Pressable>
          </Animated.View>
        ) : null}

        <Animated.View layout={BAR_LAYOUT} style={s.assembleWrap}>
          {barOpen ? (
            <Svg
              viewBox={`0 0 ${ASSEMBLE_COLLAR_SIZE} ${ASSEMBLE_COLLAR_SIZE}`}
              style={[s.assembleCollar, { top: (ASSEMBLE_CENTRE_OPEN - ASSEMBLE_COLLAR_SIZE / 2) * k }]}
              pointerEvents="none"
            >
              <Circle
                cx={ASSEMBLE_COLLAR_SIZE / 2}
                cy={ASSEMBLE_COLLAR_SIZE / 2}
                r={ASSEMBLE_COLLAR_SIZE / 2}
                fill={BAR_FILL}
              />
              <Path d={ASSEMBLE_COLLAR_ARC} fill="none" stroke={BAR_STROKE} strokeWidth={BAR_STROKE_WIDTH} />
            </Svg>
          ) : (
            <View
              style={[s.assembleCollarClosed, { top: (ASSEMBLE_CENTRE_CLOSED - ASSEMBLE_COLLAR_SIZE / 2) * k }]}
              pointerEvents="none"
            />
          )}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Assemble"
            style={[s.assembleButton, !barOpen && s.assembleButtonClosed]}
            onPress={() => router.push("/catalogue" as Href)}
          >
            <Image
              source={ASSEMBLE_ICON}
              style={[
                s.assembleIcon,
                {
                  left: ((ASSEMBLE_BUTTON_SIZE - ASSEMBLE_ICON_SIZE) / 2) * k,
                  top: ((ASSEMBLE_BUTTON_SIZE - ASSEMBLE_ICON_SIZE) / 2 + ASSEMBLE_ICON_NUDGE_Y) * k,
                },
              ]}
              resizeMode="contain"
            />
          </Pressable>
          {barOpen ? <Text style={[s.barLabel, s.assembleLabel]}>Assemble</Text> : null}
        </Animated.View>

        {barOpen ? (
          <Animated.View entering={BAR_ITEM_ENTERING} exiting={BAR_ITEM_EXITING} layout={BAR_LAYOUT}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Visit friends"
              accessibilityState={{ selected: active === 'friends' }}
              style={s.barItem}
              onPress={onOpenVisit}
            >
              <View style={s.iconSlot}>
                {active === 'friends' ? <View style={s.activeDisc} /> : null}
                <Image source={VISIT_FRIENDS_ICON} style={s.friendsIcon} resizeMode="contain" />
              </View>
              <Text style={s.barLabel}>Friends</Text>
            </Pressable>
          </Animated.View>
        ) : null}

        {barOpen ? (
          <Animated.View entering={BAR_ITEM_ENTERING} exiting={BAR_ITEM_EXITING} layout={BAR_LAYOUT}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Your profile"
              style={s.barItem}
              onPress={() => router.push("/profile" as Href)}
            >
              <View style={s.iconSlot}>
                <Image source={YOU_ICON} style={s.youIcon} resizeMode="contain" />
              </View>
              <Text style={s.barLabel}>You</Text>
            </Pressable>
          </Animated.View>
        ) : null}
      </Animated.View>

      {!barOpen ? (
        <Animated.View style={s.chevronLift} entering={BAR_ITEM_ENTERING} exiting={BAR_ITEM_EXITING} layout={BAR_LAYOUT}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Expand menu"
            accessibilityState={{ expanded: false }}
            hitSlop={12}
            style={s.chevronButton}
            onPress={() => setBarOpen(true)}
          >
            <View style={s.chevronLeft}>
              <ChevronIcon size={CHEVRON_SIZE * k} up color={BAR_FILL} outlineColor={BAR_STROKE} outlineWidth={BAR_STROKE_WIDTH} />
            </View>
          </Pressable>
        </Animated.View>
      ) : null}
    </Animated.View>
  );
}

const makeStyles = (t: Theme) => StyleSheet.create({
  bottomBarWrap: {
    position: 'absolute',
    zIndex: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 0,
  },
  bottomBarWrapOpen: {
    alignSelf: 'center',
  },
  bottomBarWrapClosed: {
    gap: 0,
  },
  chevronLift: {
    zIndex: 2,
  },
  bottomBar: {
    flexDirection: 'row',
    alignItems: 'center',
    height: BAR_HEIGHT,
    paddingHorizontal: 24,
    borderRadius: 32,
    backgroundColor: BAR_FILL,
    gap: BAR_GAP,
    ...BAR_SHADOW,
  },
  bottomBarClosed: {
    height: 62,
    paddingHorizontal: 0,
    borderWidth: 0,
    backgroundColor: 'transparent',
    boxShadow: '0px 0px 0px rgba(0,0,0,0)',
    shadowOpacity: 0,
    elevation: 0,
    gap: 0,
  },
  chevronButton: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chevronLeft: {
    transform: [{ rotate: '90deg' }],
  },
  chevronRight: {
    transform: [{ rotate: '270deg' }],
  },

  barItem: {
    width: 80,
    alignItems: 'center',
    justifyContent: 'center',
  },
  barLabel: {
    ...LEXEND.medium,
    fontSize: 10.5,
    lineHeight: BAR_LABEL_LINE_HEIGHT,
    color: CREAM.ink,
    marginTop: BAR_LABEL_GAP,
    textAlign: 'center',
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
  barIcon: {
    width: BAR_ICON_SIZE,
    height: BAR_ICON_SIZE,
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
  assembleLabel: {
    marginTop: ASSEMBLE_LABEL_TOP,
  },
  assembleWrap: {
    marginHorizontal: ASSEMBLE_SPREAD,
    alignItems: 'center',
    justifyContent: 'center',
  },

  assembleCollar: {
    position: 'absolute',
    alignSelf: 'center',
    width: ASSEMBLE_COLLAR_SIZE,
    height: ASSEMBLE_COLLAR_SIZE,
  },
 
  assembleIcon: {
    position: 'absolute',
    width: ASSEMBLE_ICON_SIZE,
    height: ASSEMBLE_ICON_SIZE,
  },
  assembleButton: {
    width: ASSEMBLE_BUTTON_SIZE,
    height: ASSEMBLE_BUTTON_SIZE,
    borderRadius: ASSEMBLE_BUTTON_SIZE / 2,
    marginTop: -ASSEMBLE_LIFT,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: ASSEMBLE_DISC_FILL,
    borderWidth: 0.6,
    borderColor: '#9C9994',
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 4,
    shadowOffset: {
      width: 0,
      height: 2,
    },
    elevation: 3,
  },
  assembleButtonClosed: {
    marginTop: 0,
  },
  assembleCollarClosed: {
    position: 'absolute',
    alignSelf: 'center',
    width: ASSEMBLE_COLLAR_SIZE,
    height: ASSEMBLE_COLLAR_SIZE,
    borderRadius: ASSEMBLE_COLLAR_SIZE / 2,
    backgroundColor: BAR_FILL,
    ...BAR_SHADOW,
  },
});
