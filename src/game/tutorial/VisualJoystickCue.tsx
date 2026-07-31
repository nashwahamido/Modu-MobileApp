import { useEffect, useRef } from "react";
import { Animated, StyleSheet, Text, View } from "react-native";

import type { TutorialFrame } from "./targetRegistry";
import { Theme, useStyles } from "@/src/game/ui/theme";

interface Props {
  frame: TutorialFrame;
}

export function VisualJoystickCue({ frame }: Props) {
  const styles = useStyles(makeStyles);
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(progress, {
          toValue: 1,
          duration: 1200,
          useNativeDriver: true,
        }),
        Animated.timing(progress, {
          toValue: 0,
          duration: 650,
          useNativeDriver: true,
        }),
        Animated.delay(250),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [progress]);

  return (
    <View
      pointerEvents="none"
      style={[
        styles.cue,
        {
          left: frame.x,
          top: frame.y,
          width: frame.width,
          height: frame.height,
        },
      ]}
    >
      <Text style={styles.label}>DRAG TO ROTATE</Text>
      <Animated.Text
        style={[
          styles.rotateArrow,
          {
            transform: [
              {
                rotate: progress.interpolate({
                  inputRange: [0, 1],
                  outputRange: ["-40deg", "70deg"],
                }),
              },
              {
                scale: progress.interpolate({
                  inputRange: [0, 0.5, 1],
                  outputRange: [0.9, 1.08, 0.9],
                }),
              },
            ],
          },
        ]}
      >
        ↻
      </Animated.Text>
      <Animated.Text
        style={[
          styles.downArrow,
          {
            opacity: progress.interpolate({
              inputRange: [0, 0.25, 1],
              outputRange: [0.25, 1, 0.25],
            }),
            transform: [
              {
                translateY: progress.interpolate({
                  inputRange: [0, 1],
                  outputRange: [-4, 8],
                }),
              },
            ],
          },
        ]}
      >
        ↓
      </Animated.Text>
    </View>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    cue: {
      position: "absolute",
      alignItems: "center",
      justifyContent: "center",
      zIndex: 4,
    },
    label: {
      position: "absolute",
      top: -18,
      right: 0,
      color: "#ffffff",
      fontSize: 10,
      lineHeight: 12,
      fontWeight: "900",
      textShadowColor: "rgba(0,0,0,0.55)",
      textShadowRadius: 3,
      textShadowOffset: { width: 0, height: 1 },
    },
    rotateArrow: {
      position: "absolute",
      right: -10,
      top: 20,
      color: t.accent,
      fontSize: 52,
      lineHeight: 58,
      fontWeight: "900",
      textShadowColor: "rgba(0,0,0,0.35)",
      textShadowRadius: 5,
      textShadowOffset: { width: 0, height: 2 },
    },
    downArrow: {
      position: "absolute",
      right: 2,
      bottom: 6,
      color: "#ffffff",
      fontSize: 24,
      lineHeight: 27,
      fontWeight: "900",
      textShadowColor: "rgba(0,0,0,0.45)",
      textShadowRadius: 3,
      textShadowOffset: { width: 0, height: 1 },
    },
  });
