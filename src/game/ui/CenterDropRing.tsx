import { Theme, useStyles } from "@/src/game/ui/theme";
import { StyleSheet, View } from "react-native";
import { selectFirstDrop, useGameStore } from "@/src/game/core/store";

/** First-part drop target. The very first part of a cluster has nothing to align to, so instead of a socket ghost we centre the camera on where it lands and show this ring at screen centre. It turns green when the part is close enough to place. Hidden for every later part. */
const SIZE = 92;

export function CenterDropRing() {
  const styles = useStyles(makeStyles);
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
