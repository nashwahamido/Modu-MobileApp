import { Image, StyleSheet, View } from "react-native";
import { useGameStore } from "@/src/game/core/store";
import { Button } from "@/src/game/ui/system/Button";
import { SPACE } from "@/src/game/ui/system/theme";

/** The two in-scene toggles. A chip that is ON takes the ACCENT — the same fill as a
 *  pressed button — because "on" and "pressed" are the same idea in this language: the
 *  control is lifted and live. It is deliberately not the success green: green means the
 *  build is done, and a toggle being on is not an achievement. */
export function ToggleChips() {
  return (
    <View style={styles.row}>
      <FocusToggleButton />
      <SpotButton />
    </View>
  );
}

export function FocusToggleButton() {
  const focusMode = useGameStore((s) => s.settings.focusMode);
  const setSettings = useGameStore((s) => s.setSettings);

  return (
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
      variant={focusMode ? "primary" : "secondary"}
      onPress={() => setSettings({ focusMode: !focusMode })}
      accessibilityLabel="Focus mode"
    />
  );
}

export function AutoViewToggleButton() {
  const autoView = useGameStore((s) => s.settings.autoView);
  const setSettings = useGameStore((s) => s.setSettings);

  return (
    <Button
      label="Auto-view"
      small
      pill
      variant={autoView ? "primary" : "secondary"}
      onPress={() => setSettings({ autoView: !autoView })}
      accessibilityLabel="Auto-view"
    />
  );
}

// Exported so the tutorial renders the SAME control the build does, rather than its own copy — that
// divergence is how the tutorial ended up teaching an Auto-view chip the assembly no longer shows.
export function SpotButton() {
  const focusMode = useGameStore((s) => s.settings.focusMode);

  if (focusMode) return null;
  return (
    <Button
      label="Spot"
      small
      pill
      variant="secondary"
      onPress={() => useGameStore.getState().suggestNext()}
      accessibilityLabel="Spot the next part"
    />
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: SPACE.sm },
  focusIcon: { width: 22, height: 22 },
});