import { Theme, useFixedStyles } from "@/src/game/ui/system/theme";
import { useEffect, useRef } from 'react';
import { StyleSheet } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withTiming } from 'react-native-reanimated';

/** Full-screen green completion flash; fires whenever `trigger` increases. */
export function GreenFlash({ trigger }: { trigger: number }) {
  const styles = useFixedStyles(makeStyles);
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

const makeStyles = (t: Theme) =>
  StyleSheet.create({
  // The completion pulse. SUCCESS green — the one moment the colour is earned.
    flash: { ...StyleSheet.absoluteFillObject, backgroundColor: t.success },
  });
