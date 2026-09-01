import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { StyleSheet, Image, ScrollView, Text, View } from "react-native";
import { Pressable } from "@/src/components/Pressable";
import type { StyleProp, ViewStyle } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";

import { CatalogThumb } from "@/src/components/CatalogThumb";
import { COIN_ICON } from "@/src/components/iconAssets";
import type { BuildRewardAmount } from "@/src/data/core/repos";
import { isSurfaceCategory } from "@/src/data/shop/items";
import { useGameStore } from "@/src/game/core/store";
import { usePrefsStore } from "@/src/game/core/prefsStore";
import { modelThumbSet } from "@/src/game/core/presentation/finish";
import { useScaledStyles, FONT } from "@/src/game/ui/system/theme";
import { useCelebrationScale } from "./celebrationScale";
import { useRepos } from "@/src/data";
import { usePlacementStore } from "@/src/room/core/placement";
import { ConfettiRain } from "@/src/game/ui/celebration/Confetti";
import { SCREEN_VERTICAL_MARGIN, useSafeInsets } from "@/src/hooks/use-safe-insets";
import type { Theme } from "@/src/game/ui/system/theme";
import { playSfx } from "@/src/game/audio/sfx";

const RIBBON_W = 200;

const REWARD_ICON_SIZE = 26;
const RIBBON_H = Math.round(RIBBON_W * (218 / 900));
const REVEAL_MS = 520;

const SPARKS = [
  { x: 0.14, y: -6, size: 5, delay: 200 },
  { x: 0.3, y: RIBBON_H - 4, size: 4, delay: 300 },
  { x: 0.45, y: -9, size: 6, delay: 380 },
  { x: 0.58, y: RIBBON_H - 2, size: 4, delay: 460 },
  { x: 0.72, y: -5, size: 5, delay: 540 },
  { x: 0.88, y: RIBBON_H - 6, size: 6, delay: 620 },
];
const SPARK_COLORS = ["#F0E6D2", "#E8C878", "#FFFFFF"];

function Spark({ x, y, size, delay, color }: { x: number; y: number; size: number; delay: number; color: string }) {
  const pop = useSharedValue(0);
  useEffect(() => {
    pop.value = withDelay(
      delay,
      withSequence(withTiming(1, { duration: 200 }), withTiming(0, { duration: 420 })),
    );
  }, [delay, pop]);
  const anim = useAnimatedStyle(() => ({
    opacity: pop.value,
    transform: [
      { translateY: -9 * pop.value },
      { scale: 0.4 + pop.value * 0.9 },
      { rotate: `${45 + pop.value * 90}deg` },
    ],
  }));
  return (
    <Animated.View
      style={[
        { position: "absolute", left: x, top: y, width: size, height: size, backgroundColor: color },
        anim,
      ]}
    />
  );
}

const STAGE = {
  ribbon: 140,
  piece: 780,
  reward: 1010,
  xp: 1190,
  actions: 1380,
  confetti: 1760,
} as const;

const SCRIM = "rgba(10,8,9,0.88)";

const MAUVE = "#A97480";

function PopIn({ delay, style, children }: { delay: number; style?: StyleProp<ViewStyle>; children: ReactNode }) {
  const on = useSharedValue(0);
  useEffect(() => {
    on.value = withDelay(delay, withSpring(1, { damping: 11, stiffness: 170, mass: 0.7 }));
  }, [delay, on]);
  const anim = useAnimatedStyle(() => ({
    opacity: Math.min(1, on.value * 3),
    transform: [{ scale: 0.7 + on.value * 0.3 }],
  }));
  return <Animated.View style={[style, anim]}>{children}</Animated.View>;
}

function SlideIn({ delay, style, children }: { delay: number; style?: StyleProp<ViewStyle>; children: ReactNode }) {
  const on = useSharedValue(0);
  useEffect(() => {
    on.value = withDelay(delay, withTiming(1, { duration: 330, easing: Easing.out(Easing.cubic) }));
  }, [delay, on]);
  const anim = useAnimatedStyle(() => ({
    opacity: on.value,
    transform: [{ translateX: 38 * (1 - on.value) }],
  }));
  return <Animated.View style={[style, anim]}>{children}</Animated.View>;
}

