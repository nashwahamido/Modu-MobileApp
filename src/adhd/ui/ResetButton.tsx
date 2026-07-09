import { Alert, Pressable, StyleSheet, Text } from "react-native";
import { useGameStore } from "@/src/adhd/core/store";

/** Top-right chip that restarts the assembly from scratch (with confirm). */
export function ResetButton() {
  const completedCount = useGameStore((s) => s.completed.length);
  const reset = useGameStore((s) => s.reset);

  const confirmReset = () => {
    if (completedCount === 0) return;
    Alert.alert("Start over?", "This clears all assembly progress.", [
      { text: "Cancel", style: "cancel" },
      { text: "Reset", style: "destructive", onPress: reset },
    ]);
  };

  return (
    <Pressable
      style={[styles.btn, completedCount === 0 && styles.btnIdle]}
      onPress={confirmReset}
      hitSlop={8}
    >
      <Text style={styles.text}>↺ Reset</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    position: "absolute",
    top: 102,
    left: 14,
    backgroundColor: "rgba(255,255,255,0.75)",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 14,
  },
  btnIdle: { opacity: 0.4 },
  text: { fontSize: 13, fontWeight: "700", color: "#2e2a24" },
});