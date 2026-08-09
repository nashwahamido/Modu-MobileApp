import { router } from "expo-router";
import type { Href } from "expo-router";
import * as Speech from "@/src/onboarding/speech";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { StyleSheet, Animated, Image, Pressable, Text, View } from "react-native";
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
import { ACCENT_LIGHT, ELEVATION, FONT, SPACE, TYPE, useStyles, useUiScale } from "@/src/game/ui/system/theme";
import { SCREEN_SIDE_MARGIN, SCREEN_VERTICAL_MARGIN, useSafeInsets } from "@/src/hooks/use-safe-insets";
import { saveOnboardingResults } from "@/src/services/onboarding";
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

/** Flat, not a ramp — the intro is one card on an empty field and a gradient behind it only pulled
 *  the eye off the thing being read. */
const BG_SOLID = "#A9BFD9";
/** The card's rim. Lavender at 3pt, matching the catalogue's selected-card treatment. */
const BUBBLE_RIM = ACCENT_LIGHT;
/** One source for the bubble's width: the reveal animates a clip to exactly this, and the card
 *  inside is pinned to it so nothing squeezes as the clip opens. */
const BUBBLE_W = 470;

/** The intro entrance, as one block: the mascot arrives, then its speech bubble, then what it says,
 *  then the thing you press. Every value is the moment that element starts. */
const INTRO_STAGE = {
  mascot: 120,
  bubble: 620,
  text: 1080,
  /** Between the greeting, the question and the two choices. */
  lineStep: 420,
} as const;

/** Scales up past its resting size and settles. */
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

/** The bubble UNROLLS left to right: an outer clip whose width animates from zero, with the card
 *  held at full width inside it so nothing squeezes as the clip opens. A scale-up read as a card
 *  appearing; a wipe reads as speech arriving from the character's side. */
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
  useEffect(() => {
    on.value = withDelay(delay, withTiming(1, { duration: 460, easing: Easing.out(Easing.cubic) }));
  }, [delay, on]);
  const clip = useAnimatedStyle(() => ({ width: width * on.value }));
  return (
    <Reanimated.View style={[{ overflow: "hidden" }, clip]}>
      <View style={[style, { width }]}>{children}</View>
    </Reanimated.View>
  );
}


/** Opens from small. The pinch gesture wraps this, so it has to be a plain animated View that
 *  forwards its props — hence collapsable, which GestureDetector needs on Android. */
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

/** A card that swells when it becomes the chosen one. Spring, not timing: the overshoot is what
 *  makes the press feel like it landed rather than like a style change. */
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

/** The animated wrapper has to carry the row's flex, or the cards stop sharing the width evenly. */
const styles_cardFlex = { flex: 1 };

/** Each line drops in from above, in reading order. */
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

/** The ring breathing behind Next. Swells and fades rather than pulsing the button, which has to
 *  stay a stable target. */
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
/** The progress fill. Its own value rather than t.accent: the accent IS the gradient's first stop,
 *  so a lavender bar on a lavender backdrop had almost nothing to read against. */
