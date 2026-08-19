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
// The dark-theme dial. Matched to the HUD's own chrome (Theme.surface / Theme.border in
// ui/system/theme) rather than a dimmed cream: the joystick sits in the same row as the
// recenter and undo buttons, and a pale dial beside dark chrome read as a hole in the HUD.
// Written as literals because this component renders outside the themed tree — same reason
// ACCENT_LIGHT is exported for the knob.
const DIAL_DARK = 'rgba(43,37,35,0.92)';
const DIAL_DARK_EDGE = 'rgba(243,239,232,0.16)';
// The arrows have to lift off the dark dial the way the dark ones lift off cream.
const ARROW_DARK = '#8d7ba8';

interface Props {
  onStart: () => void;
  onMove: (x: number, y: number) => void;
  onEnd: () => void;
  /** Dark theme: the dial takes the HUD's dark chrome so it belongs to the same control set. */
  dark?: boolean;
}

/** Fixed virtual joystick: a cream dial with four direction arrows and a raised, glossy
 *  knob that springs back on release. */
/**
 * Below this fraction of full deflection the stick reports nothing. A thumb resting a few pixels
 * off-centre was enough to drift the camera, which is most of what "too sensitive" means here — the
 * model appeared to move on its own.
 */
const DEADZONE = 0.14;
/**
 * Response curve. Linear deflection gave the same degrees-per-pixel at the centre as at the rim, so
 * there was no slow end to the stick and nothing to aim with. Squaring the magnitude keeps the top
 * speed while making the first half of the travel fine control.
 */
const CURVE = 2;

function JoystickImpl({ onStart, onMove, onEnd, dark = false }: Props) {
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);

  // MEMOISED, for the same reason the scene gestures and the part/cluster gesture caches are: the play screen re-renders throughout a drag (fit-state churn), and handing GestureDetector a fresh Gesture object makes gesture-handler reconfigure the native handler underneath an in-flight touch. The three callbacks are useCallback-stable in useOrbitCamera, so this rebuilds only when the manipulator itself swaps.
  const pan = useMemo(
    () => {
      const g = Gesture.Pan()
        .onBegin(() => {
          scheduleOnRN(onStart);
        })
        .onUpdate((e) => {
          const len = Math.hypot(e.translationX, e.translationY);
          const clamp = len > RADIUS ? RADIUS / len : 1;
          // The THUMB still tracks the finger exactly — the curve belongs to the camera, not to the
          // control. A knob that lagged its own finger would read as broken.
          tx.value = e.translationX * clamp;
          ty.value = e.translationY * clamp;
          // Deadzone and curve applied to the MAGNITUDE, not per axis: shaping x and y separately
          // would bend the diagonals, so a stick pushed corner-to-corner would not travel corner to
          // corner.
          const mag = Math.min(1, len / RADIUS);
          const shaped =
            mag <= DEADZONE ? 0 : Math.pow((mag - DEADZONE) / (1 - DEADZONE), CURVE);
          const scale = mag > 0 ? shaped / mag : 0;
          // onMove (JS hop) keeps API compatibility and updates any JS-side listeners.
          // OrbitDrive reads stickShared on the render thread; writing it here via the same hop is a single cheap assignment (not the old per-frame integration), so even under drag load the camera keeps orbiting at the latest deflection.
          scheduleOnRN(onMove, (tx.value / RADIUS) * scale, (ty.value / RADIUS) * scale);
        })
        .onFinalize(() => {
          tx.value = withSpring(0);
          ty.value = withSpring(0);
          scheduleOnRN(onEnd);
        });
      /**
       * NEVER YIELDS TO ANOTHER GESTURE.
       *
       * Two Pan handlers in separate detectors compete by default, and on Android the first to
       * activate blocks the second outright — so a part held from the tray meant this stick reported
       * nothing, and the camera could not be turned while hunting for a socket. iOS is more
       * permissive natively, which is why it only ever appeared on Android.
       *
       * `manualActivation(false)` with `shouldCancelWhenOutside(false)` keeps this handler alive
       * once it has begun, regardless of what else activates: the dial owns the finger that is
       * inside it, and no other gesture has any claim on that finger.
       *
       * Not simultaneousWithExternalGesture, which needs a REF to the other gesture — the drag is
       * built per part by gestureFor(action), so there is no single object to point at.
       */
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
  // The dial in dark theme: the HUD's own surface and hairline, so it reads as one of the controls
  // rather than a cream disc sitting on a dark scene.
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