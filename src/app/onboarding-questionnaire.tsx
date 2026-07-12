import { router } from "expo-router";
import type { Href } from "expo-router";
import * as Speech from "@/src/onboarding/speech";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import {
  getRecommendedModes,
  questionnaireIntroVoiceText,
  questions,
  type Handedness,
  type HintId,
} from "@/src/onboarding/questionnaire";
import { VoiceButton } from "@/src/game/ui/VoiceButton";
import { saveOnboardingResults } from "@/src/services/onboarding";

const mascot = require("../assets/mascot/mascot.png");
const q3ManualReference = require("../assets/questionnaire/q3-manual-reference.png");
const optionExpressionImages = [
  require("../assets/mascot/expressions/luna-expression-1.png"),
  require("../assets/mascot/expressions/luna-expression-2.png"),
  require("../assets/mascot/expressions/luna-expression-3.png"),
  require("../assets/mascot/expressions/luna-expression-4.png"),
];

export default function QuestionnaireScreen() {
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
        <Pressable
          disabled={!handedness}
          onPress={() => {
            Speech.stop();
            setIntroComplete(true);
            setActiveHint("voice");
          }}
          style={[
            styles.introNextButton,
            !handedness && styles.disabledNavButton,
          ]}
        >
          <Text style={styles.introNextText}>Next</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.root}>
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
            <Text style={styles.navText}>{"<"}</Text>
          </Pressable>
          <Pressable
            disabled={!selectedAnswer || saving}
            onPress={goNext}
            style={[
              styles.navButton,
              (!selectedAnswer || saving) && styles.disabledNavButton,
            ]}
          >
            <Text style={styles.navText}>{">"}</Text>
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
                  <Text style={styles.navText}>{"<"}</Text>
                  <Text style={styles.navText}>{">"}</Text>
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
          const expressionImage =
            optionExpressionImages[optionIndex % optionExpressionImages.length];
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
              <VoiceButton
                onPress={(event) => {
                  event.stopPropagation();
                  speakAnswer(option);
                }}
                style={styles.optionAudioButton}
                size="small"
              />
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

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#fffaf0",
    paddingHorizontal: 44,
    paddingVertical: 22,
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
    borderColor: "#c8c0a8",
    borderRadius: 95,
    borderWidth: 2,
    backgroundColor: "#fbffc9",
  },
  introMascot: {
    width: 128,
    height: 128,
    borderRadius: 30,
  },
  introMascotModel: {
    ...StyleSheet.absoluteFillObject,
  },
  speechBubble: {
    width: 560,
    minHeight: 216,
    borderRadius: 42,
    backgroundColor: "#fbffc9",
    paddingHorizontal: 44,
    paddingVertical: 28,
    gap: 18,
  },
  introText: {
    color: "#171512",
    fontSize: 17,
    fontWeight: "600",
    lineHeight: 24,
  },
  introPrompt: {
    color: "#171512",
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
    borderColor: "#c8c0a8",
    borderRadius: 18,
    borderWidth: 2,
    backgroundColor: "#fffef4",
  },
  selectedHandButton: {
    borderColor: "#2fa56f",
    backgroundColor: "#e7f5ec",
  },
  handIcon: {
    color: "#2d2a26",
    fontSize: 28,
    fontWeight: "900",
  },
  handText: {
    color: "#746a5d",
    fontSize: 12,
    fontWeight: "800",
  },
  introNextButton: {
    position: "absolute",
    right: 54,
    bottom: 30,
    minWidth: 116,
    alignItems: "center",
    borderRadius: 26,
    backgroundColor: "#8c8c8c",
    paddingHorizontal: 24,
    paddingVertical: 13,
  },
  introNextText: {
    color: "#fff",
    fontSize: 17,
    fontWeight: "900",
  },
  questionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 18,
  },
  stepText: {
    width: 52,
    color: "#4d4942",
    fontSize: 18,
    fontWeight: "900",
    textAlign: "right",
  },
  progressTrack: {
    flex: 1,
    height: 10,
    overflow: "hidden",
    borderRadius: 8,
    backgroundColor: "#d1d1d1",
  },
  progressFill: {
    height: "100%",
    borderRadius: 8,
    backgroundColor: "#2fa56f",
  },
  navButtons: {
    width: 150,
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 16,
    borderRadius: 24,
    paddingHorizontal: 6,
  },
  highlightedNavButtons: {
    borderColor: "#2fa56f",
    borderWidth: 3,
    backgroundColor: "#e7f5ec",
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
    color: "#8c8c8c",
    fontSize: 42,
    fontWeight: "900",
    lineHeight: 42,
  },
  guidedOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 20,
    alignItems: "flex-end",
    backgroundColor: "rgba(0, 0, 0, 0.48)",
    paddingRight: 52,
    paddingTop: 68,
  },
  navHintCard: {
    width: 320,
    borderColor: "#2fa56f",
    borderRadius: 22,
    borderWidth: 3,
    backgroundColor: "#fffef8",
    paddingHorizontal: 18,
    paddingVertical: 14,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.24,
    shadowRadius: 14,
  },
  voiceHintCard: {
    width: 330,
    borderColor: "#2fa56f",
    borderRadius: 22,
    borderWidth: 3,
    backgroundColor: "#fffef8",
    paddingHorizontal: 18,
    paddingVertical: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.24,
    shadowRadius: 14,
  },
  voiceHintIconWrap: {
    width: 54,
    height: 54,
    alignItems: "center",
    justifyContent: "center",
    borderColor: "#d3c8b6",
    borderRadius: 27,
    borderWidth: 1,
    backgroundColor: "#fbffc9",
    marginBottom: 10,
  },
  navHintArrowDemo: {
    alignSelf: "flex-end",
    flexDirection: "row",
    gap: 14,
    borderColor: "#2fa56f",
    borderRadius: 20,
    borderWidth: 2,
    backgroundColor: "#e7f5ec",
    paddingHorizontal: 10,
    marginBottom: 8,
  },
  navHint: {
    position: "absolute",
    right: 54,
    top: 74,
    zIndex: 10,
    width: 300,
    borderColor: "#2fa56f",
    borderRadius: 20,
    borderWidth: 2,
    backgroundColor: "#fffef8",
    paddingHorizontal: 18,
    paddingVertical: 14,
  },
  navHintTitle: {
    color: "#176842",
    fontSize: 15,
    fontWeight: "900",
    marginBottom: 4,
  },
  navHintText: {
    color: "#3f3932",
    fontSize: 14,
    fontWeight: "700",
    lineHeight: 19,
  },
  promptRow: {
    minHeight: 64,
    flexDirection: "row",
    alignItems: "center",
    gap: 20,
    paddingTop: 12,
  },
  prompt: {
    flex: 1,
    color: "#171512",
    fontSize: 21,
    fontWeight: "900",
    lineHeight: 27,
  },
  saveErrorText: {
    marginLeft: 72,
    color: "#a83b32",
    fontSize: 12,
    fontWeight: "800",
  },
  savingText: {
    marginLeft: 72,
    color: "#2f7c57",
    fontSize: 12,
    fontWeight: "800",
  },
  referencePanel: {
    width: 230,
    height: 252,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    borderColor: "#d3c8b6",
    borderRadius: 12,
    borderWidth: 2,
    backgroundColor: "#fffef8",
    paddingHorizontal: 8,
    paddingVertical: 8,
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
    borderColor: "#d3c8b6",
    borderRadius: 14,
    borderWidth: 1,
    backgroundColor: "#fbffc9",
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginTop: 6,
  },
  referenceZoomIcon: {
    color: "#176842",
    fontSize: 14,
    fontWeight: "900",
    lineHeight: 14,
  },
  referencePanelText: {
    color: "#176842",
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
    gap: 28,
    paddingTop: 0,
  },
  manualOptionsRow: {
    alignItems: "center",
    gap: 22,
  },
  optionCard: {
    flex: 1,
    height: 258,
    alignItems: "center",
    justifyContent: "flex-start",
    borderColor: "#d3c8b6",
    borderRadius: 34,
    borderWidth: 2,
    backgroundColor: "#fffef8",
    paddingHorizontal: 22,
    paddingTop: 18,
    paddingBottom: 58,
  },
  compactOptionCard: {
    height: 238,
    justifyContent: "flex-start",
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 44,
  },
  selectedOptionCard: {
    borderColor: "#2fa56f",
    backgroundColor: "#e7f5ec",
  },
  expressionCircle: {
    width: 104,
    height: 104,
    alignItems: "center",
    justifyContent: "center",
    borderColor: "#d0c998",
    borderRadius: 52,
    borderWidth: 1,
    backgroundColor: "#fbffc9",
  },
  expressionSlot: {
    height: 110,
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
    borderColor: "#2fa56f",
  },
  optionMascot: {
    width: 82,
    height: 82,
    borderRadius: 22,
  },
  compactOptionMascot: {
    width: 68,
    height: 68,
    borderRadius: 18,
  },
  optionText: {
    color: "#56514a",
    fontSize: 15,
    fontWeight: "700",
    lineHeight: 20,
    marginTop: 8,
    minHeight: 82,
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
    bottom: 14,
    left: "50%",
    marginLeft: -18,
  },
  selectedOptionText: {
    color: "#176842",
  },
  referenceOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 30,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 38,
    paddingVertical: 24,
  },
  referenceOverlayBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0, 0, 0, 0.68)",
  },
  referenceExpandedCard: {
    width: "84%",
    height: "88%",
    overflow: "hidden",
    borderColor: "#fbffc9",
    borderRadius: 24,
    borderWidth: 3,
    backgroundColor: "#fff",
  },
  referenceExpandedImage: {
    width: "100%",
    height: "100%",
  },
  referenceExpandedHint: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 12,
    alignItems: "center",
  },
  referenceExpandedHintText: {
    overflow: "hidden",
    borderRadius: 14,
    backgroundColor: "rgba(23, 21, 18, 0.72)",
    color: "#fffef8",
    fontSize: 12,
    fontWeight: "800",
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
});
