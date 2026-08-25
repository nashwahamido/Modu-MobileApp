import { router, useLocalSearchParams } from "expo-router";
import type { Href } from "expo-router";
import * as Speech from "@/src/onboarding/speech";
import { StyleSheet, Animated, Image, Text, View, useWindowDimensions } from "react-native";
import { Pressable } from "@/src/components/Pressable";
import { useEffect, useRef, useState } from "react";
import { avatarModes } from "@/src/onboarding/avatarModes";
import { avatarPath } from "@/src/onboarding/voiceAssets";
import type { ModeId } from "@/src/onboarding/questionnaire";
import { VoiceButton } from "@/src/game/ui/hud/VoiceButton";
import { useGameStore } from "@/src/game/core/store";
import type { ProfileId } from "@/src/game/core/profile";
import { AVATAR_IMAGES } from "@/src/components/avatarAssets";
import { useTutorialStore } from "@/src/game/tutorial/store";
import { saveSelectedAvatarMode } from "@/src/services/onboarding";
import { Button } from "@/src/game/ui/system/Button";
import { ACCENT_LIGHT, FONT, RADIUS, SPACE, TYPE, useIsTablet, useStyles, useTheme, useUiScale } from "@/src/game/ui/system/theme";
import { CheckIcon, StarIcon } from "@/src/components/Icons";
import { useScreenInsets } from "@/src/hooks/use-safe-insets";
import type { Theme } from "@/src/game/ui/system/theme";

import Svg, { Defs, RadialGradient, Rect, Stop } from "react-native-svg";
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
import type { StyleProp, ViewStyle } from "react-native";
import { SceneBackdrop } from "@/src/game/ui/backdrop/SceneBackdrop";
import { playSfx } from "@/src/game/audio/sfx";

/** This screen's backdrop. Deliberately its own pair rather than a shared token: each screen can
 *  be retuned without touching the others. Keep root.backgroundColor equal to BG_FROM — that is
 *  what shows for the frame before the SVG paints. */
/** The entrance, as ONE block. Every value is the moment that element starts, so re-timing the whole
 *  screen means editing this and nothing else. The order is the order a person reads the page:
 *  the avatar arrives, then its name, then what it is like, then what it does, then the choice. */
const STAGE = {
  avatar: 140,
  spark: 260,
  // The avatar gets the stage to itself: everything below starts at twice its old delay, so the pop and its glints finish before a single word appears.
  title: 1400,
  traits: 1800,
  traitStep: 130,
  bullets: 2200,
  bulletStep: 150,
  confirm: 2900,
  tabs: 3200,
} as const;

/** Scales up past its resting size and settles. For things that should feel like they LANDED.
 *
 *  `big` is the avatar's version: starts far smaller and springs on a looser damping, so it
 *  overshoots visibly and rocks back. On a trait pill that would be slapstick; on the one thing the
 *  screen is about, it is the arrival. */
function PopIn({
  delay,
  style,
  big = false,
  animate = true,
  children,
}: {
  delay: number;
  style?: StyleProp<ViewStyle>;
  big?: boolean;
  /** False = mount fully formed. The entrance is a one-shot, so after it every child renders flat. */
  animate?: boolean;
  children: ReactNode;
}) {
  const on = useSharedValue(0);
  useEffect(() => {
    if (!animate) return;
    on.value = withDelay(
      delay,
      withSpring(1, big ? { damping: 7.5, stiffness: 190, mass: 0.9 } : { damping: 11, stiffness: 170, mass: 0.7 }),
    );
  }, [animate, big, delay, on]);
  const from = big ? 0.35 : 0.7;
  const anim = useAnimatedStyle(() => ({
    // Faster than the scale, so it is never seen at its smallest.
    opacity: Math.min(1, on.value * 3),
    transform: [{ scale: from + on.value * (1 - from) }],
  }));
  // A PLAIN view when not animating, not an animated one parked at its end value. A shared value's initialiser only runs on the hook's first render, so a child that mounted mid-intro could keep a stale 0 and stay invisible. No animated style, no way to be stuck.
  if (!animate) return <View style={style}>{children}</View>;
  return <Reanimated.View style={[style, anim]}>{children}</Reanimated.View>;
}

