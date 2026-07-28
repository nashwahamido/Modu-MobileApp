import { router } from "expo-router";
import type { Href } from "expo-router";
import { useState } from "react";
import { StyleSheet, Pressable, Text, View } from "react-native";
import { AccountSwitcher } from "./AccountSwitcher";

type GmTarget = {
  label: string;
  route: Href;
  note: string;
};

const targets: GmTarget[] = [
  { label: "Welcome", route: "/" as Href, note: "Landing screen" },
  { label: "Onboarding", route: "/onboarding-questionnaire" as Href, note: "Questionnaire" },
  {
    label: "Avatar",
    route: "/avatar-recommendation?mode=momentum&secondary=visual" as Href,
    note: "Recommendation result",
  },
  { label: "Tutorial", route: "/tutorial" as Href, note: "Mascot guide task" },
  { label: "Task", route: "/catalogue" as Href, note: "Task catalogue" },
  { label: "Room", route: "/room" as Href, note: "Virtual room" },
  { label: "Profile", route: "/profile" as Href, note: "Profile & friends" },
  { label: "Engine", route: "/engine-test" as Href, note: "Engine test (dev)" },
];

export function GmTestPanel() {
  const [open, setOpen] = useState(false);

  // The catalogue picks the furniture now, so nothing here needs the old "/play + an id chosen from
  // the active profile" special case — that guessed one piece when the point was to choose.
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
          {/* Renders nothing unless a roster is live in this build. Closes the panel before it navigates. */}
          <AccountSwitcher onDone={() => setOpen(false)} />
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
  // Sits above the room's bottom-left rotate controls (left:24, bottom:78, 44px tall) rather than in the
  // corner, which the joystick claims on the assembly screen. This panel is mounted globally, so the slot
  // has to be clear on every screen.
  root: {
    position: "absolute",
    left: 24,
    bottom: 132,
    zIndex: 999,
    alignItems: "flex-start",
  },
  // Faint at rest: a dev affordance riding on top of the real UI should read as an overlay, not as a game
  // control. Opening it brings it back to full strength.
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
