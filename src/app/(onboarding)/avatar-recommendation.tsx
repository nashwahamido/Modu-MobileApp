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

const TAB_ROW_RESERVE = 118;

const STAGE = {
  avatar: 140,
  spark: 260,
  title: 1400,
  traits: 1800,
  traitStep: 130,
  bullets: 2200,
  bulletStep: 150,
  confirm: 2900,
  tabs: 3200,
} as const;

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
    opacity: Math.min(1, on.value * 3),
    transform: [{ scale: from + on.value * (1 - from) }],
  }));
  if (!animate) return <View style={style}>{children}</View>;
  return <Reanimated.View style={[style, anim]}>{children}</Reanimated.View>;
}

function SlideDown({
  delay,
  style,
  animate = true,
  children,
}: {
  delay: number;
  style?: StyleProp<ViewStyle>;
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
  if (!animate) return <View style={style}>{children}</View>;
  return <Reanimated.View style={[style, anim]}>{children}</Reanimated.View>;
}

function Spark({ x, y, size, delay }: { x: number; y: number; size: number; delay: number }) {
  const pop = useSharedValue(0);
  useEffect(() => {
    pop.value = withDelay(delay, withTiming(1, { duration: 780, easing: Easing.out(Easing.quad) }));
  }, [delay, pop]);
  const anim = useAnimatedStyle(() => ({
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

const AVATAR_CIRCLE = "#EFE6D6";
const backdrop = require("@/src/assets/ui/profile-backdrop.jpg");

const BG_FALLBACK = "#E9E6DF";

function sentenceCase(s: string): string {
  const t = s.trim();
  return t ? t[0].toUpperCase() + t.slice(1) : t;
}

const mascotAtWork = require("../../assets/images/mascot/modu-tool.png");
const homeRoute = "/room" as Href;

const modes = avatarModes.map((mode) => ({
  ...mode,
  image: AVATAR_IMAGES[mode.id],
}));

const POPUP_RIGHT = 92;
const TABLET_RECOMMENDATION_STACK_GAP = 22;

export default function AvatarRecommendationScreen() {
  const k = useUiScale();
  const isTablet = useIsTablet();
  const styles = useStyles(makeStyles);
  const t = useTheme();
  const [introPlaying, setIntroPlaying] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setIntroPlaying(false), STAGE.tabs + 900);
    return () => clearTimeout(t);
  }, []);
  useEffect(() => {
    const cue = setTimeout(() => playSfx("recommendation"), STAGE.avatar);
    return () => clearTimeout(cue);
  }, []);
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
  const safe = useScreenInsets();
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
      <View style={styles.modeColumn}>
        <PopIn delay={STAGE.avatar} big animate={introPlaying}>
          <View style={styles.avatarCircle}>
            <Svg style={StyleSheet.absoluteFill} pointerEvents="none">
              <Defs>
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
              resizeMode="contain"
            />
          </View>
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
              left: 38 + safe.left,
              right: 38 + safe.right,
              bottom: 28 * k + safe.bottom,
            },
      ]}
    >
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
            <Image
              source={require("@/src/assets/ui/icons/arrow-back.png")}
              style={styles.navArrow}
              resizeMode="contain"
            />
          </Pressable>
        </View>

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

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: BG_FALLBACK },
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
      paddingBottom: TAB_ROW_RESERVE,
    },
    recommendationLayoutTablet: {
      flex: 0,
      paddingBottom: 0,
      paddingTop: 18,
    },
    audioButton: { position: "absolute", zIndex: 5 },
    sparkLayer: { ...StyleSheet.absoluteFillObject },
    confirmWrap: {
      alignSelf: "center",
      width: 260,
      marginTop: SPACE.lg,
      alignItems: "center",
    },
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
      backgroundColor: AVATAR_CIRCLE,
    },
    avatarImage: {
      width: 196,
      height: 196,
    },
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
      width: 620,
      minHeight: 142,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "flex-end",
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
    smallMascot: {
      width: 78,
      height: 78,
    },
  });