import { router } from "expo-router";
import type { Href } from "expo-router";
import * as Speech from "@/src/onboarding/speech";
import { useEffect, useMemo, useRef, useState } from "react";
import { Animated, Image, Pressable, Text, View } from "react-native";
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
import { useStyles } from "@/src/game/ui/theme";
import { saveOnboardingResults } from "@/src/services/onboarding";
import { makeStyles } from "./onboarding-questionnaire.styles";

const mascot = require("../../assets/images/mascot/mascot.png");
const q3ManualReference = require("../../assets/images/questionnaire/q3-manual-reference.png");
const optionExpressionImages = [
  require("../../assets/images/mascot/expressions/luna-expression-1.png"),
  require("../../assets/images/mascot/expressions/luna-expression-2.png"),
  require("../../assets/images/mascot/expressions/luna-expression-3.png"),
  require("../../assets/images/mascot/expressions/luna-expression-4.png"),
];

export default function QuestionnaireScreen() {
  const styles = useStyles(makeStyles);
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
