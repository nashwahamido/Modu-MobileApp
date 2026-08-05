import { memo, useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { GrainOverlay } from '@/src/game/ui/system/Button';

const RADIUS = 46;      // travel radius of the knob
const THUMB = 52;       // the knob itself — bigger than the travel, as in the reference
const BASE = 124;       // the cream dial the arrows sit on

// Sampled from the reference.
const KNOB = '#8B73A3';
const KNOB_EDGE = '#6f5a87';   // a darker rim, so the knob reads as raised
const KNOB_TOP = '#9c85b4';    // a lighter cap, for the gloss
const ARROW = '#a796b4';
// 75% opaque, so the workbench shows faintly through the dial.
const CREAM = 'rgba(245,234,221,0.75)';
const CREAM_EDGE = 'rgba(120,100,80,0.18)';

interface Props {
  onStart: () => void;
  onMove: (x: number, y: number) => void;
  onEnd: () => void;
  /** Kept for call-site compatibility; the dial now looks the same in both themes. */
  dark?: boolean;
}

/** Fixed virtual joystick: a cream dial with four direction arrows and a raised, glossy
 *  knob that springs back on release. */
function JoystickImpl({ onStart, onMove, onEnd }: Props) {
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);

  // MEMOISED, for the same reason the scene gestures and the part/cluster gesture caches are: the play screen re-renders throughout a drag (fit-state churn), and handing GestureDetector a fresh Gesture object makes gesture-handler reconfigure the native handler underneath an in-flight touch. The three callbacks are useCallback-stable in useOrbitCamera, so this rebuilds only when the manipulator itself swaps.
  const pan = useMemo(
    () =>
      Gesture.Pan()
        .onBegin(() => {
          scheduleOnRN(onStart);
        })
        .onUpdate((e) => {
          const len = Math.hypot(e.translationX, e.translationY);
          const clamp = len > RADIUS ? RADIUS / len : 1;
          tx.value = e.translationX * clamp;
          ty.value = e.translationY * clamp;
          // onMove (JS hop) keeps API compatibility and updates any JS-side listeners.
          // OrbitDrive reads stickShared on the render thread; writing it here via the same hop is a single cheap assignment (not the old per-frame integration), so even under drag load the camera keeps orbiting at the latest deflection.
          scheduleOnRN(onMove, tx.value / RADIUS, ty.value / RADIUS);
        })
        .onFinalize(() => {
          tx.value = withSpring(0);
          ty.value = withSpring(0);
          scheduleOnRN(onEnd);
        }),
    [onStart, onMove, onEnd, tx, ty],
  );

  const thumbStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: tx.value }, { translateY: ty.value }],
  }));

  return (
    <GestureDetector gesture={pan}>
      <View style={styles.base}>
        <GrainOverlay radius={BASE / 2} />
        <Text style={[styles.arrow, styles.arrowUp]}>▲</Text>
        <Text style={[styles.arrow, styles.arrowDown]}>▼</Text>
        <Text style={[styles.arrow, styles.arrowLeft]}>◀</Text>
        <Text style={[styles.arrow, styles.arrowRight]}>▶</Text>
        <Animated.View style={[styles.thumb, thumbStyle]}>
          <GrainOverlay radius={THUMB / 2} />
          {/* A lighter cap over the top half reads as a gloss highlight. */}
          <View style={styles.thumbGloss} />
        </Animated.View>
      </View>
    </GestureDetector>
  );
}

/** memo as well as the useMemo above: the parent re-renders on every fit-state change, and
 *  there is no reason for the dial to re-render at all — its props are stable. */
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
    // The dial itself sits slightly off the backdrop.
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  arrow: {
    position: 'absolute',
    color: ARROW,
    fontSize: 16,
  },
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
    // The drop shadow you asked for — soft, offset down, so the knob floats above the dial.
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