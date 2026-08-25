// The IN-BUILD settings list — what the gear panel (GameSettings) shows with a part in the player's hand. A short composition of the shared sections in ./sections.
//
// What is deliberately NOT here, and lives only in the tabbed /settings screen: the Profile preset (one tap would reset every setting mid-build), the whole Interaction section (Released part, Drag mechanism and Choose tools — swapping the tool policy mid-build changes the next step under the player's finger) and Dark mode — all pre-build or app-wide choices. Focus mode is out for the opposite reason: it already has a HUD chip, and a setting that is one tap away on screen does not need a second home behind a panel. Lighting and Text size no longer exist on any surface; see LIGHTING_RETIRED and the note in AppDisplaySection.
//
// The settings walkthrough opens THIS panel, so every SettingsFocusTarget has to name a row below.
import { View } from "react-native";
import { useSettingsStyles } from "@/src/game/ui/settings/SettingsPrimitives";
import {
  BuildAudioSection,
  BuildDisplaySection,
  GuidanceSection,
  RestartRow,
  type FocusProps,
  type SettingsFocusTarget,
} from "@/src/game/ui/settings/sections";

export type { SettingsFocusTarget };

export function SettingsControls({
  onRestarted,
  ...props
}: FocusProps & { onRestarted?: () => void } = {}) {
  const styles = useSettingsStyles();
  return (
    <View style={styles.list}>
      {/* showFocusMode travelled here from GuidanceSection with the row itself — Focus mode is a Display
          row now, and this is the panel that must not show it. showLighting is gone with the Lighting
          row: this panel no longer has to opt out of a control that exists nowhere. */}
      <BuildDisplaySection showFocusMode={false} {...props} />
      <GuidanceSection {...props} />
      <BuildAudioSection />
      {/* Last, not first: it throws the build away, and the end of a scrolled list is the one place a thumb does not land by accident. */}
      <RestartRow onRestarted={onRestarted} />
    </View>
  );
}