// Assemble, on its own at the bottom-left corner.
//
// Standing apart from the navigation rail is the point: the rail is four PLACES to go, and this is the
// one thing to DO. As the fifth item in a row it read as another tab; alone in the opposite corner it
// reads as the room's primary action.
//
// It keeps the collar — a cream disc behind the purple one — which is what the button wore when it
// popped out of the old bottom bar. Free-standing it no longer has a bar to break out of, so the ring
// runs the full circle rather than being an arc.
import { router } from 'expo-router';
import type { Href } from 'expo-router';
import { StyleSheet, Image, Pressable, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { ASSEMBLE_ICON } from '../../components/iconAssets';
import { CARD_CHROME, CREAM, useScaledStyles, LEXEND } from '@/src/game/ui/system/theme';
import type { Theme } from '@/src/game/ui/system/theme';
import { RAIL_FILL } from './RoomNavRail';
import { useBottomBarScale } from './roomScale';

const COLLAR_SIZE = 68;
const BUTTON_SIZE = 55;
// Larger than the button on purpose — the PNG is mostly transparent margin
const ICON_SIZE = 76;
// Negative = up. The wrench head sits above the hand, so the hand reads low when centred
const ICON_NUDGE_Y = -7;
const DISC_FILL = '#E6DCF5';
const DISC_STROKE = '#9C9994';

export function RoomAssembleButton({ style }: { style?: StyleProp<ViewStyle> }) {
  const k = useBottomBarScale();
  // The sheet takes the SAME k as the hand-scaled values below — see useScaledStyles.
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
          {/* Bigger than the disc, so it is centred by offset — flex will not centre an overflowing child */}
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
      <Text style={s.label}>Assemble</Text>
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
    // The cream ring, which is also what carries the shadow: the purple disc sits inside it
    collar: {
      width: COLLAR_SIZE,
      height: COLLAR_SIZE,
      borderRadius: COLLAR_SIZE / 2,
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
      // overflow visible by default; the icon deliberately overhangs the disc
    },
    icon: {
      position: 'absolute',
      width: ICON_SIZE,
      height: ICON_SIZE,
    },
    label: {
      marginTop: 2,
      ...LEXEND.medium,
      fontSize: 10.5,
      lineHeight: 13,
      color: CREAM.ink,
      textAlign: 'center',
    },
  });
