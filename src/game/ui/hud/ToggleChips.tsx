import { Image, StyleSheet, View } from "react-native";
import { useGameStore } from "@/src/game/core/store";
import { Button } from "@/src/game/ui/system/Button";
import { SPACE, useThemeId } from "@/src/game/ui/system/theme";
import { hudIcon } from "@/src/game/ui/hud/hudIcons";
import { HudSpotTarget } from "@/src/game/ui/hud/hudSpotlight";
export function ToggleChips() {
  return (
    <View style={styles.row}>
      <FocusToggleButton />
      <HudSpotTarget id="spot">
        <SpotButton />
      </HudSpotTarget>
    </View>
  );
}
export function FocusToggleButton() {
  const focusMode = useGameStore((s) => s.settings.focusMode);
  const setSettings = useGameStore((s) => s.setSettings);
  const dark = useThemeId() !== "light";
  const focusIcon = hudIcon("focus", focusMode ? !dark : dark);
  return (
    <Button
      label="Focus"
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