/** Drops in from above. For lines of copy, which read top-down anyway. */
function SlideDown({
  delay,
  style,
  animate = true,
  children,
}: {
  delay: number;
  style?: StyleProp<ViewStyle>;
  /** False = mount fully formed. The entrance is a one-shot, so after it every child renders flat. */
  animate?: boolean;
  children: ReactNode;
}) {
  const on = useSharedValue(0);
  useEffect(() => {
    if (!animate) return;
    on.value = withDelay(delay, withTiming(1, { duration: 320, easing: Easing.out(Easing.cubic) }));
  }, [animate, delay, on]);
  const anim = useAnimatedStyle(() => ({
    opacity: on.value,
    transform: [{ translateY: -18 * (1 - on.value) }],
  }));
  // Same reasoning as PopIn: when the entrance is over, this is just a View.
  if (!animate) return <View style={style}>{children}</View>;
  return <Reanimated.View style={[style, anim]}>{children}</Reanimated.View>;
}

/** One glint around the avatar as it lands. Rotated so it reads as a sparkle rather than a dot. */
function Spark({ x, y, size, delay }: { x: number; y: number; size: number; delay: number }) {
  const pop = useSharedValue(0);
  useEffect(() => {
    pop.value = withDelay(delay, withTiming(1, { duration: 780, easing: Easing.out(Easing.quad) }));
  }, [delay, pop]);
  const anim = useAnimatedStyle(() => ({
    // Up and out, brightest in the middle of its life.
    opacity: pop.value < 0.4 ? pop.value / 0.4 : 1 - (pop.value - 0.4) / 0.6,
    transform: [
      { translateY: -22 * pop.value },
      { scale: 0.3 + pop.value * 1.5 },
      { rotate: `${45 + pop.value * 120}deg` },
    ],
  }));
  return (
    <Reanimated.View
      style={[{ position: "absolute", left: x, top: y, width: size, height: size, backgroundColor: "#FFF6D8" }, anim]}
    />
  );
}

/** The ring breathing behind Confirm. Swells and fades rather than pulsing the button itself: the
 *  button has to stay a stable target, and a control that changes size under the thumb is a control
 *  you can miss. */
function ConfirmHalo() {
  const on = useSharedValue(0);
  useEffect(() => {
    on.value = withDelay(
      STAGE.confirm + 300,
      withRepeat(withTiming(1, { duration: 1400, easing: Easing.out(Easing.quad) }), -1, false),
    );
  }, [on]);
  const anim = useAnimatedStyle(() => ({
    opacity: 0.5 * (1 - on.value),
    transform: [{ scale: 1 + on.value * 0.16 }],
  }));
  return <Reanimated.View style={[styles_halo, anim]} pointerEvents="none" />;
}

/** Where the glints sit around the 210pt circle, and when each fires. */
const SPARKS = [
  { x: 6, y: 40, size: 13, delay: 0 },
  { x: 186, y: 26, size: 10, delay: 70 },
  { x: 200, y: 132, size: 15, delay: 140 },
  { x: 24, y: 168, size: 12, delay: 210 },
  { x: 96, y: -10, size: 16, delay: 280 },
  { x: 150, y: 200, size: 10, delay: 350 },
  { x: -6, y: 108, size: 11, delay: 420 },
  { x: 118, y: 210, size: 13, delay: 490 },
  { x: 214, y: 74, size: 9, delay: 560 },
  { x: 54, y: -2, size: 12, delay: 630 },
];

/** Plain object, not a themed sheet: the halo is one fixed accent and ConfirmHalo takes no props. */
const styles_halo = {
  position: "absolute" as const,
  left: -10,
  right: -10,
  top: -10,
  bottom: -10,
  borderRadius: 999,
  borderWidth: 3,
  borderColor: ACCENT_LIGHT,
};

/** The rim colour of the avatar circle — the gradient's outer stop, so the disc and the corners it
 *  cannot reach agree. */
const AVATAR_CIRCLE = "#EFE6D6";
/** Shared with the profile screen — the two are the same moment either side of onboarding ("this is
 *  who you are"), so they wear the same art rather than each tuning a ramp of its own. */
const backdrop = require("@/src/assets/ui/profile-backdrop.jpg");

/** What shows for the frame before the artwork decodes, and behind it if the asset ever fails to
 *  load. Sampled from the art's own open area so the swap is invisible rather than a flash. */
