import { useState } from "react";
import { Image, StyleSheet, Text, View } from "react-native";

import { useTutorialStore } from "@/src/game/tutorial/store";
import { GameSettings } from "@/src/game/ui/GameSettings";
import { SceneAppearanceControls } from "@/src/game/ui/SettingsControls";

const MASCOT_IMAGE = require("@/src/assets/mascot/mascot.png");

export function TutorialGameSettings() {
  const [previewedBackground, setPreviewedBackground] = useState(false);
  const [previewedLighting, setPreviewedLighting] = useState(false);
  const tutorialStep = useTutorialStore((s) => s.steps[s.currentIndex]);
  const tutorialCompleted = useTutorialStore((s) => s.completed);
  const tutorialSkipped = useTutorialStore((s) => s.skipped);
  const completeTutorialEvent = useTutorialStore((s) => s.completeEvent);
  const isDisplayTutorial =
    tutorialStep?.id === "choose-display-settings" &&
    !tutorialCompleted &&
    !tutorialSkipped;

  if (!isDisplayTutorial) return <GameSettings />;

  const displayPreviewComplete = previewedBackground && previewedLighting;

  return (
    <GameSettings
      headerContent={
        <View style={styles.callout}>
          <Image source={MASCOT_IMAGE} style={styles.mascot} resizeMode="contain" />
          <View style={styles.copy}>
            <Text style={styles.title}>Choose your scene look</Text>
            <Text style={styles.message}>
              Preview a Background and Lighting setup, then confirm your choices.
            </Text>
          </View>
        </View>
      }
      controls={
        <>
          <SceneAppearanceControls
            onPreferenceChange={(preference) => {
              if (preference === "background") setPreviewedBackground(true);
              if (preference === "lighting") setPreviewedLighting(true);
            }}
          />
          <Text style={styles.note}>
            Try the arrows to preview each option. You can change these again later.
          </Text>
        </>
      }
      confirmLabel="Confirm choices"
      confirmDisabled={!displayPreviewComplete}
      onConfirm={() => completeTutorialEvent("display_preferences_confirmed")}
    />
  );
}

const styles = StyleSheet.create({
  callout: {
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
  mascot: {
    width: 54,
    height: 48,
    borderRadius: 10,
    backgroundColor: "#fbf8f3",
  },
  copy: { flex: 1 },
  title: { fontSize: 14, fontWeight: "800", color: "#2e2a24" },
  message: {
    marginTop: 2,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "600",
    color: "#665f55",
  },
  note: {
    marginTop: 10,
    color: "#7a7163",
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "600",
  },
});
