import { router, useLocalSearchParams } from "expo-router";
import type { Href } from "expo-router";
import * as Speech from "@/src/onboarding/speech";
import { Animated, Image, Pressable, StyleSheet, Text, View } from "react-native";
import { useEffect, useRef, useState } from "react";
import { avatarModes } from "@/src/onboarding/avatarModes";
import type { ModeId } from "@/src/onboarding/questionnaire";
import { VoiceButton } from "@/src/game/ui/VoiceButton";
import { useGameStore } from "@/src/game/core/store";
import type { ProfileId } from "@/src/game/core/profile";
import { useTutorialStore } from "@/src/game/tutorial/store";
import { saveSelectedAvatarMode } from "@/src/services/onboarding";

const mascot = require("../assets/mascot/mascot.png");
const lumiAvatar = require("../assets/avatars/lumi.jpg");
const sparkyAvatar = require("../assets/avatars/sparky.jpg");
const ciaraAvatar = require("../assets/avatars/ciara.jpg");
const felixAvatar = require("../assets/avatars/felix.jpg");
const homeRoute = "/home" as Href;

const avatarImages = {
  visual: lumiAvatar,
  momentum: sparkyAvatar,
  "clearPath": ciaraAvatar,
  control: felixAvatar,
};

const modes = avatarModes.map((mode) => ({
  ...mode,
  image: avatarImages[mode.id],
}));

