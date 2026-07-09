import { Pressable, StyleSheet, Text, View } from "react-native";
import { useGameStore } from "@/src/game/core/store";

function ToggleChip({
  label,
  on,
  onToggle,
  dark,
}: {
  label: string;
  on: boolean;
  onToggle: () => void;
  dark: boolean;
}) {
  return (
    <Pressable
      style={[
        styles.chip,
        dark && styles.chipDark,
        on && (dark ? styles.chipOnDark : styles.chipOn),
      ]}
      onPress={onToggle}
      hitSlop={6}
    >
      <Text
        style={[
          styles.chipText,
          dark && styles.chipTextDark,
          on && styles.chipTextOn,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export function ToggleChips() {
  const settings = useGameStore((s) => s.settings);
  const setSettings = useGameStore((s) => s.setSettings);
  const dark = useGameStore((s) => s.theme === "dark");

  return (
    <View style={styles.row}>
      <ToggleChip
        label="Focus"
        on={settings.focusMode}
        onToggle={() => setSettings({ focusMode: !settings.focusMode })}
        dark={dark}
      />
      {settings.focusMode ? null : (
        <ToggleChip
          label="Auto-View"
          on={settings.autoView}
          onToggle={() => setSettings({ autoView: !settings.autoView })}
          dark={dark}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    position: "absolute",
    right: 14,
    top: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    zIndex: 15,
  },
  chip: {
    height: 36,
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.85)",
    borderRadius: 12,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: "rgba(60,50,40,0.15)",
  },
  chipOn: { backgroundColor: "#6f8a68", borderColor: "#6f8a68" },
  chipText: { fontSize: 12, fontWeight: "700", color: "#2e2a24" },
  chipTextOn: { color: "#fff" },
  chipDark: {
    backgroundColor: "rgba(22,30,44,0.86)",
    borderColor: "rgba(255,255,255,0.18)",
  },
  chipOnDark: { backgroundColor: "#3e5a37", borderColor: "#3e5a37" },
  chipTextDark: { color: "#eef1f6" },
});
