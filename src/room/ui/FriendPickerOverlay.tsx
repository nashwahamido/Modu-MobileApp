import {
  useEffect,
  useRef,
  useState } from "react";
import { router } from "expo-router";
import type { Href } from "expo-router";
import { ActivityIndicator,
  Animated,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Pressable } from "@/src/components/Pressable";

import { avatarForProfile } from "@/src/components/avatarAssets";
import { CloseIcon } from "@/src/components/Icons";
import { STAR_ICON, levelIcon } from "@/src/components/iconAssets";
import { GRID_EDGE, PANEL_EDGE, usePopupInsets } from "@/src/components/popupInsets";
import { FRAME_FILL, FRAME_RADIUS, useTileScale } from "@/src/components/ItemTileFrame";
import { Button } from "@/src/game/ui/system/Button";
import { useSlideUpPresentation } from "@/src/game/ui/system/slideUp";
import {
  CARD_CHROME,
  CREAM,
  CREAM_LIFT,
  LEXEND,
  useFixedStyles,
  useScaledStyles,
  useTheme,
} from "@/src/game/ui/system/theme";
import type { Theme } from "@/src/game/ui/system/theme";
import { useCurrentUserId, useRepos } from "@/src/data";
import type { Profile } from "@/src/data";

const AVATAR = 46;
const STAR = 38;

