import { router, useLocalSearchParams } from "expo-router";
import type { Href } from "expo-router";
import { useMemo, useState } from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";

import { useGameStore } from "@/src/game/core/store";
import type { ProfileId } from "@/src/game/core/profile";

const mascot = require("../assets/mascot/mascot.png");
const tutorialRoute = "/play" as Href;
const homeRoute = "/" as Href;

type TutorialStep = {
  title: string;
  body: string;
  target: "part" | "assembly" | "joystick" | "recenter" | "tool";
  primaryAction: string;
  secondaryAction?: string;
};

const steps: TutorialStep[] = [
  {
    title: "Pick up a part",
    body: "Long-press a part card first. Keep holding while you move it toward the assembly area.",
    target: "part",
    primaryAction: "Long-press part",
  },
  {
    title: "Place it in the workspace",
    body: "Drag the part into the main area. Choose what should happen if you release it in the wrong place.",
    target: "assembly",
    primaryAction: "Try drag",
    secondaryAction: "Choose drop behavior",
  },
  {
    title: "Rotate the view",
    body: "Use the left joystick to rotate around the furniture and check the shape from another angle.",
    target: "joystick",
    primaryAction: "Move joystick",
  },
  {
    title: "Recover the camera",
    body: "If the view gets confusing, tap Recenter to return to a comfortable default angle.",
    target: "recenter",
    primaryAction: "Tap Recenter",
  },
  {
    title: "Secure the part",
    body: "Some steps need a tool action: trace, tap, press, or slide. Follow the highlighted control until it is complete.",
    target: "tool",
    primaryAction: "Practice tool action",
  },
];

function isProfileId(value: unknown): value is ProfileId {
  return value === "visual" || value === "momentum" || value === "clearPath" || value === "control";
}

