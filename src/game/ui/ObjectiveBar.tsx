// The centred objective pill: instruction line + [★ star | progress track | XP label] row. SHARED by the play screen and the tutorial fork — edit here and both stay in sync.
import { Image, StyleSheet, Text, View } from "react-native";
import { ProgressBar } from "@/src/game/ui/Button";
import { ELEVATION, RADIUS, SPACE, Theme, TYPE, useStyles } from "@/src/game/ui/theme";

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
}

export function ObjectiveBar({ line, fontSize, value, total, xp }: Props) {
  const styles = useStyles(makeStyles);
  return (
    <View
      style={[styles.objectiveBar, line === null && styles.objectiveBarSlim]}
      pointerEvents="none"
    >
      {line !== null ? (
        <Text style={[styles.objectiveText, { fontSize }]} numberOfLines={2}>
          {line}
        </Text>
      ) : null}
      {/* [★ star] [progress track] [XP label] — the badge sits ON the bar's left,
          the way the reference integrates the level star into the track. */}
      <View style={[styles.progressRow, line !== null && styles.progressGap]}>
        <Image
          source={require("@/src/assets/ui/icons/icon-xp.png")}
          style={styles.xpBadge}
          resizeMode="contain"
        />
        <ProgressBar value={value} total={total} style={styles.xpTrack} />
        <Text style={styles.xpLabel}>{xp}</Text>
      </View>
    </View>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    objectiveBar: {
      justifyContent: "center",
      // CAPPED. The bar is centred and the cluster chips sit at right:14, so an unbounded
      // bar grows under them on a long instruction. 360 + the pause button keeps the whole
      // group clear of that corner; anything longer wraps to a second line instead.
      maxWidth: 360,
      backgroundColor: t.surface,
      borderColor: t.border,
      borderWidth: StyleSheet.hairlineWidth * 2,
      paddingHorizontal: SPACE.lg,
      // With the objective sentence shown the bar needs two rows, so it sizes to content.
      paddingVertical: 6,
      borderRadius: RADIUS.panel,
      ...ELEVATION.card,
    },
    // Instructions hidden — just the XP row. FIXED to the cluster panel's height (its
    // paddingTop 6 + chip 32 + paddingBottom 8 = 46); both sit at top:10, so their bottom
    // edges line up at y=56. No vertical padding: the 46 is the whole height.
    objectiveBarSlim: { width: 260, height: 46, paddingVertical: 0 },
    objectiveText: { ...TYPE.body, color: t.text, fontSize: 13, lineHeight: 15 },
    progressGap: { marginTop: SPACE.sm },

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
    xpLabel: { ...TYPE.numeric, color: t.gold },
  });