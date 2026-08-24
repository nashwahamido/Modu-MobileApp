// The chrome over a visited room: whose room this is, the way out, and the heart. Deliberately thin — a visit is look-and-like, so there is no bar of tools to host.
import {
  Image,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Pressable } from "@/src/components/Pressable";

import { avatarForProfile } from "@/src/components/avatarAssets";
import { CREAM, useFixedStyles, useTheme, LEXEND } from "@/src/game/ui/system/theme";
import type { Theme } from "@/src/game/ui/system/theme";
import type { Profile } from "@/src/data";
import { useScreenInsets } from '../../hooks/use-safe-insets';


export function VisitHud({
  host,
  liked,
  likes,
  empty,
  onToggleLike,
  onBack,
}: {
  host: Profile | null;
  liked: boolean;
  likes: number;
  empty: boolean;
  onToggleLike: () => void;
  onBack: () => void;
}) {
  const s = useFixedStyles(makeStyles);
  const t = useTheme();
  // Immersive mode reports 0 insets, so these floors sit UNDER the design's own offsets.
  const safe = useScreenInsets();
  const padTop = 12 + safe.top;
  const padL = 22 + safe.left;
  const padR = 22 + safe.right;
  const padBottom = 22 + safe.bottom;

  return (
    <>
      <View style={[s.header, { top: padTop, left: padL }]}>
        <Pressable accessibilityRole="button" accessibilityLabel="Back to your room" style={s.backButton} onPress={onBack} hitSlop={10}>
          <Text style={s.backGlyph}>‹</Text>
        </Pressable>
        <View style={s.hostCard}>
          <Image source={avatarForProfile(host?.avatarMode)} style={s.hostAvatar} />
          <Text style={s.hostName} numberOfLines={1}>
            {host?.username ?? "Builder"}&apos;s room
          </Text>
        </View>
      </View>

      {empty ? (
        <View style={[s.emptyNote, { top: padTop }]}>
          <Text style={s.emptyText}>They haven&apos;t decorated yet.</Text>
        </View>
      ) : null}

      <Pressable
        accessibilityRole="button"
        accessibilityState={{ selected: liked }}
        accessibilityLabel={liked ? "Unlike this room" : "Like this room"}
        style={[s.heart, { bottom: padBottom, right: padR }]}
        onPress={onToggleLike}
      >
        <Text style={[s.heartGlyph, liked && { color: t.danger }]}>{liked ? "♥" : "♡"}</Text>
        <Text style={s.heartCount}>{likes}</Text>
      </Pressable>
    </>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    header: {
      position: "absolute",
      zIndex: 12,
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
    },
    backButton: {
      width: 42,
      height: 42,
      borderRadius: 21,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: "#FBFAF3",
      borderWidth: 0.4,
      borderColor: "#D7D1CE",
    },
    backGlyph: {
      color: CREAM.ink,
      ...LEXEND.bold,
      fontSize: 26,
      // The glyph reads right-heavy in its box; nudge it back onto the centre.
      marginRight: 3,
      marginTop: -3,
    },
    hostCard: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      height: 42,
      paddingLeft: 5,
      paddingRight: 16,
      borderRadius: 21,
      backgroundColor: "#FBFAF3",
      borderWidth: 0.4,
      borderColor: "#D7D1CE",
    },
    hostAvatar: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: t.surfaceRaised,
    },
    hostName: {
      color: CREAM.ink,
      ...LEXEND.semibold,
      fontSize: 13,
      maxWidth: 180,
    },
    emptyNote: {
      position: "absolute",
      zIndex: 12,
      alignSelf: "center",
      paddingHorizontal: 16,
      paddingVertical: 8,
      borderRadius: 16,
      backgroundColor: "#FBFAF3",
      borderWidth: 0.4,
      borderColor: "#D7D1CE",
    },
    emptyText: {
      color: CREAM.ink,
      ...LEXEND.regular,
      fontSize: 12,
    },
    heart: {
      position: "absolute",
      zIndex: 14,
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      height: 48,
      paddingHorizontal: 18,
      borderRadius: 24,
      backgroundColor: "#FBFAF3",
      borderWidth: 0.4,
      borderColor: "#D7D1CE",
    },
    heartGlyph: {
      color: CREAM.ink,
      fontSize: 22,
      lineHeight: 26,
    },
    heartCount: {
      color: CREAM.ink,
      ...LEXEND.bold,
      fontSize: 14,
    },
  });
