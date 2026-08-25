// "Voice is available" — its own screen, ahead of Modu's introduction.
//
// It used to be a small card that appeared over question 1 a beat after the intro, and that is the
// wrong moment twice over: the player has just been handed a question, so a panel arriving on top of
// it competes with the thing they are trying to read, and it timed itself out after ~5 seconds
// whether or not they had looked. Something that tells a player how to have the app READ TO THEM is
// not a passing hint — for the profile that needs it, it is the most important sentence in
// onboarding.
//
// So it is a page, it is centred, and it waits: nothing moves until "Got it".
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

/** Where this hands over. The questionnaire opens on Modu's introduction, so the player meets the
 *  voice, then meets Modu, then answers. `replace` rather than `push`: this is a one-way step, and
 *  leaving it on the stack would let the hardware back button return to a notice already answered. */
const NEXT: Href = "/onboarding-questionnaire" as Href;

export default function VoiceIntroScreen() {
  const styles = useStyles(makeStyles);
  const safe = useSafeInsets();

  // The same pop the questionnaire's own cards use — opacity racing ahead of a spring-ish scale, so
  // the card arrives rather than fades. Written with Animated rather than the questionnaire's
  // Reanimated PopIn because this screen has one element and no need for a worklet.
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
        {/* The real control, not a picture of one. It is inert here — onPress does nothing — because
            the point is recognising the button later, and a speaker that talked back on a page with
            nothing to read would be a puzzle rather than an introduction. */}
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
    // CENTRED both ways. The old card was anchored near the control it described; with nothing else
    // on screen there is nothing to anchor to, and the middle is where the eye already is.
    root: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: BG_SOLID,
    },
    // BIG, at her request: roughly twice the old 300pt hint and generous with its padding, so it
    // reads as the screen's content rather than as a note pinned to it. These are BASE numbers —
    // useStyles runs the whole sheet through scaleSheet, so multiplying by the UI scale here would
    // apply it twice and the card would overflow a tablet.
    card: {
      width: 560,
      maxWidth: "100%",
      alignItems: "center",
      paddingHorizontal: 32,
      paddingVertical: 28,
      borderRadius: 26,
      // NO STROKE. The card is separated from the backdrop by its fill and its shadow alone, the same
      // way the build screen's coaches are — an outline on a card this large read as a frame around
      // the screen rather than as the card's own edge.
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