const BG_FALLBACK = "#E9E6DF";

/**
 * A trait chip's own capital, applied at RENDER rather than fixed in the data.
 *
 * The four modes' `personality` strings had drifted — one written "Curious, Observant, Imaginative"
 * and the other three lower-case — so the chips came out capitalised or not depending on which
 * avatar was recommended. Doing it here means the data can be written either way and the chips
 * still match.
 *
 * Only the FIRST letter, not every word: "quick-witted" is one trait, and Title Case would render
 * it "Quick-Witted", which reads as two.
 */
function sentenceCase(s: string): string {
  const t = s.trim();
  return t ? t[0].toUpperCase() + t.slice(1) : t;
}

// The tutorial invitation's portrait: Modu at work, wrench on a screw — showing the player what the
// tutorial IS rather than just who is asking. It replaces the plain bust this screen used to share
// with create-account, which still has its own copy.
const mascotAtWork = require("../../assets/images/mascot/modu-tool.png");
// The room is the post-onboarding hub now that the home tab is gone.
const homeRoute = "/room" as Href;

const modes = avatarModes.map((mode) => ({
  ...mode,
  image: AVATAR_IMAGES[mode.id],
}));

// How far the tutorial popup's right edge sits from the screen's right edge. Absolute offsets do NOT scale (see SCALED_PROPS in ui/system/theme), so this is raw device points on every device — which is exactly why the popup needs the clamp below: its WIDTH does scale, and an unscaled anchor plus a scaled width has nothing keeping the far edge on screen. Shared between the sheet and the clamp so the two cannot drift.
const POPUP_RIGHT = 92;
const TABLET_RECOMMENDATION_STACK_GAP = 22;

