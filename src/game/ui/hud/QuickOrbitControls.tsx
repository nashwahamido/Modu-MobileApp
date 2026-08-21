import { Theme, useFixedStyles } from "@/src/game/ui/system/theme";
import * as Haptics from "expo-haptics";
import { Pressable, StyleSheet, Text, View } from "react-native";

const NUDGE_PX = 78;

interface Props {
  onOrbitBy: (dx: number, dy: number) => void;
  onRotateQuarter: (direction: -1 | 1) => void;
}

export function QuickOrbitControls({ onOrbitBy, onRotateQuarter }: Props) {
  const styles = useFixedStyles(makeStyles);
  const press = (fn: () => void) => {
    fn();
    Haptics.selectionAsync();
  };

  return (
    <View style={styles.pad} pointerEvents="box-none">
      <View style={styles.turnRow}>
        <Pressable
          accessibilityLabel="Rotate left 90 degrees"
          onPress={() => press(() => onRotateQuarter(-1))}
          style={styles.turnButton}
        >
          <Text style={styles.turnText}>↺ 90°</Text>
        </Pressable>
        <Pressable
          accessibilityLabel="Rotate right 90 degrees"
          onPress={() => press(() => onRotateQuarter(1))}
          style={styles.turnButton}
        >
          <Text style={styles.turnText}>90° ↻</Text>
        </Pressable>
      </View>
      <View style={styles.dpad}>
        <View style={styles.dpadRow}>
          <View style={styles.spacer} />
          <Pressable
            accessibilityLabel="Orbit up"
            onPress={() => press(() => onOrbitBy(0, -NUDGE_PX))}
            style={styles.arrowButton}
          >
            <Text style={styles.arrowText}>↑</Text>
          </Pressable>
          <View style={styles.spacer} />
        </View>
        <View style={styles.dpadRow}>
          <Pressable
            accessibilityLabel="Orbit left"
            onPress={() => press(() => onOrbitBy(-NUDGE_PX, 0))}
            style={styles.arrowButton}
          >
            <Text style={styles.arrowText}>←</Text>
          </Pressable>
          <Pressable
            accessibilityLabel="Orbit down"
            onPress={() => press(() => onOrbitBy(0, NUDGE_PX))}
            style={styles.arrowButton}
          >
            <Text style={styles.arrowText}>↓</Text>
          </Pressable>
          <Pressable
            accessibilityLabel="Orbit right"
            onPress={() => press(() => onOrbitBy(NUDGE_PX, 0))}
            style={styles.arrowButton}
          >
            <Text style={styles.arrowText}>→</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
  pad: {
    position: "absolute",
    bottom: 16,
    alignSelf: "center",
    alignItems: "center",
    gap: 6,
  },
  turnRow: { flexDirection: "row", gap: 6 },
  turnButton: {
    minWidth: 70,
    minHeight: 34,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: t.borderStrong,
    backgroundColor: t.surface,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 9,
  },
  turnText: { color: t.text, fontSize: 12, fontWeight: "800" },
  dpad: { gap: 4 },
  dpadRow: { flexDirection: "row", gap: 4, justifyContent: "center" },
  spacer: { width: 42, height: 34 },
  arrowButton: {
    width: 42,
    height: 34,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: t.borderStrong,
    backgroundColor: t.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  arrowText: { color: t.text, fontSize: 18, fontWeight: "900" },
  });