export default function AvatarRecommendationScreen() {
  const params = useLocalSearchParams<{ mode?: string }>();
  const initialModeId = modes.some((mode) => mode.id === params.mode) ? (params.mode as ModeId) : "momentum";
  const [selectedModeId, setSelectedModeId] = useState<ModeId>(initialModeId);
  const [showModeTip, setShowModeTip] = useState(false);
  const [savingChoice, setSavingChoice] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const modeTipAnim = useRef(new Animated.Value(0)).current;
  const selectedMode = modes.find((mode) => mode.id === selectedModeId) ?? modes[0];

  useEffect(() => {
    return () => {
      Speech.stop();
    };
  }, []);

  useEffect(() => {
    Speech.stop();
  }, [selectedModeId, showModeTip]);

  useEffect(() => {
    if (!showModeTip) {
      return;
    }
    modeTipAnim.setValue(0);
    Animated.timing(modeTipAnim, {
      toValue: 1,
      duration: 240,
      useNativeDriver: true,
    }).start();
  }, [modeTipAnim, showModeTip]);

  const goToGame = () => {
    Speech.stop();
    const gameStore = useGameStore.getState();
    gameStore.reset();
    gameStore.applyProfile(selectedMode.id as ProfileId);
    useTutorialStore.getState().resetTutorial();
    setShowModeTip(false);
    router.replace("/tutorial" as Href);
  };

  const goHome = () => {
    Speech.stop();
    router.push(homeRoute);
  };

  const speakSelectedMode = () => {
    Speech.stop();
    Speech.speak(
      `Based on your choices, I recommend ${selectedMode.avatarName} in ${selectedMode.title}. ${selectedMode.avatarName} is ${selectedMode.personality}. ${selectedMode.slogan}. ${selectedMode.explanation}. ${selectedMode.bullets.join(". ")}.`,
      {
        language: "en-US",
        pitch: 1.08,
        rate: 0.92,
      },
    );
  };

  const confirmAvatar = async () => {
    if (savingChoice) return;
    Speech.stop();
    setSavingChoice(true);
    setSaveError(null);
    try {
      await saveSelectedAvatarMode(selectedMode.id as ModeId);
      setShowModeTip(true);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not save avatar choice.";
      setSaveError(message);
    } finally {
      setSavingChoice(false);
    }
  };

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <Pressable
          onPress={() => {
            Speech.stop();
            router.back();
          }}
          style={styles.navButton}
        >
          <Text style={styles.navText}>{"<"}</Text>
        </Pressable>
      </View>

      <View style={styles.recommendationLayout}>
        <VoiceButton onPress={speakSelectedMode} style={styles.audioButton} />

        <View style={[styles.modeCard, selectedMode.id === initialModeId && styles.modeCardRecommended]}>
          {selectedMode.id === initialModeId ? (
            <View style={styles.recommendedBadge}>
              <Text style={styles.recommendedBadgeText}>Recommended</Text>
            </View>
          ) : null}
          <View style={[styles.avatarCircle, { backgroundColor: selectedMode.color }]}>
            <Image source={selectedMode.image} style={styles.avatarImage} />
          </View>
          <Text style={styles.modeTitle}>{selectedMode.title}</Text>
          <Text style={styles.avatarName}>{selectedMode.avatarName}</Text>
        </View>

        <View style={styles.recommendationCopy}>
          <Text style={styles.title}>
            {selectedMode.id === initialModeId
              ? "Based on your choices, I recommend..."
              : "Other available mode"}
          </Text>
          <Text style={styles.avatarLine}>Avatar: {selectedMode.avatarName}</Text>
          <Text style={styles.personalityLine}>{selectedMode.personality}</Text>
          <Text style={styles.sloganLine}>“{selectedMode.slogan}”</Text>
          <Text style={styles.explanation}>{selectedMode.explanation}</Text>
          <View style={styles.bulletList}>
            {selectedMode.bullets.map((bullet) => (
              <View key={bullet} style={styles.bulletRow}>
                <View style={styles.bulletDot} />
                <Text style={styles.bulletText}>{bullet}</Text>
              </View>
            ))}
          </View>
          {saveError ? <Text style={styles.saveErrorText}>{saveError}</Text> : null}
          <Pressable
            onPress={confirmAvatar}
            style={[styles.confirmButton, savingChoice && styles.disabledButton]}
          >
            <Text style={styles.confirmButtonText}>
              {savingChoice ? "Saving..." : "Confirm this avatar"}
            </Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.modeTabs}>
        {modes.map((mode) => {
          const isSelected = mode.id === selectedModeId;
          const isRecommended = mode.id === initialModeId;
          return (
            <Pressable
              key={mode.id}
              onPress={() => {
                Speech.stop();
                setSelectedModeId(mode.id as ModeId);
                setShowModeTip(false);
                setSaveError(null);
              }}
              style={[styles.modeTab, isSelected && styles.modeTabSelected]}
            >
              <Text style={[styles.modeTabText, isSelected && styles.modeTabTextSelected]}>
                {mode.title}
              </Text>
              {isRecommended ? <Text style={styles.modeTabRecommended}>Recommended</Text> : null}
            </Pressable>
          );
        })}
      </View>

      {showModeTip && (
        <View style={styles.dimOverlay}>
          <Animated.View
            style={[
              styles.highlightedPopup,
              {
                opacity: modeTipAnim,
                transform: [
                  {
                    scale: modeTipAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0.96, 1],
                    }),
                  },
                ],
              },
            ]}
          >
            <View style={styles.noteCopy}>
              <Text style={styles.noteTitle}>Ready for your tutorial task?</Text>
              <Text style={styles.noteText}>
                Your avatar is set. Start the guided assembly task now, or return to the homepage for later.
              </Text>
              <View style={styles.taskActions}>
                <Pressable onPress={goToGame} style={styles.readyButton}>
                  <Text style={styles.readyButtonText}>I am ready</Text>
                </Pressable>
                <Pressable onPress={goHome} style={styles.notNowButton}>
                  <Text style={styles.notNowButtonText}>Not now</Text>
                </Pressable>
              </View>
            </View>
            <View style={styles.smallMascotCircle}>
              <Image source={mascot} style={styles.smallMascot} />
            </View>
          </Animated.View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#F3ECE0",
    paddingHorizontal: 38,
    paddingVertical: 18,
  },
  header: {
    position: "absolute",
    right: 42,
    top: 18,
    zIndex: 10,
    flexDirection: "row",
    gap: 18,
  },
  navButton: {
    width: 56,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  navText: {
    color: "#231F20",
    fontSize: 42,
    fontWeight: "900",
    lineHeight: 42,
  },
  recommendationLayout: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 34,
    paddingBottom: 66,
    paddingRight: 54,
  },
  audioButton: {
    alignSelf: "flex-start",
    flexShrink: 0,
    marginTop: 42,
  },
  modeCard: {
    width: 190,
    height: 260,
    alignItems: "center",
    justifyContent: "center",
    borderColor: "#D8CDBB",
    borderRadius: 8,
    borderWidth: 2,
    backgroundColor: "#FBF8F3",
    gap: 8,
    padding: 14,
  },
  modeCardRecommended: {
    borderColor: "#4AAE78",
    borderWidth: 3,
    backgroundColor: "#EDF6EF",
  },
  avatarCircle: {
    width: 112,
    height: 112,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 56,
  },
  avatarImage: {
    width: 82,
    height: 82,
    borderRadius: 22,
  },
  recommendedBadge: {
    position: "absolute",
    top: 10,
    right: 10,
    borderRadius: 8,
    backgroundColor: "#4AAE78",
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  recommendedBadgeText: {
    color: "#FFFFFF",
    fontSize: 9,
    fontWeight: "900",
  },
  modeTitle: {
    color: "#231F20",
    fontSize: 21,
    fontWeight: "900",
    textAlign: "center",
  },
  avatarName: {
    color: "#665f55",
    fontSize: 14,
    fontWeight: "800",
    textAlign: "center",
  },
  recommendationCopy: {
    flex: 1,
    minWidth: 0,
    gap: 7,
  },
  title: {
    color: "#231F20",
    fontSize: 26,
    fontWeight: "900",
    lineHeight: 31,
  },
  avatarLine: {
    color: "#231F20",
    fontSize: 16,
    fontWeight: "900",
  },
  personalityLine: {
    color: "#231F20",
    fontSize: 15,
    fontWeight: "800",
  },
  explanation: {
    color: "#665f55",
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 18,
  },
  sloganLine: {
    color: "#8FA876",
    fontSize: 14,
    fontWeight: "800",
    lineHeight: 18,
  },
  bulletList: {
    gap: 5,
  },
  bulletRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
  },
  bulletDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: "#231F20",
  },
  bulletText: {
    flex: 1,
    color: "#231F20",
    fontSize: 13,
    fontWeight: "700",
  },
  modeTabs: {
    position: "absolute",
    left: 38,
    right: 38,
    bottom: 18,
    height: 56,
    flexDirection: "row",
    gap: 8,
  },
  modeTab: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    borderColor: "#D8CDBB",
    borderRadius: 8,
    borderWidth: 2,
    backgroundColor: "#FBF8F3",
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  modeTabSelected: {
    borderColor: "#4AAE78",
    borderWidth: 3,
    backgroundColor: "#EDF6EF",
  },
  modeTabText: {
    color: "#231F20",
    fontSize: 14,
    fontWeight: "900",
    textAlign: "center",
  },
  modeTabTextSelected: {
    color: "#26734B",
  },
  modeTabRecommended: {
    color: "#4AAE78",
    fontSize: 9,
    fontWeight: "900",
    marginTop: 1,
  },
  confirmButton: {
    alignItems: "center",
    borderRadius: 8,
    backgroundColor: "#2D2A26",
    paddingHorizontal: 24,
    paddingVertical: 12,
  },
  disabledButton: {
    opacity: 0.58,
  },
  confirmButtonText: {
    color: "#FBF8F3",
    fontSize: 15,
    fontWeight: "900",
  },
  saveErrorText: {
    color: "#C98B76",
    fontSize: 12,
    fontWeight: "800",
  },
  dimOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(35, 31, 32, 0.48)",
  },
  highlightedPopup: {
    position: "absolute",
    right: 92,
    bottom: 58,
    width: 620,
    minHeight: 142,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    borderColor: "#E8D48C",
    borderRadius: 28,
    borderWidth: 3,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.26,
    shadowRadius: 16,
  },
  noteCopy: {
    flex: 1,
    borderRadius: 20,
    backgroundColor: "#FBF8F3",
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  noteTitle: {
    color: "#231F20",
    fontSize: 21,
    fontWeight: "900",
    marginBottom: 5,
  },
  noteText: {
    color: "#231F20",
    fontSize: 14,
    fontWeight: "700",
    lineHeight: 19,
  },
  taskActions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 12,
  },
  readyButton: {
    alignItems: "center",
    borderRadius: 20,
    backgroundColor: "#2D2A26",
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  readyButtonText: {
    color: "#FBF8F3",
    fontSize: 14,
    fontWeight: "900",
  },
  notNowButton: {
    alignItems: "center",
    borderColor: "#d8cdbb",
    borderRadius: 20,
    borderWidth: 2,
    backgroundColor: "#FBF8F3",
    paddingHorizontal: 18,
    paddingVertical: 8,
  },
  notNowButtonText: {
    color: "#231F20",
    fontSize: 14,
    fontWeight: "900",
  },
  smallMascotCircle: {
    width: 88,
    height: 88,
    alignItems: "center",
    justifyContent: "center",
    borderColor: "#E8D48C",
    borderRadius: 44,
    borderWidth: 1,
    backgroundColor: "#FBF8F3",
    marginLeft: -8,
  },
  smallMascot: {
    width: 62,
    height: 62,
    borderRadius: 18,
  },
});
