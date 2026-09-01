import { router } from "expo-router";
import type { Href } from "expo-router";
import * as Speech from "@/src/onboarding/speech";
import { introPath, optionPath, promptPath } from "@/src/onboarding/voiceAssets";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Animated, Image, ImageBackground, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { Pressable } from "@/src/components/Pressable";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import {
  getRecommendedModes,
  questionnaireHandednessPrompt,
  questionnaireIntroText,
  questionnaireIntroVoiceText,
  questions,
  type Handedness,
  type HintId,
} from "@/src/onboarding/questionnaire";
import { VoiceButton } from "@/src/game/ui/hud/VoiceButton";
import { Button } from "@/src/game/ui/system/Button";
import { ACCENT_LIGHT, ELEVATION, FONT, SIZE, SPACE, TYPE, useIsTablet, useStyles, useUiScale } from "@/src/game/ui/system/theme";
import { SCREEN_SIDE_MARGIN, SCREEN_VERTICAL_MARGIN, useSafeInsets } from "@/src/hooks/use-safe-insets";
import { saveOnboardingResults } from "@/src/services/onboarding";
import { useGameStore } from "@/src/game/core/store";
import { usePrefsStore } from "@/src/game/core/prefsStore";
import type { Theme } from "@/src/game/ui/system/theme";

import Reanimated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import type { ReactNode } from "react";
import type { PressableProps, StyleProp, ViewProps, ViewStyle } from "react-native";
import { SceneBackdrop } from "@/src/game/ui/backdrop/SceneBackdrop";

const BG_SOLID = "#F3ECE0";
const BUBBLE_RIM = ACCENT_LIGHT;
const BUBBLE = {
  BODY_LEFT: 0.1092,
  ASPECT: 1.9608,
  TAIL_CENTRE: 0.5407,
} as const;

const BUBBLE_BAND = 0.0485;

const SHADOW_ROOM = 12;

const TABLET_NEXT_LIFT = 24;

const CARD_SHADOW = {
  boxShadow: "0px 5px 4px rgba(0,0,0,0.40)",
  shadowColor: "#000",
  shadowOpacity: 0.8,
  shadowRadius: 2,
  shadowOffset: { width: 0, height: 4 },
  elevation: 6,
} as const;

const CARD_SHADOW_RAISED = {
  boxShadow: "0px 8px 7px rgba(0,0,0,0.42)",
  shadowColor: "#000",
  shadowOpacity: 0.8,
  shadowRadius: 3.5,
  shadowOffset: { width: 0, height: 7 },
  elevation: 10,
} as const;

const BUBBLE_W = 470;
const MASCOT_W = 260;
const ROW_GAP = 14;
const MASCOT_ASPECT = 1.2982;
const ROW_SLACK = 92;

const INTRO_STAGE = {
  mascot: 120,
  bubble: 620,
  text: 1080,
  lineStep: 420,
} as const;

function PopIn({ delay, style, children }: { delay: number; style?: StyleProp<ViewStyle>; children: ReactNode }) {
  const on = useSharedValue(0);
  useEffect(() => {
    on.value = withDelay(delay, withSpring(1, { damping: 10, stiffness: 180, mass: 0.8 }));
  }, [delay, on]);
  const anim = useAnimatedStyle(() => ({
    opacity: Math.min(1, on.value * 3),
    transform: [{ scale: 0.6 + on.value * 0.4 }],
  }));
  return <Reanimated.View style={[style, anim]}>{children}</Reanimated.View>;
}

const BUBBLE_WIPE_MS = 460;

function BubbleReveal({
  delay,
  width,
  style,
  children,
}: {
  delay: number;
  width: number;
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
}) {
  const on = useSharedValue(0);
  const [wiped, setWiped] = useState(false);
  useEffect(() => {
    on.value = withDelay(delay, withTiming(1, { duration: BUBBLE_WIPE_MS, easing: Easing.out(Easing.cubic) }));
    const t = setTimeout(() => setWiped(true), delay + BUBBLE_WIPE_MS + 60);
    return () => clearTimeout(t);
  }, [delay, on]);
  const clip = useAnimatedStyle(() => ({ width: (width + SHADOW_ROOM) * on.value }));
  return (
    <Reanimated.View style={[wiped ? styles_reveal.done : styles_reveal.wiping, !wiped && clip]}>
      <View style={[style, { width }]}>{children}</View>
    </Reanimated.View>
  );
}

