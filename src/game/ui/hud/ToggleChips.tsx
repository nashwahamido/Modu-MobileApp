import { Image, StyleSheet, View } from "react-native";
import { useGameStore } from "@/src/game/core/store";
import { Button } from "@/src/game/ui/system/Button";
import { SPACE } from "@/src/game/ui/system/theme";
import { useHudIcon } from "@/src/game/ui/hud/hudIcons";
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
  const focusIcon = useHudIcon("focus");
  return (
    <Button
      icon={
        <Image
          source={focusIcon}
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
// Exported so the tutorial renders the SAME control the build does, rather than its own copy — that
// divergence is how the tutorial ended up teaching a chip the assembly no longer shows.
// Rendered in FOCUS MODE too. Focus strips the HUD down to the current step, and Spot is about the
// current step — "which part, and where does it go" is the question focus mode leaves a player alone
// with, so it is the last thing that should disappear alongside the rest of the chrome.
export function SpotButton() {
  return (
    <Button
      label="Spot"
      small
      pill
      variant="secondary"
      onPress={() => useGameStore.getState().suggestNext("spot")}
      accessibilityLabel="Spot the next part"
    />
  );
}
const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: SPACE.sm },
  focusIcon: { width: 22, height: 22 },
});