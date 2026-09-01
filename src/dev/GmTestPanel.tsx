import { router } from "expo-router";
import type { Href } from "expo-router";
import { useState } from "react";
import { StyleSheet, ScrollView, Text, View, useWindowDimensions } from "react-native";
import { Pressable } from "@/src/components/Pressable";
import { AccountSwitcher } from "./AccountSwitcher";
import { useGameStore } from "@/src/game/core/store";
import { useTutorialStore } from "@/src/game/tutorial/store";
import type { ProfileId } from "@/src/game/core/profile";
import { resetMapCoachSeen } from "@/src/game/ui/hud/MapCoach";
import { useCurrentUserId, useRepos } from "@/src/data";

type GmTarget = {
  label: string;
  route: Href;
  note: string;
  profile?: ProfileId;
};

const targets: GmTarget[] = [
  { label: "Welcome", route: "/" as Href, note: "Landing screen" },
  { label: "Onboarding", route: "/voice-intro" as Href, note: "Voice notice, then questionnaire" },
  {
    label: "Avatar",
    route: "/avatar-recommendation?mode=momentum&secondary=visual" as Href,
    note: "Recommendation result",
  },
  { label: "Tut · Lumi", route: "/tutorial" as Href, note: "Visual", profile: "visual" },
  { label: "Tut · Sparky", route: "/tutorial" as Href, note: "Momentum", profile: "momentum" },
  { label: "Tut · Pebble", route: "/tutorial" as Href, note: "Clear Path", profile: "clearPath" },
  { label: "Tut · Felix", route: "/tutorial" as Href, note: "Control", profile: "control" },
  { label: "Task", route: "/catalogue" as Href, note: "Task catalogue" },
  { label: "Room", route: "/room" as Href, note: "Virtual room" },
  { label: "Profile", route: "/profile" as Href, note: "Profile & friends" },
  { label: "Visit", route: "/visit" as Href, note: "Visit route (no owner)" },
  { label: "Engine", route: "/engine-test" as Href, note: "Engine test (dev)" },
];

const PANEL_BOTTOM_INSET = 132 + 10;
const PANEL_TOP_GUTTER = 24;

export function GmTestPanel() {
  const [open, setOpen] = useState(false);
  const { height } = useWindowDimensions();
  const repos = useRepos();
  const me = useCurrentUserId();
  const maxPanelHeight = Math.max(180, height - PANEL_BOTTOM_INSET - PANEL_TOP_GUTTER);

  const jumpTo = (target: GmTarget) => {
    setOpen(false);
    if (target.profile) {
      useGameStore.getState().applyProfile(target.profile);
      useTutorialStore.getState().resetTutorial();
    }
    router.replace(target.route);
  };

  return (
    <View pointerEvents="box-none" style={styles.root}>
      {open ? (
        <View style={[styles.panel, { maxHeight: maxPanelHeight }]} pointerEvents="auto">
          <View style={styles.header}>
            <View>
              <Text style={styles.title}>GM Test</Text>
              <Text style={styles.subtitle}>Jump to demo states</Text>
            </View>
            <Pressable onPress={() => setOpen(false)} hitSlop={10} style={styles.closeButton}>
              <Text style={styles.closeText}>×</Text>
            </Pressable>
          </View>
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator
          >
            <View style={styles.grid}>
              {targets.map((target) => (
                <Pressable
                  key={target.label}
                  onPress={() => jumpTo(target)}
                  style={styles.targetButton}
                  hitSlop={4}
                >
                  <Text style={styles.targetLabel}>{target.label}</Text>
                  <Text style={styles.targetNote}>{target.note}</Text>
                </Pressable>
              ))}
            </View>
            <Pressable
              onPress={() => {
                void resetMapCoachSeen(repos.profiles, me).then(() => setOpen(false));
              }}
              style={styles.targetButton}
              hitSlop={4}
            >
              <Text style={styles.targetLabel}>Reset Map coach</Text>
              <Text style={styles.targetNote}>Show it again on the next task</Text>
            </Pressable>
            <AccountSwitcher onDone={() => setOpen(false)} />
          </ScrollView>
        </View>
      ) : null}
      <Pressable
        onPress={() => setOpen((value) => !value)}
        style={[styles.fab, open && styles.fabOpen]}
        hitSlop={10}
        pointerEvents="auto"
      >
        <Text style={styles.fabText}>DEV</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    position: "absolute",
    left: 24,
    bottom: 132,
    zIndex: 999,
    alignItems: "flex-start",
  },
  fab: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#231F20",
    opacity: 0.4,
    borderWidth: 2,
    borderColor: "rgba(251, 248, 243, 0.94)",
    shadowColor: "#000",
    shadowOpacity: 0.22,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
  },
  fabOpen: {
    backgroundColor: "#8FA876",
    opacity: 1,
  },
  fabText: {
    color: "#FBF8F3",
    fontSize: 13,
    fontWeight: "900",
  },
  panel: {
    width: 360,
    maxWidth: "86%",
    borderRadius: 18,
    backgroundColor: "rgba(251, 248, 243, 0.97)",
    borderWidth: 1,
    borderColor: "#d8cdbb",
    padding: 14,
    marginBottom: 10,
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  title: {
    color: "#231F20",
    fontSize: 18,
    fontWeight: "900",
  },
  subtitle: {
    color: "#665f55",
    fontSize: 11,
    fontWeight: "800",
    marginTop: 2,
  },
  closeButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F3ECE0",
  },
  closeText: {
    color: "#231F20",
    fontSize: 23,
    lineHeight: 25,
    fontWeight: "800",
  },
  scroll: {
    flexShrink: 1,
  },
  scrollContent: {
    paddingBottom: 4,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  targetButton: {
    width: "31.7%",
    minHeight: 64,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#d8cdbb",
    backgroundColor: "#FBF8F3",
    paddingHorizontal: 9,
    paddingVertical: 8,
    justifyContent: "center",
  },
  targetLabel: {
    color: "#231F20",
    fontSize: 13,
    fontWeight: "900",
  },
  targetNote: {
    color: "#665f55",
    fontSize: 9,
    fontWeight: "700",
    marginTop: 3,
  },
});