import { router, useLocalSearchParams } from "expo-router";
import type { Href } from "expo-router";
import * as Speech from "@/src/onboarding/speech";
import { StyleSheet, Animated, Image, Pressable, Text, View } from "react-native";
import { useEffect, useRef, useState } from "react";
import { avatarModes } from "@/src/onboarding/avatarModes";
import type { ModeId } from "@/src/onboarding/questionnaire";
import { VoiceButton } from "@/src/game/ui/VoiceButton";
import { useGameStore } from "@/src/game/core/store";
import type { ProfileId } from "@/src/game/core/profile";
import { useTutorialStore } from "@/src/game/tutorial/store";
import { saveSelectedAvatarMode } from "@/src/services/onboarding";
import { Button } from "@/src/game/ui/Button";
import { RADIUS, SPACE, TYPE, useStyles } from "@/src/game/ui/theme";
import type { Theme } from "@/src/game/ui/theme";

const mascot = require("../../assets/images/mascot/mascot.png");
const lumiAvatar = require("../../assets/images/avatars/lumi.jpg");
const sparkyAvatar = require("../../assets/images/avatars/sparky.jpg");
const ciaraAvatar = require("../../assets/images/avatars/ciara.jpg");
const felixAvatar = require("../../assets/images/avatars/felix.jpg");
// The room is the post-onboarding hub now that the home tab is gone.
const homeRoute = "/room" as Href;

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
  const styles = useStyles(makeStyles);
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
          <Button
            label={savingChoice ? "Saving..." : "Confirm this avatar"}
            variant="primary"
            onPress={confirmAvatar}
            disabled={savingChoice}
          />
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
                <Button label="I am ready" variant="primary" pill onPress={goToGame} />
                <Button label="Not now" pill onPress={goHome} />
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

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: t.bg,
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
      color: t.text,
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
      borderColor: t.border,
      borderRadius: 8,
      borderWidth: 2,
      backgroundColor: t.surface,
      gap: SPACE.sm,
      padding: 14,
    },
    modeCardRecommended: {
      borderColor: t.success,
      borderWidth: 3,
      backgroundColor: t.surfaceRaised,
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
      backgroundColor: t.success,
      paddingHorizontal: SPACE.sm,
      paddingVertical: SPACE.xs,
    },
    recommendedBadgeText: {
      color: t.onSuccess,
      fontSize: 9,
      fontWeight: "900",
    },
    modeTitle: {
      color: t.text,
      fontSize: 21,
      fontWeight: "900",
      textAlign: "center",
    },
    avatarName: {
      color: t.textDim,
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
      color: t.text,
      fontSize: 26,
      fontWeight: "900",
      lineHeight: 31,
    },
    avatarLine: {
      color: t.text,
      fontSize: 16,
      fontWeight: "900",
    },
    personalityLine: {
      color: t.text,
      fontSize: 15,
      fontWeight: "800",
    },
    explanation: {
      color: t.textDim,
      fontSize: 13,
      fontWeight: "700",
      lineHeight: 18,
    },
    sloganLine: {
      color: t.success,
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
      backgroundColor: t.text,
    },
    bulletText: {
      flex: 1,
      color: t.text,
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
      gap: SPACE.sm,
    },
    modeTab: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      borderColor: t.border,
      borderRadius: 8,
      borderWidth: 2,
      backgroundColor: t.surface,
      paddingHorizontal: SPACE.sm,
      paddingVertical: 5,
    },
    modeTabSelected: {
      borderColor: t.accent,
      borderWidth: 3,
      backgroundColor: t.surfaceRaised,
    },
    modeTabText: {
      ...TYPE.label,
      color: t.text,
      fontWeight: "900",
      textAlign: "center",
    },
    modeTabTextSelected: {
      color: t.accent,
    },
    modeTabRecommended: {
      color: t.success,
      fontSize: 9,
      fontWeight: "900",
      marginTop: 1,
    },
    saveErrorText: {
      ...TYPE.labelSm,
      color: t.danger,
    },
    dimOverlay: {
      ...StyleSheet.absoluteFillObject,
      zIndex: 20,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: t.scrim,
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
      borderColor: t.gold,
      borderRadius: 28,
      borderWidth: 3,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.26,
      shadowRadius: 16,
    },
    noteCopy: {
      flex: 1,
      borderRadius: RADIUS.panel,
      backgroundColor: t.surface,
      paddingHorizontal: 20,
      paddingVertical: SPACE.lg,
    },
    noteTitle: {
      color: t.text,
      fontSize: 21,
      fontWeight: "900",
      marginBottom: 5,
    },
    noteText: {
      color: t.text,
      fontSize: 14,
      fontWeight: "700",
      lineHeight: 19,
    },
    taskActions: {
      flexDirection: "row",
      gap: 10,
      marginTop: SPACE.md,
    },
    smallMascotCircle: {
      width: 88,
      height: 88,
      alignItems: "center",
      justifyContent: "center",
      borderColor: t.gold,
      borderRadius: 44,
      borderWidth: 1,
      backgroundColor: t.surface,
      marginLeft: -8,
    },
    smallMascot: {
      width: 62,
      height: 62,
      borderRadius: 18,
    },
  });
