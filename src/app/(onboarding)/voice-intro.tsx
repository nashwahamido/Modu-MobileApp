import { useEffect, useRef } from "react";
import { router, type Href } from "expo-router";
import { Animated, StyleSheet, Text, View } from "react-native";

import { Button } from "@/src/game/ui/system/Button";
import { SceneBackdrop } from "@/src/game/ui/backdrop/SceneBackdrop";
import { VoiceButton } from "@/src/game/ui/hud/VoiceButton";
import { useSafeInsets } from "@/src/hooks/use-safe-insets";
import {
  ELEVATION,
  FONT,
  SPACE,
  type Theme,
  useStyles,
} from "@/src/game/ui/system/theme";

const backdrop = require("../../assets/ui/onboarding-backdrop.png");
const BG_SOLID = "#F3ECE0";

const NEXT: Href = "/onboarding-questionnaire" as Href;

export default function VoiceIntroScreen() {
  const styles = useStyles(makeStyles);
  const safe = useSafeInsets();

  const on = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.spring(on, {
      toValue: 1,
      damping: 10,
      stiffness: 180,
      mass: 0.8,
      useNativeDriver: true,
    }).start();
  }, [on]);

  return (
    <SceneBackdrop
      source={backdrop}
      style={[
        styles.root,
        {
          paddingLeft: Math.max(safe.raw.left, 24),
          paddingRight: Math.max(safe.raw.right, 24),
          paddingTop: Math.max(safe.raw.top, 16),
          paddingBottom: Math.max(safe.raw.bottom, 16),
        },
      ]}
    >
      <Animated.View
        style={[
          styles.card,
          {
            opacity: on.interpolate({ inputRange: [0, 0.34, 1], outputRange: [0, 1, 1] }),
            transform: [
              { scale: on.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }) },
            ],
          },
        ]}
      >
        <View style={styles.iconWrap}>
          <VoiceButton onPress={() => undefined} />
        </View>
        <Text style={styles.title}>Voice is available.</Text>
        <Text style={styles.body}>
          Tap the voice button beside a question or answer to hear it read aloud.
        </Text>
        <Button
          label="Got it"
          variant="primary"
          pill
          onPress={() => router.replace(NEXT)}
          style={styles.cta}
        />
      </Animated.View>
    </SceneBackdrop>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    root: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: BG_SOLID,
    },
    card: {
      width: 560,
      maxWidth: "100%",
      alignItems: "center",
      paddingHorizontal: 32,
      paddingVertical: 28,
      borderRadius: 26,
      backgroundColor: t.surface,
      ...ELEVATION.card,
    },
    iconWrap: { marginBottom: 14 },
    title: {
      color: t.accent,
      fontFamily: FONT,
      fontSize: 24,
      fontWeight: "900",
      textAlign: "center",
      marginBottom: SPACE.sm,
    },
    body: {
      color: t.text,
      fontFamily: FONT,
      fontSize: 16,
      fontWeight: "700",
      lineHeight: 23,
      textAlign: "center",
    },
    cta: { marginTop: 22, minWidth: 150 },
  });
