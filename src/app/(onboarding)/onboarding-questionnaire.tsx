import { router } from "expo-router";
import type { Href } from "expo-router";
import * as Speech from "@/src/onboarding/speech";
import { useEffect, useMemo, useRef, useState } from "react";
import { StyleSheet, Animated, Image, Pressable, Text, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import {
  getRecommendedModes,
  questionnaireIntroVoiceText,
  questions,
  type Handedness,
  type HintId,
} from "@/src/onboarding/questionnaire";
import { VoiceButton } from "@/src/game/ui/VoiceButton";
import { Button } from "@/src/game/ui/Button";
import { SPACE, TYPE, ELEVATION, useStyles } from "@/src/game/ui/theme";
import { SCREEN_SIDE_MARGIN, SCREEN_VERTICAL_MARGIN, useSafeInsets } from "@/src/hooks/use-safe-insets";
import { saveOnboardingResults } from "@/src/services/onboarding";
import type { Theme } from "@/src/game/ui/theme";

const mascot = require("../../assets/images/questionnaire/whole.png");
const q3ManualReference = require("../../assets/images/questionnaire/q3-manual-reference.png");
const questionOptionImages = [
  [
    require("../../assets/images/questionnaire/cry.png"),
    require("../../assets/images/questionnaire/starteye.png"),
    require("../../assets/images/questionnaire/calm.png"),
  ],
  [
    require("../../assets/images/questionnaire/cry.png"),
    require("../../assets/images/questionnaire/curious.png"),
    require("../../assets/images/questionnaire/happy.png"),
  ],
  [
    require("../../assets/images/questionnaire/cry.png"),
    require("../../assets/images/questionnaire/curious.png"),
    require("../../assets/images/questionnaire/happy.png"),
  ],
  [
    require("../../assets/images/questionnaire/starteye.png"),
    require("../../assets/images/questionnaire/calm.png"),
    require("../../assets/images/questionnaire/happy.png"),
  ],
  [
    require("../../assets/images/questionnaire/cry.png"),
    require("../../assets/images/questionnaire/curious.png"),
    require("../../assets/images/questionnaire/starteye.png"),
  ],
];

export default function QuestionnaireScreen() {
  const styles = useStyles(makeStyles);
  const safe = useSafeInsets();
  const [introComplete, setIntroComplete] = useState(false);
  const [handedness, setHandedness] = useState<Handedness | null>(null);
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<string[]>([]);
  const [activeHint, setActiveHint] = useState<HintId>(null);
  const [referenceExpanded, setReferenceExpanded] = useState(false);
  const [referenceScale, setReferenceScale] = useState(1);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const advanceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const referenceScaleRef = useRef(1);
  const referencePinchStartScaleRef = useRef(1);
  const navHintAnim = useRef(new Animated.Value(0)).current;
  const question = questions[index];
  const selectedAnswer = answers[index];
  const showManualReference = index === 2;
  const progressWidth = useMemo(
    () => `${((index + 1) / questions.length) * 100}%` as `${number}%`,
    [index],
  );

  const finishQuestionnaire = async (finalAnswers: string[]) => {
    if (saving) return;
    setSaving(true);
    setSaveError(null);
    const [primaryMode, secondaryMode] = getRecommendedModes(finalAnswers);
    try {
      await saveOnboardingResults({
        handedness,
        answers: finalAnswers,
        primaryMode,
        secondaryMode,
      });
      router.push(
        `/avatar-recommendation?mode=${primaryMode}&secondary=${secondaryMode}` as Href,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not save onboarding answers.";
      setSaveError(message);
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    return () => {
      if (advanceTimerRef.current) {
        clearTimeout(advanceTimerRef.current);
      }
      Speech.stop();
    };
  }, []);

  useEffect(() => {
    Speech.stop();
    setReferenceExpanded(false);
  }, [index, introComplete]);

  useEffect(() => {
    if (!referenceExpanded) return;
    referenceScaleRef.current = 1;
    referencePinchStartScaleRef.current = 1;
    setReferenceScale(1);
  }, [referenceExpanded]);

  useEffect(() => {
    if (!activeHint) {
      return;
    }
    navHintAnim.setValue(0);
    Animated.timing(navHintAnim, {
      toValue: 1,
      duration: 220,
      useNativeDriver: true,
    }).start();
    const timer = setTimeout(() => setActiveHint(null), 5200);
    return () => clearTimeout(timer);
  }, [activeHint, navHintAnim]);

  const chooseAnswer = (answer: string) => {
    const answeredIndex = index;
    Speech.stop();
    setAnswers((current) => {
      const next = [...current];
      next[answeredIndex] = answer;
      return next;
    });

    if (advanceTimerRef.current) {
      clearTimeout(advanceTimerRef.current);
    }

    advanceTimerRef.current = setTimeout(() => {
      Speech.stop();
      if (answeredIndex === questions.length - 1) {
        const finalAnswers = [...answers];
        finalAnswers[answeredIndex] = answer;
        void finishQuestionnaire(finalAnswers);
        return;
      }
      setIndex(answeredIndex + 1);
      if (answeredIndex === 0) {
        setActiveHint((current) => current ?? "navigation");
      }
    }, 650);
  };

  const speak = (text: string) => {
    Speech.stop();
    Speech.speak(text, {
      language: "en-US",
      pitch: 1.08,
      rate: 0.92,
    });
  };

  const speakIntro = () => {
    speak(questionnaireIntroVoiceText);
  };

  const speakCurrentQuestion = () => {
    speak(question.prompt);
  };

  const speakAnswer = (answer: string) => {
    speak(answer);
  };

  const goBack = () => {
    Speech.stop();
    if (advanceTimerRef.current) {
      clearTimeout(advanceTimerRef.current);
    }
    setActiveHint(null);
    if (index === 0) {
      setIntroComplete(false);
      return;
    }
    setIndex((current) => current - 1);
  };

  const goNext = () => {
    Speech.stop();
    if (advanceTimerRef.current) {
      clearTimeout(advanceTimerRef.current);
    }
    setActiveHint(null);
    if (!selectedAnswer) {
      return;
    }
    if (index === questions.length - 1) {
      void finishQuestionnaire(answers);
      return;
    }
    setIndex((current) => current + 1);
  };

  const referencePinch = useMemo(
    () =>
      Gesture.Pinch()
        .runOnJS(true)
        .onBegin(() => {
          referencePinchStartScaleRef.current = referenceScaleRef.current;
        })
        .onUpdate((event) => {
          const nextScale = Math.min(3.2, Math.max(1, referencePinchStartScaleRef.current * event.scale));
          referenceScaleRef.current = nextScale;
          setReferenceScale(nextScale);
        }),
    [],
  );

  if (!introComplete) {
    return (
      <View style={styles.root}>
        <View style={styles.introStage}>
          <View style={styles.mascotCircle}>
            <Image source={mascot} style={styles.introMascot} />
            
          </View>
          <View style={styles.speechBubble}>
            <VoiceButton onPress={speakIntro} />
            <Text style={styles.introText}>
              Hey! I am momo, your assembly assistant! Before you get started,
              let us complete a short questionnaire to help you find the best
              help mode!
            </Text>
            <Text style={styles.introPrompt}>
              Before starting, tell me - are you left or right-handed?
            </Text>
            <View style={styles.handOptions}>
              <Pressable
                onPress={() => setHandedness("left")}
                style={[
                  styles.handButton,
                  handedness === "left" && styles.selectedHandButton,
                ]}
              >
                <Text style={styles.handIcon}>L</Text>
                <Text style={styles.handText}>left</Text>
              </Pressable>
              <Pressable
                onPress={() => setHandedness("right")}
                style={[
                  styles.handButton,
                  handedness === "right" && styles.selectedHandButton,
                ]}
              >
                <Text style={styles.handIcon}>R</Text>
                <Text style={styles.handText}>right</Text>
              </Pressable>
            </View>
          </View>
        </View>
        <Button
          label="Next"
          variant="primary"
          pill
          disabled={!handedness}
          onPress={() => {
            Speech.stop();
            setIntroComplete(true);
            setActiveHint("voice");
          }}
          style={styles.introNextButton}
        />
      </View>
    );
  }

  return (
    <View
      style={[
        styles.root,
        {
          paddingLeft: 44 + Math.max(safe.raw.left, SCREEN_SIDE_MARGIN),
          paddingRight: 44 + Math.max(safe.raw.right, SCREEN_SIDE_MARGIN),
          paddingTop: 22 + Math.max(safe.raw.top, SCREEN_VERTICAL_MARGIN),
          paddingBottom: 22 + Math.max(safe.raw.bottom, SCREEN_VERTICAL_MARGIN),
        },
      ]}
    >
      <View style={styles.questionHeader}>
        <Text style={styles.stepText}>
          {index + 1}/{questions.length}
        </Text>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: progressWidth }]} />
        </View>
        <View
          style={[
            styles.navButtons,
            activeHint === "navigation" && styles.highlightedNavButtons,
          ]}
        >
          <Pressable onPress={goBack} style={styles.navButton}>
            <Image
              source={require("@/src/assets/ui/icons/arrow-back.png")}
              style={styles.navArrow}
              resizeMode="contain"
            />
          </Pressable>
          <Pressable
            disabled={!selectedAnswer || saving}
            onPress={goNext}
            style={[
              styles.navButton,
              (!selectedAnswer || saving) && styles.disabledNavButton,
            ]}
          >
            <Image
              source={require("@/src/assets/ui/icons/arrow-next.png")}
              style={[styles.navArrow, (!selectedAnswer || saving) && styles.navArrowDisabled]}
              resizeMode="contain"
            />
          </Pressable>
        </View>
      </View>

      {activeHint && (
        <Pressable
          onPress={() => setActiveHint(null)}
          style={styles.guidedOverlay}
        >
          <Animated.View
            style={[
              activeHint === "voice" ? styles.voiceHintCard : styles.navHintCard,
              {
                opacity: navHintAnim,
                transform: [
                  {
                    scale: navHintAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0.96, 1],
                    }),
                  },
                ],
              },
            ]}
          >
            {activeHint === "voice" ? (
              <>
                <View style={styles.voiceHintIconWrap}>
                  <VoiceButton onPress={() => undefined} />
                </View>
                <Text style={styles.navHintTitle}>Voice is available.</Text>
                <Text style={styles.navHintText}>
                  Tap the voice button beside a question or answer to hear it
                  read aloud.
                </Text>
              </>
            ) : (
              <>
                <View style={styles.navHintArrowDemo}>
                  <Image source={require("@/src/assets/ui/icons/arrow-back.png")} style={styles.navArrow} resizeMode="contain" />
                  <Image source={require("@/src/assets/ui/icons/arrow-next.png")} style={styles.navArrow} resizeMode="contain" />
                </View>
                <Text style={styles.navHintTitle}>Your answer is saved.</Text>
                <Text style={styles.navHintText}>
                  Use these arrows anytime to review or change a choice.
                </Text>
              </>
            )}
          </Animated.View>
        </Pressable>
      )}

      <View style={styles.promptRow}>
        <VoiceButton
          onPress={speakCurrentQuestion}
          size={showManualReference ? "small" : "default"}
        />
        <Text style={styles.prompt}>{question.prompt}</Text>
      </View>
      {saveError ? <Text style={styles.saveErrorText}>{saveError}</Text> : null}
      {saving ? <Text style={styles.savingText}>Saving onboarding...</Text> : null}

      <View
        style={[
          styles.optionsRow,
          showManualReference && styles.manualOptionsRow,
        ]}
      >
        {showManualReference && (
          <Pressable
            onPress={() => {
              Speech.stop();
              setReferenceExpanded(true);
            }}
            style={styles.referencePanel}
          >
            <Image
              source={q3ManualReference}
              style={styles.referencePanelImage}
              resizeMode="contain"
            />
            <View style={styles.referenceZoomPill}>
              <Text style={styles.referenceZoomIcon}>+</Text>
              <Text style={styles.referencePanelText}>Tap to zoom</Text>
            </View>
          </Pressable>
        )}
        {question.options.map((option, optionIndex) => {
          const selected = option === selectedAnswer;
          const expressionImage = questionOptionImages[index][optionIndex];
          return (
            <Pressable
              key={option}
              disabled={saving}
              onPress={() => chooseAnswer(option)}
              style={[
                styles.optionCard,
                showManualReference && styles.compactOptionCard,
                selected && styles.selectedOptionCard,
              ]}
            >
              <VoiceButton
                onPress={(event) => {
                  event.stopPropagation();
                  speakAnswer(option);
                }}
                style={styles.optionAudioButton}
                size="small"
              />
              <View
                style={[
                  styles.expressionSlot,
                  showManualReference && styles.compactExpressionSlot,
                ]}
              >
                <View
                  style={[
                    styles.expressionCircle,
                    showManualReference && styles.compactExpressionCircle,
                    selected && styles.selectedExpressionCircle,
                  ]}
                >
                  <Image
                    source={expressionImage}
                    style={[
                      styles.optionMascot,
                      showManualReference && styles.compactOptionMascot,
                    ]}
                  />
                </View>
              </View>
              <Text
                style={[
                  styles.optionText,
                  showManualReference && styles.compactOptionText,
                  selected && styles.selectedOptionText,
                ]}
              >
                {option}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {referenceExpanded && (
        <View style={styles.referenceOverlay}>
          <Pressable
            onPress={() => setReferenceExpanded(false)}
            style={styles.referenceOverlayBackdrop}
          />
          <GestureDetector gesture={referencePinch}>
            <View style={styles.referenceExpandedCard} collapsable={false}>
              <Image
                source={q3ManualReference}
                style={[
                  styles.referenceExpandedImage,
                  { transform: [{ scale: referenceScale }] },
                ]}
                resizeMode="contain"
              />
              <View style={styles.referenceExpandedHint} pointerEvents="none">
                <Text style={styles.referenceExpandedHintText}>
                  Pinch to zoom · Tap outside to close
                </Text>
              </View>
            </View>
          </GestureDetector>
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
      // Padding is applied inline (base + safe inset) so the questionnaire clears the cutout
      // and the immersive-hidden bars the same way every other screen does.
    },
    introStage: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 28,
    },
    mascotCircle: {
      width: 190,
      height: 190,
      alignItems: "center",
      justifyContent: "center",
      overflow: "hidden",
      borderColor: t.border,
      borderRadius: 95,
      borderWidth: 2,
      backgroundColor: t.surface,
    },
    introMascot: {
      width: "100%",
      height: "100%",
      transform: [{ scale: 1.55 }],
    },
    introMascotModel: {
      ...StyleSheet.absoluteFillObject,
    },
    speechBubble: {
      width: 560,
      minHeight: 216,
      borderRadius: 42,
      backgroundColor: t.surface,
      paddingHorizontal: 44,
      paddingVertical: 28,
      gap: 18,
    },
    introText: {
      color: t.text,
      fontSize: 17,
      fontWeight: "600",
      lineHeight: 24,
    },
    introPrompt: {
      color: t.text,
      fontSize: 18,
      fontStyle: "italic",
      fontWeight: "800",
      textAlign: "center",
    },
    handOptions: {
      flexDirection: "row",
      justifyContent: "center",
      gap: 28,
    },
    handButton: {
      width: 70,
      height: 74,
      alignItems: "center",
      justifyContent: "center",
      borderColor: t.border,
      borderRadius: 18,
      borderWidth: 2,
      backgroundColor: t.surface,
    },
    selectedHandButton: {
      borderColor: t.accent,
      backgroundColor: t.surfaceRaised,
    },
    handIcon: {
      color: t.text,
      fontSize: 28,
      fontWeight: "900",
    },
    handText: {
      ...TYPE.labelSm,
      color: t.textDim,
      fontWeight: "800",
    },
    // Layout only — the fill, radius, and padding now come from the shared Button.
    introNextButton: {
      position: "absolute",
      right: 54,
      bottom: 30,
      minWidth: 116,
    },
    questionHeader: {
      flexDirection: "row",
      alignItems: "center",
      gap: 18,
    },
    stepText: {
      width: 52,
      color: t.text,
      fontSize: 18,
      fontWeight: "900",
      textAlign: "right",
    },
    progressTrack: {
      flex: 1,
      height: 10,
      overflow: "hidden",
      borderRadius: SPACE.sm,
      backgroundColor: t.surfaceInset,
    },
    progressFill: {
      height: "100%",
      borderRadius: SPACE.sm,
      backgroundColor: t.accent,
    },
    navArrow: { width: 26, height: 26 },
    navArrowDisabled: { opacity: 0.3 },
    navButtons: {
      width: 150,
      flexDirection: "row",
      justifyContent: "flex-end",
      gap: SPACE.lg,
      borderRadius: 24,
      paddingHorizontal: 6,
    },
    highlightedNavButtons: {
      borderColor: t.accent,
      borderWidth: 3,
      backgroundColor: t.surfaceRaised,
    },
    navButton: {
      width: 54,
      height: 42,
      alignItems: "center",
      justifyContent: "center",
    },
    disabledNavButton: {
      opacity: 0.35,
    },
    navText: {
      color: t.text,
      fontSize: 42,
      fontWeight: "900",
      lineHeight: 42,
    },
    guidedOverlay: {
      ...StyleSheet.absoluteFillObject,
      zIndex: 20,
      alignItems: "flex-end",
      backgroundColor: t.scrim,
      paddingRight: 52,
      paddingTop: 68,
    },
    navHintCard: {
      width: 320,
      borderColor: t.accent,
      borderRadius: 22,
      borderWidth: 3,
      backgroundColor: t.surface,
      paddingHorizontal: 18,
      paddingVertical: 14,
      ...ELEVATION.card,
    },
    voiceHintCard: {
      width: 330,
      borderColor: t.accent,
      borderRadius: 22,
      borderWidth: 3,
      backgroundColor: t.surface,
      paddingHorizontal: 18,
      paddingVertical: SPACE.lg,
      ...ELEVATION.card,
    },
    voiceHintIconWrap: {
      width: 54,
      height: 54,
      alignItems: "center",
      justifyContent: "center",
      borderColor: t.border,
      borderRadius: 27,
      borderWidth: 1,
      backgroundColor: t.surface,
      marginBottom: 10,
    },
    navHintArrowDemo: {
      alignSelf: "flex-end",
      flexDirection: "row",
      gap: 14,
      borderColor: t.accent,
      borderRadius: 20,
      borderWidth: 2,
      backgroundColor: t.surfaceRaised,
      paddingHorizontal: 10,
      marginBottom: SPACE.sm,
    },
    navHint: {
      position: "absolute",
      right: 54,
      top: 74,
      zIndex: 10,
      width: 300,
      borderColor: t.accent,
      borderRadius: 20,
      borderWidth: 2,
      backgroundColor: t.surface,
      paddingHorizontal: 18,
      paddingVertical: 14,
    },
    navHintTitle: {
      color: t.accent,
      fontSize: 15,
      fontWeight: "900",
      marginBottom: SPACE.xs,
    },
    navHintText: {
      color: t.text,
      fontSize: 14,
      fontWeight: "700",
      lineHeight: 19,
    },
    promptRow: {
      minHeight: 44,
      flexDirection: "row",
      alignItems: "center",
      gap: 14,
      paddingTop: 0,
      marginBottom: 4,
    },
    prompt: {
      flex: 1,
      color: t.text,
      fontSize: 15,
      fontWeight: "900",
      lineHeight: 19,
    },
    saveErrorText: {
      ...TYPE.labelSm,
      marginLeft: 72,
      color: t.danger,
      fontWeight: "800",
    },
    savingText: {
      ...TYPE.labelSm,
      marginLeft: 72,
      color: t.success,
      fontWeight: "800",
    },
    referencePanel: {
      width: 230,
      height: 252,
      alignItems: "center",
      justifyContent: "center",
      overflow: "hidden",
      borderColor: t.border,
      borderRadius: SPACE.md,
      borderWidth: 2,
      backgroundColor: t.surface,
      paddingHorizontal: SPACE.sm,
      paddingVertical: SPACE.sm,
    },
    referencePanelImage: {
      width: "100%",
      height: 210,
    },
    referenceZoomPill: {
      minWidth: 116,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 5,
      borderColor: t.border,
      borderRadius: 14,
      borderWidth: 1,
      backgroundColor: t.surface,
      paddingHorizontal: 10,
      paddingVertical: SPACE.xs,
      marginTop: 6,
    },
    referenceZoomIcon: {
      color: t.accent,
      fontSize: 14,
      fontWeight: "900",
      lineHeight: 14,
    },
    referencePanelText: {
      color: t.accent,
      fontSize: 10,
      fontWeight: "900",
      lineHeight: 12,
      textAlign: "center",
    },
    optionsRow: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 20,
      paddingTop: 0,
    },
    manualOptionsRow: {
      alignItems: "center",
      gap: 22,
    },
    optionCard: {
      flex: 1,
      height: 176,
      alignItems: "center",
      justifyContent: "flex-start",
      borderColor: t.border,
      borderRadius: 24,
      borderWidth: 2,
      backgroundColor: t.surface,
      paddingHorizontal: 14,
      // room at the top for the audio button now pinned there
      paddingTop: 44,
      paddingBottom: 14,
    },
    compactOptionCard: {
      height: 238,
      justifyContent: "flex-start",
      paddingHorizontal: 14,
      paddingTop: 14,
      paddingBottom: 44,
    },
    selectedOptionCard: {
      borderColor: t.accent,
      backgroundColor: t.surfaceRaised,
    },
    expressionCircle: {
      width: 66,
      height: 66,
      alignItems: "center",
      justifyContent: "center",
      overflow: "hidden",
      borderColor: t.gold,
      borderRadius: 33,
      borderWidth: 1,
      backgroundColor: t.surface,
    },
    expressionSlot: {
      height: 72,
      alignItems: "center",
      justifyContent: "center",
    },
    compactExpressionSlot: {
      height: 92,
    },
    compactExpressionCircle: {
      width: 86,
      height: 86,
      borderRadius: 43,
    },
    selectedExpressionCircle: {
      borderColor: t.accent,
    },
    optionMascot: {
      width: "100%",
      height: "100%",
      transform: [{ scale: 1.55 }],
    },
    compactOptionMascot: {
      width: "100%",
      height: "100%",
    },
    optionText: {
      color: t.textDim,
      fontSize: 12,
      fontWeight: "700",
      lineHeight: 15,
      marginTop: 4,
      minHeight: 45,
      textAlign: "center",
    },
    compactOptionText: {
      minHeight: 76,
      fontSize: 13,
      lineHeight: 17,
      marginTop: 6,
      paddingHorizontal: 2,
    },
    optionAudioButton: {
      position: "absolute",
      top: 10,
      left: 10,
      zIndex: 2,
    },
    selectedOptionText: {
      color: t.accent,
    },
    referenceOverlay: {
      ...StyleSheet.absoluteFillObject,
      zIndex: 30,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 38,
      paddingVertical: SPACE.xl,
    },
    referenceOverlayBackdrop: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: t.scrim,
    },
    referenceExpandedCard: {
      width: "84%",
      height: "88%",
      overflow: "hidden",
      borderColor: t.gold,
      borderRadius: 24,
      borderWidth: 3,
      backgroundColor: t.surface,
    },
    referenceExpandedImage: {
      width: "100%",
      height: "100%",
    },
    referenceExpandedHint: {
      position: "absolute",
      left: 0,
      right: 0,
      bottom: SPACE.md,
      alignItems: "center",
    },
    referenceExpandedHintText: {
      ...TYPE.labelSm,
      overflow: "hidden",
      borderRadius: 14,
      backgroundColor: t.scrim,
      color: t.onAccent,
      fontWeight: "800",
      paddingHorizontal: SPACE.md,
      paddingVertical: 6,
    },
  });
