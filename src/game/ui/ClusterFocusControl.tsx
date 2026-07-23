import * as Haptics from "expo-haptics";
import { Fragment } from "react";
import { useRouter } from "expo-router";
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
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
import { brandFor } from "@/src/game/data/brands";
import { ResumeIcon, StarBadge } from "@/src/game/ui/Icons";
import { Theme, useStyles, useTheme } from "@/src/game/ui/theme";
import type { ClusterId } from "@/src/game/core/type";

/** Coins awarded per completed step. A placeholder RATE, not a placeholder number: there
 *  is no wallet or shop in the data model yet, so nothing spends these. When an economy
 *  exists this is the one line to replace. */
const COINS_PER_STEP = 3;

export function BuildMap() {
  const styles = useStyles(makeStyles);
  const t = useTheme();
  const router = useRouter();
  const furniture = useGameStore((s) => s.furniture);
  const completed = useGameStore((s) => s.completed);
  const activeCluster = useGameStore((s) => s.activeCluster);
  const mapOpen = useGameStore((s) => s.mapOpen);
  const mapSeen = useGameStore((s) => s.mapSeen);

  if (!furniture) return null;

  const done = new Set(completed);
  const clusters = focusableClusterIds(furniture);

  // Three ways the map appears, and they differ in the way OUT.
  //
  //   mustChoose — several sub-assemblies, none picked. There is nothing to resume to, so
  //                the only exit is back to the catalogue.
  //   intro      — a single-cluster build (LACK) showing what lies ahead, ONCE. Its exit
  //                starts the build; it must not behave like a chooser, because there is
  //                nothing to choose and the player would be stuck.
  //   paused     — opened deliberately mid-build; exit resumes.
  // combineReady guard: once every cluster is built, a cleared focus means the COMBINE stage (cluster cards in the tray), not an unanswered "which section" question — forcing the chooser there would block the combine.
  const mustChoose = requiresClusterFocus(furniture) && !activeCluster && !combineReady(furniture, done);
  const intro = clusters.length === 0 && !mapSeen;
  const showMap = mustChoose || intro || mapOpen;

  const selectCluster = (clusterId: ClusterId) => {
    useGameStore.getState().setActiveCluster(clusterId);
    useGameStore.getState().setMapOpen(false);
    useGameStore.getState().setMapSeen(true);
    Haptics.selectionAsync();
  };
  // Closing always marks the intro seen, so it shows once per loaded furniture rather
  // than every time the player pauses.
  const closeMap = () => {
    useGameStore.getState().setMapOpen(false);
    useGameStore.getState().setMapSeen(true);
  };

  if (showMap) {
    // ── the three nodes ───────────────────────────────────────────────────
    // Base and Seat are real clusters. COMBINE is not: it is the `combineClusters` action
    // plus whatever cluster-less finishing steps follow it. Counting by cluster alone would
    // bury those inside Seat, so combine is split out and excluded from the cluster counts.
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
        // Proper per-cluster artwork — the sub-assembly itself, not a stand-in part.
        thumb: furniture.clusterThumbs?.[clusterId]?.light,
        finished: clusterComplete(furniture, clusterId, done),
        enabled: clusterPrereqsMet(furniture, clusterId, done),
        onPress: () => selectCluster(clusterId),
      };
    });

    // Everything that isn't part of a focusable cluster: the combine itself and the
    // finishing checks that depend on it.
    const combineActions = furniture.actions.filter(
      (a) => isCombine(a) || actionCluster(furniture, a) == null,
    );
    // Locked until BOTH sub-assemblies are done — combineReady is exactly that test.
    const combineEnabled = combineReady(furniture, done);
    const combineDone = combineActions.filter((a) => done.has(a.actionId)).length;
    // Tapping it hands control to the cluster that owns the combine action, which is what
    // makes that step reachable; there is no separate "combine" focus to select.
    const combineOwner = combineActions.map((a) => actionCluster(furniture, a)).find(Boolean);

    // A build with no focusable clusters is ONE stage: the whole thing. Its actions carry
    // no cluster at all, so the per-cluster and combine splits below would both come back
    // empty and the map would draw nothing.
    const wholeNode = {
      key: "whole",
      label: clusterLabel(furniture, (Object.keys(furniture.clusters ?? {})[0] ?? "") as ClusterId),
      actions: [...furniture.actions],
      doneCount: furniture.actions.filter((a) => done.has(a.actionId)).length,
      thumb: furniture.meta.thumbnail.light,
      finished: done.size >= furniture.actions.length,
      enabled: true,
      onPress: closeMap,
    };

    const nodes = clusters.length === 0 ? [wholeNode] : [
      ...clusterNodes,
      {
        key: "combine",
        label: `Combine ${furniture.meta.name.split(" ").pop()}`,
        actions: combineActions,
        doneCount: combineDone,
        thumb: furniture.meta.thumbnail.light,
        finished: combineActions.length > 0 && combineDone === combineActions.length,
        enabled: combineEnabled,
        onPress: () =>
          selectCluster((combineOwner ?? clusters[clusters.length - 1]) as ClusterId),
      },
    ];

    // Nodes share the row, so they shrink as the count grows: EKET's three clusters plus
    // combine is four across, which will not fit at the natural width.
    const INNER = 520;
    const nodeWidth = Math.min(116, (INNER - (nodes.length - 1) * 24) / nodes.length);

    const totalSteps = furniture.actions.length;
    const pct = totalSteps ? Math.round((done.size / totalSteps) * 100) : 0;
    const totalXp = totalSteps * furniture.xpPerStep;
    // There is no economy in the data model yet — no wallet, no prices, nothing that
    // spends these. COINS_PER_STEP is the single place that changes when one exists, so
    // the number on screen stays tied to the size of the build rather than being typed in.
    const coins = totalSteps * COINS_PER_STEP;
    const brand = brandFor(furniture.meta.brand);

    return (
      <View style={styles.scrim}>
        <View style={styles.card}>
          <Pressable
            style={styles.close}
            // Paused mid-build → resume. Nothing chosen yet → there is nothing to resume
            // to, so the only way out is back to the catalogue.
            onPress={() => (mustChoose ? router.back() : closeMap())}
            hitSlop={10}
            accessibilityLabel={mustChoose ? "Leave this build" : "Start building"}
          >
            <Text style={styles.closeGlyph}>✕</Text>
          </Pressable>

          <View style={styles.titleRow}>
            <Text style={styles.title}>{furniture.meta.name}</Text>
            <Image
              source={brand.logo}
              style={styles.brandLogo}
              resizeMode="contain"
              accessibilityLabel={brand.name}
            />
          </View>

          <View style={styles.nodeRow}>
            {nodes.map((n, i) => (
              <Fragment key={n.key}>
                {i > 0 ? (
                  <View style={styles.connectorSlot}>
                    {/* Tilts to meet the staggered neighbours: down into a low node, back
                        up out of one. 28.7° is the angle between the circle edges — 62dp
                        apart across, 34dp down. */}
                    <View
                      style={[
                        styles.connectorLine,
                        i % 2 === 1 ? styles.connectorDown : styles.connectorUp,
                      ]}
                    />
                  </View>
                ) : null}
                <Pressable
                  disabled={!n.enabled || n.finished}
                  onPress={n.onPress}
                  // Odd nodes ride lower, so the row reads as a path stepping between
                  // stages rather than three buttons in a line.
                  style={[
                    styles.node,
                    { width: nodeWidth },
                    i % 2 === 1 && styles.nodeLow,
                  ]}
                  accessibilityLabel={`${n.label}, ${n.doneCount} of ${n.actions.length} steps`}
                >
                  <View
                    style={[
                      styles.circle,
                      n.finished && styles.circleFinished,
                      !n.enabled && !n.finished && styles.circleLocked,
                    ]}
                  >
                    {n.thumb ? (
                      <Image
                        source={n.thumb}
                        style={styles.nodeThumb}
                        resizeMode="contain"
                      />
                    ) : null}
                    <Text style={styles.stepCount}>
                      {n.doneCount}/{n.actions.length} steps
                    </Text>
                  </View>

                  {/* RESUME, so it appears only where there is something to resume: a stage
                      with steps behind it that is not yet finished. A play badge on an
                      untouched stage would be claiming progress that does not exist. */}
                  {n.doneCount > 0 && !n.finished ? (
                    <View style={styles.resumeBadge} pointerEvents="none">
                      <ResumeIcon size={13} color={t.onAccent} />
                    </View>
                  ) : null}

                  <View style={styles.starWrap} pointerEvents="none">
                    <StarBadge size={38} color={t.accent} />
                    <Text style={styles.starText}>
                      +{n.actions.length * furniture.xpPerStep}
                    </Text>
                  </View>

                  <Text
                    style={[styles.nodeLabel, !n.enabled && !n.finished && styles.nodeLabelLocked]}
                  >
                    {n.finished ? "✓ " : ""}
                    {n.label}
                  </Text>
                </Pressable>
              </Fragment>
            ))}
          </View>

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
            <Text style={styles.rewardKicker}>COMPLETION REWARD</Text>
            <View style={styles.rewardRow}>
              <View style={styles.rewardItem}>
                <Text style={styles.rewardIcon}>◉</Text>
                <Text style={styles.rewardText}>+{coins} coins</Text>
              </View>
              <View style={styles.rewardItem}>
                <Text style={styles.rewardIcon}>★</Text>
                <Text style={styles.rewardText}>+{totalXp} XP</Text>
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
export function ClusterFocusControl() {
  const styles = useStyles(makeStyles);
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
  // so each disc is only ever covered from the side facing the selection, and none is
  // squeezed from both. A plain left-to-right cascade is not enough — it works while the
  // first disc is selected, but choosing the LAST one makes it the peak while the first
  // still sits high, and the middle is buried between them again.
  return (
    <View style={styles.switcher}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.stack}
        // Enough room for a few clusters; beyond that it scrolls rather than growing into
        // the parts tray below.
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
                // Both zIndex and elevation: Android orders overlapping views by
                // elevation, iOS by zIndex. Setting one gives correct stacking on a single
                // platform and a mystery on the other.
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

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    scrim: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: t.scrim,
      alignItems: "center",
      justifyContent: "center",
      padding: 12,
      // zIndex only — NO elevation. On Android `elevation` draws a drop shadow around the
      // view's bounds, and a full-screen dimmer does not want one: while this sat inside
      // play.tsx's inset chrome container that shadow landed ON SCREEN as a dark band
      // tracing the container's edges, which read as a mystery rectangle behind the card.
      zIndex: 30,
    },

    // ── the build-map card ────────────────────────────────────────────────
    // Sized to fit a landscape phone WITHOUT scrolling: every block below is deliberately
    // tight, because a chooser you have to scroll hides the very options it exists to show.
    card: {
      width: "100%",
      maxWidth: 560,
      // A LITERAL cream, not a token. `surface` and `surfaceRaised` are both near-white in
      // the light theme, and across an area this large near-white just reads as white. This
      // is the tone of the catalogue cards' thumbnail panels, sampled from them.
      backgroundColor: "#E3DACD",
      borderRadius: 22,
      // The purple outline: this is the one modal that blocks the whole game, so it gets
      // the accent rather than the usual hairline.
      borderWidth: 2,
      borderColor: t.accent,
      paddingTop: 12,
      paddingBottom: 14,
      paddingHorizontal: 20,
      shadowColor: "#000",
      shadowOpacity: 0.3,
      shadowRadius: 20,
      shadowOffset: { width: 0, height: 10 },
      elevation: 12,
    },
    close: {
      position: "absolute",
      top: -12,
      right: -12,
      width: 34,
      height: 34,
      borderRadius: 17,
      backgroundColor: t.surfaceRaised,
      borderWidth: 2,
      borderColor: t.accent,
      alignItems: "center",
      justifyContent: "center",
      zIndex: 2,
      elevation: 2,
    },
    closeGlyph: { color: t.text, fontSize: 16, fontWeight: "800" },

    titleRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      marginBottom: 10,
    },
    title: { fontSize: 18, fontWeight: "800", color: t.text },
    brandLogo: { width: 42, height: 16 },

    // ── the nodes ─────────────────────────────────────────────────────────
    nodeRow: {
      flexDirection: "row",
      alignItems: "flex-start",
      justifyContent: "center",
      marginBottom: 10,
    },
    // The connector's SLOT in the row is narrow; the line itself is longer and overflows
    // it deliberately, running across the empty padding either side of the circles.
    // Midpoint between the two circle centres: radius 46 + half the 34dp stagger.
    connectorSlot: { width: 24, height: 2, marginTop: 63 },
    // The rims are 58.8dp apart on the diagonal; drawing 44 leaves ~7dp clear at each end
    // so the line stops short of both circles instead of butting into them.
    connectorLine: {
      position: "absolute",
      width: 52,
      height: 2,
      left: -14,
      backgroundColor: "rgba(60,50,40,0.28)",
    },
    connectorDown: { transform: [{ rotate: "35.3deg" }] },
    connectorUp: { transform: [{ rotate: "-35.3deg" }] },
    node: { alignItems: "center", width: 116 },
    // The dip that turns a row into a route. Matches the wireframe, where the middle stage
    // sits below its neighbours.
    nodeLow: { marginTop: 34 },
    circle: {
      width: 92,
      height: 92,
      borderRadius: 46,
      // A SOLID tone, not the translucent `surfaceInset`: layered over cream that read as
      // washed-out mud. And NO border — a bordered View with a rounded inner overlay is
      // what made Android flatten the corners into an octagon.
      backgroundColor: "#CFC4B4",
      alignItems: "center",
      justifyContent: "center",
      paddingBottom: 6,
      // Depth comes from the drop shadow alone. RN has no inset shadow, and faking one
      // with an inset ring is what broke the shape.
      shadowColor: "#000",
      shadowOpacity: 0.18,
      shadowRadius: 5,
      shadowOffset: { width: 0, height: 3 },
      elevation: 4,
    },
    circleFinished: { backgroundColor: "#BFB3A0" },
    circleLocked: { opacity: 0.4 },
    nodeThumb: { width: 48, height: 48 },
    stepCount: {
      position: "absolute",
      bottom: 10,
      fontSize: 9,
      fontWeight: "700",
      color: "#5C5347",
    },

    // The badge is an SVG star with the label absolutely centred over the SAME box, so the
    // number sits on the star's true centre — a ★ text glyph rides low in its em box and
    // never quite lines up.
    // Bottom-left of the circle, opposite the XP star.
    resumeBadge: {
      position: "absolute",
      bottom: 18,
      left: 8,
      width: 22,
      height: 22,
      borderRadius: 11,
      backgroundColor: t.accent,
      alignItems: "center",
      justifyContent: "center",
    },

    starWrap: {
      position: "absolute",
      top: -4,
      right: 8,
      width: 38,
      height: 38,
      alignItems: "center",
      justifyContent: "center",
    },
    starText: {
      position: "absolute",
      fontSize: 9,
      fontWeight: "800",
      color: t.onAccent,
      textAlign: "center",
    },

    nodeLabel: {
      marginTop: 8,
      fontSize: 13,
      fontWeight: "700",
      color: t.text,
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
      height: 18,
      borderRadius: 9,
      backgroundColor: t.surfaceInset,
      justifyContent: "center",
      overflow: "hidden",
    },
    progressFill: {
      ...StyleSheet.absoluteFillObject,
      right: undefined,
      backgroundColor: t.accent,
      borderRadius: 9,
    },
    progressLabel: {
      textAlign: "center",
      fontSize: 10,
      fontWeight: "700",
      color: t.textDim,
    },
    progressLabelOnFill: { color: t.onAccent },

    // ── reward ────────────────────────────────────────────────────────────
    reward: {
      alignSelf: "center",
      alignItems: "center",
      backgroundColor: t.surfaceInset,
      borderRadius: 12,
      paddingVertical: 8,
      paddingHorizontal: 18,
      marginBottom: 10,
    },
    rewardKicker: {
      fontSize: 9,
      fontWeight: "800",
      letterSpacing: 0.6,
      color: t.textDim,
      marginBottom: 5,
    },
    rewardRow: { flexDirection: "row", gap: 20 },
    rewardItem: { flexDirection: "row", alignItems: "center", gap: 5 },
    rewardIcon: { fontSize: 15, color: t.gold },
    rewardText: { fontSize: 11, fontWeight: "700", color: t.text },

  switcher: {
    position: "absolute",
    right: 14,
    top: 10,
    // The stack is much narrower than the old pill row, so it sits clear of the objective
    // bar even when that bar is at full width.
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
  // Each disc tucks under the previous one, so the row reads as a stack rather than a
  // spaced-out set of buttons — and takes far less width.
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
    fontSize: 9.5,
    fontWeight: "800",
    color: t.text,
    textAlign: "center",
  },
  discTextSelected: { fontSize: 11, color: t.onAccent },
  discTextFinished: { color: t.text },
  });