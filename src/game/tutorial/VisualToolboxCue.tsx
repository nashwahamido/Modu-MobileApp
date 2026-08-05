import { useEffect, useRef } from "react";
import { Animated, StyleSheet, Text, View } from "react-native";

import type { TutorialFrame } from "./targetRegistry";
import { ELEVATION, Theme, useStyles } from "@/src/game/ui/system/theme";

interface Props {
  frame: TutorialFrame;
}

export function VisualToolboxCue({ frame }: Props) {
  const styles = useStyles(makeStyles);
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(progress, {
          toValue: 1,
          duration: 2200,
          useNativeDriver: true,
        }),
        Animated.delay(450),
        Animated.timing(progress, {
          toValue: 0,
          duration: 0,
          useNativeDriver: true,
        }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [progress]);

  // The toolbox button sits at the right-hand end of the registered toolbar.
  const toolboxX = frame.x + frame.width - 34;
  const toolboxY = frame.y + frame.height / 2;

  return (
    <View
      pointerEvents="none"
      style={[
        styles.cue,
        {
          left: toolboxX - 76,
          top: toolboxY - 72,
        },
      ]}
    >
      <Animated.View
        style={[
          styles.toolCard,
          {
            opacity: progress.interpolate({
              inputRange: [0, 0.2, 0.34, 0.72, 0.9, 1],
              outputRange: [0, 0, 1, 1, 0, 0],
            }),
            transform: [
              {
                translateY: progress.interpolate({
                  inputRange: [0, 0.2, 0.42, 0.72, 1],
                  outputRange: [34, 34, 0, 0, 34],
                }),
              },
              {
                scale: progress.interpolate({
                  inputRange: [0, 0.35, 0.72, 1],
                  outputRange: [0.75, 1.08, 1, 0.75],
                }),
              },
            ],
          },
        ]}
      >
        <Text style={styles.toolIcon}>⌟</Text>
        <Text style={styles.toolLabel}>ALLEN KEY</Text>
      </Animated.View>

      <View style={styles.toolbox}>
        <Animated.View
          style={[
            styles.lid,
            {
              transform: [
                {
                  rotate: progress.interpolate({
                    inputRange: [0, 0.2, 0.35, 0.76, 0.94, 1],
                    outputRange: ["0deg", "0deg", "-24deg", "-24deg", "0deg", "0deg"],
                  }),
                },
                {
                  translateY: progress.interpolate({
                    inputRange: [0, 0.35, 0.76, 1],
                    outputRange: [0, -5, -5, 0],
                  }),
                },
              ],
            },
          ]}
        />
        <View style={styles.boxBody}>
          <View style={styles.handle} />
        </View>
      </View>

      <Animated.View
        style={[
          styles.tapRing,
          {
            opacity: progress.interpolate({
              inputRange: [0, 0.08, 0.25, 0.32, 1],
              outputRange: [0, 1, 0.65, 0, 0],
            }),
            transform: [
              {
                scale: progress.interpolate({
                  inputRange: [0, 0.08, 0.32, 1],
                  outputRange: [0.4, 0.4, 1.45, 1.45],
                }),
              },
            ],
          },
        ]}
      />
      <Animated.Text
        style={[
          styles.tapLabel,
          {
            opacity: progress.interpolate({
              inputRange: [0, 0.08, 0.32, 1],
              outputRange: [0, 1, 0, 0],
            }),
          },
        ]}
      >
        TAP
      </Animated.Text>
    </View>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    cue: {
      position: "absolute",
      width: 110,
      height: 110,
      alignItems: "center",
      justifyContent: "flex-end",
      zIndex: 4,
    },
    toolCard: {
      position: "absolute",
      top: 0,
      width: 70,
      minHeight: 48,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: 12,
      borderWidth: 3,
      borderColor: t.accent,
      backgroundColor: t.surface,
      paddingVertical: 4,
      ...ELEVATION.card,
    },
    toolIcon: {
      color: t.accent,
      fontSize: 22,
      lineHeight: 24,
      fontWeight: "900",
    },
    toolLabel: {
      color: t.text,
      fontSize: 8,
      lineHeight: 10,
      fontWeight: "900",
    },
    toolbox: {
      width: 50,
      height: 39,
      alignItems: "center",
      justifyContent: "flex-end",
    },
    lid: {
      position: "absolute",
      top: 6,
      width: 46,
      height: 9,
      borderRadius: 4,
      borderWidth: 2,
      borderColor: t.onAccent,
      backgroundColor: t.accent,
    },
    boxBody: {
      width: 48,
      height: 27,
      alignItems: "center",
      borderRadius: 7,
      borderWidth: 2,
      borderColor: t.onAccent,
      backgroundColor: t.accent,
    },
    handle: {
      width: 18,
      height: 7,
      marginTop: 5,
      borderRadius: 3,
      borderWidth: 2,
      borderColor: t.onAccent,
    },
    tapRing: {
      position: "absolute",
      bottom: 5,
      width: 34,
      height: 34,
      borderRadius: 17,
      borderWidth: 4,
      borderColor: "#ffffff",
      backgroundColor: "rgba(255,255,255,0.12)",
    },
    tapLabel: {
      position: "absolute",
      right: -4,
      bottom: 14,
      color: "#ffffff",
      fontSize: 9,
      fontWeight: "900",
      textShadowColor: "rgba(0,0,0,0.55)",
      textShadowRadius: 3,
      textShadowOffset: { width: 0, height: 1 },
    },
  });
