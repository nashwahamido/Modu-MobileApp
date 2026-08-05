// The centred objective pill: instruction line + [★ star | progress track | XP label] row. SHARED by the play screen and the tutorial fork — edit here and both stay in sync.
import { useEffect, type ReactNode } from "react";
import { Image, StyleSheet, Text, View } from "react-native";
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { ProgressBar } from "@/src/game/ui/Button";
import { ELEVATION, RADIUS, SPACE, Theme, TYPE, useStyles, FONT } from "@/src/game/ui/theme";

interface Props {
  /** The objective sentence; null hides the text row and collapses the bar to the slim fixed pill (instructions off). */
  line: string | null;
  /** Font size for the line, already scaled by the caller's fontScale setting. */
  fontSize: number;
  /** Progress fraction feeding the bar. */
  value: number;
  total: number;
  /** Running XP total shown beside the track. */
  xp: number;
  /** Optional structured content replacing the objective sentence. */
  header?: ReactNode;
}

/** A light wash of the interactive lavender — the accent at low strength, so it reads as the same
 *  colour family without competing with the buttons that use it at full strength. */
const OBJECTIVE_WASH = "#E7E1F1";

export function ObjectiveBar({ line, fontSize, value, total, xp, header }: Props) {
  const styles = useStyles(makeStyles);
  const expanded = line !== null || header != null;
  // Derived, not a constant: fontSize is already scaled by the caller's accessibility setting, so a
  // fixed box height would clip the text at the larger scales.
  const lineHeight = Math.round(fontSize * 1.18);
  // Each new instruction drops in from above. Keyed on the line itself, so it fires on a real change
  // of copy and not on every re-render the progress row causes.
  const enter = useSharedValue(1);
  useEffect(() => {
    enter.value = 0;
    enter.value = withTiming(1, { duration: 240, easing: Easing.out(Easing.cubic) });
  }, [enter, line]);
  const lineAnim = useAnimatedStyle(() => ({
    opacity: enter.value,
    transform: [{ translateY: -lineHeight * (1 - enter.value) }],
  }));
  return (
    <View
      style={[
        styles.objectiveBar,
        header != null && styles.objectiveBarStructured,
        !expanded && styles.objectiveBarSlim,
      ]}
      pointerEvents="none"
    >
      {header ?? (line !== null ? (
        // ONE line, fixed. The instruction changes on every step and its length changes with it, so
        // a box that sizes to its content made the bar breathe in and out under the player's eyes.
        // overflow:hidden is load-bearing — it is what the new line drops in from behind.
        <View
          style={[styles.objectivePill, { height: lineHeight + 6 }]}
        >
          <Animated.View style={[styles.objectiveLineRow, lineAnim]}>
            {/* A bullet, not a bare line: it marks the instruction as the ONE thing being asked for
                right now, and gives the eye a fixed point to return to as the words change. */}
            <View style={styles.objectiveBullet} />
            <Text
              style={[styles.objectiveText, { fontFamily: FONT, fontSize, lineHeight }]}
              numberOfLines={1}
              // Shrink rather than wrap: a second line would take the height back, and truncating an
              // instruction is the one outcome this screen cannot afford.
              adjustsFontSizeToFit
              minimumFontScale={0.72}
            >
              {line}
            </Text>
          </Animated.View>
        </View>
      ) : null)}
      {/* [★ star] [progress track] [XP label] — the badge sits ON the bar's left,
          the way the reference integrates the level star into the track. */}
      <View
        style={[
          styles.progressRow,
          expanded && styles.progressGap,
          header != null && styles.structuredProgressGap,
        ]}
      >
        <Image
          source={require("@/src/assets/ui/icons/icon-xp.png")}
          style={styles.xpBadge}
          resizeMode="contain"
        />
        {/* Badge and total together on the left: they are one fact, and splitting them across the track made the track a divider between a picture and a number that belong to each other. */}
        <Text style={styles.xpLabel} numberOfLines={1}>{xp}</Text>
        <ProgressBar value={value} total={total} style={styles.xpTrack} />
        {/* Step count as a ratio the eye can skip: the number that MOVES is full size in the text
            colour, the one that never changes is smaller and muted. Same information as "0/18",
            without two equal-weight numbers fighting over a slash. */}
        <View style={styles.stepCount}>
          <Text style={styles.stepNow}>{value}</Text>
          <Text style={styles.stepTotal}>/{total}</Text>
        </View>
      </View>
    </View>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    objectiveBar: {
      justifyContent: "center",
      // FIXED, not capped. A max width still lets the bar shrink to a short instruction and grow
      // back on the next one, which is the jitter itself. 360 + the pause button keeps the group
      // clear of the cluster chips at right:14.
      width: 360,
      backgroundColor: t.surface,
      borderColor: t.border,
      borderWidth: StyleSheet.hairlineWidth * 2,
      paddingHorizontal: SPACE.md,
      paddingVertical: 4,
      borderRadius: RADIUS.panel,
      ...ELEVATION.card,
    },
    // Instructions hidden — just the XP row. FIXED to the cluster panel's height (its
    // paddingTop 6 + chip 32 + paddingBottom 8 = 46); both sit at top:10, so their bottom
    // edges line up at y=56. No vertical padding: the 46 is the whole height.
    objectiveBarSlim: { width: 260, height: 46, paddingVertical: 0 },
    objectiveBarStructured: {
      width: 360,
      paddingVertical: 4,
    },
    // The instruction gets its own inset pill inside the bar: a light wash of the interactive
    // lavender, so the line reads as the live task rather than as a caption on a panel.
    objectivePill: {
      justifyContent: "center",
      overflow: "hidden",
      borderRadius: RADIUS.pill,
      backgroundColor: OBJECTIVE_WASH,
      paddingHorizontal: SPACE.md,
    },
    objectiveLineRow: { flexDirection: "row", alignItems: "center", gap: SPACE.sm },
    objectiveBullet: {
      width: 7,
      height: 7,
      borderRadius: 4,
      backgroundColor: t.accent,
    },
    objectiveText: {
      ...TYPE.body,
      flex: 1,
      color: t.text,
      fontWeight: "800",
      textAlign: "left",
    },
    progressGap: { marginTop: 2 },
    structuredProgressGap: { marginTop: 3 },

    // The XP badge sits INSIDE the bar, on the progress track's left — a star that overlaps
    // the track's start, with the running total beside it. (There is no level system in the
    // data — just xpPerStep — so this shows the honest running total, not a fake N/500.)
    progressRow: { flexDirection: "row", alignItems: "center", gap: SPACE.sm },
    xpBadge: {
      width: 24,
      height: 24,
      pointerEvents: "none",
      // Pull it left so it straddles the track's start, as the star did.
      marginRight: -2,
    },
    xpTrack: { flex: 1 },
    // minWidth on both flanks: without it the track resizes every time a number gains a digit, which
    // is the same jitter one level down.
    xpLabel: { ...TYPE.numeric, color: t.gold, minWidth: 26 },
    stepCount: { flexDirection: "row", alignItems: "baseline", minWidth: 38, justifyContent: "flex-end" },
    stepNow: { ...TYPE.numeric, color: t.text },
    stepTotal: { ...TYPE.numeric, fontSize: 10, color: t.textDim },
  });