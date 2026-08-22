import { router, useLocalSearchParams } from "expo-router";
import type { Href } from "expo-router";
import * as Speech from "@/src/onboarding/speech";
import { StyleSheet, Animated, Image, Pressable, Text, View, useWindowDimensions } from "react-native";
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
import { ACCENT_LIGHT, FONT, RADIUS, SPACE, TYPE, useStyles, useTheme, useUiScale } from "@/src/game/ui/system/theme";
import { CheckIcon, StarIcon } from "@/src/components/Icons";
import { SCREEN_SIDE_MARGIN, SCREEN_VERTICAL_MARGIN, useSafeInsets } from "@/src/hooks/use-safe-insets";
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

export default function AvatarRecommendationScreen() {
  const scale = useUiScale();
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
  const safe = useSafeInsets();
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
    // The artwork is FULL-BLEED, as the screen's root. It cannot be an absolute child of the padded
    // root below: absolute positioning resolves against the padding box, which is what once left the
    // old ramp floating in the middle with a flat border all round it. SceneBackdrop rather than an
    // <Image absoluteFill>, which scales the same file differently and renders it zoomed.
    <SceneBackdrop source={backdrop} style={styles.screen}>
      <View
        style={[
          styles.root,
          {
            paddingLeft: 38 + Math.max(safe.raw.left, SCREEN_SIDE_MARGIN),
            paddingRight: 38 + Math.max(safe.raw.right, SCREEN_SIDE_MARGIN),
            paddingTop: 18 + Math.max(safe.raw.top, SCREEN_VERTICAL_MARGIN),
            paddingBottom: 18 + Math.max(safe.raw.bottom, SCREEN_VERTICAL_MARGIN),
          },
        ]}
      >
      <View
        style={[
          styles.header,
          {
            top: 20 + Math.max(safe.raw.top, SCREEN_VERTICAL_MARGIN),
            right: 4 + Math.max(safe.raw.right, SCREEN_SIDE_MARGIN),
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
            top: 20 + Math.max(safe.raw.top, SCREEN_VERTICAL_MARGIN),
            left: 4 + Math.max(safe.raw.left, SCREEN_SIDE_MARGIN),
          },
        ]}
      />

      <View style={styles.recommendationLayout}>
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
                <Rect x="0" y="0" width="100%" height="100%" fill="url(#avatarglow)" />
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
                <Spark key={i} x={sp.x} y={sp.y} size={sp.size} delay={STAGE.spark + sp.delay} />
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
                    { scale: badgePulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.06] }) },
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
              <PopIn key={trait} delay={STAGE.traits + i * STAGE.traitStep} animate={introPlaying} style={styles.traitChip}>
                <StarIcon size={12} color={t.accent} />
                <Text style={styles.traitText}>{sentenceCase(trait)}</Text>
              </PopIn>
            ))}
          </View>
          <View style={styles.bulletList}>
            {selectedMode.bullets.map((bullet, i) => (
              <SlideDown
                key={bullet}
                delay={STAGE.bullets + i * STAGE.bulletStep} animate={introPlaying}
                style={styles.bulletRow}
              >
                {/* A tick, not a dot: these are what the mode GIVES you, and a check says that where
                    a bullet only separates lines. */}
                <CheckIcon size={15} color={t.success} />
                <Text style={styles.bulletText}>{bullet}</Text>
              </SlideDown>
            ))}
          </View>
          {saveError ? <Text style={styles.saveErrorText}>{saveError}</Text> : null}
          <PopIn delay={STAGE.confirm} animate={introPlaying} style={styles.confirmWrap}>
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

      <SlideDown
        delay={STAGE.tabs} animate={introPlaying}
        style={[
          styles.modeTabs,
          {
            // 38 to match the content column's own inset, so the tab row lines up with the copy above it rather than running wider than everything else on the screen.
            left: 38 + Math.max(safe.raw.left, SCREEN_SIDE_MARGIN),
            right: 38 + Math.max(safe.raw.right, SCREEN_SIDE_MARGIN),
            bottom: 26 + Math.max(safe.raw.bottom, SCREEN_VERTICAL_MARGIN),
          },
        ]}
      >
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
              <Text style={[styles.modeTabText, isSelected && styles.modeTabTextSelected]}>
                {mode.title}
              </Text>
              {isRecommended ? <Text style={styles.modeTabRecommended}>Recommended</Text> : null}
            </Pressable>
          );
        })}
      </SlideDown>

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
              {/* contain, not the Image default of cover: this art is a whole little SCENE — the
                  mascot, the board, the screw and its motion lines — and cropping it to fill a
                  square cuts the tool off the picture. The old portrait was a bust, so cover
                  happened to suit it. */}
              <Image source={mascotAtWork} style={styles.smallMascot} resizeMode="contain" />
            </View>
          </Animated.View>
        </View>
      )}
      </View>
    </SceneBackdrop>
  );
}

