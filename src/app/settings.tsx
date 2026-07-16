// General settings, reached from the homepage. Edits the global store, so choices made here become the defaults when you enter a build. Same controls as the in-game gear panel (SettingsControls).
import { router } from "expo-router";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { SettingsControls } from "@/src/game/ui/SettingsControls";
import { AppNavigation } from "@/src/components/AppNavigation";

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  // Landscape: the notch / home-indicator sit on the sides, so left/right insets matter as much as top. Pad the header and scroll content by them.
  const padL = Math.max(insets.left, 16);
  const padR = Math.max(insets.right, 16);
  return (
    <View style={styles.root}>
      <View
        style={[
          styles.header,
          { paddingTop: insets.top + 10, paddingLeft: padL, paddingRight: padR },
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
          { paddingLeft: padL + 4, paddingRight: padR + 4, paddingBottom: insets.bottom + 96 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <SettingsControls />
      </ScrollView>
      <AppNavigation active="settings" />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#f7f3ea" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(60,50,40,0.1)",
  },
  back: { minWidth: 64 },
  backText: { fontSize: 16, fontWeight: "700", color: "#6f8a68" },
  title: { fontSize: 18, fontWeight: "800", color: "#2e2a24" },
  scroll: { paddingTop: 8 },
});
