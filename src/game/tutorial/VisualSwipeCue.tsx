import { useEffect, useRef } from "react";
import { Animated, StyleSheet, Text, View } from "react-native";

import type { TutorialFrame } from "./targetRegistry";
import { Theme, useStyles } from "@/src/game/ui/system/theme";

interface Props {
  frame: TutorialFrame;
}

export function VisualSwipeCue({ frame }: Props) {
  const styles = useStyles(makeStyles);
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(progress, {
          toValue: 1,
          duration: 850,
          useNativeDriver: true,
        }),
        Animated.timing(progress, {
          toValue: 0,
          duration: 0,
          useNativeDriver: true,
        }),
        Animated.delay(300),
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
      <Animated.Text
        style={[
          styles.arrow,
          {
            opacity: progress.interpolate({
              inputRange: [0, 0.2, 0.85, 1],
              outputRange: [0.3, 1, 1, 0],
            }),
            transform: [
              {
                translateY: progress.interpolate({
                  inputRange: [0, 1],
                  outputRange: [-18, 26],
                }),
              },
            ],
          },
        ]}
      >
        ↓
      </Animated.Text>
      <Text style={styles.label}>SWIPE DOWN</Text>
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
    arrow: {
      color: t.accent,
      fontSize: 42,
      lineHeight: 46,
      fontWeight: "900",
      textShadowColor: "rgba(0,0,0,0.3)",
      textShadowRadius: 4,
      textShadowOffset: { width: 0, height: 2 },
    },
    label: {
      position: "absolute",
      bottom: 8,
      color: "#ffffff",
      fontSize: 10,
      lineHeight: 12,
      fontWeight: "900",
      textShadowColor: "rgba(0,0,0,0.55)",
      textShadowRadius: 3,
      textShadowOffset: { width: 0, height: 1 },
    },
  });
