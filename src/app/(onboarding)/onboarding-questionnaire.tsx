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

/** What shows for the frame before the backdrop image decodes, and behind it if the asset ever fails to load.
 *  Keep it cream so onboarding never opens as a full pink page while the art catches up. */
const BG_SOLID = "#F3ECE0";
/** The card's rim. Lavender at 3pt, matching the catalogue's selected-card treatment. */
const BUBBLE_RIM = ACCENT_LIGHT;
/** One source for the bubble's width: the reveal animates a clip to exactly this, and the card
 *  inside is pinned to it so nothing squeezes as the clip opens. */
/** The drawn bubble is an IMAGE now, and these three numbers are measured off it (see speech-bubble.png, trimmed to its alpha bounds) rather than eyeballed — the art is stretched to the box, so every offset inside has to be a FRACTION of the box or it drifts the moment the box changes size.
 *
 *  BODY_LEFT   where the rounded body starts. Everything left of it is the tail, which must stay clear of text.
 *  ASPECT      the art's own ratio, kept only as a note: the box is content-sized, so the art stretches to it. */
const BUBBLE = {
  BODY_LEFT: 0.1092,
  ASPECT: 1.9608,
  /** How far down the box the tail points, as a fraction of the height. NOT 0.5 — the art puts it a little below centre, so the mascot is nudged down by the difference to meet it (see mascotOffset at the call site). A tail aimed past the character's shoulder is the kind of thing that reads as wrong without being obviously wrong. */
  TAIL_CENTRE: 0.5407,
} as const;

/** THE ART CARRIES ITS OWN SHADOW — the darker band along the bottom edge, which follows the corners exactly because it was drawn with them.
 *
 *  A drawn one was tried first, a view behind the image wearing the catalogue's SHADOW. It could never line up: the art is stretched unevenly to a content-sized box, so its corners render as ELLIPSES (about 19pt across and 24pt down at the resting size) while a view's borderRadius is always a circle. Whatever radius the view took, it showed past the art at all four corners. Nothing to reconcile once the art's own shadow is simply left in place.
 *
 *  BAND is how deep that shadow runs, as a fraction of the height — the text's bottom padding has to clear it or the last line sits on the dark strip. */
const BUBBLE_BAND = 0.0485;

/** Extra room in the reveal's clip so nothing is sliced at the right edge as it opens. */
const SHADOW_ROOM = 12;

/** What a TABLET lifts the intro's Next row by, on top of the root's own bottom padding — the same trick the title screen's action row uses (TABLET_ACTIONS_LIFT in app/index.tsx).
 *
 *  Why a lift rather than a bigger scale: useUiScale is capped by the LONG side (long / 800), so an iPad Air 3 gets k = 1.39 even though its short side is 2.31x the phone's. That cap is right for widths — the layouts have to fit across — but this is a gap under a control on a LANDSCAPE screen, so it reads against the short side. This is the difference, and it is the ONE number to turn if the button still sits low on a tablet. */
const TABLET_NEXT_LIFT = 24;

/** The option cards' lift, lifted from the catalogue's own local SHADOW (src/app/(game)/catalogue.tsx) — chrome on this screen's art should read the same as chrome on the catalogue's watercolour, and the global ELEVATION scale is tuned for the dark HUD instead.
 *
 *  RN 0.81 + the new architecture support `boxShadow`, which renders on ANDROID with a real colour and alpha — unlike `elevation`, which ignores shadowColor/shadowOpacity and draws its own soft grey ramp regardless. The rest of the keys are the iOS fallback for the old architecture and are harmless where boxShadow works. Darker: raise the alpha. Sharper: lower the blur (the third length).
 *
 *  RAISED is the SELECTED card. With the strokes gone, "chosen" is carried by the fill, the accent text, ScaleOnSelect's 5.5% pop — and this: a card you have picked sits higher off the page than the two you have not. */
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

// The mascot carries NO shadow. Three versions were tried and none earned its place: a filled pill and a stack of ellipses both read as a grey object lying behind him (React Native has no blur primitive for a view, so a soft edge cannot be drawn), and a baked silhouette — under him, then behind him — was either too present or invisible. He sits on the backdrop unshadowed, which is also what every other character art in the app does. Only the BUBBLE is lifted off the page, and one shadowed thing in the row is what makes it read as the thing being said.

