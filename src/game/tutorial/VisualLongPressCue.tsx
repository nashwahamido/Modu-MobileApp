import { useEffect, useRef } from "react";
import { Animated, StyleSheet, Text, View } from "react-native";

import type { TutorialFrame } from "./targetRegistry";
import { Theme, useStyles } from "@/src/game/ui/theme";

interface Props {
  frame: TutorialFrame;
}

export function VisualLongPressCue({ frame }: Props) {
  const styles = useStyles(makeStyles);
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 1100,
          useNativeDriver: true,
        }),
        Animated.delay(350),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 0,
          useNativeDriver: true,
        }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [pulse]);

  const centerX = frame.x + frame.width / 2;
  // The first item in the parts tray is the tabletop. Keep the cue near the
  // top card rather than centring it over the entire vertical tray.
  const centerY = frame.y + Math.min(52, frame.height * 0.16);

  return (
    <View
      pointerEvents="none"
      style={[
        styles.cue,
        {
          left: centerX - 28,
          top: centerY - 28,
        },
      ]}
    >
      <Animated.Text
        style={[
          styles.arrow,
          {
            transform: [
              {
                translateX: pulse.interpolate({
                  inputRange: [0, 0.45, 1],
                  outputRange: [-12, -3, -12],
                }),
              },
            ],
          },
        ]}
      >
        ➜
      </Animated.Text>
      <Animated.View
        style={[
          styles.ring,
          {
            opacity: pulse.interpolate({
              inputRange: [0, 0.2, 1],
              outputRange: [0.9, 0.75, 0],
            }),
            transform: [
              {
                scale: pulse.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0.45, 1.65],
                }),
              },
            ],
          },
        ]}
      />
      <Animated.View
        style={[
          styles.ring,
          {
            opacity: pulse.interpolate({
              inputRange: [0, 0.42, 1],
              outputRange: [0, 0.8, 0],
            }),
            transform: [
              {
                scale: pulse.interpolate({
                  inputRange: [0, 0.42, 1],
                  outputRange: [0.35, 0.45, 1.25],
                }),
              },
            ],
          },
        ]}
      />
      <Animated.View
        style={[
          styles.touchPoint,
          {
            transform: [
              {
                scale: pulse.interpolate({
                  inputRange: [0, 0.28, 1],
                  outputRange: [1, 0.72, 0.72],
                }),
              },
            ],
          },
        ]}
      />
      <Text style={styles.label}>HOLD</Text>
    </View>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    cue: {
      position: "absolute",
      width: 56,
      height: 56,
      alignItems: "center",
      justifyContent: "center",
      zIndex: 4,
    },
    arrow: {
      position: "absolute",
      right: 49,
      color: t.accent,
      fontSize: 34,
      lineHeight: 38,
      fontWeight: "900",
      textShadowColor: "rgba(0,0,0,0.28)",
      textShadowRadius: 4,
      textShadowOffset: { width: 0, height: 2 },
    },
    ring: {
      position: "absolute",
      width: 50,
      height: 50,
      borderRadius: 25,
      borderWidth: 4,
      borderColor: "#ffffff",
      backgroundColor: "rgba(255,255,255,0.10)",
    },
    touchPoint: {
      width: 14,
      height: 14,
      borderRadius: 7,
      borderWidth: 3,
      borderColor: "#ffffff",
      backgroundColor: t.accent,
    },
    label: {
      position: "absolute",
      top: 52,
      color: "#ffffff",
      fontSize: 10,
      lineHeight: 12,
      fontWeight: "900",
      textShadowColor: "rgba(0,0,0,0.55)",
      textShadowRadius: 3,
      textShadowOffset: { width: 0, height: 1 },
    },
  });
