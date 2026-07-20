import { useEffect, useRef, useState } from "react";
import { Animated, StyleSheet, Text, View } from "react-native";
import { useGameStore } from "@/src/game/core/store";
import { Button, ProgressBar } from "@/src/game/ui/Button";
import { Theme, useStyles } from "@/src/game/ui/theme";
import { advance, type Milestone } from "./loadingProgress";

interface Props {
  /** Reached load signal (loadingProgress.ts); the parent derives it from store + onModelReady. */
  milestone: Milestone;
  /** Swaps the bar for the error message + Try again/Back (data-load rejection or the model watchdog). */
  error: boolean;
  onRetry: () => void;
  onBack: () => void;
  /** Fired after the fade-out completes — the parent unmounts the overlay then. */
  onFadedOut: () => void;
}

const TICK_MS = 100;
const HOLD_MS = 150;
const FADE_MS = 300;

/** Full-screen loading cover for the play screen: avatar slot + furniture name + creep/jump progress bar, with an error state. Rendered ABOVE the scene so the GLB parses beneath it; opaque, so the blank scene is never visible. */
export function LoadingOverlay({ milestone, error, onRetry, onBack, onFadedOut }: Props) {
  const styles = useStyles(makeStyles);
  const profile = useGameStore((s) => s.profile);
  const furniture = useGameStore((s) => s.furniture);
  const fontScale = useGameStore((s) => s.settings.fontScale);
  const simple = useGameStore((s) => s.settings.textLevel === "simple");
  const [fraction, setFraction] = useState(0);
  const opacity = useRef(new Animated.Value(1)).current;
  const fading = useRef(false);

  // Creep + jump tick. Paused while the error UI is up — a moving bar under an error message reads as a lie.
  useEffect(() => {
    if (error) return;
    const iv = setInterval(() => setFraction((f) => advance(f, TICK_MS, milestone)), TICK_MS);
    return () => clearInterval(iv);
  }, [milestone, error]);

  // The final beat: bar at 100% → short hold → fade → parent unmounts us. fading ref guards double-runs when deps churn mid-fade, and re-arms on error so a later successful retry can fade out again; an error arriving mid-fade stops the animation and restores full opacity, and the finished:false that stopAnimation produces is what keeps onFadedOut from firing on an aborted fade.
  useEffect(() => {
    if (error) {
      fading.current = false;
      opacity.stopAnimation();
      opacity.setValue(1);
      return;
    }
    if (milestone !== 1 || fraction < 1 || fading.current) return;
    fading.current = true;
    const hold = setTimeout(() => {
      Animated.timing(opacity, { toValue: 0, duration: FADE_MS, useNativeDriver: true }).start(({ finished }) => {
        if (finished) onFadedOut();
      });
    }, HOLD_MS);
    return () => clearTimeout(hold);
  }, [error, milestone, fraction, opacity, onFadedOut]);

  // Avatar placeholder: the active profile's initial in a ring — real art replaces the Text without layout changes.
  const initial = profile.charAt(0).toUpperCase();

  return (
    <Animated.View style={[styles.root, { opacity }]}>
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>{initial}</Text>
      </View>
      {error ? (
        <>
          <Text style={[styles.name, { fontSize: 16 * fontScale }]}>
            {simple ? "This didn't load." : "Couldn't load this furniture."}
          </Text>
          <View style={styles.buttons}>
            <Button label="Try again" variant="primary" onPress={onRetry} />
            <Button label="Back" onPress={onBack} />
          </View>
        </>
      ) : (
        <>
          <Text style={[styles.name, { fontSize: 16 * fontScale }]}>
            {furniture ? `${furniture.meta.name} · ${furniture.meta.brand}` : "Loading…"}
          </Text>
          <ProgressBar value={fraction} total={1} style={styles.bar} />
        </>
      )}
    </Animated.View>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    root: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: t.bg,
      alignItems: "center",
      justifyContent: "center",
      gap: 18,
      // Being the LAST child is not enough to cover the HUD: on Android an elevated view draws above later siblings regardless of tree order, so the cluster chooser (elevation 20) and every ELEVATION.card panel punched through. zIndex covers iOS/web ordering, elevation covers Android, and 100 sits far above the highest value any HUD element uses.
      zIndex: 100,
      elevation: 100,
    },
    avatar: {
      width: 72,
      height: 72,
      borderRadius: 36,
      backgroundColor: t.surfaceInset,
      borderWidth: 2,
      borderColor: t.accent,
      alignItems: "center",
      justifyContent: "center",
    },
    avatarText: { color: t.text, fontSize: 28, fontWeight: "700" },
    name: { color: t.textDim, fontWeight: "600" },
    bar: { width: "60%", maxWidth: 420 },
    buttons: { flexDirection: "row", gap: 12, marginTop: 6 },
  });