function CompletedRibbon({ label }: { label: string }) {
  const k = useCelebrationScale();
  const styles = useScaledStyles(makeStyles, k);
  const ribbonW = RIBBON_W * k;
  const reveal = useSharedValue(0);
  useEffect(() => {
    reveal.value = withDelay(STAGE.ribbon, withTiming(1, { duration: REVEAL_MS, easing: Easing.out(Easing.cubic) }));
  }, [reveal]);
  const clip = useAnimatedStyle(() => ({ width: ribbonW * reveal.value }));
  return (
    <View style={styles.ribbonWrap} pointerEvents="none">
      <Animated.View style={[styles.ribbonClip, clip]}>
        <View style={styles.ribbonInner}>
          <Image
            source={require("@/src/assets/ui/ribbon-completed.png")}
            style={styles.ribbonImg}
            resizeMode="contain"
          />
          <Text style={styles.ribbonText}>{label}</Text>
        </View>
      </Animated.View>
      {SPARKS.map((sp, i) => (
        <Spark
          key={i}
          x={sp.x * ribbonW}
          y={sp.y * k}
          size={sp.size * k}
          delay={sp.delay}
          color={SPARK_COLORS[i % SPARK_COLORS.length]}
        />
      ))}
    </View>
  );
}

export function BuildComplete() {
  const k = useCelebrationScale();
  const styles = useScaledStyles(makeStyles, k);
  const rewardIconSize = Math.round(REWARD_ICON_SIZE * k);
  const router = useRouter();
  const repos = useRepos();
  const furniture = useGameStore((s) => s.furniture);
  const renderStyle = usePrefsStore((s) => s.renderStyle);
  const completed = useGameStore((s) => s.completed);
  const dismissed = useGameStore((s) => s.doneDismissed);
  const confirmed = useGameStore((s) => s.completeConfirmed);
  const [reward, setReward] = useState<BuildRewardAmount>({ coins: 0, xp: 0 });
  const safe = useSafeInsets();

  const furnitureId = furniture?.meta.id ?? null;
  useEffect(() => {
    if (!furnitureId) return;
    let alive = true;
    repos.builds
      .buildReward(furnitureId)
      .then((r) => alive && setReward(r))
      .catch((err) => console.warn("[BuildComplete] reward lookup failed", err));
    return () => {
      alive = false;
    };
  }, [furnitureId, repos]);

  const total = furniture?.actions.length ?? 0;
  const isDone = total > 0 && completed.length >= total;
  const celebrating = isDone && !dismissed && confirmed;
  useEffect(() => {
    if (celebrating) playSfx("complete");
  }, [celebrating]);

  if (!furniture) return null;
  if (!isDone || dismissed || !confirmed) return null;

  const { coins, xp, item: rewardItem } = reward;
  const goToInventory = () => {
    router.replace({ pathname: "/room", params: { open: "inventory" } });
  };
  const placeInRoom = () => {
    if (!furnitureId || !usePlacementStore.getState().startPlacing(furnitureId)) {
      goToInventory();
      return;
    }
    router.replace("/room");
  };

  return (
    <View
      style={[
        styles.scrim,
        {
          paddingTop: Math.max(safe.raw.top, SCREEN_VERTICAL_MARGIN),
          paddingBottom: Math.max(safe.raw.bottom, SCREEN_VERTICAL_MARGIN),
        },
      ]}
    >
      <View style={styles.stack}>
        <CompletedRibbon label="Completed!" />
      <View style={styles.card}>
        <Pressable
          style={[styles.redoBtn, { top: 12 * k, left: 14 * k }]}
          onPress={() => {
            useGameStore.getState().setCompleteConfirmed(false);
            useGameStore.getState().setDoneDismissed(false);
            useGameStore.getState().reset();
          }}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Redo the assembly from the start"
        >
          <Image
            source={require("@/src/assets/ui/icons/icon-redo.png")}
            style={styles.redoIcon}
            resizeMode="contain"
          />
        </Pressable>

        <ScrollView
          contentContainerStyle={styles.body}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.mainRow}>
            <PopIn delay={STAGE.piece} style={styles.pieceWrap}>
              <Image
                source={modelThumbSet(furniture, renderStyle).light}
                style={styles.previewImg}
                resizeMode="contain"
              />
            </PopIn>

            <View style={styles.panels}>
              <SlideIn delay={STAGE.reward} style={styles.panel}>
                <Text style={styles.panelKicker}>COMPLETION REWARD:</Text>
                <View style={styles.rewardRow}>
                  <View style={styles.rewardItem}>
                    <Image
                      source={COIN_ICON}
                      style={styles.rewardIcon}
                      resizeMode="contain"
                    />
                    <Text style={styles.rewardText}>+ {coins} coins</Text>
                  </View>
                  {rewardItem ? (
                    <View style={styles.rewardItem}>
                      <View style={{ width: rewardIconSize, height: rewardIconSize }}>
                        <CatalogThumb source="bought" itemId={rewardItem.id} surface={isSurfaceCategory(rewardItem.category)} size={rewardIconSize} />
                      </View>
                      <Text style={styles.rewardText}>{rewardItem.name}</Text>
                    </View>
                  ) : null}
                </View>
              </SlideIn>

              <SlideIn delay={STAGE.xp} style={styles.panel}>
                <Text style={styles.panelKicker}>TOTAL EXPERIENCE GAINED</Text>
                <View style={styles.xpRow}>
                  <Text style={styles.xpText}>+{xp}</Text>
                  <Image
                    source={require("@/src/assets/ui/icons/icon-xp.png")}
                    style={styles.xpIcon}
                    resizeMode="contain"
                  />
                </View>
              </SlideIn>

              <PopIn delay={STAGE.actions} style={styles.actionsRow}>
                <Pressable
                  style={styles.action}
                  onPress={placeInRoom}
                  accessibilityLabel="Place it in the room"
                >
                  <Image
                    source={require("@/src/assets/ui/icons/icon-home.png")}
                    style={styles.actionIcon}
                    resizeMode="contain"
                  />
                  <Text style={styles.actionText}>Place in Room</Text>
                </Pressable>
                <Pressable
                  style={styles.action}
                  onPress={goToInventory}
                  accessibilityLabel="Put it in your inventory"
                >
                  <Image
                    source={require("@/src/assets/ui/icons/Inventory-icon.png")}
                    style={styles.actionIcon}
                    resizeMode="contain"
                  />
                  <Text
                    style={styles.actionText}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.8}
                  >
                    Put in Inventory
                  </Text>
                </Pressable>
              </PopIn>
            </View>
          </View>
        </ScrollView>
      </View>
      </View>
      <ConfettiRain delay={STAGE.confetti} size={k} />
    </View>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    scrim: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: SCRIM,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 12,
      zIndex: 45,
    },
    stack: { width: "100%", maxWidth: 520, maxHeight: "96%", alignItems: "center" },
    ribbonWrap: { width: RIBBON_W, height: RIBBON_H, marginBottom: -RIBBON_H * 0.42, zIndex: 2 },
    ribbonClip: { height: RIBBON_H, overflow: "hidden" },
    ribbonInner: { width: RIBBON_W, height: RIBBON_H, alignItems: "center", justifyContent: "center" },
    ribbonImg: { width: RIBBON_W, height: RIBBON_H },
    ribbonText: {
      position: "absolute",
      top: "13.2%",
      fontFamily: FONT,
      fontSize: 14,
      fontWeight: "800",
      color: "#FFFFFF",
      textAlign: "center",
    },
    card: {
      width: "100%",
      maxWidth: 520,
      backgroundColor: "#FBF8F3",
      borderRadius: 22,
      borderWidth: 3,
      borderColor: MAUVE,
      paddingTop: 26,
      paddingBottom: 12,
      paddingHorizontal: 18,
    },

    redoBtn: {
      position: "absolute",
      width: 30,
      height: 30,
      alignItems: "center",
      justifyContent: "center",
      zIndex: 3,
    },
    redoIcon: { width: 24, height: 24 },

    body: { paddingBottom: 2 },

    mainRow: { flexDirection: "row", gap: 16, alignItems: "center" },
    pieceWrap: { flex: 1.25, height: 196, alignItems: "center", justifyContent: "center" },
    previewImg: { width: "100%", height: "100%" },

    panels: { flex: 1, maxWidth: 208, gap: 8 },
    panel: {
      backgroundColor: t.surface,
      borderRadius: 12,
      borderWidth: StyleSheet.hairlineWidth * 2,
      borderColor: t.border,
      paddingVertical: 10,
      paddingHorizontal: 12,
      alignItems: "center",
    },
    panelKicker: {
      fontFamily: FONT, fontSize: 9.5,
      fontWeight: "800",
      letterSpacing: 0.5,
      color: t.textDim,
      marginBottom: 8,
    },
    rewardRow: { flexDirection: "row", gap: 18 },
    rewardItem: { alignItems: "center", gap: 4, maxWidth: 84 },
    rewardIcon: { width: REWARD_ICON_SIZE, height: REWARD_ICON_SIZE },
    rewardText: {
      fontFamily: FONT, fontSize: 10,
      fontWeight: "700",
      color: t.text,
      textAlign: "center",
    },
    xpRow: { flexDirection: "row", alignItems: "center", gap: 6 },
    xpText: { fontFamily: FONT, fontSize: 17, fontWeight: "800", color: t.text },
    xpIcon: { width: 18, height: 18 },

    actionsRow: { flexDirection: "row", justifyContent: "space-around", gap: 12, marginTop: 2 },
    action: { alignItems: "center", gap: 3, flex: 1, maxWidth: 116 },
  actionIcon: { width: 30, height: 30, marginBottom: 2 },
    actionText: {
      fontFamily: FONT, fontSize: 11,
      fontWeight: "700",
      color: t.text,
      textAlign: "center",
    },
  });