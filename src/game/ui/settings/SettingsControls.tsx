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
      <BuildDisplaySection showFocusMode={false} {...props} />
      <GuidanceSection {...props} />
      <BuildAudioSection />
      <RestartRow onRestarted={onRestarted} />
    </View>
  );
}