const styles_reveal = StyleSheet.create({
  wiping: { overflow: "hidden" },
  done: { overflow: "visible", flexShrink: 0 },
});

function ZoomIn({
  style,
  collapsable,
  onLayout,
  children,
}: {
  style?: StyleProp<ViewStyle>;
  collapsable?: boolean;
  onLayout?: ViewProps["onLayout"];
  children: ReactNode;
}) {
  const on = useSharedValue(0);
  useEffect(() => {
    on.value = withSpring(1, { damping: 14, stiffness: 190, mass: 0.8 });
  }, [on]);
  const anim = useAnimatedStyle(() => ({
    opacity: Math.min(1, on.value * 2.5),
    transform: [{ scale: 0.82 + on.value * 0.18 }],
  }));
  return (
    <Reanimated.View style={[style, anim]} collapsable={collapsable} onLayout={onLayout}>
      {children}
    </Reanimated.View>
  );
}

function ScaleOnSelect({
  selected,
  style,
  children,
  ...rest
}: {
  selected: boolean;
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
} & Omit<PressableProps, "style" | "children">) {
  const on = useSharedValue(0);
  useEffect(() => {
    on.value = withSpring(selected ? 1 : 0, { damping: 12, stiffness: 220, mass: 0.6 });
  }, [on, selected]);
  const anim = useAnimatedStyle(() => ({ transform: [{ scale: 1 + on.value * 0.055 }] }));
  return (
    <Reanimated.View style={[styles_cardFlex, anim]}>
      <Pressable style={style} {...rest}>
        {children}
      </Pressable>
    </Reanimated.View>
  );
}

const styles_cardFlex = { flex: 1 };

function SlideInDown({ delay, style, children }: { delay: number; style?: StyleProp<ViewStyle>; children: ReactNode }) {
  const on = useSharedValue(0);
  useEffect(() => {
    on.value = withDelay(delay, withTiming(1, { duration: 340, easing: Easing.out(Easing.cubic) }));
  }, [delay, on]);
  const anim = useAnimatedStyle(() => ({
    opacity: on.value,
    transform: [{ translateY: -22 * (1 - on.value) }],
  }));
  return <Reanimated.View style={[style, anim]}>{children}</Reanimated.View>;
}

function NextHalo() {
  const on = useSharedValue(0);
  useEffect(() => {
    on.value = withRepeat(withTiming(1, { duration: 1400, easing: Easing.out(Easing.quad) }), -1, false);
  }, [on]);
  const anim = useAnimatedStyle(() => ({
    opacity: 0.5 * (1 - on.value),
    transform: [{ scale: 1 + on.value * 0.18 }],
  }));
  return <Reanimated.View style={[HALO, anim]} pointerEvents="none" />;
}

const HALO = {
  position: "absolute" as const,
  left: -10,
  right: -10,
  top: -10,
  bottom: -10,
  borderRadius: 999,
  borderWidth: 3,
  borderColor: BUBBLE_RIM,
};
const PROGRESS_FILL = "#8FA876";

const backdrop = require("../../assets/ui/onboarding-backdrop.png");
const bubbleArt = require("../../assets/images/questionnaire/speech-bubble.png");
const mascot = require("../../assets/images/mascot/modu-mascot.png");
const q3ManualReference = require("../../assets/images/questionnaire/q3-manual-reference.png");
const FACE = {
  excited: require("../../assets/images/questionnaire/faces/excited.png"),
  calm: require("../../assets/images/questionnaire/faces/calm.png"),
  sad: require("../../assets/images/questionnaire/faces/sad.png"),
  overwhelmed: require("../../assets/images/questionnaire/faces/overwhelmed.png"),
  happy: require("../../assets/images/questionnaire/faces/happy.png"),
  awkward: require("../../assets/images/questionnaire/faces/awkward.png"),
};

const questionOptionImages = [
  [FACE.overwhelmed, FACE.excited, FACE.calm],
  [FACE.sad, FACE.awkward, FACE.happy],
  [FACE.overwhelmed, FACE.awkward, FACE.happy],
  [FACE.excited, FACE.calm, FACE.happy],
  [FACE.overwhelmed, FACE.awkward, FACE.excited],
];

