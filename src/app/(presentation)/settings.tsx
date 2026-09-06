import {
  useState } from "react";
import { router } from "expo-router";
import { StyleSheet,
  ScrollView,
  Text,
  View,
} from "react-native";
import { Pressable } from "@/src/components/Pressable";
import { useScreenInsets } from '@/src/hooks/use-safe-insets';
import {
  AccountSection,
  AppDisplaySection,
  AudioSection,
  BuildAudioSection,
  BuildDisplaySection,
  GuidanceSection,
  InteractionSection,
  ProfileSection,
  RedoTutorialSection,
} from "@/src/game/ui/settings/sections";
import { FONT, SPACE, TYPE, useFixedStyles } from "@/src/game/ui/system/theme";
import type { Theme } from "@/src/game/ui/system/theme";

type SettingsTab = "general" | "assembly";

const TABS: { id: SettingsTab; label: string }[] = [
  { id: "general", label: "General" },
  { id: "assembly", label: "Assembly" },
];

export default function SettingsScreen() {
  const styles = useFixedStyles(makeStyles);
  const safe = useScreenInsets();
  const [tab, setTab] = useState<SettingsTab>("general");
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

      <View style={[styles.tabs, { paddingLeft: padL, paddingRight: padR }]}>
        {TABS.map((t) => {
          const active = t.id === tab;
          return (
            <Pressable
              key={t.id}
              onPress={() => setTab(t.id)}
              hitSlop={4}
              style={[styles.tab, active && styles.tabActive]}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
            >
              <Text style={[styles.tabText, active && styles.tabTextActive]}>
                {t.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          { paddingLeft: padL + 4, paddingRight: padR + 4, paddingBottom: safe.raw.bottom + 96 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {tab === "general" ? (
          <View style={styles.list}>
            <AppDisplaySection />
            <AudioSection />
            <AccountSection />
          </View>
        ) : (
          <View style={styles.list}>
            <ProfileSection />
            <BuildDisplaySection />
            <InteractionSection />
            <GuidanceSection />
            <BuildAudioSection />
            <RedoTutorialSection />
          </View>
        )}
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
  backText: { ...TYPE.label, fontSize: 16, color: t.accent },
  title: { ...TYPE.title, color: t.text },
  tabs: { flexDirection: "row", gap: 6, paddingTop: SPACE.md },
  tab: {
    flex: 1,
    minHeight: 40,
    borderRadius: 10,
    backgroundColor: t.surfaceRaised,
    borderWidth: 1,
    borderColor: t.border,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6,
  },
  tabActive: { backgroundColor: t.accent, borderColor: t.accent },
  tabText: { fontFamily: FONT, fontSize: 13, fontWeight: "700", color: t.textDim },
  tabTextActive: { color: t.onAccent },
  scroll: { paddingTop: SPACE.sm },
  list: { gap: 2 },
  });