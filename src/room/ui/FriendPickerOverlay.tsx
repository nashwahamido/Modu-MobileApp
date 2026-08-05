// Who to visit. A layer over the hub rather than a route, the way the shop and inventory are, so the room stays mounted and lit behind the scrim and dismissing costs nothing.
import { useEffect, useRef, useState } from "react";
import { router } from "expo-router";
import type { Href } from "expo-router";
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { avatarForProfile } from "@/src/components/avatarAssets";
import { Button } from "@/src/game/ui/Button";
import { OverlaySheet } from "@/src/game/ui/OverlaySheet";
import { RADIUS, SIZE, SPACE, TYPE, useStyles, useTheme } from "@/src/game/ui/theme";
import type { Theme } from "@/src/game/ui/theme";
import { useCurrentUserId, useRepos } from "@/src/data";
import type { Profile } from "@/src/data";

export function FriendPickerOverlay({ onClose }: { onClose: () => void }) {
  const s = useStyles(makeStyles);
  const t = useTheme();
  const repos = useRepos();
  const me = useCurrentUserId();

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
        // The friend EDGES first, then one batched fetch for the cards — never N round-trips.
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

  // onClose() only SCHEDULES the overlay's removal, it does not block this handler from running again, so a double-tap — the ordinary reflex on a list row — fires visit() twice before the first navigation unmounts anything and pushes /visit twice. Two visit screens means two Filament scenes, the exact invariant this route split exists to protect, and popping the top one back off leaves the lower one showing the PLAYER's own furniture under the friend's name, because its fetch effect will not re-run. The latch makes the second tap a no-op.
  const navigatedRef = useRef(false);

  // Close the layer on the way out: the visit is a route over the hub, and leaving this open would put the picker back on screen the moment the player returns.
  const visit = (ownerId: string) => {
    if (navigatedRef.current) return;
    navigatedRef.current = true;
    onClose();
    router.push(`/visit?ownerId=${encodeURIComponent(ownerId)}` as Href);
  };

  return (
    <OverlaySheet title="Visit a friend" subtitle="Take a look around their room" onClose={onClose}>
      {loading ? (
        <View style={s.center}>
          <ActivityIndicator color={t.accent} />
        </View>
      ) : loadError ? (
        <View style={s.center}>
          <Text style={s.empty}>Couldn&apos;t load your friends. Check your connection.</Text>
          <Button label="Try again" variant="primary" onPress={() => setReloadKey((k) => k + 1)} />
        </View>
      ) : friends.length === 0 ? (
        <View style={s.center}>
          <Text style={s.empty}>No friends yet — add some from your profile.</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={s.list}>
          {friends.map((f) => (
            <Pressable
              key={f.userId}
              accessibilityRole="button"
              accessibilityLabel={`Visit ${f.username ?? "Builder"}'s room`}
              style={s.row}
              onPress={() => visit(f.userId)}
            >
              <Image source={avatarForProfile(f.avatarMode)} style={s.avatar} />
              <View style={s.rowBody}>
                <Text style={s.name} numberOfLines={1}>
                  {f.username ?? "Builder"}
                </Text>
                <Text style={s.meta}>
                  level {f.level} · {f.likes} ♥
                </Text>
              </View>
              <Text style={s.caret}>›</Text>
            </Pressable>
          ))}
        </ScrollView>
      )}
    </OverlaySheet>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    center: { alignItems: "center", justifyContent: "center", gap: SPACE.md, padding: SPACE.xl },
    empty: { ...TYPE.body, color: t.textFaint, textAlign: "center" },
    list: { padding: SPACE.sm, gap: SPACE.sm },
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: SPACE.md,
      padding: SPACE.sm,
      borderRadius: RADIUS.panel,
      borderWidth: 1,
      borderColor: t.border,
      backgroundColor: t.surface,
    },
    avatar: {
      width: SIZE.controlHeight,
      height: SIZE.controlHeight,
      borderRadius: RADIUS.pill,
      backgroundColor: t.surfaceRaised,
      borderWidth: 1,
      borderColor: t.border,
    },
    rowBody: { flex: 1 },
    name: { ...TYPE.label, color: t.text },
    meta: { ...TYPE.labelSm, color: t.textFaint, marginTop: 1 },
    caret: { color: t.textDim, fontSize: 20, fontWeight: "800" },
  });
