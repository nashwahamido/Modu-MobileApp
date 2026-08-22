import { useEffect, useRef, useState } from "react";
import { Animated, AppState, Pressable, StyleSheet, Text, View } from "react-native";

import { avatarHeadForProfile } from "@/src/components/avatarAssets";
import { CompanionPortrait } from "@/src/game/ui/hud/CompanionPortrait";
import { useGameStore } from "@/src/game/core/store";
import { useBuildPaused } from "@/src/game/ui/hud/useBuildPaused";
import { ELEVATION, RADIUS, SPACE, ThemeScope, TYPE, type Theme, useFixedStyles } from "@/src/game/ui/system/theme";

const IDLE_MS = 20_000;
const WELCOME_MS = 6_000;

/** How long "Are you still here?" stays before it puts itself away.
 *
 *  SHORTER THAN THE GAP TO StuckCoach, deliberately. That card asks at 30s and this one at 20s, so
 *  without a limit both would be on screen at once, saying different things about the same silence.
 *  It is a check-in rather than a question, so nothing is waiting on an answer and letting it expire
 *  costs the player nothing. */
const ASK_VISIBLE_MS = 8_000;
const CARD_CREAM = "#FBF8F3";
const CARD_INK = "#231F20";

export function IdleCheckIn() {
  const styles = useFixedStyles(makeStyles);
  const profile = useGameStore((s) => s.profile);

  // Every store field that means "the player is doing something". Camera moves are NOT in here —
  // orbiting is local to the manipulator and never reaches the store — which is why the layer below
  // also watches raw touches.
  const completedCount = useGameStore((s) => s.completed.length);
  const heldActionId = useGameStore((s) => s.heldActionId);
  const driveActionId = useGameStore((s) => s.driveActionId);
  const orientationActionId = useGameStore((s) => s.orientationActionId);
  const activeCluster = useGameStore((s) => s.activeCluster);
  const hintPulse = useGameStore((s) => s.hintPulse);

  const paused = useBuildPaused();

  const [asking, setAsking] = useState(false);
  const [welcoming, setWelcoming] = useState(false);
  // Bumped by a raw touch. Its only job is to be a dependency of the timer effect, so a touch
  // restarts the fuse exactly as a store change does.
  const [touchTick, setTouchTick] = useState(0);
  const pulse = useRef(new Animated.Value(1)).current;
  const appState = useRef(AppState.currentState);

  const momentum = profile === "momentum";

  useEffect(() => {
    // The map is a pause: no check-in behind it, and no idle clock running either — time spent
    // looking at the build map is not time spent stuck.
    if (!momentum || paused || welcoming) return;
    setAsking(false);
    const timer = setTimeout(() => setAsking(true), IDLE_MS);
    return () => clearTimeout(timer);
  }, [
    momentum,
    paused,
    welcoming,
    completedCount,
    heldActionId,
    driveActionId,
    orientationActionId,
    activeCluster,
    hintPulse,
    touchTick,
  ]);

  // COMING BACK TO THE APP is its own moment, and a better one than the timer's: the player has just
  // returned from somewhere else and the build is mid-step. It replaces the question with a greeting
  // rather than stacking on top of it.
  useEffect(() => {
    if (!momentum) return;
    const sub = AppState.addEventListener("change", (next) => {
      const previous = appState.current;
      appState.current = next;
      if (previous !== "active" && next === "active") {
        setAsking(false);
        setWelcoming(true);
      }
    });
    return () => sub.remove();
  }, [momentum]);

  useEffect(() => {
    if (!welcoming) return;
    const timer = setTimeout(() => setWelcoming(false), WELCOME_MS);
    return () => clearTimeout(timer);
  }, [welcoming]);

  useEffect(() => {
    if (!asking) return;
    const timer = setTimeout(() => setAsking(false), ASK_VISIBLE_MS);
    return () => clearTimeout(timer);
  }, [asking]);

  // The same slow breath the tutorial's card uses, so the two read as one character rather than as
  // two different notifications from the same app.
  useEffect(() => {
    if (!asking && !welcoming) {
      pulse.stopAnimation();
      pulse.setValue(1);
      return;
    }
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.035, duration: 700, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: true }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [pulse, asking, welcoming]);

  if (!momentum || paused || (!asking && !welcoming)) return null;

  const dismiss = () => {
    setAsking(false);
    setWelcoming(false);
  };

  return (
    // LIGHT, always. This card floats OVER the build the way the map and the celebrations do, and
    // play.tsx already scopes those three to light for the same reason: "Assemble in Dark Mode" is a
    // setting about the build surface, not about the panels shown on top of it. Without this the
    // portrait's rim resolved dark against a cream card.
    <ThemeScope value="light">
    <View
      style={styles.layer}
      // BOX-NONE, so the build underneath stays live and the card never eats a touch.
      pointerEvents="box-none"
      // Observes touches without taking them. Returning false from the CAPTURE handler lets the
      // gesture continue to whatever the player actually aimed at, while still telling us they are
      // here — which is how camera-only interaction resets the fuse even though orbiting never
      // touches the store.
      onStartShouldSetResponderCapture={() => {
        setTouchTick((n) => n + 1);
        return false;
      }}
    >
      {/* THE TUTORIAL'S SHAPE: a portrait tile OUTSIDE a copy card, not an avatar inside one. The row
          itself is transparent — only `copy` is the bubble, which is what lets Sparky sit beside it
          the way he does on every tutorial step rather than boxed in with the words. */}
      <Animated.View style={[styles.row, { transform: [{ scale: pulse }] }]}>
        <CompanionPortrait source={avatarHeadForProfile(profile)} accessibilityLabel="Sparky" />
        <View style={styles.copy}>
          <Text style={styles.title}>
            {welcoming ? "Welcome back!" : "Are you still here?"}
          </Text>
          <Text style={styles.message}>
            {welcoming
              ? "Your build is exactly where you left it."
              : "No rush. Your build is saved and Sparky is right here."}
          </Text>
          {/* An explicit way out as well as the touch-anywhere above: the card sits over the scene,
              and a player who wants it gone should not have to guess that tapping the build does it.
              INSIDE the copy card now, since that is the only bordered surface left. */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Dismiss"
            hitSlop={10}
            onPress={dismiss}
            style={({ pressed }) => [styles.dismiss, pressed && styles.dismissPressed]}
          >
            <Text style={styles.dismissText}>Got it</Text>
          </Pressable>
        </View>
      </Animated.View>
    </View>
    </ThemeScope>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    // Below the map and the celebrations, above the build chrome: it is an interruption, not a
    // modal, and nothing it says should ever cover a completion moment.
    layer: {
      ...StyleSheet.absoluteFillObject,
      zIndex: 60,
      alignItems: "center",
      justifyContent: "flex-start",
      paddingTop: 92,
    },
    // TRANSPARENT, and only a layout row: the portrait and the card are two separate surfaces the way
    // the tutorial draws them. Gap 10 is the tutorial's own.
    row: {
      maxWidth: 440,
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
    },
    // The bubble. Radius 16 and padding 14/12 are the tutorial card's, so the two read as one voice.
    copy: {
      flexShrink: 1,
      minWidth: 0,
      paddingHorizontal: 14,
      paddingVertical: 12,
      borderRadius: 16,
      // NO STROKE. The card is separated from the scene by its fill and its shadow alone — an
      // outline on a card that already sits on a shaped surface reads as a second edge.
      // The app's floating-panel cream, not the theme surface, so it matches every other card that
      // sits over the build rather than following the build's own theme.
      backgroundColor: CARD_CREAM,
      ...ELEVATION.card,
    },
    title: { ...TYPE.title, color: CARD_INK },
    message: { ...TYPE.body, marginTop: 3, color: t.textDim },
    // RIGHT-ALIGNED and FILLED with the accent: it is the one thing on this card that can be pressed,
    // and lavender is the app's single "you can act on this" colour. As a quiet grey pill on the left
    // it read as a label rather than a control.
    dismiss: {
      alignSelf: "flex-end",
      marginTop: SPACE.sm,
      paddingHorizontal: SPACE.md,
      paddingVertical: SPACE.sm,
      borderRadius: RADIUS.pill,
      backgroundColor: t.accent,
    },
    dismissPressed: { backgroundColor: t.accentPressed },
    // onAccent, not text: the same label colour every filled button in the app uses (system/Button).
    dismissText: { ...TYPE.label, color: t.onAccent },
  });