/** The bubble's width ON A PHONE. Anything wider computes it from the screen instead — see bubbleW
 *  at the call site. A fixed width plus a UI scale overflows a tablet, because the scale grows
 *  faster than the extra screen it is there to fill: 640pt of row at 1.75 is 1120pt against 1280pt
 *  of tablet, before padding. */
const BUBBLE_W = 470;
/** What the mascot and its gap take beside the bubble, in phone points. Grew from 150 when the circle came off: inside a frame the art was cropped and scaled 1.55, so it filled a 150 square; standing bare at its own 1.3:1 it only made 150x116 and read smaller than before. */
const MASCOT_W = 260;
const ROW_GAP = 14;
/** The mascot's own ratio, measured off the trimmed sprite. Its box follows this, so `contain` never letterboxes and the shadow below always meets the feet. */
const MASCOT_ASPECT = 1.2982;
/** Row slack: what the intro leaves for the root's own gutters once the mascot, the gap and the bubble have taken theirs. It is 88pt of root padding (44 a side) plus whatever air is left over, so trimming it is what pays for the mascot's growth without taking the whole cost out of the bubble. At 92 the row runs 657 of the 661pt the padding leaves — four points of air, which is as tight as this can safely go. */
const ROW_SLACK = 92;

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
  // The clip is for the WIPE and nothing else, so it is RELEASED the moment the wipe ends.
  //
  // Leaving it on is what cut the bubble off at the bottom. `overflow: hidden` clips on BOTH axes, and this view is a flex child of a row with a fixed height — so anything the bubble needed past the height that row granted it was sliced away, permanently and invisibly. It got worse as the text grew, which is why it survived three different versions of the artwork and why the missing strip always looked like a short asset rather than a clip.
  const [wiped, setWiped] = useState(false);
  useEffect(() => {
    on.value = withDelay(delay, withTiming(1, { duration: BUBBLE_WIPE_MS, easing: Easing.out(Easing.cubic) }));
    const t = setTimeout(() => setWiped(true), delay + BUBBLE_WIPE_MS + 60);
    return () => clearTimeout(t);
  }, [delay, on]);
  // Clip runs SHADOW_ROOM past the card so the drop shadow has somewhere to fall; the card itself is still pinned to `width` below.
  const clip = useAnimatedStyle(() => ({ width: (width + SHADOW_ROOM) * on.value }));
  return (
    <Reanimated.View style={[wiped ? styles_reveal.done : styles_reveal.wiping, !wiped && clip]}>
      <View style={[style, { width }]}>{children}</View>
    </Reanimated.View>
  );
}

const styles_reveal = StyleSheet.create({
  // During the wipe: clipped, and its width driven by the animation.
  wiping: { overflow: "hidden" },
  // After it: no clip at all, and the width pinned so releasing the animated style cannot resize it.
  done: { overflow: "visible", flexShrink: 0 },
});


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

const backdrop = require("../../assets/ui/onboarding-backdrop.png");
const bubbleArt = require("../../assets/images/questionnaire/speech-bubble.png");
// The brand mascot, trimmed to its own silhouette so the image box IS the character — which is what lets the contact shadow below sit at its feet rather than at the corner of a padded canvas. Replaces questionnaire/whole.png, which was drawn to sit inside a circle.
const mascot = require("../../assets/images/mascot/modu-mascot.png");
const q3ManualReference = require("../../assets/images/questionnaire/q3-manual-reference.png");
// Modu's face, one per answer. All six are authored on ONE canvas with the head at an identical size and position, so they need no per-file framing here — the shared frame is also where the flourishes that sit outside the head live (Excited's motion lines, Awkward's sweat drops), which is why the tile below does not clip.
const FACE = {
  excited: require("../../assets/images/questionnaire/faces/excited.png"),
  calm: require("../../assets/images/questionnaire/faces/calm.png"),
  sad: require("../../assets/images/questionnaire/faces/sad.png"),
  overwhelmed: require("../../assets/images/questionnaire/faces/overwhelmed.png"),
  happy: require("../../assets/images/questionnaire/faces/happy.png"),
  awkward: require("../../assets/images/questionnaire/faces/awkward.png"),
};

