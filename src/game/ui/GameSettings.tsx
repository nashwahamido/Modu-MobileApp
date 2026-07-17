// In-game settings: a gear button that opens the shared SettingsControls in a cream modal card. Same controls as the homepage /settings screen — one source of truth, one look (adopted from the on-release engine).
import { router } from "expo-router";
import { useState } from "react";
import {
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useGameStore } from "@/src/game/core/store";
import { useTutorialStore } from "@/src/game/tutorial/store";
import { SettingsControls } from "@/src/game/ui/SettingsControls";

const SETTINGS_ICON = require("@/src/assets/images/ui/setting_icon.png");
const MASCOT_IMAGE = require("@/src/assets/mascot/mascot.png");

export function GameSettings() {
  const [open, setOpen] = useState(false);
  const [previewedBackground, setPreviewedBackground] = useState(false);
  const [previewedLighting, setPreviewedLighting] = useState(false);
  const { height: winH } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const cardMaxHeight = winH - insets.top - insets.bottom - 32;
  const dark = useGameStore((s) => s.theme === "dark");
  const tutorialStep = useTutorialStore((s) => s.steps[s.currentIndex]);
  const tutorialCompleted = useTutorialStore((s) => s.completed);
  const tutorialSkipped = useTutorialStore((s) => s.skipped);
  const completeTutorialEvent = useTutorialStore((s) => s.completeEvent);
  const isDisplayTutorial =
    tutorialStep?.id === "choose-display-settings" &&
    !tutorialCompleted &&
    !tutorialSkipped;
  const displayPreviewComplete = previewedBackground && previewedLighting;

  const closeSettings = (confirmTutorial = false) => {
    if (confirmTutorial && isDisplayTutorial && !displayPreviewComplete) return;
    if (confirmTutorial && isDisplayTutorial) {
      completeTutorialEvent("display_preferences_confirmed");
    }
    setOpen(false);
  };

  return (
    <>
      {/* Settings icon — rounded-square chip with a minimalist sliders glyph. subject to change*/}
      <Pressable
        style={[styles.gear, dark && styles.gearDark]}
        onPress={() => setOpen(true)}
        hitSlop={8}
        accessibilityLabel="Settings"
      >
        <Image
          source={SETTINGS_ICON}
          style={[styles.icon, dark && styles.iconDark]}
          resizeMode="contain"
        />
      </Pressable>

      {/* Real Modal so the scrim covers the WHOLE screen: this component lives inside the inset HUD container, where a plain absolute-fill overlay could only cover the container, leaving uncovered screen edges. */}
      <Modal
        visible={open}
        transparent
        animationType="fade"
        supportedOrientations={[
          "landscape",
          "landscape-left",
          "landscape-right",
          "portrait",
        ]}
        onRequestClose={() => closeSettings(false)}
      >
        <View style={styles.backdrop} pointerEvents="box-none">
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => closeSettings(false)}
          />
          <View style={[styles.card, { maxHeight: cardMaxHeight }]}>
            <Text style={styles.title}>Settings</Text>
            {isDisplayTutorial ? (
              <View style={styles.tutorialCallout}>
                <Image source={MASCOT_IMAGE} style={styles.tutorialMascot} resizeMode="contain" />
                <View style={styles.tutorialCopy}>
                  <Text style={styles.tutorialTitle}>Choose your scene look</Text>
                  <Text style={styles.tutorialMessage}>
                    Preview a Background and Lighting setup, then confirm your choices.
                  </Text>
                </View>
              </View>
            ) : null}
            <ScrollView
              contentContainerStyle={styles.cardScroll}
              showsVerticalScrollIndicator={false}
            >
              <SettingsControls
                displayTutorialOnly={isDisplayTutorial}
                onDisplayPreferencePreview={(preference) => {
                  if (preference === "background") setPreviewedBackground(true);
                  if (preference === "lighting") setPreviewedLighting(true);
                }}
              />
            </ScrollView>
            <View style={styles.footer}>
              <Pressable
                onPress={() => {
                  setOpen(false);
                  router.navigate("/");
                }}
                hitSlop={8}
                accessibilityLabel="Return to home"
              >
                <Text style={styles.homeText}>⌂ Home</Text>
              </Pressable>
              <Pressable
                style={[
                  styles.done,
                  isDisplayTutorial && !displayPreviewComplete && styles.doneDisabled,
                ]}
                onPress={() => closeSettings(true)}
                hitSlop={8}
                disabled={isDisplayTutorial && !displayPreviewComplete}
              >
                <Text style={styles.doneText}>
                  {isDisplayTutorial ? "Confirm choices" : "Done"}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  gear: {
    position: "absolute",
    top: 8,
    left: 92,
    width: 42,
    height: 36,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.85)",
    alignItems: "center",
    justifyContent: "center",
  },
  gearDark: { backgroundColor: "rgba(22,30,44,0.86)" },
  icon: { width: 30, height: 30 },
  // The PNG is dark artwork; invert it (tint white) for the dark chip.
  iconDark: { tintColor: "#eef1f6" },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(20,18,15,0.35)",
    alignItems: "center",
    justifyContent: "center",
  },
  card: {
    width: 340,
    maxWidth: "90%",
    backgroundColor: "#f7f3ea",
    borderRadius: 18,
    padding: 18,
    shadowColor: "#000",
    shadowOpacity: 0.25,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  title: { fontSize: 17, fontWeight: "800", color: "#2e2a24", marginBottom: 2 },
  tutorialCallout: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 8,
    marginBottom: 2,
    padding: 10,
    borderRadius: 12,
    backgroundColor: "#f4f8ef",
    borderWidth: 1,
    borderColor: "#b7c9a7",
  },
  tutorialMascot: {
    width: 54,
    height: 48,
    borderRadius: 10,
    backgroundColor: "#fbf8f3",
  },
  tutorialCopy: { flex: 1 },
  tutorialTitle: { fontSize: 14, fontWeight: "800", color: "#2e2a24" },
  tutorialMessage: {
    marginTop: 2,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "600",
    color: "#665f55",
  },
  cardScroll: { paddingBottom: 4 },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 12,
  },
  homeText: { fontSize: 14, fontWeight: "700", color: "#7a7163" },
  done: {
    backgroundColor: "#6f8a68",
    borderRadius: 12,
    paddingHorizontal: 18,
    paddingVertical: 9,
  },
  doneDisabled: { opacity: 0.42 },
  doneText: { color: "#fff", fontWeight: "700", fontSize: 14 },
});
