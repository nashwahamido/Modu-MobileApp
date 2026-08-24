// The chrome over a visited room: whose room this is, the way out, and the heart. Deliberately thin — a visit is look-and-like, so there is no bar of tools to host.
import {
  Image,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Pressable } from "@/src/components/Pressable";

import { avatarForProfile } from "@/src/components/avatarAssets";
import { BackIcon } from "@/src/components/Icons";
import { CARD_CHROME, CREAM, useFixedStyles, useTheme, LEXEND } from "@/src/game/ui/system/theme";
import type { Theme } from "@/src/game/ui/system/theme";
import type { Profile } from "@/src/data";
import { useScreenInsets } from '../../hooks/use-safe-insets';
import { ROOM_CHIP_RADIUS, ROOM_CHIP_SIZE } from './RoomLightControls';

/** The chips' cream, shared with the room's other chrome. */
const CHIP_FILL = '#FBFAF3';

// The arrow inside the back chip. Sized so the drawn angle matches the weight the typed "‹" had at
// 26pt bold — the icon's own box is 14 of its 24 units tall, so this renders about 13pt of chevron.
const BACK_ICON_SIZE = 22;


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
          <BackIcon size={BACK_ICON_SIZE} color={CREAM.ink} />
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
    // THE SAME CHIP the light switch and the hour button below it wear — same box, same corner, same
    // cream, same shadow, taken from their constants rather than matched by eye. It heads that column,
    // so it has to be one of them: at 42pt and fully round it read as a different kind of control that
    // happened to be parked above them, and it sat 6pt narrower than the chips it was leading.
    backButton: {
      width: ROOM_CHIP_SIZE,
      height: ROOM_CHIP_SIZE,
      borderRadius: ROOM_CHIP_RADIUS,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: CHIP_FILL,
      ...CARD_CHROME,
      borderWidth: 0,
    },
    // Its height follows the chip beside it, and its chrome does too: the two are one row, and a
    // hairline pill next to a shadowed chip reads as one of them being a mistake.
    hostCard: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      height: ROOM_CHIP_SIZE,
      paddingLeft: 5,
      paddingRight: 16,
      borderRadius: ROOM_CHIP_RADIUS,
      backgroundColor: CHIP_FILL,
      ...CARD_CHROME,
      borderWidth: 0,
    },
    hostAvatar: {
      width: 38,
      height: 38,
      borderRadius: 19,
      backgroundColor: t.surfaceRaised,
    },
    hostName: {
      color: CREAM.ink,
      ...LEXEND.semibold,
      fontSize: 16.5,
      // Raised WITH the type: at the old 180 a longer name simply hit the ellipsis sooner at the
      // larger size, which would have read as the name shrinking rather than growing.
      maxWidth: 260,
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
