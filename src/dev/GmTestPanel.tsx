import { router } from "expo-router";
import type { Href } from "expo-router";
import { useState } from "react";
import { StyleSheet, Pressable, ScrollView, Text, View, useWindowDimensions } from "react-native";
import { AccountSwitcher } from "./AccountSwitcher";
import { useGameStore } from "@/src/game/core/store";
import { useTutorialStore } from "@/src/game/tutorial/store";
import type { ProfileId } from "@/src/game/core/profile";

type GmTarget = {
  label: string;
  route: Href;
  note: string;
  /**
   * Applied to the game store BEFORE navigating.
   *
   * The tutorial builds its step list from `useGameStore.profile` — Lumi's run is a hand-written
   * list returned only for `visual`, and the other three share the composed one. Onboarding sets the
   * profile on its way out (avatar-recommendation calls applyProfile), so the tutorial it opens
   * always matches the avatar just chosen; jumping here set nothing, so you got whatever the store
   * happened to hold and the tutorial looked like the wrong version of itself.
   */
  profile?: ProfileId;
};

const targets: GmTarget[] = [
  { label: "Welcome", route: "/" as Href, note: "Landing screen" },
  { label: "Onboarding", route: "/onboarding-questionnaire" as Href, note: "Questionnaire" },
  {
    label: "Avatar",
    route: "/avatar-recommendation?mode=momentum&secondary=visual" as Href,
    note: "Recommendation result",
  },
  // FOUR entries, not one. The four profiles run genuinely different tutorials — Lumi's is her own
  // list, the other three are composed and differ again by mode and by softHints — so a single
  // button could only ever test one of them, and silently.
  { label: "Tut · Lumi", route: "/tutorial" as Href, note: "Visual", profile: "visual" },
  { label: "Tut · Sparky", route: "/tutorial" as Href, note: "Momentum", profile: "momentum" },
  { label: "Tut · Pebble", route: "/tutorial" as Href, note: "Clear Path", profile: "clearPath" },
  { label: "Tut · Felix", route: "/tutorial" as Href, note: "Control", profile: "control" },
  { label: "Task", route: "/catalogue" as Href, note: "Task catalogue" },
  { label: "Room", route: "/room" as Href, note: "Virtual room" },
  { label: "Profile", route: "/profile" as Href, note: "Profile & friends" },
  // No ownerId on purpose: real owner ids are uuids that only exist in the database, so a hardcoded one would rot. This target proves the route registers and exercises the missing-param branch; a real friend's room is reached through the picker in Task 6.
  { label: "Visit", route: "/visit" as Href, note: "Visit route (no owner)" },
  { label: "Engine", route: "/engine-test" as Href, note: "Engine test (dev)" },
];

// What the panel occupies below its own top edge: the root's bottom offset plus the panel's marginBottom. The height cap is solved from these rather than typed in, so moving the panel cannot silently leave the cap wrong.
const PANEL_BOTTOM_INSET = 132 + 10;
// Clearance left above the panel so it never runs to the very top of the screen.
const PANEL_TOP_GUTTER = 24;

export function GmTestPanel() {
  const [open, setOpen] = useState(false);
  // The app is landscape-LOCKED, so the tall axis is the short one: a phone gives roughly 250 points above the panel's bottom edge, and the roster alone is taller than that once a build lists more than about three accounts. Uncapped, the lower rows — Sign out and Purge among them — render off the top of the screen where no touch can reach them. Cap against the live window rather than a constant so a tablet still gets the whole panel without scrolling.
  const { height } = useWindowDimensions();
  const maxPanelHeight = Math.max(180, height - PANEL_BOTTOM_INSET - PANEL_TOP_GUTTER);

  // The catalogue picks the furniture now, so nothing here needs the old "/play + an id chosen from the active profile" special case — that guessed one piece when the point was to choose.
  const jumpTo = (target: GmTarget) => {
    setOpen(false);
    if (target.profile) {
      // Same two calls onboarding makes, in the same order: applyProfile rewrites the settings and
      // the mode for that profile, and resetTutorial clears any run already in progress so the
      // screen configures from scratch rather than resuming someone else's script.
      useGameStore.getState().applyProfile(target.profile);
      useTutorialStore.getState().resetTutorial();
    }
    router.replace(target.route);
  };

  return (
    <View pointerEvents="box-none" style={styles.root}>
      {open ? (
        <View style={[styles.panel, { maxHeight: maxPanelHeight }]} pointerEvents="auto">
          {/* Outside the scroller on purpose: the close button has to stay reachable no matter how far down the roster you have scrolled. */}
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
            {/* Renders nothing unless a roster is live in this build. Closes the panel before it navigates. */}
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
  // Sits above the room's bottom-left rotate controls (left:24, bottom:78, 44px tall) rather than in the corner, which the joystick claims on the assembly screen. This panel is mounted globally, so the slot has to be clear on every screen.
  root: {
    position: "absolute",
    left: 24,
    bottom: 132,
    zIndex: 999,
    alignItems: "flex-start",
  },
  // Faint at rest: a dev affordance riding on top of the real UI should read as an overlay, not as a game control. Opening it brings it back to full strength.
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
  // flexShrink, not flex: 1 — the panel must still hug its content on a screen tall enough to hold all of it, and only give way once maxHeight actually binds.
  scroll: {
    flexShrink: 1,
  },
  // The roster's last row would otherwise sit flush against the panel's bottom edge with nothing to show it is the end.
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