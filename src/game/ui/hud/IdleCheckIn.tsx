// "Are you still here?" — Sparky, after the build has sat untouched for a while.
//
// MOMENTUM ONLY, and deliberately so. The profile exists for players who lose the thread when
// progress stalls; the other three are each built around NOT being nudged — Control asks for help
// when it wants it, Clear Path is already showing exactly one next step, and Lumi is being read to.
// The profile test lives in this component rather than at the call site, so no future caller can
// disagree with it about who this is for.
import { useEffect, useRef, useState } from "react";
import { Animated, AppState, StyleSheet, Text, View } from "react-native";
import { Pressable } from "@/src/components/Pressable";

import { avatarHeadForProfile } from "@/src/components/avatarAssets";
import { CompanionPortrait } from "@/src/game/ui/hud/CompanionPortrait";
import { useGameStore } from "@/src/game/core/store";
import { useBuildPaused } from "@/src/game/ui/hud/useBuildPaused";
import { ELEVATION, RADIUS, SPACE, ThemeScope, TYPE, type Theme, useFixedStyles } from "@/src/game/ui/system/theme";

/**
 * How long the build sits untouched before Sparky asks.
 *
 * 20 SECONDS. Longer than the tutorial's 12, because the tutorial names the single tap the player
 * owes it and silence there really is being stuck, while here they may be reading the step or
 * hunting the right part. Shorter than the 45 this started at: for the profile built around losing
 * the thread when progress stalls, a check-in that waits three quarters of a minute arrives after
 * the moment it was meant to catch.
 *
 * The fuse restarts on ANY activity, touches included, so the only way to reach it is a genuinely
 * still screen.
 */
const IDLE_MS = 20_000;

/** How long the "welcome back" card stays before it fades itself out. It is a greeting, not a
 *  question, so it should never need dismissing. */
const WELCOME_MS = 6_000;

/** How long "Are you still here?" stays before putting itself away. SHORTER THAN THE GAP TO
 *  StuckCoach, which asks at 30s: without a limit both would be up at once saying different things
 *  about the same silence. It is a check-in, not a question, so nothing waits on an answer. */
const ASK_VISIBLE_MS = 8_000;
/** The panel colour the rest of the app's floating cards use — the project map's PANEL_CREAM, the
 *  celebration panel's, the catalogue's pills. Copied rather than imported for the same reason
 *  MapCoach copies it: it wants a token in theme.ts, and several screens already write it by hand. */
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
  // The whole map rule, shared with the other coaches and the spoken step.
  const paused = useBuildPaused();
  const hintPulse = useGameStore((s) => s.hintPulse);

  const [asking, setAsking] = useState(false);
  const [welcoming, setWelcoming] = useState(false);
  // Bumped by a raw touch. Its only job is to be a dependency of the timer effect, so a touch
  // restarts the fuse exactly as a store change does.
  const [touchTick, setTouchTick] = useState(0);
  const pulse = useRef(new Animated.Value(1)).current;
  const appState = useRef(AppState.currentState);

  const momentum = profile === "momentum";

  useEffect(() => {
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
    if (!asking) return;
    const timer = setTimeout(() => setAsking(false), ASK_VISIBLE_MS);
    return () => clearTimeout(timer);
  }, [asking]);

  useEffect(() => {
    if (!welcoming) return;
    const timer = setTimeout(() => setWelcoming(false), WELCOME_MS);
    return () => clearTimeout(timer);
  }, [welcoming]);

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