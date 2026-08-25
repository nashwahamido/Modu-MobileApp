// The centred objective pill: instruction line + [★ star | progress track | XP label] row. SHARED by the play screen and the tutorial fork — edit here and both stay in sync.
import { useEffect, type ReactNode } from "react";
import { Image, StyleSheet, Text, View } from "react-native";
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { ProgressBar } from "@/src/game/ui/system/Button";
import { ELEVATION, FONT, RADIUS, SPACE, TYPE, Theme, useFixedStyles } from "@/src/game/ui/system/theme";

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

/** A light wash of the Continue blue (#A9BFD9), lifted toward white. Light enough that ink on it
 *  reads at 10.7:1, dark enough to still separate from the bar's cream — at the paler end of the
 *  ramp the pill stops looking like an inset and starts looking like a gap. */
const OBJECTIVE_WASH = "#C3D3E6";

export function ObjectiveBar({ line, fontSize, value, total, xp, header }: Props) {
  const styles = useFixedStyles(makeStyles);
  // The instruction IS the reading surface of the assembly screen.
  const expanded = line !== null || header != null;
  // Derived, not a constant: fontSize is already scaled by the caller's accessibility setting, so a fixed box height would clip the text at the larger scales.
  const lineHeight = Math.round(fontSize * 1.18);
  // How tall the pill is when the instruction fits on one line — the height it had at every step
  // before, and still has at most of them. Anything longer grows DOWNWARD from here; see the pill.
  const oneLine = lineHeight + 6;
  // Each new instruction drops in from above. Keyed on the line itself, so it fires on a real change of copy and not on every re-render the progress row causes.
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
        // ONE LINE, OR TWO WHEN ONE WILL NOT DO. `minHeight` rather than `height`, so the pill keeps
        // its old size at every step that fits and grows by exactly one line at the few that do not.
        //
        // It was a fixed one-line box with `adjustsFontSizeToFit`, which meant a long instruction was
        // not truncated — it was SHRUNK, down to 72% of the player's chosen size. EKET is where that
        // bites: thirteen of its steps are two-clause sentences ("Press the Top panel onto its pins,
        // then push it forward to lock."), and on a 360pt bar they all fell to the floor scale. The
        // one screen whose whole job is to be read was setting its most detailed instructions in its
        // smallest type, and for a player who had turned the font size UP.
        //
        // The original comment here argued against sizing to content, and it was right about the
        // failure it named: a box free to be any height makes the bar breathe under the player's
        // eyes as the copy changes. Two fixed steps is not that. There are exactly two heights, most
        // steps sit at the first, and the second is a single line taller.
        //
        // overflow:hidden stays load-bearing — it is what the new line drops in from behind.
        <View
          style={[styles.objectivePill, { minHeight: oneLine }]}
        >
          <Animated.View style={[styles.objectiveLineRow, lineAnim]}>
            {/* A bullet, not a bare line: it marks the instruction as the ONE thing being asked for
                right now, and gives the eye a fixed point to return to as the words change. */}
            <View style={styles.objectiveBullet} />
            <Text
              style={[styles.objectiveText, { fontFamily: FONT, fontSize, lineHeight }]}
              // A CEILING AT THREE, and nothing shrinks to reach it.
              //
              // `adjustsFontSizeToFit` used to sit here with a 0.72 floor, and that is what made the
              // long steps unreadable: RN does not grow the box to fit the words, it shrinks the
              // words to fit the box. So EKET's two-clause steps were set at 72% of the size the
              // player had chosen — the one screen whose whole job is to be read, setting its most
              // detailed instructions in its smallest type, for someone who had turned the size UP.
              //
              // Without it the text simply WRAPS at the player's own size and the pill grows by a
              // line to hold it, which is what `minHeight` above is for. Every step in the app now
              // fits two lines at the default scale: EKET's longest three were rewritten to reach
              // that, and the rest were already inside it.
              //
              // Three rather than two, because the ceiling has to leave room for the accessibility
              // scales. At 17pt or 20pt the two-line steps take a third line on their own, and a
              // hard two would TRUNCATE them — cutting an instruction in half is the one outcome
              // this screen cannot afford, and it is strictly worse than a taller bar.
              numberOfLines={3}
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
        {/* Progress as a PERCENTAGE, not a step ratio: "43%" answers "how far along am I"
            directly, where "6/14" asks the player to do the division themselves. Whole
            numbers only — decimal places would imply a precision the step count doesn't have. */}
        <Text style={styles.stepPct}>
          {total > 0 ? Math.round((value / total) * 100) : 0}%
        </Text>
      </View>
    </View>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    objectiveBar: {
      justifyContent: "center",
      // FIXED, not capped. A max width still lets the bar shrink to a short instruction and grow back on the next one, which is the jitter itself. 360 + the pause button keeps the group clear of the cluster chips at right:14.
      width: 420,
      backgroundColor: t.surface,
      borderColor: t.border,
      borderWidth: StyleSheet.hairlineWidth * 2,
      paddingHorizontal: SPACE.md,
      paddingVertical: 4,
      borderRadius: RADIUS.panel,
      ...ELEVATION.card,
    },
    // Instructions hidden — just the XP row. FIXED to the cluster panel's height (its paddingTop 6 + chip 32 + paddingBottom 8 = 46); both sit at top:10, so their bottom edges line up at y=56. No vertical padding: the 46 is the whole height.
    objectiveBarSlim: { width: 260, height: 46, paddingVertical: 0 },
    objectiveBarStructured: {
      width: 360,
      paddingVertical: 4,
    },
    // The instruction gets its own inset pill inside the bar: a light wash of the interactive lavender, so the line reads as the live task rather than as a caption on a panel.
    objectivePill: {
      justifyContent: "center",
      overflow: "hidden",
      borderRadius: RADIUS.pill,
      backgroundColor: OBJECTIVE_WASH,
      paddingHorizontal: SPACE.md,
      // The 6pt that `oneLine` accounts for, as real padding now that the height can grow: at one
      // line it reproduces the old box exactly, and at two it keeps the same air above and below
      // rather than letting the second line sit against the rim.
      paddingVertical: 3,
    },
    objectiveLineRow: { flexDirection: "row", alignItems: "center", gap: SPACE.sm },
    objectiveBullet: {
      width: 7,
      height: 7,
      borderRadius: 4,
      // Stays lavender: it marks the live task, and the accent is what "act on this" means here.
      backgroundColor: t.accent,
    },
    objectiveText: {
      ...TYPE.body,
      flex: 1,
      // INK, not t.text: the pill behind it is OBJECTIVE_WASH, a fixed light blue in BOTH themes,
      // so a theme-following colour turned the instruction near-white on pale blue in dark mode.
      // The text has to answer to what it sits on, not to the app theme.
      color: "#231F20",
      fontWeight: "800",
      textAlign: "left",
    },
    progressGap: { marginTop: 2 },
    structuredProgressGap: { marginTop: 3 },

    // The XP badge sits INSIDE the bar, on the progress track's left — a star that overlaps the track's start, with the running total beside it. (There is no level system in the data — just xpPerStep — so this shows the honest running total, not a fake N/500.)
    // gap xs, not sm: the row's width is fixed, so every point of gap is a point the track loses.
    progressRow: { flexDirection: "row", alignItems: "center", gap: SPACE.xs },
    xpBadge: {
      width: 24,
      height: 24,
      pointerEvents: "none",
      // Pull it left so it straddles the track's start, as the star did.
      marginRight: -2,
    },
    xpTrack: { flex: 1 },
    // minWidth on both flanks: without it the track resizes every time a number gains a digit, which
    // is the same jitter one level down. The two flanks are the SAME width so the track sits centred
    // between them — 26 vs 44 put a visible hole between the bar and the percentage while the XP
    // side sat tight against it. 40 fits the widest content either flank can hold ("100%").
    // The XP number sits TIGHT against its badge — the two are one fact — so it takes its natural
    // width with no reserved box: a minWidth here parks empty space between the number and the
    // track, which is what pushed the track off centre.
    xpLabel: { ...TYPE.numeric, color: t.gold },
    // The percentage keeps a fixed box (so the track can't resize as 9% → 100%) but its text hugs
    // the track, putting that reserved space on the OUTSIDE. With the XP tight on the left and the
    // percentage tight on the right, the track has an equal gap on each side.
    stepPct: { ...TYPE.numeric, color: t.text, minWidth: 34, textAlign: "left" },
  });