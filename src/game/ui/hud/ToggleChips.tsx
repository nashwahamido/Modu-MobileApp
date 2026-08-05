import { Image, StyleSheet, View } from "react-native";
import { useGameStore } from "@/src/game/core/store";
import { Button } from "@/src/game/ui/system/Button";
import { SPACE } from "@/src/game/ui/system/theme";

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
        icon={
          <Image
            source={require("@/src/assets/ui/icons/icon-focus.png")}
            style={styles.focusIcon}
            resizeMode="contain"
          />
        }
        small
        pill
        variant={settings.focusMode ? "primary" : "secondary"}
        onPress={() => setSettings({ focusMode: !settings.focusMode })}
        accessibilityLabel="Focus mode"
      />
      {settings.focusMode ? null : (
        // Spot is a ONE-SHOT, not a toggle: it fires an arrow at the next socket and puts itself out. Hence always "secondary" — a chip that stayed lit would claim a mode is on. The autoView SETTING still exists and still has its switch in Settings; this chip is no longer its control.
        <Button
          label="Spot"
          small
          pill
          variant="secondary"
          onPress={() => useGameStore.getState().suggestNext()}
          accessibilityLabel="Spot the next part"
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: SPACE.sm },
  focusIcon: { width: 22, height: 22 },
});