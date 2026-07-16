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
const homeRoute = "/" as Href;

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
  const params = useLocalSearchParams<{ mode?: string; secondary?: string }>();
  const initialModeId = modes.some((mode) => mode.id === params.mode) ? (params.mode as ModeId) : "momentum";
  const secondaryModeId = modes.some((mode) => mode.id === params.secondary)
    ? (params.secondary as ModeId)
    : (modes.find((mode) => mode.id !== initialModeId)?.id as ModeId | undefined);
  const recommendedModeIds = [initialModeId, secondaryModeId].filter(Boolean) as ModeId[];
  const [selectedModeId, setSelectedModeId] = useState<ModeId>(initialModeId);
  const [showOtherModes, setShowOtherModes] = useState(false);
  const [showModeTip, setShowModeTip] = useState(false);
  const [savingChoice, setSavingChoice] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const modeTipAnim = useRef(new Animated.Value(0)).current;
  const selectedMode = modes.find((mode) => mode.id === selectedModeId) ?? modes[0];
  const otherModes = modes.filter((mode) => recommendedModeIds.includes(mode.id as ModeId) && mode.id !== selectedModeId);

  useEffect(() => {
    return () => {
      Speech.stop();
    };
  }, []);

  useEffect(() => {
    Speech.stop();
  }, [selectedModeId, showModeTip, showOtherModes]);

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
    router.replace("/game" as Href);
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

      {!showOtherModes ? (
        <View style={styles.recommendationLayout}>
          <VoiceButton onPress={speakSelectedMode} style={styles.audioButton} />
          <View style={styles.modeCard}>
            <View style={[styles.avatarCircle, { backgroundColor: selectedMode.color }]}>
              <Image source={selectedMode.image} style={styles.avatarImage} />
            </View>
            <Text style={styles.modeTitle}>{selectedMode.title}</Text>
            <Text style={styles.avatarName}>{selectedMode.avatarName}</Text>
          </View>

          <View style={styles.recommendationCopy}>
            <Text style={styles.title}>Based on your choices, I recommend...</Text>
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
            <Pressable
              onPress={() => {
                Speech.stop();
                setShowOtherModes(true);
              }}
            >
              <Text style={styles.otherModesLink}>Other recommended avatars</Text>
            </Pressable>
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
      ) : (
        <View style={styles.otherModesLayout}>
          <Text style={styles.otherModesTitle}>Other recommended avatar...</Text>
          <View style={styles.otherModesGrid}>
            {otherModes.map((mode) => (
              <Pressable
                key={mode.id}
                onPress={() => {
                  Speech.stop();
                  setSelectedModeId(mode.id as ModeId);
                  setShowOtherModes(false);
                  setShowModeTip(false);
                }}
                style={styles.otherModeCard}
              >
                <View style={[styles.otherAvatarCircle, { backgroundColor: mode.color }]}>
                  <Image source={mode.image} style={styles.otherAvatarImage} />
                </View>
                <View style={styles.otherModeCopy}>
                  <Text style={styles.otherModeTitle}>{mode.title}</Text>
                  <Text style={styles.otherAvatarName}>{mode.avatarName}</Text>
                  {mode.bullets.map((bullet) => (
                    <View key={bullet} style={styles.otherBulletRow}>
                      <View style={styles.otherBulletDot} />
                      <Text style={styles.otherBulletText}>{bullet}</Text>
                    </View>
                  ))}
                </View>
              </Pressable>
            ))}
          </View>
        </View>
      )}

      {showModeTip && !showOtherModes && (
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
    paddingHorizontal: 46,
    paddingVertical: 24,
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
    gap: 44,
  },
  audioButton: {
    alignSelf: "flex-start",
    marginTop: 62,
  },
  modeCard: {
    width: 190,
    height: 252,
    alignItems: "center",
    justifyContent: "center",
    borderColor: "#d8cdbb",
    borderRadius: 32,
    borderWidth: 2,
    backgroundColor: "#FBF8F3",
    gap: 9,
  },
  avatarCircle: {
    width: 118,
    height: 118,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 59,
  },
  avatarImage: {
    width: 86,
    height: 86,
    borderRadius: 24,
  },
  modeTitle: {
    color: "#231F20",
    fontSize: 23,
    fontWeight: "900",
    textAlign: "center",
  },
  avatarName: {
    color: "#665f55",
    fontSize: 15,
    fontWeight: "800",
    textAlign: "center",
  },
  recommendationCopy: {
    flex: 1,
    gap: 8,
  },
  title: {
    color: "#231F20",
    fontSize: 28,
    fontWeight: "800",
    lineHeight: 34,
  },
  explanation: {
    color: "#665f55",
    fontSize: 17,
    fontWeight: "700",
    lineHeight: 23,
  },
  avatarLine: {
    color: "#231F20",
    fontSize: 17,
    fontWeight: "900",
  },
  personalityLine: {
    color: "#231F20",
    fontSize: 16,
    fontWeight: "800",
  },
  sloganLine: {
    color: "#8FA876",
    fontSize: 15,
    fontWeight: "800",
    lineHeight: 20,
  },
  bulletList: {
    gap: 8,
  },
  bulletRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  bulletDot: {
    width: 13,
    height: 13,
    borderRadius: 7,
    backgroundColor: "#231F20",
  },
  bulletText: {
    color: "#231F20",
    fontSize: 17,
    fontWeight: "700",
  },
  otherModesLink: {
    color: "#665f55",
    fontSize: 15,
    fontWeight: "800",
    textDecorationLine: "underline",
  },
  confirmButton: {
    alignSelf: "flex-start",
    alignItems: "center",
    borderRadius: 24,
    backgroundColor: "#2D2A26",
    paddingHorizontal: 24,
    paddingVertical: 12,
    marginTop: 2,
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
  otherModesLayout: {
    flex: 1,
    justifyContent: "center",
    gap: 26,
  },
  otherModesTitle: {
    color: "#231F20",
    fontSize: 27,
    fontWeight: "800",
  },
  otherModesGrid: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 18,
  },
  otherModeCard: {
    flex: 1,
    maxWidth: 360,
    minHeight: 236,
    borderColor: "#d8cdbb",
    borderRadius: 28,
    borderWidth: 2,
    backgroundColor: "#FBF8F3",
    padding: 18,
    gap: 14,
  },
  otherAvatarCircle: {
    width: 86,
    height: 86,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 43,
  },
  otherAvatarImage: {
    width: 62,
    height: 62,
    borderRadius: 18,
  },
  otherModeCopy: {
    gap: 8,
  },
  otherModeTitle: {
    color: "#231F20",
    fontSize: 20,
    fontWeight: "900",
  },
  otherAvatarName: {
    color: "#665f55",
    fontSize: 14,
    fontWeight: "800",
  },
  otherBulletRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
  },
  otherBulletDot: {
    width: 11,
    height: 11,
    borderColor: "#231F20",
    borderRadius: 6,
    borderWidth: 2,
  },
  otherBulletText: {
    flex: 1,
    color: "#231F20",
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 17,
  },
});
