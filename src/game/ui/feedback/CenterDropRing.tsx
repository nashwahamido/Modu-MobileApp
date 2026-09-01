import { Theme, useFixedStyles } from "@/src/game/ui/system/theme";
import { StyleSheet, View } from "react-native";
import { selectFirstDrop, useGameStore } from "@/src/game/core/store";

const SIZE = 92;

export function CenterDropRing() {
  const styles = useFixedStyles(makeStyles);
  const firstDrop = useGameStore(selectFirstDrop);
  const fitState = useGameStore((s) => s.fitState);
  if (!firstDrop) return null;
  const ready = fitState === "nearCorrect";
  return (
    <View style={styles.wrap} pointerEvents="none">
      <View style={[styles.ring, ready && styles.ringReady]} />
    </View>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
  wrap: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
  ring: {
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    borderWidth: 3,
    borderStyle: "dashed",
    borderColor: t.surface,
  },
  ringReady: {
    borderStyle: "solid",
    borderColor: t.success,
  },
  });
