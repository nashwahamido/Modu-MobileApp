import { StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

const RADIUS = 56;
const THUMB = 44;

interface Props {
  onStart: () => void;
  onMove: (x: number, y: number) => void; // each in [-1, 1]
  onEnd: () => void;
}

/** Fixed virtual joystick: stable base circle, spring-back thumb. */
export function Joystick({ onStart, onMove, onEnd }: Props) {
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);

  const pan = Gesture.Pan()
    .onBegin(() => {
      scheduleOnRN(onStart);
    })
    .onUpdate((e) => {
      const len = Math.hypot(e.translationX, e.translationY);
      const clamp = len > RADIUS ? RADIUS / len : 1;
      tx.value = e.translationX * clamp;
      ty.value = e.translationY * clamp;
      scheduleOnRN(onMove, tx.value / RADIUS, ty.value / RADIUS);
    })
    .onFinalize(() => {
      tx.value = withSpring(0);
      ty.value = withSpring(0);
      scheduleOnRN(onEnd);
    });

  const thumbStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: tx.value }, { translateY: ty.value }],
  }));

  return (
    <GestureDetector gesture={pan}>
      <View style={styles.base} collapsable={false}>
        <Animated.View style={[styles.thumb, thumbStyle]} />
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  base: {
    width: RADIUS * 2,
    height: RADIUS * 2,
    borderRadius: RADIUS,
    backgroundColor: 'rgba(60, 50, 40, 0.12)',
    borderWidth: 2,
    borderColor: 'rgba(60, 50, 40, 0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumb: {
    width: THUMB,
    height: THUMB,
    borderRadius: THUMB / 2,
    backgroundColor: 'rgba(60, 50, 40, 0.45)',
  },
});
