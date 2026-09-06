import { useCallback, useEffect, useRef } from "react";
import { Animated, Easing, useWindowDimensions } from "react-native";

export const SLIDE_UP = {
  enterMs: 360,
  exitMs: 260,
  enterEasing: Easing.out(Easing.cubic),
  exitEasing: Easing.in(Easing.cubic),
  centerTravel: 48,
} as const;

export function useSlideUpPresentation(onClosed: () => void) {
  const { height } = useWindowDimensions();
  const anim = useRef(new Animated.Value(0)).current;
  const closing = useRef(false);

  useEffect(() => {
    Animated.timing(anim, {
      toValue: 1,
      duration: SLIDE_UP.enterMs,
      easing: SLIDE_UP.enterEasing,
      useNativeDriver: true,
    }).start();
  }, [anim]);

  const requestClose = useCallback(() => {
    if (closing.current) return;
    closing.current = true;
    Animated.timing(anim, {
      toValue: 0,
      duration: SLIDE_UP.exitMs,
      easing: SLIDE_UP.exitEasing,
      useNativeDriver: true,
    }).start(() => {
      onClosed();
    });
  }, [anim, onClosed]);

  const translateY = anim.interpolate({ inputRange: [0, 1], outputRange: [height, 0] });

  return {
    sheetStyle: { opacity: anim, transform: [{ translateY }] },
    scrimStyle: { opacity: anim },
    requestClose,
  };
}