const PROGRESS_FILL = "#8FA876";

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
  const scale = useUiScale();
  const styles = useStyles(makeStyles, scale);
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
  // Where the zoomed page has been dragged to, in view units. Kept in a ref as well as state for the same reason the scale is: the gesture reads the CURRENT value on every frame, and state lags.
  const [referenceOffset, setReferenceOffset] = useState({ x: 0, y: 0 });
  const referenceOffsetRef = useRef({ x: 0, y: 0 });
  const referencePanStartRef = useRef({ x: 0, y: 0 });
  // Measured, not assumed: the clamp needs the real box to know how far there is left to travel.
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

  /** How far the page may be dragged at the current scale: the overhang on each side, and nothing
   *  more. At scale 1 there is no overhang, so panning is a no-op rather than a way to lose the
   *  image off the edge of the screen. */
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
          // Zooming OUT has to pull the page back into bounds, or it stays stranded off-centre.
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

  /** A single tap closes. The card is 84%x88% of the screen and now has no background, so the empty
   *  area around the letterboxed page LOOKS like outside but is still the card — taps there were
   *  landing on it rather than on the backdrop behind. Handling the tap here covers both. */
  const referenceTap = useMemo(
    () =>
      Gesture.Tap()
        .runOnJS(true)
        .maxDuration(250)
        .onEnd(() => setReferenceExpanded(false)),
    [],
  );

  /** Simultaneous, not exclusive: a two-finger zoom also drifts, and having to lift and re-place to
   *  reposition is the thing that makes a zoom view feel stuck. The tap is exclusive against the
   *  other two, so a drag or a pinch never registers as a tap on release. */
  const referenceGesture = useMemo(
    () => Gesture.Exclusive(Gesture.Simultaneous(referencePinch, referencePan), referenceTap),
    [referencePan, referencePinch, referenceTap],
  );

  if (!introComplete) {
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
        <View style={styles.introStage}>
          <PopIn delay={INTRO_STAGE.mascot} style={styles.mascotCircle}>
            <Image source={mascot} style={styles.introMascot} />
          </PopIn>
          {/* The button is a SIBLING of the reveal, not a child of it: the wipe needs overflow
              hidden, and anything hanging over the bubble's edge gets clipped by that same rule. */}
          <View style={styles.bubbleWrap}>
            <BubbleReveal delay={INTRO_STAGE.bubble} width={BUBBLE_W} style={styles.speechBubble}>
            <SlideInDown delay={INTRO_STAGE.text}>
              <Text style={styles.introText}>{questionnaireIntroText}</Text>
            </SlideInDown>
            <SlideInDown delay={INTRO_STAGE.text + INTRO_STAGE.lineStep}>
              <Text style={styles.introPrompt}>{questionnaireHandednessPrompt}</Text>
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
            </BubbleReveal>
            <VoiceButton onPress={speakIntro} style={styles.bubbleVoice} />
          </View>
        </View>
        {/* Not rendered at all until a hand is chosen. A disabled button sitting there through the
            whole introduction is a dead control the eye keeps returning to; appearing on the choice
            makes it the consequence of the choice. */}
        {handedness ? (
        <PopIn
          delay={0}
          style={[
            styles.introNextWrap,
            {
              right: 28 + Math.max(safe.raw.right, SCREEN_SIDE_MARGIN),
              bottom: 24 + Math.max(safe.raw.bottom, SCREEN_VERTICAL_MARGIN),
            },
          ]}
        >
          <NextHalo />
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
        </PopIn>
        ) : null}
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
          <View
            style={[
              styles.progressFill,
              // Green is DONE, and the last question is not done until it is answered.
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
                    // Translate BEFORE scale: the offsets are clamped in view units, and scaling first would multiply them and let the page slide past its own bounds.
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
    </View>
  );
}

// k is the device UI scale (see useUiScale): these layouts are authored in phone points,
// and a tablet needs the same proportions at a larger size, not the same numbers.
const makeStyles = (t: Theme, k: number) =>
  StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: BG_SOLID,
      // Padding is applied inline (base + safe inset) so the questionnaire clears the cutout and the immersive-hidden bars the same way every other screen does.
    },
    introStage: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: Math.round(20 * k),
      // Room at the foot for the Next button and its halo, so the bubble clears it — but modest: too much and the row is pushed into the top margin instead.
      paddingBottom: Math.round(58 * k),
    },
    mascotCircle: {
      width: Math.round(150 * k),
      height: Math.round(150 * k),
      alignItems: "center",
      justifyContent: "center",
      overflow: "hidden",
      borderColor: t.border,
      borderRadius: Math.round(95 * k),
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
      width: BUBBLE_W,
      minHeight: Math.round(190 * k),
      borderRadius: Math.round(36 * k),
      backgroundColor: t.surface,
      borderWidth: 3,
      borderColor: BUBBLE_RIM,
      paddingHorizontal: Math.round(32 * k),
      paddingVertical: Math.round(24 * k),
      gap: Math.round(14 * k),
    },
    // Straddling the top-left corner of the rim. Absolute, so it contributes no height — in the flow it was pushing every line of the message down by its own 44pt.
    bubbleWrap: { position: "relative" },
    bubbleVoice: { position: "absolute", top: -20, left: 22, zIndex: 3 },
    introText: {
      color: t.text,
      fontFamily: FONT, fontSize: Math.round(17 * k),
      fontWeight: "600",
      lineHeight: Math.round(24 * k),
    },
    introPrompt: {
      color: t.text,
      fontFamily: FONT, fontSize: Math.round(18 * k),
      fontStyle: "italic",
      fontWeight: "800",
      textAlign: "center",
    },
    handOptions: {
      flexDirection: "row",
      justifyContent: "center",
      gap: Math.round(28 * k),
    },
    handButton: {
      width: Math.round(70 * k),
      height: Math.round(74 * k),
      alignItems: "center",
      justifyContent: "center",
      borderColor: t.border,
      borderRadius: Math.round(18 * k),
      borderWidth: 2,
      backgroundColor: t.surface,
    },
    selectedHandButton: {
      borderColor: t.accent,
      backgroundColor: t.surfaceRaised,
    },
    handIcon: {
      color: t.text,
      fontFamily: FONT, fontSize: Math.round(28 * k),
      fontWeight: "900",
    },
    handText: {
      ...TYPE.labelSm,
      color: t.textDim,
      fontWeight: "800",
    },
    // Layout only — the fill, radius, and padding now come from the shared Button.
    // Outside the bubble entirely: it is what you do NEXT, not part of what Modu is saying. Offsets are set at the call site from the safe insets: an absolute child is not inset by the parent's padding, so a literal here could never account for the device.
    introNextWrap: { position: "absolute" },
    introNextButton: { minWidth: Math.round(116 * k) },
    questionHeader: {
      flexDirection: "row",
      alignItems: "center",
      gap: Math.round(18 * k),
    },
    stepText: {
      width: Math.round(52 * k),
      color: t.text,
      fontFamily: FONT, fontSize: Math.round(18 * k),
      fontWeight: "900",
      textAlign: "right",
    },
    progressTrack: {
      flex: 1,
      height: Math.round(10 * k),
      overflow: "hidden",
      borderRadius: SPACE.sm,
      backgroundColor: t.surfaceInset,
    },
    progressFill: {
      height: "100%",
      borderRadius: SPACE.sm,
      backgroundColor: t.accent,
    },
    // Green is reserved for DONE in this palette, so the bar only earns it on the last question.
    progressFillComplete: { backgroundColor: PROGRESS_FILL },
    navArrow: { width: Math.round(26 * k), height: Math.round(26 * k) },
    navArrowDisabled: { opacity: 0.3 },
    navButtons: {
      width: Math.round(150 * k),
      flexDirection: "row",
      justifyContent: "flex-end",
      gap: SPACE.lg,
      borderRadius: Math.round(24 * k),
      paddingHorizontal: Math.round(6 * k),
    },
    highlightedNavButtons: {
      borderColor: t.accent,
      borderWidth: 3,
      backgroundColor: t.surfaceRaised,
    },
    navButton: {
      width: Math.round(54 * k),
      height: Math.round(42 * k),
      alignItems: "center",
      justifyContent: "center",
    },
    disabledNavButton: {
      opacity: 0.35,
    },
    navText: {
      color: t.text,
      fontFamily: FONT, fontSize: Math.round(42 * k),
      fontWeight: "900",
      lineHeight: Math.round(42 * k),
    },
    guidedOverlay: {
      ...StyleSheet.absoluteFillObject,
      zIndex: 20,
      alignItems: "flex-end",
      backgroundColor: t.scrim,
      paddingRight: Math.round(52 * k),
      paddingTop: Math.round(68 * k),
    },
    // Both bubbles hold two short lines and one glyph. The old padding was sized for a card and left more empty space than message.
    navHintCard: {
      width: Math.round(300 * k),
      borderColor: t.accent,
      borderRadius: Math.round(20 * k),
      borderWidth: 3,
      backgroundColor: t.surface,
      paddingHorizontal: Math.round(16 * k),
      paddingVertical: Math.round(12 * k),
      gap: Math.round(4 * k),
      ...ELEVATION.card,
    },
    voiceHintCard: {
      width: Math.round(300 * k),
      borderColor: t.accent,
      borderRadius: Math.round(20 * k),
      borderWidth: 3,
      backgroundColor: t.surface,
      paddingHorizontal: Math.round(16 * k),
      paddingVertical: Math.round(12 * k),
      gap: Math.round(4 * k),
      ...ELEVATION.card,
    },
    // No second ring: VoiceButton draws its own, and the wrapper's was a circle around a circle.
    voiceHintIconWrap: { alignSelf: "flex-start", marginBottom: Math.round(4 * k) },
    // Bare arrows. The frame around them read as a control you could press — it is a picture of the buttons up in the header, not a copy of them.
    navHintArrowDemo: {
      alignSelf: "flex-end",
      flexDirection: "row",
      gap: Math.round(12 * k),
      marginBottom: Math.round(2 * k),
    },
    navHint: {
      position: "absolute",
      right: 54,
      top: 74,
      zIndex: 10,
      width: Math.round(300 * k),
      borderColor: t.accent,
      borderRadius: Math.round(20 * k),
      borderWidth: 2,
      backgroundColor: t.surface,
      paddingHorizontal: Math.round(18 * k),
      paddingVertical: Math.round(14 * k),
    },
    navHintTitle: {
      color: t.accent,
      fontFamily: FONT, fontSize: Math.round(15 * k),
      fontWeight: "900",
      marginBottom: SPACE.xs,
    },
    navHintText: {
      color: t.text,
      fontFamily: FONT, fontSize: Math.round(14 * k),
      fontWeight: "700",
      lineHeight: Math.round(19 * k),
    },
    promptRow: {
      minHeight: Math.round(44 * k),
      flexDirection: "row",
      alignItems: "center",
      gap: Math.round(14 * k),
      paddingTop: Math.round(0 * k),
      // The audio buttons now hang over the cards' top rim, so the gap has to clear the BUTTON, not the card — at 4 they were colliding with the question line.
      marginBottom: Math.round(26 * k),
    },
    prompt: {
      flex: 1,
      color: t.text,
      fontFamily: FONT, fontSize: Math.round(15 * k),
      fontWeight: "900",
      lineHeight: Math.round(19 * k),
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
    // No container: the instruction art IS the panel. A card around a picture that already has its own white field was two boxes deep for one thing to look at. Narrower than before so the three answer cards get the width back — on this question the captions are the longest in the set and were wrapping to four lines in a tall thin box.
    referencePanel: { width: Math.round(178 * k), alignItems: "center", gap: Math.round(8 * k) },
    // The rounding lives on a CLIPPING wrapper, not on the Image: borderRadius on an Image with resizeMode contain leaves the letterboxed field square on Android.
    referenceImageClip: { width: "100%", borderRadius: Math.round(18 * k), overflow: "hidden" },
    referencePanelImage: {
      width: "100%",
      height: Math.round(172 * k),
    },
    referenceZoomPill: {
      minWidth: Math.round(116 * k),
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: Math.round(5 * k),
      borderColor: t.border,
      borderRadius: Math.round(14 * k),
      borderWidth: 1,
      backgroundColor: t.surface,
      paddingHorizontal: Math.round(10 * k),
      paddingVertical: SPACE.xs,
      marginTop: Math.round(6 * k),
    },
    referenceZoomIcon: {
      color: t.accent,
      fontFamily: FONT, fontSize: Math.round(14 * k),
      fontWeight: "900",
      lineHeight: Math.round(14 * k),
    },
    referencePanelText: {
      color: t.accent,
      fontFamily: FONT, fontSize: Math.round(10 * k),
      fontWeight: "900",
      lineHeight: Math.round(12 * k),
      textAlign: "center",
    },
    optionsRow: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: Math.round(20 * k),
      paddingTop: Math.round(0 * k),
    },
    manualOptionsRow: {
      alignItems: "center",
      gap: Math.round(22 * k),
    },
    optionCard: {
      // width, NOT flex. The card now sits inside ScaleOnSelect's wrapper, which is a column — so `flex: 1` there meant "fill the available HEIGHT" and quietly beat the height below. The wrapper carries the row's flex; the card just fills it.
      width: "100%",
      // 152 is what the contents actually need at full size: 14 padding + 66 circle + 10 gap + three 16pt lines + 14 padding. The old 176 was that plus a 44pt gutter for an audio button that now hangs on the rim, so the card loses the gutter and keeps everything else.
      height: Math.round(152 * k),
      alignItems: "center",
      // The card is art then words, with the space shared between them rather than pooled at the bottom — "flex-start" left the picture stranded at the top and the caption on the floor.
      justifyContent: "center",
      borderColor: t.border,
      borderRadius: Math.round(24 * k),
      borderWidth: 2,
      backgroundColor: t.surface,
      paddingHorizontal: Math.round(16 * k),
      // No top gutter for the audio button any more: it hangs on the rim, so the card is sized by its contents and the caption gets the room the gutter used to take.
      paddingTop: Math.round(14 * k),
      paddingBottom: Math.round(14 * k),
      gap: Math.round(10 * k),
    },
    compactOptionCard: {
      height: Math.round(196 * k),
      justifyContent: "center",
      paddingHorizontal: Math.round(14 * k),
      paddingTop: Math.round(14 * k),
      paddingBottom: Math.round(14 * k),
    },
    selectedOptionCard: {
      borderColor: t.accent,
      backgroundColor: t.surfaceRaised,
    },
    expressionCircle: {
      width: Math.round(66 * k),
      height: Math.round(66 * k),
      alignItems: "center",
      justifyContent: "center",
      overflow: "hidden",
      borderColor: t.gold,
      borderRadius: Math.round(33 * k),
      borderWidth: 1,
      backgroundColor: t.surface,
    },
    expressionSlot: {
      height: Math.round(66 * k),
      alignItems: "center",
      justifyContent: "center",
    },
    compactExpressionSlot: {
      height: Math.round(76 * k),
    },
    compactExpressionCircle: {
      width: Math.round(74 * k),
      height: Math.round(74 * k),
      borderRadius: Math.round(37 * k),
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
    // Left-aligned inside a full-width block: centred captions of different lengths gave three cards three different silhouettes, and the eye reads a common left edge faster.
    optionText: {
      width: "100%",
      color: t.textDim,
      fontFamily: FONT, fontSize: Math.round(12 * k),
      fontWeight: "700",
      lineHeight: Math.round(16 * k),
      textAlign: "left",
    },
    compactOptionText: {
      fontFamily: FONT, fontSize: Math.round(13 * k),
      lineHeight: Math.round(17 * k),
      marginTop: Math.round(6 * k),
      paddingHorizontal: Math.round(2 * k),
    },
    // Straddling the card's top-left corner, matching the speech bubble's button.
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
      paddingHorizontal: Math.round(38 * k),
      paddingVertical: SPACE.xl,
    },
    referenceOverlayBackdrop: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: t.scrim,
    },
    // No card. The manual page is white artwork on its own — a cream panel with a gold rim around it was a frame around a frame, and it is what made the zoom read as a document viewer rather than as the page itself.
    referenceExpandedCard: {
      width: "84%",
      height: "88%",
      overflow: "hidden",
      borderRadius: Math.round(24 * k),
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
      borderRadius: Math.round(14 * k),
      backgroundColor: t.scrim,
      color: t.onAccent,
      fontWeight: "800",
      paddingHorizontal: SPACE.md,
      paddingVertical: Math.round(6 * k),
    },
  });