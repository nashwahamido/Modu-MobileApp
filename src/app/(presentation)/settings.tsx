// General settings, reached from the homepage. Edits the global store, so choices made here become the defaults when you enter a build. Same controls as the in-game gear panel (SettingsControls).
import { router } from "expo-router";
import { StyleSheet, Pressable, ScrollView, Text, View } from "react-native";
import { useScreenInsets } from '@/src/hooks/use-safe-insets';
import { SettingsControls } from "@/src/game/ui/settings/SettingsControls";
import { SPACE, TYPE, useFixedStyles } from "@/src/game/ui/system/theme";
import type { Theme } from "@/src/game/ui/system/theme";

export default function SettingsScreen() {
  const styles = useFixedStyles(makeStyles);
  const safe = useScreenInsets();
  // Landscape: the notch / home-indicator sit on the sides, so left/right insets matter as much as top. Pad the header and scroll content by them.
  const padL = 16 + safe.left;
  const padR = 16 + safe.right;
  return (
    <View style={styles.root}>
      <View
        style={[
          styles.header,
          { paddingTop: 10 + safe.top, paddingLeft: padL, paddingRight: padR },
        ]}
      >
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.back}>
          <Text style={styles.backText}>‹ Back</Text>
        </Pressable>
        <Text style={styles.title}>Settings</Text>
        <View style={styles.back} />
      </View>
      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          // raw.bottom, not the floored value: this pad already clears the gesture bar by 96, so flooring it would only push the last row further up
          { paddingLeft: padL + 4, paddingRight: padR + 4, paddingBottom: safe.raw.bottom + 96 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <SettingsControls />
      </ScrollView>
    </View>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
  root: { flex: 1, backgroundColor: t.bg },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingBottom: SPACE.md,
    borderBottomWidth: StyleSheet.hairlineWidth * 2,
    borderBottomColor: t.border,
  },
  back: { minWidth: 64 },
  // The back affordance is the only pressable thing in the header, so it carries the accent — nothing else here should look tappable.
  backText: { ...TYPE.label, fontSize: 16, color: t.accent },
  title: { ...TYPE.title, color: t.text },
  scroll: { paddingTop: SPACE.sm },
  });