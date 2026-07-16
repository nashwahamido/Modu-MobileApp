import { StyleSheet, View } from "react-native";
import { useGameStore } from "@/src/game/core/store";
import { Button } from "@/src/game/ui/Button";
import { SPACE } from "@/src/game/ui/theme";

/** The two in-scene toggles. A chip that is ON takes the ACCENT — the same fill as a
 *  pressed button — because "on" and "pressed" are the same idea in this language: the
 *  control is lifted and live. It is deliberately not the success green: green means the
 *  build is done, and a toggle being on is not an achievement. */
export function ToggleChips() {
  const settings = useGameStore((s) => s.settings);
  const setSettings = useGameStore((s) => s.setSettings);

  return (
    <View style={styles.row}>
      <Button
        label="Focus"
        small
        pill
        variant={settings.focusMode ? "primary" : "secondary"}
        onPress={() => setSettings({ focusMode: !settings.focusMode })}
      />
      {settings.focusMode ? null : (
        <Button
          label="Auto-View"
          small
          pill
          variant={settings.autoView ? "primary" : "secondary"}
          onPress={() => setSettings({ autoView: !settings.autoView })}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: SPACE.sm },
});
