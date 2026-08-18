import { useEffect } from "react";
import { GrainOverlay } from "@/src/game/ui/system/Button";
import { Image, StyleSheet, Text, View } from "react-native";
import Svg, { Defs, RadialGradient, Rect, Stop } from "react-native-svg";
import { useGameStore } from "@/src/game/core/store";
import { avatarHeadForProfile } from "@/src/components/avatarAssets";
import { Theme, useFixedStyles, useReadingFont } from "@/src/game/ui/system/theme";

/** FREE-mode soft nudge: a calm, low-stimulation message shown when the player reaches for a part that isn't ready yet ("Maybe place the leg first."). Driven by store.hint (set by noteBlocked); off entirely in plan/guide and when the softHints setting is off (noteBlocked no-ops there). */
const DISMISS_MS = 3200;

export function HintToast() {
  const styles = useFixedStyles(makeStyles);
  // A hint is read, not glanced at.
  const readingFont = useReadingFont();
  const hint = useGameStore((s) => s.hint);
  const hintTone = useGameStore((s) => s.hintTone);
  const clearHint = useGameStore((s) => s.clearHint);
  const fontScale = useGameStore((s) => s.settings.fontScale);
  // The player's OWN companion delivers the nudge — Felix in Control, Sparky in Momentum — the same
  // character that taught them in the tutorial. A hint is the one moment in the build where
  // something speaks to you, and it should be a voice they recognise.
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
          {/* White at the centre falling to cream at the rim — the same pool of light the tutorial
              portrait sits in. SVG because RN has no radial gradient. */}
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
        {/* A blocked move colours the BUBBLE in the warning tone — the same hue as the hard
            difficulty band — so the toast registers as "that didn't work" before the words are
            read. The ink stays dark: red-on-red text would cost the legibility the message needs. */}
        <View style={[styles.bubble, hintTone === "error" && styles.bubbleError]}>
          <GrainOverlay radius={14} />
          <Text style={[styles.text, { fontFamily: readingFont, fontSize: Math.round(14 * fontScale) }]}>{hint}</Text>
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
  // Avatar and bubble travel as ONE object, centred as a pair.
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
    // Only the corners the gradient's square Rect can't reach — matched to its OUTER stop.
    backgroundColor: "#EADFCB",
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  // OVER 100%: the head art carries its own padding, so filling the tile exactly still left the face
  // small inside it. Scaling past the frame crops that padding rather than the character.
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