// Row order matches `questions`, and within a row the order matches that question's `options` — the answer's own index is what picks the face, so these two lists have to stay in step.
const questionOptionImages = [
  // "scattered screws" / "dismiss the manual and start" / "calm if guidance is detailed"
  [FACE.overwhelmed, FACE.excited, FACE.calm],
  // "lose track of the part" / "review the step again" / "pick up right where I left off"
  [FACE.sad, FACE.awkward, FACE.happy],
  // "the lines bleed together" / "hard to tell front from back" / "totally clear"
  [FACE.overwhelmed, FACE.awkward, FACE.happy],
  // "sound effects and rewards" / "clean, quiet, guided" / "a balance of both"
  [FACE.excited, FACE.calm, FACE.happy],
  // "spatially disoriented" / "takes me a second" / "rotate and size up easily"
  [FACE.overwhelmed, FACE.awkward, FACE.excited],
];

export default function QuestionnaireScreen() {
  const styles = useStyles(makeStyles);
  // Onboarding is where a player reads the most before they know the app.
  // The bubble fills whatever is left after the mascot, up to a readable maximum. Fixed on a phone
  // (the window is smaller than the cap), proportional on a tablet — so the row can never be wider
  // than the screen it sits in, at any scale.
  const win = useWindowDimensions();
  const uiScale = useUiScale();
  const isTablet = useIsTablet();
  const bubbleW = Math.round(
    Math.min(
      // A line of text past ~62 characters is hard to track back to the next line, so the bubble
      // stops growing well before the screen does.
      BUBBLE_W * uiScale,
      win.width - (MASCOT_W + ROW_GAP) * uiScale - ROW_SLACK * uiScale,
    ),
  );
  const safe = useSafeInsets();
  // The art is STRETCHED to the box, so its corner radius is a fraction of whatever height the text ends up needing — measured here rather than guessed, because the shadow behind it has to bend on exactly the same curve. Until the first layout lands, the resting height is the best estimate.
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

  // Every voice button plays the RECORDED clip for its line, falling back to synthesis if the clip
  // is missing or the device is offline (see onboarding/speech.ts). The pitch and rate below only
  // ever reach the fallback — a recording already sounds however it was performed.
  const VOICE = { language: "en-US", pitch: 1.08, rate: 0.92 };

  const speakIntro = () => {
    Speech.speakLine(introPath(), questionnaireIntroVoiceText, VOICE);
  };

  const speakCurrentQuestion = () => {
    Speech.speakLine(promptPath(index), question.prompt, VOICE);
  };

  // Takes the option's INDEX as well as its text: the clip is identified by position (Q3-Opt2.mp3),
  // and matching on the text instead would break the moment a line was reworded — silently, and
  // only for the players using the voice button.
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
        {/* THE WAY OUT OF ONBOARDING. This is the first screen a new player reaches, so it is the
            only one where Back means "I did not mean to start this" rather than "previous question"
            — everything after it is served by the nav arrows at the foot of the questionnaire.
            Without it, a player who tapped into onboarding by accident had no route back to the
            landing page except the hardware button, which Android has and iOS does not.

            `dismissTo` unwinds to the landing page already under this run rather than pushing a
            fresh one, so its intro animation does not replay; `replace` covers the case where this
            screen was reached directly and there is nothing beneath it to return to.

            The same arrow and the same 54x42 box as the questionnaire's own nav below, so it is one
            control the player learns once. Absolute, so it sits in the screen's top-left gutter
            without joining introStage's centred row and shifting the mascot. */}
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
              // Same corner and the same reasoning as the account picker's — see the note there. The
              // 44pt it used to carry aligned it with the mascot stage, which made it look like part
              // of the card rather than a way off the screen.
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
          {/* Dropped by however far the art's tail sits below the box's centre, so the tail lands on the character rather than above his shoulder. Derived from the MEASURED bubble height, so it stays right when the text reflows. */}
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
          {/* The button is a SIBLING of the reveal, not a child of it: the wipe needs overflow
              hidden, and anything hanging over the bubble's edge gets clipped by that same rule. */}
          <View style={styles.bubbleWrap}>
            <BubbleReveal
              delay={INTRO_STAGE.bubble}
              width={bubbleW}
              style={{ width: bubbleW }}
            >
            <ImageBackground
              source={bubbleArt}
              // STRETCH, not contain: the box is sized by the text inside it, so the art has to follow the box. The corners take a little vertical squash at the extremes, which is why the padding below is fractional — it keeps the text off the rim whatever the box does.
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
        {/* The button's OWN ROW, below the stage rather than a layer over it. Absolutely positioned it could only ever be tuned AWAY from a bubble whose height is set by its text — a row of its own cannot be overlapped at all, at any text length or scale.
            The row is here whether or not the button is in it, so choosing a hand does not jump the bubble up by a button's height. */}
        <View style={[styles.introFooter, isTablet && { marginBottom: TABLET_NEXT_LIFT * uiScale }]}>
        {/* Not rendered at all until a hand is chosen. A disabled button sitting there through the
            whole introduction is a dead control the eye keeps returning to; appearing on the choice
            makes it the consequence of the choice. */}
        {handedness ? (
        <PopIn delay={0} style={styles.introNextWrap}>
          <NextHalo />
        <Button
          label="Next"
          variant="primary"
          pill
          // small, so it clears the bubble on a phone: the bubble is the tallest thing on the screen and grows with the text, and at the full 44pt height this button's corner ran under it. The one action on the screen still reads as the one action — it is the only filled control here, and the halo is what draws the eye rather than the size.
          small
          disabled={!handedness}
          onPress={() => {
            Speech.stop();
            // Apply the hand HERE, not only where it is saved. A first run goes questionnaire -> avatar -> room without passing the loading gate again, so a left-hander who waited for the gate to read it back would build their whole first session right-handed. The DB write still happens at the end of the questionnaire; this is the same answer reaching the session it was given in.
            if (handedness) useGameStore.getState().setHandedness(handedness);
            setIntroComplete(true);
            // The voice notice is its own screen now (app/(onboarding)/voice-intro.tsx), shown before
            // this one. Firing it here as well would say the same thing twice, the second time on top
            // of question 1.
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
    </SceneBackdrop>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    root: {
      flex: 1,
      // Only what shows before the backdrop art decodes — SceneBackdrop is the root element now, so the image covers this.
      backgroundColor: BG_SOLID,
      // Padding is applied inline (base + safe inset) so the questionnaire clears the cutout and the immersive-hidden bars the same way every other screen does.
    },
    // The intro's own Back, in the top-left gutter. Absolute so it cannot push the mascot row; the
    // box matches `navButton` below so both arrows have the same target.
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
      // Nothing in this row may be clipped by it: the bubble is the tallest thing on the screen and is allowed to use the padding below if the text runs long.
      overflow: "visible",
      gap: 20,
      // The GAP between the bubble and the Next row below it, and nothing more. It used to have to reserve the button's whole height as well, because the button was absolutely positioned and could sit under a bubble that had grown — introFooter holds that height for real now, so this is only air.
      paddingTop: 16,
      paddingBottom: 20,
    },
    // NO circle, no rim, no fill: the mascot stands on the backdrop. Wider than the old 150 square because the sprite is 1.3:1 — a square box would letterbox it and shrink the character to fit a frame that is no longer drawn.
    // The box IS the sprite — trimmed to its silhouette, so there is nothing to align or pad around.
    mascotWrap: {
      width: MASCOT_W,
      height: Math.round(MASCOT_W / MASCOT_ASPECT),
    },
    // contain: the sprite is trimmed to its silhouette, so the box IS the character and cropping it would cut a limb.
    introMascot: {
      width: "100%",
      height: Math.round(MASCOT_W / MASCOT_ASPECT),
    },
    introMascotModel: {
      ...StyleSheet.absoluteFillObject,
    },
    // The bubble is ARTWORK now: no fill, no rim, no radius of its own — the PNG carries all three. What stays here is only the box the art stretches to and the room the text needs inside it. paddingLeft is set at the call site, because it has to clear the tail and the tail's width is a fraction of a width this sheet cannot see.
    speechBubble: {
      minHeight: 190,
      paddingRight: 24,
      paddingTop: 26,
      // Deeper than the top by the art's own shadow band, so the last line clears the dark strip along the bottom edge rather than sitting on it.
      paddingBottom: 26,
      gap: 14,
      justifyContent: "center",
    },
    // Straddling the top-left corner of the rim. Absolute, so it contributes no height — in the flow it was pushing every line of the message down by its own 44pt.
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
    // Layout only — the fill, radius, and padding now come from the shared Button.
    // Outside the bubble entirely: it is what you do NEXT, not part of what Modu is saying. Offsets are set at the call site from the safe insets: an absolute child is not inset by the parent's padding, so a literal here could never account for the device.
    // The row the button sits in, right-aligned to the content edge. minHeight holds the space open while the button is still hidden, so revealing it does not move the bubble.
    introFooter: {
      minHeight: SIZE.controlHeightSm,
      alignItems: "flex-end",
      justifyContent: "center",
    },
    // Relative, not absolute: the button takes real height in the footer now. It stays a positioned box only so NextHalo's -10 inset has something to measure against.
    introNextWrap: { position: "relative" },
    // 92, not 116: a four-letter label never needed the width, and the halo insets off this box (HALO is -10 on every side), so it shrinks with it.
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
    // Green is reserved for DONE in this palette, so the bar only earns it on the last question.
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
    // Both bubbles hold two short lines and one glyph. The old padding was sized for a card and left more empty space than message.
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
    // No second ring: VoiceButton draws its own, and the wrapper's was a circle around a circle.
    voiceHintIconWrap: { alignSelf: "flex-start", marginBottom: 4 },
    // Bare arrows. The frame around them read as a control you could press — it is a picture of the buttons up in the header, not a copy of them.
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
      // The audio buttons now hang over the cards' top rim, so the gap has to clear the BUTTON, not the card — at 4 they were colliding with the question line.
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
    // No container: the instruction art IS the panel. A card around a picture that already has its own white field was two boxes deep for one thing to look at. Narrower than before so the three answer cards get the width back — on this question the captions are the longest in the set and were wrapping to four lines in a tall thin box.
    referencePanel: { width: 178, alignItems: "center", gap: 8 },
    // The rounding lives on a CLIPPING wrapper, not on the Image: borderRadius on an Image with resizeMode contain leaves the letterboxed field square on Android.
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
      // width, NOT flex. The card now sits inside ScaleOnSelect's wrapper, which is a column — so `flex: 1` there meant "fill the available HEIGHT" and quietly beat the height below. The wrapper carries the row's flex; the card just fills it.
      width: "100%",
      // What the contents actually need at full size: 14 padding + 72 face + 10 gap + three 16pt lines + 14 padding = 158, plus a little slack. It was 152 when the face was a 66 disc and never moved when the new art made it 72 — so the tallest caption overflowed by 6, which centring hid by splitting it three above and three below. Top-aligned there is nowhere to hide it, so the number is corrected rather than the symptom.
      height: 160,
      alignItems: "center",
      // TOP-ALIGNED, not centred. Centring treated face + gap + caption as one block and centred the whole block, so a one-line caption sat its face LOWER than a three-line one — measured at 74, 117 and 87pt from the card top across one row. Pinned to the top, every face lands at the same y whatever its caption does. The height above is what keeps this from stranding the caption on the floor: it fits the tallest caption with two points to spare, so there is no slack for the old centring to have been distributing.
      justifyContent: "flex-start",
      // NO stroke. The card is lifted off the backdrop instead of outlined on it — see CARD_SHADOW.
      borderRadius: 24,
      backgroundColor: t.surface,
      ...CARD_SHADOW,
      paddingHorizontal: 16,
      // No top gutter for the audio button any more: it hangs on the rim, so the card is sized by its contents and the caption gets the room the gutter used to take.
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
    // A plain box, not a disc: the face art carries its own cream fill and gold rim, so a second one behind it would only show as a halo. 72 rather than 66 because the head is 91.75% of its canvas — the rest is the room the flourishes need — so this renders the head itself at the same 66pt it always was.
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
    // Nothing to change on the chosen card: the face is art with its own rim, and the card already lifts, brightens and pops when it is picked. Kept as a named no-op so the call site's three conditional styles stay parallel and the next person can hang something here.
    selectedExpressionCircle: {},
    // No scale: the old art was a FULL BODY drawing that had to be blown up and cropped by the disc to read as a head. These are heads, framed as they should sit.
    optionMascot: {
      width: "100%",
      height: "100%",
    },
    compactOptionMascot: {
      width: "100%",
      height: "100%",
    },
    // CENTRED under the face. The card is one column — a face with its caption beneath — so the caption reads as belonging to the art above it rather than as a list item beside it, and three cards of different caption lengths stay symmetrical about their own centres.
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
      paddingHorizontal: 38,
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