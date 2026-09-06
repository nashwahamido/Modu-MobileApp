import { useEffect } from "react";
import { GrainOverlay } from "@/src/game/ui/system/Button";
import { Image, StyleSheet, Text, View } from "react-native";
import Svg, { Defs, RadialGradient, Rect, Stop } from "react-native-svg";
import { useGameStore } from "@/src/game/core/store";
import { avatarHeadForProfile } from "@/src/components/avatarAssets";
import { FONT, Theme, useFixedStyles } from "@/src/game/ui/system/theme";

const DISMISS_MS = 3200;

export function HintToast() {
  const styles = useFixedStyles(makeStyles);
  const hint = useGameStore((s) => s.hint);
  const hintTone = useGameStore((s) => s.hintTone);
  const clearHint = useGameStore((s) => s.clearHint);
  const fontScale = useGameStore((s) => s.settings.fontScale);
  const profile = useGameStore((s) => s.profile);

  useEffect(() => {
    if (!hint) return;
    const t = setTimeout(clearHint, DISMISS_MS);
    return () => clearTimeout(t);
  }, [hint, clearHint]);

  if (!hint) return null;
  return (
    <View style={styles.wrap} pointerEvents="none">
      <View style={styles.row}>
        <View style={styles.avatarTile}>
          <Svg style={StyleSheet.absoluteFill} pointerEvents="none">
            <Defs>
              <RadialGradient id="hintglow" cx="50%" cy="45%" r="65%">
                <Stop offset="0" stopColor="#FFFFFF" />
                <Stop offset="1" stopColor="#EADFCB" />
              </RadialGradient>
            </Defs>
            <Rect x="0" y="0" width="100%" height="100%" fill="url(#hintglow)" />
          </Svg>
          <Image source={avatarHeadForProfile(profile)} style={styles.avatar} resizeMode="cover" />
        </View>
        <View style={[styles.bubble, hintTone === "error" && styles.bubbleError]}>
          <GrainOverlay radius={14} />
          <Text style={[styles.text, { fontFamily: FONT, fontSize: Math.round(14 * fontScale) }]}>{hint}</Text>
        </View>
      </View>
    </View>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
  wrap: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 60,
    alignItems: "center",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    maxWidth: "86%",
  },
  avatarTile: {
    width: 54,
    height: 54,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: t.surface,
    backgroundColor: "#EADFCB",
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  avatar: { width: "124%", height: "124%" },
  bubble: {
    flexShrink: 1,
    backgroundColor: t.surface,
    borderRadius: 14,
    paddingVertical: 9,
    paddingHorizontal: 16,
  },
  text: { color: t.text, fontWeight: "700", textAlign: "center" },
  bubbleError: { backgroundColor: "#C98B76" },
  });