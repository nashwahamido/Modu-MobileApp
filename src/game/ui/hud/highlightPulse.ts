import { useEffect, useRef } from "react";
import { Animated } from "react-native";

export function useHighlightPulse(active: boolean) {
  const value = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!active) {
      value.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(value, { toValue: 1, duration: 240, useNativeDriver: true }),
        Animated.timing(value, { toValue: 0, duration: 240, useNativeDriver: true }),
        Animated.delay(520),
      ]),
    );
    loop.start();
    return () => {
      loop.stop();
      value.setValue(0);
    };
  }, [active, value]);

  return value;
}