// k is the device UI scale (see useUiScale): these layouts are authored in phone points,
// and a tablet needs the same proportions at a larger size, not the same numbers.
const makeStyles = (t: Theme, k = 1) =>
  StyleSheet.create({
    // The full-bleed layer. No padding here, ever: it is what the gradient measures against.
    screen: { flex: 1, backgroundColor: BG_FALLBACK },
    root: {
      flex: 1,
      paddingHorizontal: Math.round(38 * k),
      paddingVertical: Math.round(18 * k),
    },
    header: {
      position: "absolute",
      zIndex: 10,
      flexDirection: "row",
      gap: Math.round(18 * k),
    },
    navButton: {
      width: Math.round(56 * k),
      height: Math.round(44 * k),
      alignItems: "center",
      justifyContent: "center",
    },
    navArrow: { width: Math.round(26 * k), height: Math.round(26 * k) },
    recommendationLayout: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      gap: Math.round(34 * k),
      paddingBottom: Math.round(82 * k),
    },
    audioButton: { position: "absolute", zIndex: 5 },
    // A column, not a card: width comes from the circle, and nothing draws a box around it.
    sparkLayer: { ...StyleSheet.absoluteFillObject },
    // Narrower than the copy column: a full-width primary action read as a banner rather than a button, and the halo needs room to swell without touching the text above it.
    confirmWrap: { alignSelf: "center", width: Math.round(260 * k), marginTop: SPACE.lg, alignItems: "center" },
    // stretch + auto margin puts the title on the column's BASE, which is where the Confirm button sits in the column beside it — so the two land on the same line.
    modeColumn: { width: Math.round(220 * k), alignItems: "center", alignSelf: "stretch", paddingTop: Math.round(12 * k) },
    avatarCircle: {
      width: Math.round(210 * k),
      height: Math.round(210 * k),
      alignItems: "center",
      justifyContent: "center",
      borderRadius: Math.round(105 * k),
      overflow: "hidden",
      // The gradient above paints the disc; this is only what shows outside its bounds.
      backgroundColor: AVATAR_CIRCLE,
    },
    // Sized INSIDE the circle now (was 232 in a 210 circle, which relied on the crop). With contain
    // the art fits the box, so the box has to sit within the rim or the character floats in a gap.
    avatarImage: {
      width: Math.round(196 * k),
      height: Math.round(196 * k),
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
      fontFamily: FONT, fontSize: Math.round(9 * k),
      fontWeight: "900",
    },
    recommendationCopy: {
      flex: 1,
      minWidth: Math.round(0 * k),
      gap: Math.round(7 * k),
    },
    title: {
      color: t.text,
      fontFamily: FONT, fontSize: Math.round(20 * k),
      fontWeight: "900",
      lineHeight: Math.round(24 * k),
    },
    // Space above the primary action, so it is not the next thing after the last tick — a gap is what makes it read as the conclusion rather than a fourth list item.
    confirmButton: { width: "100%" },
    traitRow: { flexDirection: "row", flexWrap: "wrap", gap: SPACE.sm },
    traitChip: {
      flexDirection: "row",
      alignItems: "center",
      gap: Math.round(5 * k),
      paddingHorizontal: SPACE.sm,
      paddingVertical: Math.round(3 * k),
      borderRadius: RADIUS.pill,
      backgroundColor: t.surface,
    },
    traitText: {
      color: t.text,
      fontFamily: FONT,
      fontSize: Math.round(13 * k),
      fontWeight: "800",
    },
    bulletList: {
      gap: Math.round(5 * k),
    },
    bulletRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: Math.round(9 * k),
    },
    bulletText: {
      flex: 1,
      color: t.text,
      fontFamily: FONT, fontSize: Math.round(13 * k),
      fontWeight: "700",
    },
    // Offsets come from the CALL SITE, not from here: absolute children are not inset by the parent's padding, so a literal here can never account for a device's safe insets.
    modeTabs: {
      position: "absolute",
      height: Math.round(56 * k),
      flexDirection: "row",
      gap: SPACE.sm,
    },
    modeTab: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      borderColor: t.border,
      borderRadius: Math.round(8 * k),
      borderWidth: 2,
      backgroundColor: t.surface,
      paddingHorizontal: SPACE.sm,
      paddingVertical: Math.round(5 * k),
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
      fontFamily: FONT, fontSize: Math.round(9 * k),
      fontWeight: "900",
      marginTop: Math.round(1 * k),
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
      // The CALL SITE clamps this with an inline maxWidth — see POPUP_RIGHT. A maxWidth here could not: the sheet is run through scaleSheet, which would multiply the cap by the very k that overflows it.
      width: Math.round(620 * k),
      minHeight: Math.round(142 * k),
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "flex-end",
      // No rim. The shadow already lifts this off the dimmed screen behind it, and an outline on top of that was drawing a box around something already clearly separated.
      borderRadius: Math.round(28 * k),
      shadowColor: "#000",
      shadowOffset: { width: Math.round(0 * k), height: Math.round(8 * k) },
      shadowOpacity: 0.26,
      shadowRadius: 16,
    },
    noteCopy: {
      flex: 1,
      borderRadius: RADIUS.panel,
      backgroundColor: t.surface,
      paddingHorizontal: Math.round(20 * k),
      paddingVertical: SPACE.lg,
    },
    noteTitle: {
      color: t.text,
      fontFamily: FONT, fontSize: Math.round(21 * k),
      fontWeight: "900",
      marginBottom: Math.round(5 * k),
    },
    noteText: {
      color: t.text,
      fontFamily: FONT, fontSize: Math.round(14 * k),
      fontWeight: "700",
      lineHeight: Math.round(19 * k),
    },
    taskActions: {
      flexDirection: "row",
      gap: Math.round(10 * k),
      marginTop: SPACE.md,
    },
    smallMascotCircle: {
      width: Math.round(88 * k),
      height: Math.round(88 * k),
      alignItems: "center",
      justifyContent: "center",
      borderColor: t.accent,
      borderRadius: Math.round(44 * k),
      borderWidth: 1,
      backgroundColor: t.surface,
      marginLeft: -8,
    },
    // 78, not 62: the artwork is padded to a square so nothing is cropped, so more of its box is
    // empty than the old bust's was. Sized up to keep the same amount of drawn mark inside the same
    // 88 circle. No borderRadius — it rounded the corners of a picture that no longer has any.
    smallMascot: {
      width: Math.round(78 * k),
      height: Math.round(78 * k),
    },
  });