import { Fragment, useEffect, useRef, useState } from "react";
import { useRouter } from "expo-router";
import { Animated, Easing, Image, ScrollView, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { Pressable } from "@/src/components/Pressable";
import {
  actionCluster,
  clusterComplete,
  clusterLabel,
  clusterPrereqsMet,
  combineReady,
  focusableClusterIds,
  requiresClusterFocus,
} from "@/src/game/core/evaluation/clusters";
import { HudSpotTarget } from "@/src/game/ui/hud/hudSpotlight";
import { useGameStore } from "@/src/game/core/store";
import { usePrefsStore } from "@/src/game/core/prefsStore";
import { clusterThumbSet, modelThumbSet } from "@/src/game/core/presentation/finish";
import Svg, { Circle as SvgCircle, Defs, RadialGradient, Stop } from "react-native-svg";
import { COIN_ICON } from "@/src/components/iconAssets";
import { ChevronIcon } from "@/src/components/Icons";
import { Theme, useFixedStyles, useScaledStyles, useUiScale, FONT, RADIUS, SIZE, useIsTablet } from "@/src/game/ui/system/theme";
import { useMirror } from "@/src/game/ui/system/handedness";
import { useRepos } from "@/src/data";
import { useCatalogRow } from "@/src/data/catalog/buildStore";
import { HUD_SIDE_MARGIN, HUD_VERTICAL_MARGIN } from "@/src/hooks/use-safe-insets";
import type { ClusterId } from "@/src/game/core/type";
import * as Haptics from "expo-haptics";

function TapCue({ label, resuming, k }: { label: string; resuming: boolean; k: number }) {
  const s = useScaledStyles(makeCueStyles, k);
  return (
    <View
      pointerEvents="none"
      style={[s.wrap, { top: (CIRCLE - PILL_H / 2) * k }, resuming && s.wrapResume]}
    >
      <Text style={s.text}>{label}</Text>
    </View>
  );
}

const PANEL_CREAM = "#FBF8F3";

const CIRCLE = 92;
const PILL_H = 22;

const RESUME_BLUE = "#A9BFD9";

const makeCueStyles = () =>
  StyleSheet.create({
    wrap: {
      position: "absolute",
      height: PILL_H,
      zIndex: 3,
      paddingHorizontal: 12,
      justifyContent: "center",
      borderRadius: 999,
      backgroundColor: "#8D7BA8",
    },
    wrapResume: { backgroundColor: RESUME_BLUE },
    text: {
      color: "#FBF8F3",
      fontFamily: FONT,
      fontSize: 11,
      fontWeight: "900",
      letterSpacing: 0.3,
      lineHeight: PILL_H,
      includeFontPadding: false,
      textAlign: "center",
    },
  });

function PulseRing({ style }: { style: StyleProp<ViewStyle> }) {
  const t = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(t, {
        toValue: 1,
        duration: 1700,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [t]);
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        style,
        {
          opacity: t.interpolate({ inputRange: [0, 1], outputRange: [0.6, 0] }),
          transform: [
            { scale: t.interpolate({ inputRange: [0, 1], outputRange: [1, 1.22] }) },
          ],
        },
      ]}
    />
  );
}

interface BuildMapProps {
  overviewOnly?: boolean;
}

