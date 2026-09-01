import { useEffect, type ReactNode } from "react";
import { Image, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { ProgressBar } from "@/src/game/ui/system/Button";
import { ELEVATION, FONT, RADIUS, SPACE, TYPE, Theme, useFixedStyles, useUiScale } from "@/src/game/ui/system/theme";

interface Props {
  line: string | null;
  fontSize: number;
  value: number;
  total: number;
  xp: number;
  header?: ReactNode;
}

const OBJECTIVE_WASH = "#C3D3E6";

const BAR_W = 420;
const SLIM_W = 260;
const STRUCTURED_W = 360;
const TOP_ROW_RESERVE = 210;

export function ObjectiveBar({ line, fontSize, value, total, xp, header }: Props) {
  const styles = useFixedStyles(makeStyles);
  const k = useUiScale();
  const { width: winW } = useWindowDimensions();
  const grow = Math.max(1, Math.min(k, (winW - TOP_ROW_RESERVE * 2) / BAR_W));
  const expanded = line !== null || header != null;
  const lineHeight = Math.round(fontSize * 1.18);
  const oneLine = lineHeight + 6;
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
        { width: Math.round((header != null ? STRUCTURED_W : !expanded ? SLIM_W : BAR_W) * grow) },
      ]}
      pointerEvents="none"
    >
      {header ?? (line !== null ? (
        <View
          style={[styles.objectivePill, { minHeight: oneLine }]}
        >
          <Animated.View style={[styles.objectiveLineRow, lineAnim]}>
            <View style={styles.objectiveBullet} />
            <Text
              style={[styles.objectiveText, { fontFamily: FONT, fontSize, lineHeight }]}
              numberOfLines={3}
            >
              {line}
            </Text>
          </Animated.View>
        </View>
      ) : null)}
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
        <Text style={styles.xpLabel} numberOfLines={1}>{xp}</Text>
        <ProgressBar value={value} total={total} style={styles.xpTrack} />
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
      width: BAR_W,
      backgroundColor: t.surface,
      borderColor: t.border,
      borderWidth: StyleSheet.hairlineWidth * 2,
      paddingHorizontal: SPACE.md,
      paddingVertical: 4,
      borderRadius: RADIUS.panel,
      ...ELEVATION.card,
    },
    objectiveBarSlim: { width: SLIM_W, height: 46, paddingVertical: 0 },
    objectiveBarStructured: {
      width: STRUCTURED_W,
      paddingVertical: 4,
    },
    objectivePill: {
      justifyContent: "center",
      overflow: "hidden",
      borderRadius: RADIUS.pill,
      backgroundColor: OBJECTIVE_WASH,
      paddingHorizontal: SPACE.md,
      paddingVertical: 3,
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
      color: "#231F20",
      fontWeight: "800",
      textAlign: "left",
    },
    progressGap: { marginTop: 2 },
    structuredProgressGap: { marginTop: 3 },

    progressRow: { flexDirection: "row", alignItems: "center", gap: SPACE.xs },
    xpBadge: {
      width: 24,
      height: 24,
      pointerEvents: "none",
      marginRight: -2,
    },
    xpTrack: { flex: 1 },
    xpLabel: { ...TYPE.numeric, color: t.gold },
    stepPct: { ...TYPE.numeric, color: t.text, minWidth: 34, textAlign: "left" },
  });