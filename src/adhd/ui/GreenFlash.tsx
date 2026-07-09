import { useEffect, useRef } from 'react';
import { StyleSheet } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withTiming } from 'react-native-reanimated';

/** Full-screen green completion flash; fires whenever `trigger` increases. */
export function GreenFlash({ trigger }: { trigger: number }) {
  const opacity = useSharedValue(0);
  const prev = useRef(trigger);

  useEffect(() => {
    if (trigger > prev.current) {
      opacity.value = withSequence(withTiming(0.4, { duration: 90 }), withTiming(0, { duration: 320 }));
    }
    prev.current = trigger;
  }, [trigger, opacity]);

  const style = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return <Animated.View pointerEvents="none" style={[styles.flash, style]} />;
}

const styles = StyleSheet.create({
  flash: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#37c871' },
});
