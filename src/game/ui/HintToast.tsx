import { useEffect } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useGameStore } from "@/src/game/core/store";
import { Theme, useStyles } from "@/src/game/ui/theme";

/** FREE-mode soft nudge: a calm, low-stimulation message shown when the player reaches for a part that isn't ready yet ("Maybe place the leg first."). Driven by store.hint (set by noteBlocked); off entirely in plan/guide and when the softHints setting is off (noteBlocked no-ops there). */
const DISMISS_MS = 3200;

export function HintToast() {
  const styles = useStyles(makeStyles);
  const hint = useGameStore((s) => s.hint);
  const clearHint = useGameStore((s) => s.clearHint);
  const fontScale = useGameStore((s) => s.settings.fontScale);

  useEffect(() => {
    if (!hint) return;
    const t = setTimeout(clearHint, DISMISS_MS);
    return () => clearTimeout(t);
  }, [hint, clearHint]);

  if (!hint) return null;
  return (
    <View style={styles.wrap} pointerEvents="none">
      <View style={styles.bubble}>
        <Text style={[styles.text, { fontSize: Math.round(14 * fontScale) }]}>{hint}</Text>
      </View>
    </View>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
  wrap: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 60,
    alignItems: "center",
  },
  bubble: {
    maxWidth: "80%",
    backgroundColor: t.surface,
    borderRadius: 14,
    paddingVertical: 9,
    paddingHorizontal: 16,
  },
  text: { color: t.text, fontWeight: "700", textAlign: "center" },
  });
