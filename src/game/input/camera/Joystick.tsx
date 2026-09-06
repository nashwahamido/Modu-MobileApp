import { memo, useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { GrainOverlay } from '@/src/game/ui/system/Button';

// --------------- looks
const RADIUS = 46; // travel radius of the knob
const THUMB = 52; // the knob. bit bigger
const BASE = 124; // the cream dial

const KNOB = '#8B73A3';
const KNOB_EDGE = '#6f5a87'; // a darker rim, so the knob reads as raised
const KNOB_TOP = '#9c85b4'; // a lighter cap, for the gloss

const ARROW = '#a796b4';

const CREAM = 'rgba(245,234,221,0.75)'; // 75% opaque, so the workbench shows faintly through the dial.
const CREAM_EDGE = 'rgba(120,100,80,0.18)';

// The dark-theme dial
const DIAL_DARK = 'rgba(43,37,35,0.92)';
const DIAL_DARK_EDGE = 'rgba(243,239,232,0.16)';

const ARROW_DARK = '#8d7ba8';

interface Props {
  onStart: () => void;
  onMove: (x: number, y: number) => void;
  onEnd: () => void;
  // dark theme: the dial takes the HUD's dark chrome so it belongs to the same control set
  dark?: boolean;
}

// below this fraction of full deflection the stick reports nothing — a thumb resting a few pixels off-centre was enough to drift the camera, which is most of what "too sensitive" meant
const DEADZONE = 0.14;
// response curve: linear gave the same degrees-per-pixel at the centre as at the rim, so there was no slow end to aim with. Squaring keeps the top speed and makes the first half fine control
const CURVE = 2;

function JoystickImpl({ onStart, onMove, onEnd, dark = false }: Props) {
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);

  // MEMOISED like the scene and part gesture caches: the play screen re-renders throughout a drag, and a fresh Gesture object makes gesture-handler reconfigure the native handler under an in-flight touch. The three callbacks are useCallback-stable, so this rebuilds only when the manipulator swaps
  const pan = useMemo(
    () => {
      const g = Gesture.Pan()
        .onBegin(() => {
          scheduleOnRN(onStart);
        })
        .onUpdate((e) => {
          const len = Math.hypot(e.translationX, e.translationY);
          const clamp = len > RADIUS ? RADIUS / len : 1;
          
          tx.value = e.translationX * clamp;
          ty.value = e.translationY * clamp;

          // deadzone + curve on the MAGNITUDE, not per axis — per axis bends the diagonals
          const mag = Math.min(1, len / RADIUS);
          const shaped =
            mag <= DEADZONE ? 0 : Math.pow((mag - DEADZONE) / (1 - DEADZONE), CURVE);
          const scale = mag > 0 ? shaped / mag : 0;

          // unit direction x shaped speed. JS hop stores it in stickShared; OrbitDrive integrates it on the render thread
          scheduleOnRN(onMove, (tx.value / RADIUS) * scale, (ty.value / RADIUS) * scale);
        })
        .onFinalize(() => {
          tx.value = withSpring(0);
          ty.value = withSpring(0);
          scheduleOnRN(onEnd);
        });

      // NEVER YIELDS. Two Pan handlers in separate detectors compete, and on Android the first to activate blocks the second outright — holding a part from the tray meant this stick reported nothing and the camera could not be turned while hunting for a socket (iOS is permissive natively, hence Android-only). shouldCancelWhenOutside(false) keeps this handler alive once begun; not simultaneousWithExternalGesture, which needs a REF to the other gesture and the drag is built per part by gestureFor(action)
      return g.shouldCancelWhenOutside(false);
    },
    [onStart, onMove, onEnd, tx, ty],
  );

  const thumbStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: tx.value }, { translateY: ty.value }],
  }));

  return (
    <GestureDetector gesture={pan}>
      <View style={[styles.base, dark && styles.baseDark]}>
        <GrainOverlay radius={BASE / 2} />
        <Text style={[styles.arrow, dark && styles.arrowDark, styles.arrowUp]}>▲</Text>
        <Text style={[styles.arrow, dark && styles.arrowDark, styles.arrowDown]}>▼</Text>
        <Text style={[styles.arrow, dark && styles.arrowDark, styles.arrowLeft]}>◀</Text>
        <Text style={[styles.arrow, dark && styles.arrowDark, styles.arrowRight]}>▶</Text>
        <Animated.View style={[styles.thumb, thumbStyle]}>
          <GrainOverlay radius={THUMB / 2} />

          <View style={styles.thumbGloss} />
        </Animated.View>
      </View>
    </GestureDetector>
  );
}

// memo as well as the useMemo above: the parent re-renders on every fit-state change and the dial's props are stable
export const Joystick = memo(JoystickImpl);

const styles = StyleSheet.create({
  base: {
    width: BASE,
    height: BASE,
    borderRadius: BASE / 2,
    backgroundColor: CREAM,
    borderWidth: 1,
    borderColor: CREAM_EDGE,
    alignItems: 'center',
    justifyContent: 'center',

    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  // dark theme
  baseDark: { backgroundColor: DIAL_DARK, borderColor: DIAL_DARK_EDGE },
  arrow: {
    position: 'absolute',
    color: ARROW,
    fontSize: 16,
  },
  arrowDark: { color: ARROW_DARK },
  arrowUp: { top: 8 },
  arrowDown: { bottom: 8 },
  arrowLeft: { left: 10 },
  arrowRight: { right: 10 },
  thumb: {
    width: THUMB,
    height: THUMB,
    borderRadius: THUMB / 2,
    backgroundColor: KNOB,
    borderWidth: 1.5,
    borderColor: KNOB_EDGE,
    overflow: 'hidden',

    shadowColor: '#3a2f4a',
    shadowOpacity: 0.45,
    shadowRadius: 7,
    shadowOffset: { width: 0, height: 5 },
    elevation: 8,
  },
  thumbGloss: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: THUMB * 0.5,
    backgroundColor: KNOB_TOP,
    opacity: 0.55,
    borderTopLeftRadius: THUMB / 2,
    borderTopRightRadius: THUMB / 2,
  },
});