export default function AvatarRecommendationScreen() {
  const k = useUiScale();
  // The room asks this way too: the device question belongs to useIsTablet, and `scale > 1` only happens to agree with it.
  const isTablet = useIsTablet();
  const styles = useStyles(makeStyles);
  // The icons take their colour as a prop, so this screen needs the tokens as values, not just the sheet.
  const t = useTheme();
  // A slow breath on the Recommended tag. Small on purpose — it marks the default choice, it is not asking to be pressed, and anything stronger would compete with the Confirm button. The entrance plays ONCE, for the avatar being announced. After that the player is comparing four modes, and replaying the build-up on every switch read as a wait — the pills and lines are keyed on their own text, so they remount on each switch and ran their delays again from scratch. Once this is false they mount fully formed and a switch is instant.
  //
  // The two LOOPING animations are deliberately NOT gated by it: the Recommended badge and the Confirm halo are ongoing states rather than an entrance, and keep breathing whatever mode is up.
  const [introPlaying, setIntroPlaying] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setIntroPlaying(false), STAGE.tabs + 900);
    return () => clearTimeout(t);
  }, []);
  // THE RESULT LANDING, once. Empty deps on purpose: this is tied to the recommendation the
  // questionnaire produced, not to `selectedModeId`, so switching between the four modes afterwards
  // is silent — the player is comparing then, and a fanfare per tab would turn the announcement into
  // a click sound. Timed to the avatar's own pop (STAGE.avatar) so the sound and the arrival are one
  // event rather than two.
  useEffect(() => {
    const cue = setTimeout(() => playSfx("recommendation"), STAGE.avatar);
    return () => clearTimeout(cue);
  }, []);
  // The timer alone was not enough: tapping a mode inside the opening ~4s left the intro "still playing", so the switch animated. Touching a tab IS the end of the announcement, whenever it happens — after this the player is comparing, and comparing wants content, not choreography.
  const endIntro = () => setIntroPlaying(false);
  const badgePulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(badgePulse, { toValue: 1, duration: 900, useNativeDriver: true }),
        Animated.timing(badgePulse, { toValue: 0, duration: 900, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [badgePulse]);
  // The floored insets, per axis. RoomTopStats and the title screen read them exactly like this — the hand-rolled Math.max is what this hook was added to replace.
  const safe = useScreenInsets();
  // The widest the tutorial popup may be before it runs off the LEFT edge, in raw device points. It is right-anchored at POPUP_RIGHT, so everything it is allowed to occupy is what remains once that anchor and the left safe margin are taken off. Measured, not assumed: the sheet asks for 620 * k, which on an iPad Air 3 (1112pt wide, k capped at 1.75) came to 1085 and put the left edge 65pt off the screen.
  const { width: windowWidth } = useWindowDimensions();
  const popupMaxWidth = windowWidth - POPUP_RIGHT - safe.left;
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
    // THE COMPANION'S OWN RECORDING, with the assembled sentence as the fallback. speakLine plays
    // the clip if storage has one and speaks the text if it does not, so a companion recorded later
    // needs no change here — same contract the questionnaire's buttons already use.
    //
    // The fallback text is what this button said before, unchanged: it is not a transcript of the
    // recording and does not need to be. If the clip is missing the player still hears which avatar
    // they were given and why, which is the whole job of the button.
    Speech.speakLine(
      avatarPath(selectedMode.avatarName),
      `Your recommended avatar is ${selectedMode.avatarName} in ${selectedMode.title}. ${selectedMode.avatarName} is ${selectedMode.personality}. ${selectedMode.explanation}. ${selectedMode.bullets.join(". ")}.`,
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
      const result = await saveSelectedAvatarMode(selectedMode.id as ModeId);
      if (result.skipped) throw new Error("Sign in again to save your avatar choice.");
      // Keep the already-mounted room in sync when the player returns home in
      // this session; the next cold start hydrates the same value from the DB.
      useGameStore.getState().applyProfile(selectedMode.id as ProfileId);
      setShowModeTip(true);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not save avatar choice.";
      setSaveError(message);
    } finally {
      setSavingChoice(false);
    }
  };

  const recommendationContent = (
    <View
      style={[
        styles.recommendationLayout,
        isTablet && styles.recommendationLayoutTablet,
      ]}
    >
      {/* No card. The avatar IS the object here, and a frame around a circle was two shapes
        competing to be the thing you look at. */}
      <View style={styles.modeColumn}>
        <PopIn delay={STAGE.avatar} big animate={introPlaying}>
          {/* ONE circle colour for every mode. Per-mode tints made the four cards read as four
            different components, and the avatars — which now carry their own colour — had to
            sit on whatever hue the mode happened to own. Control's light lavender is the one
            that worked against all four characters. */}
          <View style={styles.avatarCircle}>
            {/* White at the centre falling to cream at the rim, matching the tutorial portrait and
              the hint toast — one backing for a character wherever it appears. */}
            <Svg style={StyleSheet.absoluteFill} pointerEvents="none">
              <Defs>
                {/* The SAME three stops as the auth screen's character cards (dev/AccountPicker):
                  a character sits on one backing wherever it is chosen. */}
                <RadialGradient id="avatarglow" cx="50%" cy="40%" r="62%">
                  <Stop offset="0" stopColor="#FFFFFF" />
                  <Stop offset="0.55" stopColor="#F7F1E6" />
                  <Stop offset="1" stopColor="#DCCFB8" />
                </RadialGradient>
              </Defs>
              <Rect
                x="0"
                y="0"
                width="100%"
                height="100%"
                fill="url(#avatarglow)"
              />
            </Svg>
            <Image
              source={selectedMode.image}
              style={styles.avatarImage}
              // contain: these are FULL BODY portraits, and cropping them to fill the circle cut
              // heads off — the head tiles elsewhere are cover because a head has no such problem.
              resizeMode="contain"
            />
          </View>
          {/* Outside the circle's overflow:hidden, so the glints can sit ON its rim. */}
          <View style={styles.sparkLayer} pointerEvents="none">
            {(introPlaying ? SPARKS : []).map((sp, i) => (
              <Spark
                key={i}
                x={sp.x}
                y={sp.y}
                size={sp.size}
                delay={STAGE.spark + sp.delay}
              />
            ))}
          </View>
        </PopIn>
        {/* Straddling the top of the circle, so it reads as pinned ON the avatar rather than
          floating beside it. */}
        {selectedMode.id === initialModeId ? (
          <Animated.View
            style={[
              styles.recommendedBadge,
              {
                transform: [
                  {
                    scale: badgePulse.interpolate({
                      inputRange: [0, 1],
                      outputRange: [1, 1.06],
                    }),
                  },
                ],
              },
            ]}
          >
            <Text style={styles.recommendedBadgeText}>Recommended</Text>
          </Animated.View>
        ) : null}
      </View>

      <View style={styles.recommendationCopy}>
        <SlideDown delay={STAGE.title} animate={introPlaying}>
          <Text style={styles.title}>
            {selectedMode.avatarName}: {selectedMode.title}
          </Text>
        </SlideDown>
        {/* The three traits become chips: short, parallel, and read at a glance rather than as a
          sentence to parse. */}
        <View style={styles.traitRow}>
          {selectedMode.personality.split(",").map((trait, i) => (
            <PopIn
              key={trait}
              delay={STAGE.traits + i * STAGE.traitStep}
              animate={introPlaying}
              style={styles.traitChip}
            >
              <StarIcon size={12} color={t.accent} />
              <Text style={styles.traitText}>{sentenceCase(trait)}</Text>
            </PopIn>
          ))}
        </View>
        <View style={styles.bulletList}>
          {selectedMode.bullets.map((bullet, i) => (
            <SlideDown
              key={bullet}
              delay={STAGE.bullets + i * STAGE.bulletStep}
              animate={introPlaying}
              style={styles.bulletRow}
            >
              {/* A tick, not a dot: these are what the mode GIVES you, and a check says that where
                a bullet only separates lines. */}
              <CheckIcon size={15} color={t.success} />
              <Text style={styles.bulletText}>{bullet}</Text>
            </SlideDown>
          ))}
        </View>
        {saveError ? (
          <Text style={styles.saveErrorText}>{saveError}</Text>
        ) : null}
        <PopIn
          delay={STAGE.confirm}
          animate={introPlaying}
          style={styles.confirmWrap}
        >
          <ConfirmHalo />
          <Button
            label={savingChoice ? "Saving..." : "Confirm"}
            variant="primary"
            style={styles.confirmButton}
            onPress={confirmAvatar}
            disabled={savingChoice}
          />
        </PopIn>
      </View>
    </View>
  );

  const modeTabs = (
    <SlideDown
      delay={STAGE.tabs}
      animate={introPlaying}
      style={[
        styles.modeTabsWrap,
        isTablet
          ? styles.modeTabsWrapTablet
          : {
              // 38 to match the content column's own inset, so the tab row lines up with the copy above it rather than running wider than everything else on the screen.
              left: 38 + safe.left,
              right: 38 + safe.right,
              // The design offset scales, the device inset does not — same split as RoomTopStats' padTop.
              bottom: 28 * k + safe.bottom,
            },
      ]}
    >
      {/* Names what the row is for. Without it the four tabs read as navigation the player is
        expected to work through, rather than an alternative to the one choice already made for
        them. Inside the same SlideDown as the row so the label and its tabs arrive together. */}
      <Text style={styles.modeTabsLabel}>
        Or, you can choose another mode:
      </Text>
      <View style={styles.modeTabs}>
        {modes.map((mode) => {
          const isSelected = mode.id === selectedModeId;
          const isRecommended = mode.id === initialModeId;
          return (
            <Pressable
              key={mode.id}
              onPress={() => {
                Speech.stop();
                endIntro();
                setSelectedModeId(mode.id as ModeId);
                setShowModeTip(false);
                setSaveError(null);
              }}
              style={[styles.modeTab, isSelected && styles.modeTabSelected]}
            >
              <Text
                style={[
                  styles.modeTabText,
                  isSelected && styles.modeTabTextSelected,
                ]}
              >
                {mode.title}
              </Text>
              {isRecommended ? (
                <Text style={styles.modeTabRecommended}>Recommended</Text>
              ) : null}
            </Pressable>
          );
        })}
      </View>
    </SlideDown>
  );

  return (
    // The artwork is FULL-BLEED, as the screen's root. It cannot be an absolute child of the padded
    // root below: absolute positioning resolves against the padding box, which is what once left the
    // old ramp floating in the middle with a flat border all round it. SceneBackdrop rather than an
    // <Image absoluteFill>, which scales the same file differently and renders it zoomed.
    <SceneBackdrop source={backdrop} style={styles.screen}>
      <View
        style={[
          styles.root,
          {
            paddingLeft: 38 + safe.left,
            paddingRight: 38 + safe.right,
            paddingTop: 18 + safe.top,
            paddingBottom: 18 + safe.bottom,
          },
        ]}
      >
        <View
          style={[
            styles.header,
            {
              top: 20 + safe.top,
              right: 4 + safe.right,
            },
          ]}
        >
          <Pressable
            onPress={() => {
              Speech.stop();
              router.back();
            }}
            style={styles.navButton}
          >
            {/* The drawn arrow head, same asset the questionnaire uses — a "<" glyph is a
              less-than sign that happens to look like an arrow, and it renders differently in
              every font. */}
            <Image
              source={require("@/src/assets/ui/icons/arrow-back.png")}
              style={styles.navArrow}
              resizeMode="contain"
            />
          </Pressable>
        </View>

        {/* Top-left of the SCREEN, not of the layout row: it reads the page aloud, so it belongs with
          the page's own chrome rather than inside the content it narrates. */}
        <VoiceButton
          onPress={speakSelectedMode}
          style={[
            styles.audioButton,
            {
              top: 20 + safe.top,
              left: 4 + safe.left,
            },
          ]}
        />

        {isTablet ? (
          <View style={styles.tabletContentStack}>
            {recommendationContent}
            {modeTabs}
          </View>
        ) : (
          <>
            {recommendationContent}
            {modeTabs}
          </>
        )}

        {showModeTip && (
          <View style={styles.dimOverlay}>
            <Animated.View
              style={[
                styles.highlightedPopup,
                { maxWidth: popupMaxWidth },
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
                <Text style={styles.noteTitle}>
                  Ready for your tutorial task?
                </Text>
                <Text style={styles.noteText}>
                  Your avatar is set. Start the guided assembly task now, or
                  return to the homepage for later.
                </Text>
                <View style={styles.taskActions}>
                  <Button
                    label="I am ready"
                    variant="primary"
                    pill
                    onPress={goToGame}
                  />
                  <Button label="Not now" pill onPress={goHome} />
                </View>
              </View>
              <View style={styles.smallMascotCircle}>
                {/* contain, not the Image default of cover: this art is a whole little SCENE — the
                  mascot, the board, the screw and its motion lines — and cropping it to fill a
                  square cuts the tool off the picture. The old portrait was a bust, so cover
                  happened to suit it. */}
                <Image
                  source={mascotAtWork}
                  style={styles.smallMascot}
                  resizeMode="contain"
                />
              </View>
            </Animated.View>
          </View>
        )}
      </View>
    </SceneBackdrop>
  );
}

// Authored in phone points, like every other sheet: useStyles runs it through scaleSheet, which multiplies the size props for you. The props it skips — top/left/right/bottom, borderWidth, shadow* — are scaled at the CALL SITE by k instead.
const makeStyles = (t: Theme) =>
  StyleSheet.create({
    // The full-bleed layer. No padding here, ever: it is what the gradient measures against.
    screen: { flex: 1, backgroundColor: BG_FALLBACK },
    // All four paddings come from the CALL SITE, which folds in the safe insets — a shorthand here would only be overridden by them.
    root: { flex: 1 },
    header: {
      position: "absolute",
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
    navArrow: { width: 26, height: 26 },
    tabletContentStack: {
      flex: 1,
      alignSelf: "stretch",
      justifyContent: "center",
      gap: TABLET_RECOMMENDATION_STACK_GAP,
    },
    recommendationLayout: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      gap: 34,
      // Clearance for the absolute chooser at the bottom, and no more: the old 82 reserved a chooser's worth of space twice over and centred the avatar visibly high on the page.
      paddingBottom: 48,
    },
    // Inside the tablet stack the chooser is part of the same centred group, so this row drops the phone-only bottom reserve entirely.
    // What it takes instead is a top pad: the stack centres row + chooser together, and without it the taller row sits hard against the header.
    recommendationLayoutTablet: {
      flex: 0,
      paddingBottom: 0,
      paddingTop: 18,
    },
    audioButton: { position: "absolute", zIndex: 5 },
    // A column, not a card: width comes from the circle, and nothing draws a box around it.
    sparkLayer: { ...StyleSheet.absoluteFillObject },
    // Narrower than the copy column: a full-width primary action read as a banner rather than a button, and the halo needs room to swell without touching the text above it.
    confirmWrap: {
      alignSelf: "center",
      width: 260,
      marginTop: SPACE.lg,
      alignItems: "center",
    },
    // stretch + auto margin puts the title on the column's BASE, which is where the Confirm button sits in the column beside it — so the two land on the same line.
    modeColumn: {
      width: 220,
      alignItems: "center",
      paddingTop: 12,
    },
    avatarCircle: {
      width: 210,
      height: 210,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: 105,
      overflow: "hidden",
      // The gradient above paints the disc; this is only what shows outside its bounds.
      backgroundColor: AVATAR_CIRCLE,
    },
    // Sized INSIDE the circle now (was 232 in a 210 circle, which relied on the crop). With contain
    // the art fits the box, so the box has to sit within the rim or the character floats in a gap.
    avatarImage: {
      width: 196,
      height: 196,
    },
    // Straddling the circle's top edge. alignSelf centre plus a negative top pulls it back over the rim, so it reads as pinned to the avatar rather than floating above it.
    recommendedBadge: {
      position: "absolute",
      top: 2,
      alignSelf: "center",
      borderRadius: RADIUS.pill,
      backgroundColor: t.success,
      paddingHorizontal: SPACE.md,
      paddingVertical: SPACE.xs,
    },
    recommendedBadgeText: {
      color: t.onSuccess,
      fontFamily: FONT,
      fontSize: 9,
      fontWeight: "900",
    },
    recommendationCopy: {
      flex: 1,
      minWidth: 0,
      gap: 7,
    },
    title: {
      color: t.text,
      fontFamily: FONT,
      fontSize: 20,
      fontWeight: "900",
      lineHeight: 24,
    },
    // Space above the primary action, so it is not the next thing after the last tick — a gap is what makes it read as the conclusion rather than a fourth list item.
    confirmButton: { width: "100%" },
    traitRow: { flexDirection: "row", flexWrap: "wrap", gap: SPACE.sm },
    traitChip: {
      flexDirection: "row",
      alignItems: "center",
      gap: 5,
      paddingHorizontal: SPACE.sm,
      paddingVertical: 3,
      borderRadius: RADIUS.pill,
      backgroundColor: t.surface,
    },
    traitText: {
      color: t.text,
      fontFamily: FONT,
      fontSize: 13,
      fontWeight: "800",
    },
    bulletList: {
      gap: 5,
    },
    bulletRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 9,
    },
    bulletText: {
      flex: 1,
      color: t.text,
      fontFamily: FONT,
      fontSize: 13,
      fontWeight: "700",
    },
    // Offsets come from the CALL SITE, not from here: absolute children are not inset by the parent's padding, so a literal here can never account for a device's safe insets.
    // The COLUMN: label above, tabs below. It carries the absolute placement the row used to, so the
    // row's own height is preserved and the label simply sits on top of it.
    modeTabsWrap: {
      position: "absolute",
      flexDirection: "column",
      gap: SPACE.xs,
    },
    modeTabsWrapTablet: {
      position: "relative",
      alignSelf: "stretch",
    },
    modeTabsLabel: {
      ...TYPE.body,
      fontSize: 13,
      color: t.textDim,
      // Centred over the four tabs rather than left-aligned to the first one — it introduces the row
      // as a whole, so it belongs to the row's middle, not to its start.
      textAlign: "center",
    },
    modeTabs: {
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
      fontFamily: FONT,
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
      right: POPUP_RIGHT,
      bottom: 58,
      // The CALL SITE clamps this with an inline maxWidth — see POPUP_RIGHT. A maxWidth here could not: the sheet is run through scaleSheet, which would multiply the cap by the very scale that overflows it.
      width: 620,
      minHeight: 142,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "flex-end",
      // No rim. The shadow already lifts this off the dimmed screen behind it, and an outline on top of that was drawing a box around something already clearly separated.
      borderRadius: 28,
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
      fontFamily: FONT,
      fontSize: 21,
      fontWeight: "900",
      marginBottom: 5,
    },
    noteText: {
      color: t.text,
      fontFamily: FONT,
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
      borderColor: t.accent,
      borderRadius: 44,
      borderWidth: 1,
      backgroundColor: t.surface,
      marginLeft: -8,
    },
    // 78, not 62: the artwork is padded to a square so nothing is cropped, so more of its box is
    // empty than the old bust's was. Sized up to keep the same amount of drawn mark inside the same
    // 88 circle. No borderRadius — it rounded the corners of a picture that no longer has any.
    smallMascot: {
      width: 78,
      height: 78,
    },
  });
