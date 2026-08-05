// A level-requirement badge: a star with the required level number centered on it. Shown on
// level-locked Shop tiles and in the "reach level N" purchase notice — one source so both match.
import { StyleSheet, Text, View } from "react-native";

import { LevelStarIcon } from "@/src/components/Icons";
import { Theme, useStyles } from "@/src/game/ui/theme";

export function LevelBadge({ level, size = 72 }: { level: number; size?: number }) {
  const styles = useStyles(makeStyles);
  return (
    <View style={styles.wrap}>
      <LevelStarIcon size={size} />
      <Text style={[styles.number, { fontSize: Math.round(size * 0.4) }]}>{level}</Text>
    </View>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    wrap: { alignItems: "center", justifyContent: "center" },
    number: { position: "absolute", color: t.onAccent, fontWeight: "800" },
  });
