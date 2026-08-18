// The IN-BUILD settings list — what the gear panel (GameSettings) shows with a part in the player's hand. A short composition of the shared sections in ./sections.
//
// What is deliberately NOT here, and lives only in the tabbed /settings screen: the Profile preset (one tap would reset every setting mid-build), the Interaction (dev) experiments, Lighting, Dark mode, Text size and Choose tools — all pre-build or app-wide choices. Focus mode is out for the opposite reason: it already has a HUD chip, and a setting that is one tap away on screen does not need a second home behind a panel.
//
// The settings walkthrough opens THIS panel, so every SettingsFocusTarget has to name a row below.
import { View } from "react-native";
import { useFixedStyles } from "@/src/game/ui/system/theme";
import { makeSettingsStyles } from "@/src/game/ui/settings/SettingsPrimitives";
import {
  AudioSection,
  BuildDisplaySection,
  GuidanceSection,
  ProfileSection,
  RestartRow,
  type FocusProps,
  type SettingsFocusTarget,
} from "@/src/game/ui/settings/sections";

export type { SettingsFocusTarget };

export function SettingsControls(props: FocusProps = {}) {
  const styles = useFixedStyles(makeSettingsStyles);
  return (
    <View style={styles.list}>
      {/* The preset that sets every default below it, back in the build panel: switching profile is
          how a player changes the WHOLE interaction model (Control / Momentum / Clear path /
          Visual), and having to leave the assembly for the app settings screen to do it put the
          most consequential control the furthest away. */}
      <ProfileSection />
      <BuildDisplaySection showLighting={false} {...props} />
      <GuidanceSection showManualTools={false} showFocusMode={false} {...props} />
      <AudioSection />
      {/* Last, not first: it throws the build away, and the end of a scrolled list is the one place a thumb does not land by accident. */}
      <RestartRow />
    </View>
  );
}