export function FriendPickerOverlay({ onClose }: { onClose: () => void }) {
  const s = useFixedStyles(makeStyles);
  const k = useTileScale();
  const r = useScaledStyles(makeRowStyles, k);
  const t = useTheme();
  const repos = useRepos();
  const me = useCurrentUserId();
  const { sheetStyle, scrimStyle, requestClose } = useSlideUpPresentation(onClose);
  const { padTop, padSide, padBottom } = usePopupInsets();

  const [friends, setFriends] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setLoadError(false);
    (async () => {
      try {
        const edges = await repos.friends.list(me);
        const cards = await repos.profiles.getMany(edges.map((e) => e.userId));
        if (!alive) return;
        setFriends(cards);
      } catch (err) {
        console.warn("[visit] could not load the friends list:", (err as Error).message);
        if (alive) setLoadError(true);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [me, repos, reloadKey]);

  const navigatedRef = useRef(false);

  const visit = (ownerId: string) => {
    if (navigatedRef.current) return;
    navigatedRef.current = true;
    requestClose();
    router.push(`/visit?ownerId=${encodeURIComponent(ownerId)}` as Href);
  };

  return (
    <View style={s.layer}>
      <Animated.View style={[s.scrim, scrimStyle]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={requestClose} />
      </Animated.View>

      <Animated.View
        style={[
          s.panel,
          {
            top: padTop,
            bottom: padBottom,
            left: padSide,
            right: padSide,
          },
          sheetStyle,
        ]}
      >
        <View style={r.header}>
          <Text style={r.title} numberOfLines={1}>
            Visit a friend
          </Text>
          <Text style={r.subtitle} numberOfLines={1}>
            Take a look around their room
          </Text>
        </View>

        {loading ? (
          <View style={s.center}>
            <ActivityIndicator color={t.accent} />
          </View>
        ) : loadError ? (
          <View style={s.center}>
            <Text style={s.empty}>Couldn&apos;t load your friends. Check your connection.</Text>
            <Button label="Try again" variant="primary" onPress={() => setReloadKey((n) => n + 1)} />
          </View>
        ) : friends.length === 0 ? (
          <View style={s.center}>
            <Text style={s.empty}>No friends yet — add some from your profile.</Text>
          </View>
        ) : (
          <ScrollView contentContainerStyle={r.list} showsVerticalScrollIndicator>
            {friends.map((f) => {
              const star = levelIcon(f.level);
              return (
                <Pressable
                  key={f.userId}
                  accessibilityRole="button"
                  accessibilityLabel={`Visit ${f.username ?? "Builder"}'s room`}
                  style={({ pressed }) => [r.row, pressed && r.rowPressed]}
                  onPress={() => visit(f.userId)}
                >
                  <View style={r.avatarWell}>
                    <Image source={avatarForProfile(f.avatarMode)} style={r.avatar} resizeMode="contain" />
                  </View>
                  <View style={r.body}>
                    <Text style={r.name} numberOfLines={1}>
                      {f.username ?? "Builder"}
                    </Text>
                    <Text style={r.meta} numberOfLines={1}>
                      {f.likes} ♥
                    </Text>
                  </View>
                  <View style={r.star}>
                    <Image source={star ?? STAR_ICON} style={r.starArt} resizeMode="contain" />
                    {star ? null : <Text style={r.starLevel}>{f.level}</Text>}
                  </View>
                </Pressable>
              );
            })}
          </ScrollView>
        )}
      </Animated.View>

      <Animated.View
        style={[
          s.close,
          {
            top: padTop - 16,
            right: padSide - 16,
          },
          sheetStyle,
        ]}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close"
          hitSlop={12}
          style={s.closeHit}
          onPress={requestClose}
        >
          <CloseIcon size={22} color={CREAM.card} />
        </Pressable>
      </Animated.View>
    </View>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    layer: {
      ...StyleSheet.absoluteFillObject,
      zIndex: 40,
    },
    scrim: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: t.scrim,
    },
    panel: {
      position: "absolute",
      borderRadius: 28,
      backgroundColor: CREAM.card,
      paddingTop: 18,
      paddingHorizontal: PANEL_EDGE,
      overflow: "hidden",
      ...CREAM_LIFT.panel,
    },
    center: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      gap: 14,
    },
    empty: {
      ...LEXEND.regular,
      fontSize: 14,
      color: CREAM.inkDim,
      textAlign: "center",
    },
    close: {
      position: "absolute",
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: CREAM.darkChip,
      ...CREAM_LIFT.chip,
    },
    closeHit: {
      ...StyleSheet.absoluteFillObject,
      alignItems: "center",
      justifyContent: "center",
    },
  });

const makeRowStyles = (_t: Theme) =>
  StyleSheet.create({
    header: {
      alignItems: "center",
      paddingTop: 4,
      paddingBottom: 2,
    },
    title: {
      ...LEXEND.semibold,
      fontSize: 18,
      lineHeight: 23,
      color: CREAM.ink,
      textAlign: "center",
    },
    subtitle: {
      ...LEXEND.regular,
      fontSize: 12,
      lineHeight: 16,
      color: CREAM.inkDim,
      textAlign: "center",
    },
    list: {
      paddingHorizontal: GRID_EDGE,
      paddingTop: 20,
      paddingBottom: 24,
      gap: 12,
    },
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      paddingVertical: 8,
      paddingHorizontal: 10,
      borderRadius: FRAME_RADIUS,
      backgroundColor: FRAME_FILL,
      ...CARD_CHROME,
      borderWidth: 0,
    },
    rowPressed: {
      opacity: 0.7,
    },
    avatarWell: {
      width: AVATAR,
      height: AVATAR,
      borderRadius: AVATAR / 2,
      backgroundColor: CREAM.card,
      alignItems: "center",
      justifyContent: "center",
      overflow: "hidden",
    },
    avatar: {
      width: AVATAR,
      height: AVATAR,
    },
    body: {
      flex: 1,
    },
    name: {
      ...LEXEND.semibold,
      fontSize: 13,
      color: CREAM.ink,
    },
    meta: {
      ...LEXEND.regular,
      fontSize: 11,
      color: CREAM.inkDim,
      marginTop: 1,
    },
    star: {
      width: STAR,
      height: STAR,
      alignItems: "center",
      justifyContent: "center",
    },
    starArt: {
      width: STAR,
      height: STAR,
    },
    starLevel: {
      position: "absolute",
      ...LEXEND.bold,
      fontSize: 13,
      color: CREAM.card,
    },
  });