export default function OnboardingTutorialScreen() {
  const params = useLocalSearchParams<{ mode?: string }>();
  const selectedProfile = isProfileId(params.mode) ? params.mode : useGameStore.getState().profile;
  const [stepIndex, setStepIndex] = useState(0);
  const [dropBehavior, setDropBehavior] = useState<"float" | "autoReturn" | null>(null);
  const [completedSteps, setCompletedSteps] = useState<boolean[]>(() => steps.map(() => false));
  const step = steps[stepIndex];
  const canContinue = completedSteps[stepIndex];
  const progress = ((stepIndex + 1) / steps.length) * 100;

  const mascotLine = useMemo(() => {
    if (step.target === "assembly" && !dropBehavior) {
      return "Nice. Now choose the drop behavior that feels easier while you learn.";
    }
    if (stepIndex === steps.length - 1) {
      return "One last practice step. After this, you are ready for the real build.";
    }
    return "Try this once. I will keep the task small and clear.";
  }, [dropBehavior, step.target, stepIndex]);

  const markStepDone = () => {
    setCompletedSteps((current) => current.map((done, index) => (index === stepIndex ? true : done)));
  };

  const goNext = () => {
    if (!canContinue) return;
    if (stepIndex < steps.length - 1) {
      setStepIndex((current) => current + 1);
      return;
    }

    const store = useGameStore.getState();
    store.reset();
    store.applyProfile(selectedProfile);
    if (dropBehavior) {
      store.setSettings({ releaseBehavior: dropBehavior });
    }
    router.replace(tutorialRoute);
  };

  const goBack = () => {
    if (stepIndex === 0) {
      router.back();
      return;
    }
    setStepIndex((current) => current - 1);
  };

  return (
    <View style={styles.root}>
      <View style={styles.topBar}>
        <Text style={styles.progressLabel}>{stepIndex + 1}/{steps.length}</Text>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${progress}%` }]} />
        </View>
        <Pressable onPress={() => router.replace(homeRoute)} style={styles.skipButton}>
          <Text style={styles.skipText}>Not now</Text>
        </Pressable>
      </View>

      <View style={styles.content}>
        <View style={styles.leftColumn}>
          <View style={styles.mascotRow}>
            <Image source={mascot} style={styles.mascot} />
            <View style={styles.speechBubble}>
              <Text style={styles.speechTitle}>Tutorial task</Text>
              <Text style={styles.speechText}>{mascotLine}</Text>
            </View>
          </View>

          <View style={styles.stepCard}>
            <Text style={styles.stepTitle}>{step.title}</Text>
            <Text style={styles.stepBody}>{step.body}</Text>
            {step.secondaryAction ? (
              <View style={styles.choiceRow}>
                <Pressable
                  onPress={() => {
                    setDropBehavior("float");
                    markStepDone();
                  }}
                  style={[styles.choiceButton, dropBehavior === "float" && styles.activeChoice]}
                >
                  <Text style={[styles.choiceText, dropBehavior === "float" && styles.activeChoiceText]}>Keep it there</Text>
                </Pressable>
                <Pressable
                  onPress={() => {
                    setDropBehavior("autoReturn");
                    markStepDone();
                  }}
                  style={[styles.choiceButton, dropBehavior === "autoReturn" && styles.activeChoice]}
                >
                  <Text style={[styles.choiceText, dropBehavior === "autoReturn" && styles.activeChoiceText]}>Send it back</Text>
                </Pressable>
              </View>
            ) : (
              <Pressable onPress={markStepDone} style={[styles.practiceButton, canContinue && styles.practicedButton]}>
                <Text style={styles.practiceText}>{canContinue ? "Practiced" : step.primaryAction}</Text>
              </Pressable>
            )}
          </View>
        </View>

        <View style={styles.demoArea}>
          <View style={[styles.highlight, getHighlightStyle(step.target)]} />

          <Pressable onPress={markStepDone} style={styles.recenter}>
            <Text style={styles.recenterText}>Recenter</Text>
          </Pressable>

          <View style={styles.sceneCanvas}>
            <View style={styles.furnitureGhost}>
              <View style={styles.panelBack} />
              <View style={styles.panelSide} />
            </View>
            <Text style={styles.sceneLabel}>Assembly area</Text>
          </View>

          <View style={styles.partsTray}>
            <View style={styles.partCard}>
              <View style={styles.partThumb} />
              <Text style={styles.partText}>Bottom panel</Text>
            </View>
            <View style={styles.partCardMuted}>
              <View style={styles.partThumbThin} />
              <Text style={styles.partText}>Side panel</Text>
            </View>
          </View>

          <View style={styles.joystick}>
            <View style={styles.joystickKnob} />
          </View>

          <View style={styles.toolControl}>
            <Text style={styles.toolIcon}>rotate</Text>
          </View>
        </View>
      </View>

      <View style={styles.footer}>
        <Pressable onPress={goBack} style={styles.backButton}>
          <Text style={styles.backText}>Back</Text>
        </Pressable>
        <Pressable onPress={goNext} style={[styles.nextButton, !canContinue && styles.disabledButton]}>
          <Text style={styles.nextText}>{stepIndex === steps.length - 1 ? "Start real build" : "Continue"}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#fffaf0",
    paddingHorizontal: 40,
    paddingTop: 28,
    paddingBottom: 24,
  },
  topBar: {
    height: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: 18,
  },
  progressLabel: {
    width: 62,
    color: "#3d3933",
    fontSize: 22,
    fontWeight: "900",
  },
  progressTrack: {
    flex: 1,
    height: 11,
    overflow: "hidden",
    borderRadius: 8,
    backgroundColor: "#d8d1c6",
  },
  progressFill: {
    height: "100%",
    borderRadius: 8,
    backgroundColor: "#2faa73",
  },
  skipButton: {
    minWidth: 110,
    alignItems: "center",
    paddingVertical: 8,
  },
  skipText: {
    color: "#81786d",
    fontSize: 16,
    fontWeight: "900",
  },
  content: {
    flex: 1,
    flexDirection: "row",
    gap: 30,
    paddingTop: 18,
    paddingBottom: 78,
  },
  leftColumn: {
    width: "38%",
    justifyContent: "space-between",
  },
  mascotRow: {
    minHeight: 112,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  mascot: {
    width: 92,
    height: 92,
    borderRadius: 22,
    borderWidth: 5,
    borderColor: "#ffffff",
  },
  speechBubble: {
    flex: 1,
    minHeight: 96,
    justifyContent: "center",
    borderRadius: 22,
    backgroundColor: "#f9ffc7",
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  speechTitle: {
    color: "#2faa73",
    fontSize: 15,
    fontWeight: "900",
    marginBottom: 5,
  },
  speechText: {
    color: "#28241f",
    fontSize: 16,
    fontWeight: "800",
    lineHeight: 21,
  },
  stepCard: {
    minHeight: 246,
    borderRadius: 22,
    borderWidth: 2,
    borderColor: "#ded4c5",
    backgroundColor: "#fffdf7",
    paddingHorizontal: 26,
    paddingVertical: 22,
    gap: 13,
  },
  stepTitle: {
    color: "#201d19",
    fontSize: 34,
    fontWeight: "900",
    lineHeight: 38,
  },
  stepBody: {
    color: "#5d554c",
    fontSize: 18,
    fontWeight: "800",
    lineHeight: 25,
  },
  practiceButton: {
    alignSelf: "flex-start",
    marginTop: 4,
    borderRadius: 24,
    backgroundColor: "#2d2a26",
    paddingHorizontal: 24,
    paddingVertical: 11,
  },
  practicedButton: {
    backgroundColor: "#2faa73",
  },
  practiceText: {
    color: "#fff9ef",
    fontSize: 15,
    fontWeight: "900",
  },
  choiceRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 2,
  },
  choiceButton: {
    borderRadius: 22,
    borderWidth: 2,
    borderColor: "#d6cabb",
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: "#fffaf0",
  },
  activeChoice: {
    borderColor: "#2faa73",
    backgroundColor: "#e7f5ed",
  },
  choiceText: {
    color: "#3d3933",
    fontSize: 14,
    fontWeight: "900",
  },
  activeChoiceText: {
    color: "#16764a",
  },
  demoArea: {
    flex: 1,
    minHeight: 350,
    borderRadius: 26,
    borderWidth: 2,
    borderColor: "#ded4c5",
    backgroundColor: "#efe8dc",
    overflow: "hidden",
  },
  sceneCanvas: {
    position: "absolute",
    left: "22%",
    top: "19%",
    width: "45%",
    height: "52%",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 18,
    backgroundColor: "#fffaf0",
  },
  furnitureGhost: {
    width: 150,
    height: 108,
  },
  panelBack: {
    position: "absolute",
    left: 30,
    top: 12,
    width: 84,
    height: 80,
    borderRadius: 8,
    backgroundColor: "#d6d0c6",
    transform: [{ skewY: "-9deg" }],
  },
  panelSide: {
    position: "absolute",
    right: 18,
    top: 24,
    width: 50,
    height: 80,
    borderRadius: 8,
    backgroundColor: "#c6beb1",
    transform: [{ skewY: "18deg" }],
  },
  sceneLabel: {
    position: "absolute",
    bottom: 12,
    color: "#83796b",
    fontSize: 13,
    fontWeight: "900",
  },
  partsTray: {
    position: "absolute",
    right: 16,
    top: 28,
    width: 150,
    gap: 12,
  },
  partCard: {
    height: 112,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 18,
    borderWidth: 2,
    borderColor: "#d6cabb",
    backgroundColor: "#fffdf8",
    gap: 8,
  },
  partCardMuted: {
    height: 112,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 18,
    borderWidth: 2,
    borderColor: "#e4dbcf",
    backgroundColor: "#fbf6ec",
    opacity: 0.75,
    gap: 8,
  },
  partThumb: {
    width: 54,
    height: 38,
    borderRadius: 8,
    backgroundColor: "#d8d1c6",
  },
  partThumbThin: {
    width: 16,
    height: 58,
    borderRadius: 8,
    backgroundColor: "#c9c0b4",
  },
  partText: {
    color: "#575047",
    fontSize: 13,
    fontWeight: "900",
    textAlign: "center",
  },
  joystick: {
    position: "absolute",
    left: 38,
    bottom: 34,
    width: 112,
    height: 112,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 56,
    borderWidth: 3,
    borderColor: "#bfb7aa",
    backgroundColor: "#eee5d7",
  },
  joystickKnob: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#9d9588",
  },
  recenter: {
    position: "absolute",
    left: 38,
    top: 38,
    borderRadius: 22,
    borderWidth: 2,
    borderColor: "#ded4c5",
    backgroundColor: "#fffdf8",
    paddingHorizontal: 18,
    paddingVertical: 9,
  },
  recenterText: {
    color: "#37332e",
    fontSize: 15,
    fontWeight: "900",
  },
  toolControl: {
    position: "absolute",
    left: "42%",
    bottom: 26,
    minWidth: 116,
    alignItems: "center",
    borderRadius: 22,
    backgroundColor: "#2d2a26",
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  toolIcon: {
    color: "#fff9ef",
    fontSize: 14,
    fontWeight: "900",
  },
  highlight: {
    position: "absolute",
    zIndex: 20,
    borderRadius: 22,
    borderWidth: 4,
    borderColor: "#82ff9d",
    backgroundColor: "rgba(130,255,157,0.08)",
  },
  highlight_part: {
    right: 8,
    top: 18,
    width: 166,
    height: 126,
  },
  highlight_assembly: {
    left: "21%",
    top: "18%",
    width: "47%",
    height: "54%",
  },
  highlight_joystick: {
    left: 28,
    bottom: 24,
    width: 132,
    height: 132,
    borderRadius: 66,
  },
  highlight_recenter: {
    left: 28,
    top: 28,
    width: 148,
    height: 62,
  },
  highlight_tool: {
    left: "40%",
    bottom: 16,
    width: 140,
    height: 66,
  },
  footer: {
    position: "absolute",
    left: 40,
    right: 40,
    bottom: 24,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  backButton: {
    minWidth: 116,
    alignItems: "center",
    borderRadius: 24,
    borderWidth: 2,
    borderColor: "#d6cabb",
    backgroundColor: "#fffaf0",
    paddingHorizontal: 22,
    paddingVertical: 11,
  },
  backText: {
    color: "#3d3933",
    fontSize: 15,
    fontWeight: "900",
  },
  nextButton: {
    minWidth: 184,
    alignItems: "center",
    borderRadius: 26,
    backgroundColor: "#2d2a26",
    paddingHorizontal: 28,
    paddingVertical: 13,
  },
  disabledButton: {
    opacity: 0.35,
  },
  nextText: {
    color: "#fff9ef",
    fontSize: 16,
    fontWeight: "900",
  },
});

function getHighlightStyle(target: TutorialStep["target"]) {
  switch (target) {
    case "part":
      return styles.highlight_part;
    case "assembly":
      return styles.highlight_assembly;
    case "joystick":
      return styles.highlight_joystick;
    case "recenter":
      return styles.highlight_recenter;
    case "tool":
      return styles.highlight_tool;
    default:
      return styles.highlight_assembly;
  }
}
