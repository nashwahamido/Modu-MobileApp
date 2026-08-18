import * as Haptics from "expo-haptics";
import { Fragment, useEffect, useRef, useState } from "react";
import { useRouter } from "expo-router";
import {
  Animated,
  Easing,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import {
  actionCluster,
  clusterComplete,
  clusterLabel,
  clusterPrereqsMet,
  combineReady,
  focusableClusterIds,
  requiresClusterFocus,
} from "@/src/game/core/evaluation/clusters";
import { useGameStore } from "@/src/game/core/store";
import { clusterThumbSet, modelThumbSet } from "@/src/game/core/presentation/finish";
import Svg, { Circle as SvgCircle, Defs, RadialGradient, Stop } from "react-native-svg";
import { Theme, useFixedStyles, FONT, RADIUS, SIZE } from "@/src/game/ui/system/theme";
import { useRepos } from "@/src/data";
import { useCatalogRow } from "@/src/data/catalog/buildStore";
import { HUD_SIDE_MARGIN, HUD_VERTICAL_MARGIN } from "@/src/hooks/use-safe-insets";
import type { ClusterId } from "@/src/game/core/type";

/**
 * A ring that swells and fades out of an available stage, over and over. It marks what the
 * player CAN start right now — the locked stages are already paler and the finished ones wear
 * a solid outline, so this is the only cue that has to attract the eye rather than just
 * describe a state, and motion is what does that without another colour.
 *
 * Native-driven: it runs on transform and opacity only, so the loop never touches the JS
 * thread — the same reason the orbit driver moved off it.
 */
/**
 * The "press this" tab under an openable stage.
 *
 * Rises into place and then breathes, native-driven on transform and opacity only — the same
 * discipline as PulseRing, because this file deliberately keeps its loops off the JS thread.
 */
function TapCue({ label, resuming }: { label: string; resuming: boolean }) {
  // STILL, not pulsing — and a plain View, not Animated: the ring around the circle already says
  // "this one is live", and a second thing throbbing beside it competes with the first rather than
  // reinforcing it.
  //
  // BLUE for resume, LAVENDER for start: blue is already the catalogue's "in progress" colour, so a
  // stage you have opened before is marked the same way there and here. Lavender stays the invitation
  // to begin something.
  return (
    <View pointerEvents="none" style={[styles_cue.wrap, resuming && styles_cue.wrapResume]}>
      <Text style={styles_cue.text}>{label}</Text>
    </View>
  );
}

/** Plain sheet: the cue takes no theme — it is one fixed accent either way. */
const styles_cue = StyleSheet.create({
  wrap: {
    marginTop: 4,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: "#8D7BA8",
  },
  // The Continue blue, as used by the catalogue's in-progress pill.
  wrapResume: { backgroundColor: "#6E90B8" },
  text: {
    color: "#FBF8F3",
    fontFamily: FONT,
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 0.3,
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
  /** Tutorial pause uses the project card without exposing task-stage selection. */
  overviewOnly?: boolean;
}

export function BuildMap({ overviewOnly = false }: BuildMapProps = {}) {
  const styles = useFixedStyles(makeStyles);
  const router = useRouter();
  const furniture = useGameStore((s) => s.furniture);
  const completed = useGameStore((s) => s.completed);
  const activeCluster = useGameStore((s) => s.activeCluster);
  const renderStyle = useGameStore((s) => s.renderStyle);
  const mapOpen = useGameStore((s) => s.mapOpen);
  const mapSeen = useGameStore((s) => s.mapSeen);
  const repos = useRepos();

  // The reward is DB-authored (item_build, granted by reward_build), so read it rather than recomputing a rate here — what this panel promises and what the grant applies cannot drift. Above the early return: the map unmounts between builds, so these hooks must stay unconditional.
  const furnitureId = furniture?.meta.id ?? null;
  // Name and brand are DB-authored too; read from the boot-loaded catalogue rather than the bundle. Synchronous by design — this panel opens mid-build and cannot wait on a fetch.
  const catalogRow = useCatalogRow(furnitureId);
  const [reward, setReward] = useState({ coins: 0, xp: 0 });
  useEffect(() => {
    if (!furnitureId) return;
    let alive = true;
    repos.builds
      .buildReward(furnitureId)
      .then((r) => alive && setReward(r))
      // Showing zero beats blocking the map on a reward lookup — the grant is server-side regardless.
      .catch((err) => console.warn("[BuildMap] reward lookup failed", err));
    return () => {
      alive = false;
    };
  }, [furnitureId, repos]);

  if (!furniture) return null;

  // The MODEL's art in the finish being built — the whole-build and combine nodes, which are the two
  // that picture the finished piece. The finish is resolved from renderStyle against THIS model's own
  // finishes (presentation/finish.ts), so "realistic" lands on white for EKET and black for DALFRED
  // rather than falling through to the plain thumbnail as it did while the table lived here.
  const styledThumb = modelThumbSet(furniture, renderStyle).light;

  const done = new Set(completed);
  const clusters = focusableClusterIds(furniture);

  // Three ways the map appears, and they differ in the way OUT.
  //
  //   mustChoose — several sub-assemblies, none picked. There is nothing to resume to, so the only exit is back to the catalogue. intro      — a single-cluster build (LACK) showing what lies ahead, ONCE. Its exit starts the build; it must not behave like a chooser, because there is nothing to choose and the player would be stuck. paused     — opened deliberately mid-build; exit resumes. combineReady guard: once every cluster is built, a cleared focus means the COMBINE stage (cluster cards in the tray), not an unanswered "which section" question — forcing the chooser there would block the combine.
  const mustChoose = requiresClusterFocus(furniture) && !activeCluster && !combineReady(furniture, done);
  const intro = clusters.length === 0 && !mapSeen;
  // Tutorial overview is pause-only. It must never inherit the task's
  // one-time LACK intro behaviour and open before the player taps Pause.
  const showMap = overviewOnly ? mapOpen : mustChoose || intro || mapOpen;

  const selectCluster = (clusterId: ClusterId) => {
    useGameStore.getState().setActiveCluster(clusterId);
    useGameStore.getState().setMapOpen(false);
    useGameStore.getState().setMapSeen(true);
    Haptics.selectionAsync();
  };
  // Closing always marks the intro seen, so it shows once per loaded furniture rather than every time the player pauses.
  const closeMap = () => {
    useGameStore.getState().setMapOpen(false);
    useGameStore.getState().setMapSeen(true);
  };

  if (showMap) {
    // ── the three nodes ───────────────────────────────────────────────────
    // Base and Seat are real clusters. COMBINE is not: it is the `combineClusters` action plus whatever cluster-less finishing steps follow it. Counting by cluster alone would bury those inside Seat, so combine is split out and excluded from the cluster counts.
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
        // Proper per-cluster artwork — the sub-assembly itself, not a stand-in part — and in the
        // finish being built, so a cozy EKET's stages are the cozy cabinet and drawers. Falls back
        // per cluster to the plain generated render when a finish ships no art for that stage.
        thumb: clusterThumbSet(furniture, clusterId, renderStyle)?.light,
        finished: clusterComplete(furniture, clusterId, done),
        enabled: clusterPrereqsMet(furniture, clusterId, done),
        onPress: () => selectCluster(clusterId),
      };
    });

    // Everything that isn't part of a focusable cluster: the combine itself and the finishing checks that depend on it.
    const combineActions = furniture.actions.filter(
      (a) => isCombine(a) || actionCluster(furniture, a) == null,
    );
    // Locked until BOTH sub-assemblies are done — combineReady is exactly that test.
    const combineEnabled = combineReady(furniture, done);
    const combineDone = combineActions.filter((a) => done.has(a.actionId)).length;
    // Tapping it hands control to the cluster that owns the combine action, which is what makes that step reachable; there is no separate "combine" focus to select.
    const combineOwner = combineActions.map((a) => actionCluster(furniture, a)).find(Boolean);

    // A build with no focusable clusters is ONE stage: the whole thing. Its actions carry no cluster at all, so the per-cluster and combine splits below would both come back empty and the map would draw nothing.
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
        // Just "Combine". It used to append the catalogue name's last word ("Combine Cabinet"),
        // which wrapped to two lines inside the circle and repeated a word already in the title
        // above it.
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

    // The card GROWS with the stage count rather than squeezing the nodes: two stages (LACK) sit in
    // a compact card, DALFRED's three want more room, and EKET's four need enough that every circle
    // keeps its natural width instead of shrinking until the labels inside them stop fitting.
    // WHICH labels stack one-word-per-line. Not "every multi-word name": a name breaks only when
    // ANOTHER stage in the same row shares a word with it — "Top Drawer" and "Bottom Drawer" are a
    // matched pair and must be set identically, so both stack. "Step Stool" has no counterpart, so
    // forcing it onto two lines only made it smaller for no gain. Derived rather than listed, so a
    // future model's pairs behave without another exception here.
    const words = (label: string) => label.toLowerCase().split(" ");
    const stacksLabel = (label: string) => {
      const mine = words(label);
      if (mine.length < 2) return false;
      return nodes.some(
        (other) => other.label !== label && words(other.label).some((w) => mine.includes(w)),
      );
    };

    const cardMax = nodes.length >= 4 ? 620 : nodes.length === 3 ? 520 : 460;
    const INNER = cardMax - 60;
    const nodeWidth = Math.min(116, (INNER - (nodes.length - 1) * 24) / nodes.length);

    const totalSteps = furniture.actions.length;
    const pct = totalSteps ? Math.round((done.size / totalSteps) * 100) : 0;
    // Both come straight from the DB row — zero until the lookup lands, or if it failed.
    const { coins } = reward;
    // A tutorial awards XP per completed assembly action. Its pause overview
    // must use the same source as the tutorial HUD (14 × 10 = 140 for LACK),
    // rather than the catalogue build reward used by a normal task.
    const totalXp = overviewOnly
      ? furniture.actions.length * furniture.xpPerStep
      : reward.xp;

    return (
      <View style={styles.scrim}>
        <View style={[styles.card, { maxWidth: cardMax }]}>
          {/* NO close button. Every stage's Start/Resume closes the map by opening that stage, and
              Home leaves the build entirely — an ✕ on the corner was a third exit that did the same
              thing as the first two, and on a card this size it read as the loudest control on it. */}
          <Pressable
            style={({ pressed }) => [styles.home, pressed && { opacity: 0.6 }]}
            onPress={() => router.dismissTo("/room")}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Back to your room"
          >
            <Image
              source={require("@/src/assets/ui/icons/icon-home.png")}
              style={styles.homeIcon}
              resizeMode="contain"
            />
            <Text style={styles.homeText}>Home</Text>
          </Pressable>

          <View style={styles.titleRow}>
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
            {/* Every connector is drawn FIRST, in one absolutely-positioned layer, so all of
                them sit under all of the circles. Interleaving them with the nodes could only
                ever put a band under the node that followed it — the last one always landed on
                top of the circle to its right, and zIndex alone did not settle it on Android. */}
            <View
              style={[
                styles.connectorLayer,
                {
                  // The row centres its children, so a full-width layer would put the bands off by half the slack. Pin it to the content box instead.
                  width: nodes.length * nodeWidth + (nodes.length - 1) * 24,
                  marginLeft: -(nodes.length * nodeWidth + (nodes.length - 1) * 24) / 2,
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
                        // Midpoint of the two circle centres: node i-1's centre plus half a node, plus the 24dp slot between them, less half the band's length.
                        left:
                          (i - 1) * (nodeWidth + 24) + nodeWidth + 12 - CONNECTOR_LEN / 2,
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
                  disabled={!n.enabled || n.finished}
                  onPress={n.onPress}
                  // Odd nodes ride lower, so the row reads as a path stepping between stages rather than three buttons in a line.
                  style={[
                    styles.node,
                    { width: nodeWidth },
                    i % 2 === 1 && styles.nodeLow,
                  ]}
                  accessibilityLabel={`${n.label}, ${n.doneCount} of ${n.actions.length} steps`}  /* the count lives here now: read aloud, not drawn */
                >
                  {/* Available: pulsing. Finished: a steady outline plus the tick. Both are
                      SIBLINGS of the circle, never a border on it — the circle clips its own
                      gradient, and a bordered view with a rounded inner overlay is what made
                      Android flatten these into octagons before. */}
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
                        style={styles.doneCheck}
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
                    {/* The wireframe's sphere: a light halo in the middle falling off to a
                        deeper cream at the rim. A flat fill read as a sticker; the gradient is
                        what gives the node its volume. */}
                    <Svg width={92} height={92} style={StyleSheet.absoluteFill}>
                      <Defs>
                        <RadialGradient id={`halo-${n.key}`} cx="50%" cy="42%" r="65%">
                          {/* A locked stage is drawn PALER, never more transparent: dropping the
                              view's opacity is what let the connector band show straight through
                              the circle. The fill stays fully opaque at every state. */}
                          <Stop offset="0" stopColor="#FBF8F3" />
                          <Stop
                            offset="1"
                            stopColor={!n.enabled && !n.finished ? "#E6E0D5" : "#D9D0C2"}
                          />
                        </RadialGradient>
                      </Defs>
                      <SvgCircle cx="46" cy="46" r="46" fill={`url(#halo-${n.key})`} />
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
                    {/* INSIDE the circle, under the thumbnail: the stage's name belongs to the
                        stage, and outside it the row read as a caption floating beneath a picture.
                        Absolutely positioned so it cannot push the thumbnail off centre. */}
                    <View style={styles.nodeLabelBox} pointerEvents="none">
                      <Text
                        style={[styles.nodeLabel, !n.enabled && !n.finished && styles.nodeLabelLocked]}
                        numberOfLines={2}
                      >
                        {/* Stacked one word per line only where a MATCHED PAIR needs it — see
                            stacksLabel above. The box centres whatever comes out, so a one-line and
                            a two-line name still share a midline. */}
                        {stacksLabel(n.label) ? n.label.split(" ").join("\n") : n.label}
                      </Text>
                    </View>
                  </View>


                  {/* One tab, on the first stage that can be opened.
                      The pulsing ring says "this one is LIVE", which is a state. It never says the
                      circle is a button, and a diagram of stages is a perfectly ordinary thing to
                      look at without touching — so a first-time player reads the map, understands
                      it, and waits. This says what to do, in words, exactly once: more than one
                      would be a scatter of instructions rather than a next step. */}
                  {/* On EVERY stage that can be opened, not just the first: with three or four
                      stages the player picks which to work on, and a single tab on the leftmost
                      one implied the others were not choices. A finished stage has nothing to
                      start; a locked one cannot be started yet. */}
                  {n.enabled && !n.finished ? (
                    <TapCue label={n.doneCount > 0 ? "Resume" : "Start"} resuming={n.doneCount > 0} />
                  ) : null}
                </Pressable>
              </Fragment>
            ))}
          </View>
          )}

          <View style={styles.progressRow}>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${pct}%` }]} />
              {/* The label sits centred ON the track, so once the fill passes halfway it
                  is sitting on accent, not on the groove — and has to flip to match. */}
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
            {/* Rosette overlaps the banner's left end, as in the wireframe — it reads as a
                seal pinned to the ribbon rather than a third item in the row. */}
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
                <Image
                  source={require("@/src/assets/ui/icons/icon-coins.png")}
                  style={styles.rewardIcon}
                  resizeMode="contain"
                />
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

/**
 * The compact Base | Seat switcher, top-right of the HUD.
 *
 * Split from the map deliberately: the map is a FULL-SCREEN overlay and has to render
 * outside play.tsx's inset `chrome` container, or its scrim can only dim that container and
 * leaves a lighter rectangle of scene around the edges. The chips are the opposite — they
 * are positioned AGAINST those insets, so they have to stay inside it.
 */
/**
 * The one control that opens the project map, in the slot the cluster discs used to occupy.
 *
 * The discs were a SECOND way to change focus — a horizontal stack you scrolled and tapped — sitting
 * beside a map that already does that job with more context. A single button that opens the map is
 * the same capability without a parallel UI to learn, and it gives the HUD's top-right back.
 */
export function MapButton() {
  const styles = useFixedStyles(makeStyles);
  const furniture = useGameStore((s) => s.furniture);
  const setMapOpen = useGameStore((s) => s.setMapOpen);
  if (!furniture) return null;
  return (
    <View style={styles.mapSlot}>
      <Pressable
        style={({ pressed }) => [styles.mapButton, pressed && styles.mapButtonPressed]}
        onPress={() => {
          setMapOpen(true);
          Haptics.selectionAsync();
        }}
        accessibilityRole="button"
        accessibilityLabel="Open the project map"
      >
        {({ pressed }) => (
          <Text style={[styles.mapLabel, pressed && styles.mapLabelPressed]}>Map</Text>
        )}
      </Pressable>
    </View>
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

  // Stacking peaks at the SELECTED disc and falls away in both directions:
  //
  //     z = count - |i - selectedIndex|
  //
  // so each disc is only ever covered from the side facing the selection, and none is squeezed from both. A plain left-to-right cascade is not enough — it works while the first disc is selected, but choosing the LAST one makes it the peak while the first still sits high, and the middle is buried between them again.
  return (
    <View style={styles.switcher}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.stack}
        // Enough room for a few clusters; beyond that it scrolls rather than growing into the parts tray below.
        style={styles.stackScroll}
      >
        {clusters.map((clusterId, i) => {
          const selected = activeCluster === clusterId;
          const z = clusters.length - Math.abs(i - selectedIndex);
          const finished = clusterComplete(furniture, clusterId, done);
          const enabled =
            !finished && clusterPrereqsMet(furniture, clusterId, done);
          return (
            <Pressable
              key={clusterId}
              disabled={!enabled && !selected}
              onPress={() => selectCluster(clusterId)}
              style={[
                styles.disc,
                // Overlap: every circle after the first tucks under its neighbour.
                i > 0 && styles.discOverlap,
                // Both zIndex and elevation: Android orders overlapping views by elevation, iOS by zIndex. Setting one gives correct stacking on a single platform and a mystery on the other.
                { zIndex: z, elevation: z },
                finished && styles.discFinished,
                // Selected LAST so it wins the fill.
                selected && styles.discSelected,
                !enabled && !finished && !selected && styles.discDisabled,
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

/** Every text on this modal, per the wireframe. */
const INK = "#231F20";

/** Centre-to-centre span of the band between two stage circles (node 116 + slot 24). */
const CONNECTOR_LEN = 140;

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    scrim: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: t.scrim,
      alignItems: "center",
      justifyContent: "center",
      // The same floors the assembly HUD uses, so the modal never sits closer to the glass than the controls behind it. Immersive mode reports 0 insets, hence the constants.
      paddingHorizontal: HUD_SIDE_MARGIN,
      // A real gutter, not the HUD's floor — but only just: at +18 the card had to give back more
      // height than the reward row could spare, so the tiles ran past its edge. 10 keeps a visible
      // margin top and bottom while returning that room to the content.
      paddingVertical: HUD_VERTICAL_MARGIN + 10,
      // zIndex only — NO elevation. On Android `elevation` draws a drop shadow around the view's bounds, and a full-screen dimmer does not want one: while this sat inside play.tsx's inset chrome container that shadow landed ON SCREEN as a dark band tracing the container's edges, which read as a mystery rectangle behind the card.
      zIndex: 30,
    },

    // ── the build-map card ────────────────────────────────────────────────
    // Sized to fit a landscape phone WITHOUT scrolling: every block below is deliberately tight, because a chooser you have to scroll hides the very options it exists to show.
    card: {
      width: "100%",
      // A CEILING, not a fixed height: the card sizes to its content but can never grow past the
      // window minus the scrim's own padding — which is what let EKET's four stages push it to the
      // top and bottom edges. maxWidth is set inline, per stage count.
      maxHeight: "100%",
      // The CELEBRATION screen's panel colour, and no outline: the accent border made the map read
      // as an alert, where it is really the same kind of surface as the finish summary.
      backgroundColor: "#E3DACD",
      borderRadius: 22,
      paddingTop: 10,
      paddingBottom: 10,
      paddingHorizontal: 20,
      shadowColor: "#000",
      shadowOpacity: 0.3,
      shadowRadius: 20,
      shadowOffset: { width: 0, height: 10 },
      elevation: 12,
    },
    // Top-left of the card. Absolute so it cannot push the centred title off centre. (It used to be
    // described as "opposite the close button"; the close button is gone, this is the only corner
    // control now.)
    home: {
      position: "absolute",
      top: 12,
      left: 16,
      zIndex: 3,
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
    },
    homeIcon: { width: 26, height: 26 },
    homeText: { fontFamily: FONT, fontSize: 13, fontWeight: "700", color: INK },
    titleRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      marginBottom: 10,
    },
    title: { fontFamily: FONT, fontSize: 18, fontWeight: "800", color: t.text },

    // Tutorial pause is an overview, not a stage chooser. Keep the task card's
    // visual language but give the finished furniture the whole centre area.
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

    // ── the nodes ─────────────────────────────────────────────────────────
    nodeRow: {
      flexDirection: "row",
      alignItems: "flex-start",
      justifyContent: "center",
      marginBottom: 6,
    },
    // The connector's SLOT in the row is narrow; the line itself is longer and overflows it deliberately, running across the empty padding either side of the circles. Midpoint between the two circle centres: radius 46 + half the 34dp stagger. Pure spacer now — the bands live in connectorLayer, which paints before any node.
    connectorSlot: { width: 24 },
    connectorLayer: { position: "absolute", top: 0, bottom: 0, left: "50%", zIndex: 0 },
    // The rims are 58.8dp apart on the diagonal; drawing 44 leaves ~7dp clear at each end so the line stops short of both circles instead of butting into them. Spans CENTRE to CENTRE (node 116 + slot 24 = 140), not rim to rim: the long run makes the tilt shallow (atan 34/140 ≈ 13.7°) and buries both rounded ends under the circles, which draw after it and carry elevation. A short rim-to-rim band showed its own caps.
    connectorLine: {
      position: "absolute",
      // Circle centres sit at y=46 and y=80 (the 34dp stagger); their midpoint is 63.
      top: 63 - 7,
      width: CONNECTOR_LEN,
      height: 14,
      borderRadius: 7,
      backgroundColor: "rgba(35,31,32,0.06)",
    },
    connectorDown: { transform: [{ rotate: "13.7deg" }] },
    connectorUp: { transform: [{ rotate: "-13.7deg" }] },
    node: { alignItems: "center", width: 116, zIndex: 1 },
    // The dip that turns a row into a route. Matches the wireframe, where the middle stage sits below its neighbours.
    // Half the old 34: the dip still reads as a path stepping between stages, but it was adding its
    // full height to the card — the tallest node sets the row, so the offset is paid twice over.
    nodeLow: { marginTop: 18 },
    circle: {
      width: 92,
      height: 92,
      borderRadius: 46,
      // Fill comes from the SVG radial gradient inside; keep the View transparent, and NO border — a bordered View with a rounded inner overlay is what made Android flatten the corners into an octagon.
      overflow: "hidden",
      alignItems: "center",
      justifyContent: "center",
      paddingBottom: 6,
      // Depth comes from the drop shadow alone. RN has no inset shadow, and faking one with an inset ring is what broke the shape.
      shadowColor: "#000",
      shadowOpacity: 0.18,
      shadowRadius: 5,
      shadowOffset: { width: 0, height: 3 },
      elevation: 4,
    },
    circleFinished: {},
    // Sits UNDER the circle so the swell reads as a halo growing out from behind it.
    pulseRing: {
      position: "absolute",
      top: 0,
      alignSelf: "center",
      width: 92,
      height: 92,
      borderRadius: 46,
      borderWidth: 3,
      // The ring says the same thing its pill does, in the same colour: LAVENDER around a stage
      // waiting to be started, BLUE around one already under way.
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
    pulseRingResume: { borderColor: "#6E90B8" },
    // Bottom-left of the circle. It used to share this spot with the resume badge, which is now
    // retired — a finished stage is the only thing marked here.
    doneCheck: {
      position: "absolute",
      bottom: 14,
      left: 6,
      width: 28,
      height: 28,
      zIndex: 3,
    },
    // NOT opacity — see the gradient comment above.
    circleLocked: {},
    dimmed: { opacity: 0.4 },
    // Lifted off centre so the label below has clear air — but only just: at 22 the icon sat too
    // high in the circle, and the gap read as a gap rather than as spacing.
    nodeThumb: { width: 46, height: 46, marginBottom: 15 },

    // Pinned to the LOWER THIRD of the circle, clear of the thumbnail above it.
    // A FIXED box that centres whatever it holds. Bottom-anchored text grew upward as it wrapped,
    // so a one-line name ("Top Drawer") sat lower than a two-line one ("Bottom Drawer") in the same
    // row — the box gives both the same midline, whatever they wrap to.
    nodeLabelBox: {
      position: "absolute",
      // Full width inside the circle: the per-word break is decided by stacksLabel above, so this
      // no longer needs to force wrapping — and at 16 it was squeezing "Step Stool" onto two lines
      // regardless of that decision.
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

    // ── overall progress ──────────────────────────────────────────────────
    // Narrow and centred, as in the wireframe — a full-width bar competed with the nodes.
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
      // Tall enough to CONTAIN the label: at 13 the text had no room and sat on the bottom edge,
      // because a Text with no lineHeight is laid out from its baseline, not its box.
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
    // Absolutely filled and line-height-matched to the track, so the label is centred by its BOX
    // rather than by where its baseline happens to fall.
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
    // Sized to the drawn icon it replaces, so the reward row keeps its rhythm.
    rewardIcon: { width: 22, height: 22 },

    // ── reward ────────────────────────────────────────────────────────────
    // Full width now: the banner is a ribbon across the card, with the two tiles under it. Sized to the wireframe: a ribbon a bit over half the card, not a full-width bar.
    reward: {
      alignSelf: "center",
      alignItems: "stretch",
      // A hair wider now it carries three tiles rather than two.
      width: "44%",
      marginBottom: 4,
    },
    // Rosette sits beside the ribbon, not over it — no part of the banner runs behind it. No gap: the rosette butts against the ribbon, as drawn.
    rewardHeaderRow: { flexDirection: "row", alignItems: "center", marginBottom: 6 },
    rewardBanner: {
      flex: 1,
      height: 19,
      borderRadius: 5,
      backgroundColor: "#A97480",
      alignItems: "center",
      justifyContent: "center",
    },
    // Pulled a hair over the ribbon so there is no seam between the two.
    // The ribbon continues beneath the rosette, as drawn — a bigger bite than a seam.
    awardIcon: { width: 30, height: 30, marginRight: -16, zIndex: 1 },
    // Icon ABOVE the label, per the reference — a row read as a chip, not a reward card.
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
    rewardRow: { flexDirection: "row", gap: 5, alignSelf: "stretch" },
    rewardText: { fontFamily: FONT, fontSize: 10, fontWeight: "700", color: INK },

  // TOP-RIGHT corner. top:8 is the HUD's grid line — the settings gear, the hint and the pause row
  // all sit on it — and right:14 is the parts tray's own margin, so the button lines up with the
  // tray column beneath it and with the left-hand controls across from it.
  mapSlot: { position: "absolute", right: 14, top: 8, zIndex: 20 },
  // The same 36pt chip height the settings gear, hint and undo sit on, and the PARTS TRAY's width
  // (86) so the button and the column beneath it read as one right-hand rail rather than two
  // stacked shapes of different sizes.
  mapButton: {
    width: 86,
    minHeight: SIZE.controlHeightSm,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: RADIUS.pill,
    // THEME-driven, not CREAM: this chip sits in the HUD beside the gear and the tray, which both
    // follow the theme — cream here was a light-mode surface floating on the dark build.
    backgroundColor: t.surface,
    borderWidth: 1,
    borderColor: t.border,
    boxShadow: "0px 3px 3px rgba(0,0,0,0.28)",
  },
  // Lavender on press — the app's one "you can act on this" colour, the same fill a primary button
  // takes when held.
  // The accent is the same lavender in both themes — "act on this" does not change meaning.
  mapButtonPressed: { backgroundColor: t.accent, borderColor: t.accent },
  mapLabel: { fontFamily: FONT, fontSize: 13, fontWeight: "800", color: t.text, letterSpacing: 0.2, textAlign: "center" },
  mapLabelPressed: { color: t.onAccent },
  switcher: {
    position: "absolute",
    right: 14,
    top: 2,
    // The stack is much narrower than the old pill row, so it sits clear of the objective bar even when that bar is at full width.
    maxWidth: 190,
    zIndex: 20,
  },
  stackScroll: { flexGrow: 0 },
  // paddingRight leaves room for the last disc's shadow; paddingVertical for the lift.
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
  // Each disc tucks under the previous one, so the row reads as a stack rather than a spaced-out set of buttons — and takes far less width.
  discOverlap: { marginLeft: -14 },
  discFinished: { backgroundColor: t.surface },
  // Bigger, filled, and lifted ABOVE its neighbours on both sides.
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