export default function QuestionnaireScreen() {
  const styles = useStyles(makeStyles);
  const win = useWindowDimensions();
  const uiScale = useUiScale();
  const isTablet = useIsTablet();
  const bubbleW = Math.round(
    Math.min(
      BUBBLE_W * uiScale,
      win.width - (MASCOT_W + ROW_GAP) * uiScale - ROW_SLACK * uiScale,
    ),
  );
  const safe = useSafeInsets();
  const [bubbleH, setBubbleH] = useState(Math.round(bubbleW / BUBBLE.ASPECT));
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
  const [referenceOffset, setReferenceOffset] = useState({ x: 0, y: 0 });
  const referenceOffsetRef = useRef({ x: 0, y: 0 });
  const referencePanStartRef = useRef({ x: 0, y: 0 });
  const referenceBoxRef = useRef({ w: 0, h: 0 });
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
    referenceOffsetRef.current = { x: 0, y: 0 };
    setReferenceOffset({ x: 0, y: 0 });
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

  const VOICE = { language: "en-US", pitch: 1.08, rate: 0.92 };

  const speakIntro = () => {
    Speech.speakLine(introPath(), questionnaireIntroVoiceText, VOICE);
  };

  const speakCurrentQuestion = () => {
    Speech.speakLine(promptPath(index), question.prompt, VOICE);
  };

  const speakAnswer = (answer: string, optionIndex: number) => {
    Speech.speakLine(optionPath(index, optionIndex), answer, VOICE);
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

  const clampOffset = useCallback((x: number, y: number, scale: number) => {
    const maxX = Math.max(0, (referenceBoxRef.current.w * (scale - 1)) / 2);
    const maxY = Math.max(0, (referenceBoxRef.current.h * (scale - 1)) / 2);
    return {
      x: Math.min(maxX, Math.max(-maxX, x)),
      y: Math.min(maxY, Math.max(-maxY, y)),
    };
  }, []);

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
          const pulled = clampOffset(
            referenceOffsetRef.current.x,
            referenceOffsetRef.current.y,
            nextScale,
          );
          referenceOffsetRef.current = pulled;
          setReferenceOffset(pulled);
        }),
    [clampOffset],
  );

  const referencePan = useMemo(
    () =>
      Gesture.Pan()
        .runOnJS(true)
        .onBegin(() => {
          referencePanStartRef.current = referenceOffsetRef.current;
        })
        .onUpdate((event) => {
          const next = clampOffset(
            referencePanStartRef.current.x + event.translationX,
            referencePanStartRef.current.y + event.translationY,
            referenceScaleRef.current,
          );
          referenceOffsetRef.current = next;
          setReferenceOffset(next);
        }),
    [clampOffset],
  );

  const referenceTap = useMemo(
    () =>
      Gesture.Tap()
        .runOnJS(true)
        .maxDuration(250)
        .onEnd(() => setReferenceExpanded(false)),
    [],
  );

  const referenceGesture = useMemo(
    () => Gesture.Exclusive(Gesture.Simultaneous(referencePinch, referencePan), referenceTap),
    [referencePan, referencePinch, referenceTap],
  );

  if (!introComplete) {
    return (
      <SceneBackdrop
        source={backdrop}
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
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back to the start screen"
          hitSlop={10}
          onPress={() => {
            Speech.stop();
            if (router.canDismiss()) router.dismissTo("/");
            else router.replace("/");
          }}
          style={({ pressed }) => [
            styles.introBack,
            {
              top: 22 + Math.max(safe.raw.top, SCREEN_VERTICAL_MARGIN),
              left: Math.max(safe.raw.left, SCREEN_SIDE_MARGIN),
            },
            pressed && styles.disabledNavButton,
          ]}
        >
          <Image
            source={require("@/src/assets/ui/icons/arrow-back.png")}
            style={styles.navArrow}
            resizeMode="contain"
          />
        </Pressable>
        <View style={styles.introStage}>
          <PopIn
            delay={INTRO_STAGE.mascot}
            style={[
              styles.mascotWrap,
              {
                marginTop: Math.round(bubbleH * (BUBBLE.TAIL_CENTRE - 0.5)),
              },
            ]}
          >
            <Image source={mascot} style={styles.introMascot} resizeMode="contain" />
          </PopIn>
          <View style={styles.bubbleWrap}>
            <BubbleReveal
              delay={INTRO_STAGE.bubble}
              width={bubbleW}
              style={{ width: bubbleW }}
            >
            <ImageBackground
              source={bubbleArt}
              resizeMode="stretch"
              onLayout={(e) => setBubbleH(e.nativeEvent.layout.height)}
              style={[
                styles.speechBubble,
                {
                  width: bubbleW,
                  paddingLeft: Math.round(bubbleW * BUBBLE.BODY_LEFT) + 16,
                  paddingBottom: 26 + Math.round(bubbleH * BUBBLE_BAND),
                },
              ]}
            >
            <SlideInDown delay={INTRO_STAGE.text}>
              <Text style={[styles.introText, { fontFamily: FONT }]}>{questionnaireIntroText}</Text>
            </SlideInDown>
            <SlideInDown delay={INTRO_STAGE.text + INTRO_STAGE.lineStep}>
              <Text style={[styles.introPrompt, { fontFamily: FONT }]}>{questionnaireHandednessPrompt}</Text>
            </SlideInDown>
            <SlideInDown delay={INTRO_STAGE.text + INTRO_STAGE.lineStep * 2} style={styles.handOptions}>
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
            </SlideInDown>
            </ImageBackground>
            </BubbleReveal>
            <VoiceButton onPress={speakIntro} style={styles.bubbleVoice} />
          </View>
        </View>
        <View style={[styles.introFooter, isTablet && { marginBottom: TABLET_NEXT_LIFT * uiScale }]}>
        {handedness ? (
        <PopIn delay={0} style={styles.introNextWrap}>
          <NextHalo />
        <Button
          label="Next"
          variant="primary"
          pill
          small
          disabled={!handedness}
          onPress={() => {
            Speech.stop();
            if (handedness) usePrefsStore.getState().setHandedness(handedness);
            setIntroComplete(true);
          }}
          style={styles.introNextButton}
        />
        </PopIn>
        ) : null}
        </View>
      </SceneBackdrop>
    );
  }

  return (
    <SceneBackdrop
      source={backdrop}
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
          <View
            style={[
              styles.progressFill,
              index === questions.length - 1 && !!selectedAnswer && styles.progressFillComplete,
              { width: progressWidth },
            ]}
          />
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
            <View style={styles.referenceImageClip}>
              <Image
                source={q3ManualReference}
                style={styles.referencePanelImage}
                resizeMode="contain"
              />
            </View>
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
            <ScaleOnSelect
              key={option}
              selected={selected}
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
                  speakAnswer(option, optionIndex);
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
                    resizeMode="contain"
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
            </ScaleOnSelect>
          );
        })}
      </View>

      {referenceExpanded && (
        <View style={styles.referenceOverlay}>
          <Pressable
            onPress={() => setReferenceExpanded(false)}
            style={styles.referenceOverlayBackdrop}
          />
          <GestureDetector gesture={referenceGesture}>
            <ZoomIn
              style={styles.referenceExpandedCard}
              collapsable={false}
              onLayout={(e) => {
                referenceBoxRef.current = {
                  w: e.nativeEvent.layout.width,
                  h: e.nativeEvent.layout.height,
                };
              }}
            >
              <Image
                source={q3ManualReference}
                style={[
                  styles.referenceExpandedImage,
                  {
                    transform: [
                      { translateX: referenceOffset.x },
                      { translateY: referenceOffset.y },
                      { scale: referenceScale },
                    ],
                  },
                ]}
                resizeMode="contain"
              />
              <View style={styles.referenceExpandedHint} pointerEvents="none">
                <Text style={styles.referenceExpandedHintText}>
                  Pinch to zoom · Tap outside to close
                </Text>
              </View>
            </ZoomIn>
          </GestureDetector>
        </View>
      )}
    </SceneBackdrop>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: BG_SOLID,
    },
    introBack: {
      position: "absolute",
      width: 54,
      height: 42,
      alignItems: "center",
      justifyContent: "center",
      zIndex: 5,
    },
    introStage: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      overflow: "visible",
      gap: 20,
      paddingTop: 16,
      paddingBottom: 20,
    },
    mascotWrap: {
      width: MASCOT_W,
      height: Math.round(MASCOT_W / MASCOT_ASPECT),
    },
    introMascot: {
      width: "100%",
      height: Math.round(MASCOT_W / MASCOT_ASPECT),
    },
    introMascotModel: {
      ...StyleSheet.absoluteFillObject,
    },
    speechBubble: {
      minHeight: 190,
      paddingRight: 24,
      paddingTop: 26,
      paddingBottom: 26,
      gap: 14,
      justifyContent: "center",
    },
    bubbleWrap: { position: "relative", flexShrink: 0, overflow: "visible" },
    bubbleVoice: { position: "absolute", top: -20, left: 22, zIndex: 3 },
    introText: {
      color: t.text,
      fontFamily: FONT, fontSize: 17,
      fontWeight: "600",
      lineHeight: 24,
    },
    introPrompt: {
      color: t.text,
      fontFamily: FONT, fontSize: 18,
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
      fontFamily: FONT, fontSize: 28,
      fontWeight: "900",
    },
    handText: {
      ...TYPE.labelSm,
      color: t.textDim,
      fontWeight: "800",
    },
    introFooter: {
      minHeight: SIZE.controlHeightSm,
      alignItems: "flex-end",
      justifyContent: "center",
    },
    introNextWrap: { position: "relative" },
    introNextButton: { minWidth: 92 },
    questionHeader: {
      flexDirection: "row",
      alignItems: "center",
      gap: 18,
    },
    stepText: {
      width: 52,
      color: t.text,
      fontFamily: FONT, fontSize: 18,
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
    progressFillComplete: { backgroundColor: PROGRESS_FILL },
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
      fontFamily: FONT, fontSize: 42,
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
      width: 300,
      borderColor: t.accent,
      borderRadius: 20,
      borderWidth: 3,
      backgroundColor: t.surface,
      paddingHorizontal: 16,
      paddingVertical: 12,
      gap: 4,
      ...ELEVATION.card,
    },
    voiceHintCard: {
      width: 300,
      borderColor: t.accent,
      borderRadius: 20,
      borderWidth: 3,
      backgroundColor: t.surface,
      paddingHorizontal: 16,
      paddingVertical: 12,
      gap: 4,
      ...ELEVATION.card,
    },
    voiceHintIconWrap: { alignSelf: "flex-start", marginBottom: 4 },
    navHintArrowDemo: {
      alignSelf: "flex-end",
      flexDirection: "row",
      gap: 12,
      marginBottom: 2,
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
      fontFamily: FONT, fontSize: 15,
      fontWeight: "900",
      marginBottom: SPACE.xs,
    },
    navHintText: {
      color: t.text,
      fontFamily: FONT, fontSize: 14,
      fontWeight: "700",
      lineHeight: 19,
    },
    promptRow: {
      minHeight: 44,
      flexDirection: "row",
      alignItems: "center",
      gap: 14,
      paddingTop: 0,
      marginBottom: 26,
    },
    prompt: {
      flex: 1,
      color: t.text,
      fontFamily: FONT, fontSize: 15,
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
    referencePanel: { width: 178, alignItems: "center", gap: 8 },
    referenceImageClip: { width: "100%", borderRadius: 18, overflow: "hidden" },
    referencePanelImage: {
      width: "100%",
      height: 172,
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
      fontFamily: FONT, fontSize: 14,
      fontWeight: "900",
      lineHeight: 14,
    },
    referencePanelText: {
      color: t.accent,
      fontFamily: FONT, fontSize: 10,
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
      width: "100%",
      height: 160,
      alignItems: "center",
      justifyContent: "flex-start",
      borderRadius: 24,
      backgroundColor: t.surface,
      ...CARD_SHADOW,
      paddingHorizontal: 16,
      paddingTop: 14,
      paddingBottom: 14,
      gap: 10,
    },
    compactOptionCard: {
      height: 196,
      paddingHorizontal: 14,
      paddingTop: 14,
      paddingBottom: 14,
    },
    selectedOptionCard: {
      backgroundColor: t.surfaceRaised,
      ...CARD_SHADOW_RAISED,
    },
    expressionCircle: {
      width: 72,
      height: 72,
      alignItems: "center",
      justifyContent: "center",
    },
    expressionSlot: {
      height: 72,
      alignItems: "center",
      justifyContent: "center",
    },
    compactExpressionSlot: {
      height: 84,
    },
    compactExpressionCircle: {
      width: 80,
      height: 80,
    },
    selectedExpressionCircle: {},
    optionMascot: {
      width: "100%",
      height: "100%",
    },
    compactOptionMascot: {
      width: "100%",
      height: "100%",
    },
    optionText: {
      width: "100%",
      color: t.textDim,
      fontFamily: FONT, fontSize: 12,
      fontWeight: "700",
      lineHeight: 16,
      textAlign: "center",
    },
    compactOptionText: {
      fontFamily: FONT, fontSize: 13,
      lineHeight: 17,
      marginTop: 6,
      paddingHorizontal: 2,
    },
    optionAudioButton: {
      position: "absolute",
      top: -14,
      left: 12,
      zIndex: 3,
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
      borderRadius: 24,
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