export function BuildMap({ overviewOnly = false }: BuildMapProps = {}) {
  const k = useUiScale();
  const styles = useScaledStyles(makeStyles, k);
  const isTablet = useIsTablet();
  const router = useRouter();
  const furniture = useGameStore((s) => s.furniture);
  const completed = useGameStore((s) => s.completed);
  const activeCluster = useGameStore((s) => s.activeCluster);
  const renderStyle = usePrefsStore((s) => s.renderStyle);
  const mapOpen = useGameStore((s) => s.mapOpen);
  const mapSeen = useGameStore((s) => s.mapSeen);
  const repos = useRepos();

  const furnitureId = furniture?.meta.id ?? null;
  const catalogRow = useCatalogRow(furnitureId);
  const [reward, setReward] = useState({ coins: 0, xp: 0 });
  useEffect(() => {
    if (!furnitureId) return;
    let alive = true;
    repos.builds
      .buildReward(furnitureId)
      .then((r) => alive && setReward(r))
      .catch((err) => console.warn("[BuildMap] reward lookup failed", err));
    return () => {
      alive = false;
    };
  }, [furnitureId, repos]);

  if (!furniture) return null;

  const styledThumb = modelThumbSet(furniture, renderStyle).light;

  const done = new Set(completed);
  const clusters = focusableClusterIds(furniture);

  const mustChoose = requiresClusterFocus(furniture) && !activeCluster && !combineReady(furniture, done);
  const intro = clusters.length === 0 && !mapSeen;
  const showMap = overviewOnly ? mapOpen : mustChoose || intro || mapOpen;

  const selectCluster = (clusterId: ClusterId) => {
    useGameStore.getState().setActiveCluster(clusterId);
    useGameStore.getState().setMapOpen(false);
    useGameStore.getState().setMapSeen(true);
    Haptics.selectionAsync();
  };
  const closeMap = () => {
    useGameStore.getState().setMapOpen(false);
    useGameStore.getState().setMapSeen(true);
  };

  if (showMap) {
    const isCombine = (a: { type: string }) => a.type === "combineClusters";

    const clusterNodes = clusters.map((clusterId) => {
      const actions = furniture.actions.filter(
        (a) => actionCluster(furniture, a) === clusterId && !isCombine(a),
      );
      return {
        key: clusterId as string,
        label: clusterLabel(furniture, clusterId),
        actions,
        doneCount: actions.filter((a) => done.has(a.actionId)).length,
        thumb: clusterThumbSet(furniture, clusterId, renderStyle)?.light,
        finished: clusterComplete(furniture, clusterId, done),
        enabled: clusterPrereqsMet(furniture, clusterId, done),
        onPress: () => selectCluster(clusterId),
      };
    });

    const combineActions = furniture.actions.filter(
      (a) => isCombine(a) || actionCluster(furniture, a) == null,
    );
    const combineEnabled = combineReady(furniture, done);
    const combineDone = combineActions.filter((a) => done.has(a.actionId)).length;
    const combineOwner = combineActions.map((a) => actionCluster(furniture, a)).find(Boolean);

    const wholeNode = {
      key: "whole",
      label: clusterLabel(furniture, (Object.keys(furniture.clusters ?? {})[0] ?? "") as ClusterId),
      actions: [...furniture.actions],
      doneCount: furniture.actions.filter((a) => done.has(a.actionId)).length,
      thumb: styledThumb,
      finished: done.size >= furniture.actions.length,
      enabled: true,
      onPress: closeMap,
    };

    const nodes = clusters.length === 0 ? [wholeNode] : [
      ...clusterNodes,
      {
        key: "combine",
        label: "Combine",
        actions: combineActions,
        doneCount: combineDone,
        thumb: styledThumb,
        finished: combineActions.length > 0 && combineDone === combineActions.length,
        enabled: combineEnabled,
        onPress: () =>
          selectCluster((combineOwner ?? clusters[clusters.length - 1]) as ClusterId),
      },
    ];

    const words = (label: string) => label.toLowerCase().split(" ");
    const stacksLabel = (label: string) => {
      const mine = words(label);
      if (mine.length < 2) return false;
      return nodes.some(
        (other) => other.label !== label && words(other.label).some((w) => mine.includes(w)),
      );
    };

    const cardMax = (nodes.length >= 4 ? 620 : nodes.length === 3 ? 520 : 460) * k;
    const INNER = cardMax - 60 * k;
    const slot = NODE_SLOT * k;
    const nodeWidth = Math.min(116 * k, (INNER - (nodes.length - 1) * slot) / nodes.length);
    const circleSize = Math.round(CIRCLE * k);

    const totalSteps = furniture.actions.length;
    const pct = totalSteps ? Math.round((done.size / totalSteps) * 100) : 0;
    const { coins } = reward;
    const totalXp = overviewOnly
      ? furniture.actions.length * furniture.xpPerStep
      : reward.xp;

    return (
      <View style={styles.scrim}>
        <View style={[styles.card, { maxWidth: cardMax }, isTablet && { paddingVertical: CARD_VPAD * k * TABLET_VPAD_LIFT }]}>
          <View style={styles.titleRow}>
            <Pressable
              style={({ pressed }) => [
                styles.home,
                !isTablet && styles.homePhone,
                pressed && { opacity: 0.6 },
              ]}
              onPress={() => router.dismissTo("/catalogue")}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Back to the catalogue"
            >
              <View style={styles.homeChevron}>
                <ChevronIcon size={Math.round(13 * k)} color={INK} up />
              </View>
              <Text style={styles.homeText}>Catalogue</Text>
            </Pressable>
            <Text style={styles.title}>{catalogRow?.name ?? ""}</Text>
          </View>

          {overviewOnly ? (
            <View style={styles.overviewHero} pointerEvents="none">
              <View style={styles.overviewHalo}>
                <Image
                  source={styledThumb}
                  style={styles.overviewImage}
                  resizeMode="contain"
                />
              </View>
            </View>
          ) : (
          <View style={styles.nodeRow}>
            <View
              style={[
                styles.connectorLayer,
                {
                  width: nodes.length * nodeWidth + (nodes.length - 1) * slot,
                  marginLeft: -(nodes.length * nodeWidth + (nodes.length - 1) * slot) / 2,
                },
              ]}
              pointerEvents="none"
            >
              {nodes.map((n, i) =>
                i === 0 ? null : (
                  <View
                    key={`link-${n.key}`}
                    style={[
                      styles.connectorLine,
                      {
                        left:
                          (i - 1) * (nodeWidth + slot) + nodeWidth + slot / 2 - (CONNECTOR_LEN * k) / 2,
                        top: CONNECTOR_TOP * k,
                      },
                      i % 2 === 1 ? styles.connectorDown : styles.connectorUp,
                    ]}
                  />
                ),
              )}
            </View>
            {nodes.map((n, i) => (
              <Fragment key={n.key}>
                {i > 0 ? <View style={styles.connectorSlot} /> : null}
                <Pressable
                  disabled={!n.enabled}
                  onPress={n.onPress}
                  style={[
                    styles.node,
                    { width: nodeWidth },
                    i % 2 === 1 && styles.nodeLow,
                  ]}
                  accessibilityLabel={`${n.label}, ${n.doneCount} of ${n.actions.length} steps`}  /* the count lives here now: read aloud, not drawn */
                >
                  {n.enabled && !n.finished ? (
                    <TapCue label={n.doneCount > 0 ? "Resume" : "Start"} resuming={n.doneCount > 0} k={k} />
                  ) : null}
                  {n.enabled && !n.finished ? (
                    <PulseRing
                      style={[styles.pulseRing, n.doneCount > 0 && styles.pulseRingResume]}
                    />
                  ) : null}
                  {n.finished ? (
                    <>
                      <View style={styles.doneRing} pointerEvents="none" />
                      <Image
                        source={require("@/src/assets/ui/icons/icon-success.png")}
                        style={[styles.doneCheck, { bottom: 14 * k, left: 6 * k }]}
                        resizeMode="contain"
                      />
                    </>
                  ) : null}
                  <View
                    style={[
                      styles.circle,
                      n.finished && styles.circleFinished,
                      !n.enabled && !n.finished && styles.circleLocked,
                    ]}
                  >
                    <Svg width={circleSize} height={circleSize} style={StyleSheet.absoluteFill}>
                      <Defs>
                        <RadialGradient id={`halo-${n.key}`} cx="50%" cy="42%" r="65%">
                          <Stop offset="0" stopColor="#FBF8F3" />
                          <Stop
                            offset="1"
                            stopColor={!n.enabled && !n.finished ? "#E6E0D5" : "#D9D0C2"}
                          />
                        </RadialGradient>
                      </Defs>
                      <SvgCircle
                        cx={circleSize / 2}
                        cy={circleSize / 2}
                        r={circleSize / 2}
                        fill={`url(#halo-${n.key})`}
                      />
                    </Svg>
                    {n.thumb ? (
                      <Image
                        source={n.thumb}
                        style={[
                          styles.nodeThumb,
                          !n.enabled && !n.finished && styles.dimmed,
                        ]}
                        resizeMode="contain"
                      />
                    ) : null}
                    <View
                      style={[styles.nodeLabelBox, { left: 4 * k, right: 4 * k, bottom: 12 * k }]}
                      pointerEvents="none"
                    >
                      <Text
                        style={[styles.nodeLabel, !n.enabled && !n.finished && styles.nodeLabelLocked]}
                        numberOfLines={2}
                      >
                        {stacksLabel(n.label) ? n.label.split(" ").join("\n") : n.label}
                      </Text>
                    </View>
                  </View>

                </Pressable>
              </Fragment>
            ))}
          </View>
          )}

          <View style={styles.progressRow}>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${pct}%` }]} />
              <Text
                style={[
                  styles.progressLabel,
                  pct >= 50 && styles.progressLabelOnFill,
                ]}
              >
                {pct}% completed
              </Text>
            </View>
          </View>

          <View style={styles.reward}>
            <View style={styles.rewardHeaderRow}>
              <Image
                source={require("@/src/assets/ui/icons/icon-award.png")}
                style={styles.awardIcon}
                resizeMode="contain"
              />
              <View style={styles.rewardBanner}>
                <Text style={styles.rewardKicker}>REWARDS</Text>
              </View>
            </View>
            <View style={styles.rewardRow}>
              <View style={styles.rewardTile}>
                <Image source={COIN_ICON} style={styles.rewardCoin} resizeMode="contain" />
                <Text style={styles.rewardText}>+ {coins}</Text>
              </View>
              <View style={styles.rewardTile}>
                <View style={styles.itemWell}>
                  <Text style={styles.itemGlyph}>?</Text>
                </View>
                <Text style={styles.rewardText}>+1 item</Text>
              </View>
              <View style={styles.rewardTile}>
                <Image
                  source={require("@/src/assets/ui/icons/icon-xp.png")}
                  style={styles.xpIcon}
                  resizeMode="contain"
                />
                <Text style={styles.rewardText}>+ {totalXp}</Text>
              </View>
            </View>
          </View>
        </View>
      </View>
    );
  }

  return null;
}

const MAP_RAISED_SCALE = 1.08;

export function MapButton() {
  const styles = useFixedStyles(makeStyles);
  const m = useMirror();
  const furniture = useGameStore((s) => s.furniture);
  const setMapOpen = useGameStore((s) => s.setMapOpen);
  const mapOpen = useGameStore((s) => s.mapOpen);
  const [held, setHeld] = useState(false);

  const raised = held || mapOpen;
  const lift = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    Animated.spring(lift, {
      toValue: raised ? MAP_RAISED_SCALE : 1,
      useNativeDriver: true,
      damping: 14,
      stiffness: 220,
      mass: 0.6,
    }).start();
  }, [raised, lift]);

  if (!furniture) return null;
  return (
    <HudSpotTarget id="map" style={m(styles.mapSlot)}>
      <Animated.View style={{ transform: [{ scale: lift }] }}>
        <Pressable
          style={styles.mapButton}
          onPressIn={() => setHeld(true)}
          onPressOut={() => setHeld(false)}
          onPress={() => {
            setMapOpen(true);
            Haptics.selectionAsync();
          }}
          accessibilityRole="button"
          accessibilityState={{ expanded: mapOpen }}
          accessibilityLabel="Open the project map"
        >
          <Text style={styles.mapLabel}>Map</Text>
        </Pressable>
      </Animated.View>
    </HudSpotTarget>
  );
}

export function ClusterFocusControl() {
  const styles = useFixedStyles(makeStyles);
  const furniture = useGameStore((s) => s.furniture);
  const completed = useGameStore((s) => s.completed);
  const activeCluster = useGameStore((s) => s.activeCluster);

  if (!furniture || !requiresClusterFocus(furniture) || !activeCluster) return null;

  const done = new Set(completed);
  const clusters = focusableClusterIds(furniture);
  const selectCluster = (clusterId: ClusterId) => {
    useGameStore.getState().setActiveCluster(clusterId);
    Haptics.selectionAsync();
  };
  const selectedIndex = Math.max(0, clusters.indexOf(activeCluster));

  return (
    <View style={styles.switcher}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.stack}
        style={styles.stackScroll}
      >
        {clusters.map((clusterId, i) => {
          const selected = activeCluster === clusterId;
          const z = clusters.length - Math.abs(i - selectedIndex);
          const finished = clusterComplete(furniture, clusterId, done);
          const enabled = clusterPrereqsMet(furniture, clusterId, done);
          return (
            <Pressable
              key={clusterId}
              disabled={!enabled && !selected}
              onPress={() => selectCluster(clusterId)}
              style={[
                styles.disc,
                i > 0 && styles.discOverlap,
                { zIndex: z, elevation: z },
                finished && styles.discFinished,
                selected && styles.discSelected,
                !enabled && !selected && styles.discDisabled,
              ]}
            >
              <Text
                numberOfLines={1}
                style={[
                  styles.discText,
                  selected && styles.discTextSelected,
                  finished && !selected && styles.discTextFinished,
                ]}
              >
                {finished ? "✓ " : ""}
                {clusterLabel(furniture, clusterId)}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const INK = "#231F20";

const CONNECTOR_LEN = 140;

const CARD_VPAD = 10;

const TABLET_VPAD_LIFT = 2.2;

const NODE_SLOT = 24;

const CONNECTOR_TOP = 63 - 7;

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    scrim: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: t.scrim,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: HUD_SIDE_MARGIN,
      paddingVertical: HUD_VERTICAL_MARGIN + 10,
      zIndex: 30,
    },

    card: {
      width: "100%",
      maxHeight: "100%",
      backgroundColor: PANEL_CREAM,
      borderRadius: 22,
      paddingTop: CARD_VPAD,
      paddingBottom: CARD_VPAD,
      paddingHorizontal: 20,
      shadowColor: "#000",
      shadowOpacity: 0.3,
      shadowRadius: 20,
      shadowOffset: { width: 0, height: 10 },
      elevation: 12,
    },
    home: {
      position: "absolute",
      top: "50%",
      marginTop: -12,
      left: 0,
      zIndex: 3,
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      height: 24,
      paddingHorizontal: 10,
      borderRadius: 999,
      backgroundColor: "#CCC4D8",
    },
    homePhone: {
      height: 24,
      marginTop: -12,
      paddingHorizontal: 8,
    },
    homeChevron: { transform: [{ rotate: "-90deg" }] },
    homeText: {
      fontFamily: FONT,
      fontSize: 13,
      fontWeight: "700",
      color: INK,
    },
    titleRow: {
      position: "relative",
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      marginBottom: 10,
    },
    title: { fontFamily: FONT, fontSize: 18, fontWeight: "800", color: t.text },

    overviewHero: {
      height: 150,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 8,
    },
    overviewHalo: {
      width: 190,
      height: 142,
      borderRadius: 71,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: "#EEE8DD",
      shadowColor: "#000",
      shadowOpacity: 0.14,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 4 },
      elevation: 4,
    },
    overviewImage: { width: 154, height: 126 },

    nodeRow: {
      flexDirection: "row",
      alignItems: "flex-start",
      justifyContent: "center",
      paddingBottom: PILL_H / 2,
      marginBottom: 12,
    },
    connectorSlot: { width: 24 },
    connectorLayer: { position: "absolute", top: 0, bottom: 0, left: "50%", zIndex: 0 },
    connectorLine: {
      position: "absolute",
      width: CONNECTOR_LEN,
      height: 14,
      borderRadius: 7,
      backgroundColor: "rgba(35,31,32,0.06)",
    },
    connectorDown: { transform: [{ rotate: "13.7deg" }] },
    connectorUp: { transform: [{ rotate: "-13.7deg" }] },
    node: { alignItems: "center", width: 116, zIndex: 1 },
    nodeLow: { marginTop: 18 },
    circle: {
      width: 92,
      height: 92,
      borderRadius: 46,
      overflow: "hidden",
      alignItems: "center",
      justifyContent: "center",
      paddingBottom: 6,
      shadowColor: "#000",
      shadowOpacity: 0.18,
      shadowRadius: 5,
      shadowOffset: { width: 0, height: 3 },
      elevation: 4,
    },
    circleFinished: {},
    pulseRing: {
      position: "absolute",
      top: 0,
      alignSelf: "center",
      width: 92,
      height: 92,
      borderRadius: 46,
      borderWidth: 3,
      borderColor: "#8D7BA8",
      zIndex: 0,
    },
    doneRing: {
      position: "absolute",
      top: 0,
      alignSelf: "center",
      width: 92,
      height: 92,
      borderRadius: 46,
      borderWidth: 3,
      borderColor: "#8FA876",
      zIndex: 2,
    },
    pulseRingResume: { borderColor: RESUME_BLUE },
    doneCheck: {
      position: "absolute",
      bottom: 14,
      left: 6,
      width: 28,
      height: 28,
      zIndex: 3,
    },
    circleLocked: {},
    dimmed: { opacity: 0.4 },
    nodeThumb: { width: 46, height: 46, marginBottom: 15 },

    nodeLabelBox: {
      position: "absolute",
      left: 4,
      right: 4,
      bottom: 12,
      height: 28,
      alignItems: "center",
      justifyContent: "center",
    },
    nodeLabel: {
      fontFamily: FONT,
      fontSize: 12,
      lineHeight: 13,
      fontWeight: "800",
      color: INK,
      textAlign: "center",
    },
    nodeLabelLocked: { color: t.textFaint },

    progressRow: {
      flexDirection: "row",
      alignItems: "center",
      alignSelf: "center",
      gap: 8,
      width: "78%",
      marginBottom: 10,
    },
    progressTrack: {
      flex: 1,
      height: 22,
      borderRadius: 11,
      backgroundColor: t.surfaceInset,
      justifyContent: "center",
      overflow: "hidden",
    },
    progressFill: {
      ...StyleSheet.absoluteFillObject,
      right: undefined,
      backgroundColor: "#8FA876",
      borderRadius: 7,
    },
    progressLabel: {
      ...StyleSheet.absoluteFillObject,
      textAlign: "center",
      textAlignVertical: "center",
      lineHeight: 22,
      fontFamily: FONT,
      fontSize: 11,
      fontWeight: "700",
      color: INK,
    },
    progressLabelOnFill: { color: t.onAccent },
    rewardIcon: { width: 22, height: 22 },

    reward: {
      alignSelf: "center",
      alignItems: "stretch",
      width: "44%",
      marginBottom: 4,
    },
    rewardHeaderRow: { flexDirection: "row", alignItems: "center", marginBottom: 6 },
    rewardBanner: {
      flex: 1,
      height: 19,
      borderRadius: 5,
      backgroundColor: "#A97480",
      alignItems: "center",
      justifyContent: "center",
    },
    awardIcon: { width: 30, height: 30, marginRight: -16, zIndex: 1 },
    rewardTile: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      gap: 1,
      paddingVertical: 4,
      borderRadius: 6,
      backgroundColor: "#FBF8F3",
      borderWidth: 1,
      borderColor: "rgba(35,31,32,0.10)",
      shadowColor: "#000",
      shadowOpacity: 0.16,
      shadowRadius: 4,
      shadowOffset: { width: 0, height: 2 },
      elevation: 3,
    },
    itemWell: {
      width: 26,
      height: 26,
      borderRadius: 6,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: "rgba(35,31,32,0.05)",
      borderWidth: 1,
      borderColor: "rgba(35,31,32,0.12)",
    },
    itemGlyph: { fontFamily: FONT, fontSize: 14, fontWeight: "800", color: INK },
    xpIcon: { width: 22, height: 22 },
    rewardKicker: {
      fontFamily: FONT, fontSize: 9,
      fontWeight: "800",
      letterSpacing: 1,
      color: "#FBF8F3",
    },
    rewardRow: { flexDirection: "row", gap: 6, alignSelf: "stretch" },
    rewardCoin: { width: 26, height: 26 },
    rewardText: { fontFamily: FONT, fontSize: 10, fontWeight: "700", color: INK },

  mapSlot: { position: "absolute", right: 14, top: 8, zIndex: 20 },
  mapButton: {
    width: 86,
    minHeight: SIZE.controlHeightSm,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: RADIUS.pill,
    backgroundColor: t.accent,
    borderWidth: 1,
    borderColor: t.accent,
    boxShadow: "0px 3px 3px rgba(0,0,0,0.28)",
  },
  mapLabel: { fontFamily: FONT, fontSize: 13, fontWeight: "800", color: t.onAccent, letterSpacing: 0.2, textAlign: "center" },
  switcher: {
    position: "absolute",
    right: 14,
    top: 2,
    maxWidth: 190,
    zIndex: 20,
  },
  stackScroll: { flexGrow: 0 },
  stack: { flexDirection: "row", alignItems: "center", paddingVertical: 6, paddingRight: 4 },

  disc: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: t.surface,
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderColor: t.border,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 3,
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  discOverlap: { marginLeft: -14 },
  discFinished: { backgroundColor: t.surface },
  discSelected: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: t.accent,
    borderColor: t.accent,
  },
  discDisabled: { opacity: 0.5 },

  discText: {
    fontFamily: FONT, fontSize: 9.5,
    fontWeight: "800",
    color: t.text,
    textAlign: "center",
  },
  discTextSelected: { fontFamily: FONT, fontSize: 11, color: t.onAccent },
  discTextFinished: { color: t.text },
  });