import { router } from "expo-router";
import type { Href } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

type GmTarget = {
  label: string;
  route: Href;
  note: string;
};

const targets: GmTarget[] = [
  { label: "Welcome", route: "/" as Href, note: "Landing screen" },
  { label: "Home", route: "/home" as Href, note: "Main navigation" },
  { label: "Onboarding", route: "/onboarding-questionnaire" as Href, note: "Questionnaire" },
  {
    label: "Avatar",
    route: "/avatar-recommendation?mode=momentum&secondary=visual" as Href,
    note: "Recommendation result",
  },
  { label: "Tutorial", route: "/tutorial" as Href, note: "Mascot guide task" },
  { label: "Task", route: "/play" as Href, note: "Assembly task" },
  { label: "Room", route: "/room" as Href, note: "Virtual room" },
];

export function GmTestPanel() {
  const [open, setOpen] = useState(false);

  const jumpTo = (route: Href) => {
    setOpen(false);
    router.replace(route);
  };

  return (
    <View pointerEvents="box-none" style={styles.root}>
      {open ? (
        <View style={styles.panel} pointerEvents="auto">
          <View style={styles.header}>
            <View>
              <Text style={styles.title}>GM Test</Text>
              <Text style={styles.subtitle}>Jump to demo states</Text>
            </View>
            <Pressable onPress={() => setOpen(false)} hitSlop={10} style={styles.closeButton}>
              <Text style={styles.closeText}>×</Text>
            </Pressable>
          </View>
          <View style={styles.grid}>
            {targets.map((target) => (
              <Pressable
                key={target.label}
                onPress={() => jumpTo(target.route)}
                style={styles.targetButton}
                hitSlop={4}
              >
                <Text style={styles.targetLabel}>{target.label}</Text>
                <Text style={styles.targetNote}>{target.note}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}
      <Pressable
        onPress={() => setOpen((value) => !value)}
        style={[styles.fab, open && styles.fabOpen]}
        hitSlop={10}
        pointerEvents="auto"
      >
        <Text style={styles.fabText}>GM</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    position: "absolute",
    left: 18,
    bottom: 18,
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
    borderWidth: 2,
    borderColor: "rgba(251, 248, 243, 0.94)",
    shadowColor: "#000",
    shadowOpacity: 0.22,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
  },
  fabOpen: {
    backgroundColor: "#8FA876",
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
