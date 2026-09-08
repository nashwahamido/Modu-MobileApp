import {
  router } from 'expo-router';
import type { Href } from 'expo-router';
import { StyleSheet,
  Image,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { Pressable } from "@/src/components/Pressable";

import { ASSEMBLE_ICON } from '../../components/iconAssets';
import { CARD_CHROME, CREAM, useScaledStyles, LEXEND } from '@/src/game/ui/system/theme';
import type { Theme } from '@/src/game/ui/system/theme';
import { RAIL_FILL } from './RoomNavRail';
import { useBottomBarScale } from './roomScale';

export const ASSEMBLE_COLLAR_SIZE = 84;
const BUTTON_SIZE = 68;
const ICON_SIZE = 95;
const ICON_NUDGE_Y = -7;
const DISC_FILL = '#D4CED9';
const DISC_STROKE = '#9C9994';
const OUTLINE_COLOUR = '#FBFAF3';
const OUTLINE_WIDTH = 0.8;
const OUTLINE_OFFSETS = [
  {
    x: -OUTLINE_WIDTH,
    y: 0,
  },
  {
    x: OUTLINE_WIDTH,
    y: 0,
  },
  {
    x: 0,
    y: -OUTLINE_WIDTH,
  },
  {
    x: 0,
    y: OUTLINE_WIDTH,
  },
  {
    x: -OUTLINE_WIDTH,
    y: -OUTLINE_WIDTH,
  },
  {
    x: OUTLINE_WIDTH,
    y: -OUTLINE_WIDTH,
  },
  {
    x: -OUTLINE_WIDTH,
    y: OUTLINE_WIDTH,
  },
  {
    x: OUTLINE_WIDTH,
    y: OUTLINE_WIDTH,
  },
];

export function RoomAssembleButton({ style }: { style?: StyleProp<ViewStyle> }) {
  const k = useBottomBarScale();
  const s = useScaledStyles(makeStyles, k);

  return (
    <View style={[s.wrap, style]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Assemble"
        style={s.collar}
        onPress={() => router.push('/catalogue' as Href)}
      >
        <View style={s.disc}>
          <Image
            source={ASSEMBLE_ICON}
            style={[
              s.icon,
              {
                left: ((BUTTON_SIZE - ICON_SIZE) / 2) * k,
                top: ((BUTTON_SIZE - ICON_SIZE) / 2 + ICON_NUDGE_Y) * k,
              },
            ]}
            resizeMode="contain"
          />
        </View>
      </Pressable>
      <View>
        {OUTLINE_OFFSETS.map((o) => (
          <Text
            key={`${o.x},${o.y}`}
            style={[
              s.label,
              s.labelOutline,
              { transform: [{ translateX: o.x * k }, { translateY: o.y * k }] },
            ]}
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          >
            Assemble
          </Text>
        ))}
        <Text style={s.label}>Assemble</Text>
      </View>
    </View>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    wrap: {
      position: 'absolute',
      zIndex: 14,
      alignItems: 'center',
    },
    collar: {
      width: ASSEMBLE_COLLAR_SIZE,
      height: ASSEMBLE_COLLAR_SIZE,
      borderRadius: ASSEMBLE_COLLAR_SIZE / 2,
      backgroundColor: RAIL_FILL,
      alignItems: 'center',
      justifyContent: 'center',
      ...CARD_CHROME,
    },
    disc: {
      width: BUTTON_SIZE,
      height: BUTTON_SIZE,
      borderRadius: BUTTON_SIZE / 2,
      backgroundColor: DISC_FILL,
      borderWidth: 0.6,
      borderColor: DISC_STROKE,
      alignItems: 'center',
      justifyContent: 'center',
    },
    icon: {
      position: 'absolute',
      width: ICON_SIZE,
      height: ICON_SIZE,
    },
    labelOutline: {
      position: 'absolute',
      left: 0,
      right: 0,
      color: OUTLINE_COLOUR,
    },
    label: {
      marginTop: 2,
      ...LEXEND.semibold,
      fontSize: 13,
      lineHeight: 16,
      color: CREAM.ink,
      textAlign: 'center',
    },
  });
