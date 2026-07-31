// The player's profile hub: their card (avatar, level, editable nickname, stats) beside a friends list. Reads/writes entirely through the repo seam (src/data), so it works on fixtures today and swaps to Supabase untouched.
import { router } from "expo-router";
import { useEffect, useState } from "react";
import { StyleSheet, ActivityIndicator, Image, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { SCREEN_SIDE_MARGIN, SCREEN_VERTICAL_MARGIN } from "@/src/hooks/use-safe-insets";

import { Button } from "@/src/game/ui/Button";
import { SettingsIcon, StarIcon } from "@/src/components/Icons";
import { RADIUS, TYPE, ELEVATION, SPACE, useStyles, useTheme, SIZE } from "@/src/game/ui/theme";
import { FURNITURE_METAS } from "@/src/game/content/furnitures/furnitures";
import { avatarForProfile } from "@/src/game/core/avatar";
import { useCurrentUserId, useRepos } from "@/src/data";
import type { Profile } from "@/src/data";
import type { Theme } from "@/src/game/ui/theme";

// The "/N" denominator for items assembled: the same buildable set the catalogue counts.
const TOTAL_BUILDS = FURNITURE_METAS.length;

type FriendsTab = "friends" | "requests";

export default function ProfileScreen() {
  const styles = useStyles(makeStyles);
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const repos = useRepos();
  const me = useCurrentUserId();

  const [profile, setProfile] = useState<Profile | null>(null);
  const [friends, setFriends] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [tab, setTab] = useState<FriendsTab>("friends");
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setLoadError(false);
    (async () => {
      try {
        // The profile and the friend EDGES are independent; only the friend CARDS depend on the edges.
        const [p, edges] = await Promise.all([repos.profiles.get(me), repos.friends.list(me)]);
        const cards = await repos.profiles.getMany(edges.map((e) => e.userId));
        if (!alive) return;
        setProfile(p);
        setFriends(cards);
      } catch (err) {
        // The repos THROW on any Postgrest error, and the guard below renders a spinner whenever
        // profile is null — so without this the screen hangs on a dropped connection.
        console.warn("[profile] could not load:", (err as Error).message);
        if (alive) setLoadError(true);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [me, repos, reloadKey]);

  const saveName = async () => {
    const name = draft.trim();
    setEditing(false);
    if (!profile || !name || name === profile.username) return;
    try {
      const next = await repos.profiles.update(me, { username: name });
      setProfile(next);
    } catch (err) {
      // The username column is NOT NULL + UNIQUE, so a collision is an ordinary outcome here, not an
      // exceptional one. Leaving `profile` untouched reverts the field to the stored name.
      console.warn("[profile] could not save the name:", (err as Error).message);
    }
  };

  const removeFriend = async (id: string) => {
    // Optimistic: drop the row, then persist. The repo is the source of truth on next load.
    const previous = friends;
    setFriends((list) => list.filter((f) => f.userId !== id));
    try {
      await repos.friends.remove(me, id);
    } catch (err) {
      // Put them back. Without the rollback the friend stays gone on screen but is still in the DB,
      // so the list silently disagrees with the backend until the next load.
      console.warn("[profile] could not remove the friend:", (err as Error).message);
      setFriends(previous);
    }
  };

  if (!loading && loadError && !profile) {
    return (
      <View style={[styles.root, styles.center]}>
        <Text style={styles.errorText}>Couldn&apos;t load your profile. Check your connection.</Text>
        <Button label="Try again" variant="primary" onPress={() => setReloadKey((k) => k + 1)} />
        <Button label="Home" onPress={() => router.dismissTo("/room")} />
      </View>
    );
  }

  if (loading || !profile) {
    return (
      <View style={[styles.root, styles.center]}>
        <ActivityIndicator color={t.accent} />
      </View>
    );
  }

  return (
    <View style={[styles.root, { paddingTop: SPACE.sm + Math.max(insets.top, SCREEN_VERTICAL_MARGIN), paddingLeft: SPACE.xl + Math.max(insets.left, SCREEN_SIDE_MARGIN), paddingRight: SPACE.xl + Math.max(insets.right, SCREEN_SIDE_MARGIN) }]}>
      <View style={styles.header}>
        <Pressable style={styles.settingsLink} onPress={() => router.push("/settings")} hitSlop={8}>
          <SettingsIcon size={24} color={t.textDim} />
          <Text style={styles.settingsText}>Account & App settings</Text>
          <Text style={styles.caret}>›</Text>
        </Pressable>
        {/* dismissTo, not replace: pops back to the room already under the modal so it never remounts. */}
        <Button label="Home" onPress={() => router.dismissTo("/room")} />
      </View>

      <View style={styles.body}>
        <View style={styles.profileCard}>
          <View style={styles.avatarWrap}>
            <Image source={avatarForProfile(profile.avatarMode)} style={styles.avatar} />
            <View style={styles.levelBadge}>
              <StarIcon size={40} color={t.accent} />
              <Text style={styles.levelText}>{profile.level}</Text>
            </View>
          </View>

          {editing ? (
            <View style={styles.nameRow}>
              <TextInput
                value={draft}
                onChangeText={setDraft}
                style={styles.nameInput}
                autoFocus
                returnKeyType="done"
                onSubmitEditing={saveName}
                placeholder="Nickname"
                placeholderTextColor={t.textFaint}
                maxLength={24}
              />
              <Pressable onPress={saveName} hitSlop={8}>
                <Text style={styles.saveText}>Save</Text>
              </Pressable>
            </View>
          ) : (
            <Pressable
              style={styles.nameRow}
              onPress={() => {
                setDraft(profile.username ?? "");
                setEditing(true);
              }}
            >
              <Text style={styles.nameText} numberOfLines={1}>
                {profile.username ?? "Set a nickname"}
              </Text>
              <Text style={styles.pencil}>✎</Text>
            </Pressable>
          )}

          <View style={styles.statRow}>
            <Text style={styles.statGlyph}>✁</Text>
            <View style={styles.statBody}>
              <Text style={styles.statTitle}>{profile.title ?? "newcomer"}</Text>
              <Text style={styles.statSub}>
                {profile.itemsAssembled}/{TOTAL_BUILDS} items assembled
              </Text>
            </View>
          </View>

          <View style={styles.statRow}>
            <Text style={styles.statGlyph}>♡</Text>
            <View style={styles.statBody}>
              <Text style={styles.statTitle}>{profile.likes} liked</Text>
              <Text style={styles.statSub}>your cozy home!</Text>
            </View>
          </View>
        </View>

        <View style={styles.friendsPanel}>
          <View style={styles.tabs}>
            <Pressable
              style={[styles.tab, tab === "friends" && styles.tabActive]}
              onPress={() => setTab("friends")}
            >
              <Text style={[styles.tabText, tab === "friends" && styles.tabTextActive]}>
                My friends ({friends.length})
              </Text>
            </Pressable>
            <Pressable
              style={[styles.tab, tab === "requests" && styles.tabActive]}
              onPress={() => setTab("requests")}
            >
              <Text style={[styles.tabText, tab === "requests" && styles.tabTextActive]}>
                Friend requests
              </Text>
            </Pressable>
          </View>

          {tab === "friends" ? (
            <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
              {friends.map((f) => (
                <View key={f.userId} style={styles.friendRow}>
                  <Image source={avatarForProfile(f.avatarMode)} style={styles.friendAvatar} />
                  <Text style={styles.friendName} numberOfLines={1}>
                    {f.username ?? "Builder"}
                  </Text>
                  <Pressable style={styles.removeBtn} onPress={() => removeFriend(f.userId)} hitSlop={6}>
                    <Text style={styles.removeText}>remove</Text>
                  </Pressable>
                </View>
              ))}
              {friends.length === 0 && <Text style={styles.empty}>No friends yet.</Text>}
            </ScrollView>
          ) : (
            <View style={styles.emptyPane}>
              <Text style={styles.empty}>No friend requests yet.</Text>
            </View>
          )}
        </View>
      </View>
    </View>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: t.bg,
      paddingBottom: SPACE.md,
    },
    center: { alignItems: "center", justifyContent: "center", gap: SPACE.md },
    errorText: { ...TYPE.body, color: t.textFaint, textAlign: "center", padding: SPACE.lg },
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: SPACE.md,
    },
    settingsLink: { flexDirection: "row", alignItems: "center", gap: SPACE.sm },
    settingsText: { ...TYPE.label, color: t.textDim },
    caret: { color: t.textDim, fontSize: 20, fontWeight: "800" },

    body: { flex: 1, flexDirection: "row", gap: SPACE.xl },

    profileCard: {
      width: 300,
      alignItems: "center",
      paddingTop: SPACE.sm,
    },
    avatarWrap: { width: 150, height: 150, marginBottom: SPACE.md },
    avatar: {
      width: 150,
      height: 150,
      borderRadius: 75,
      borderWidth: 2,
      borderColor: t.border,
      backgroundColor: t.surfaceRaised,
    },
    levelBadge: { position: "absolute", top: -6, left: -6, alignItems: "center", justifyContent: "center" },
    levelText: { position: "absolute", color: t.onAccent, fontSize: 13, fontWeight: "900" },

    nameRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: SPACE.sm,
      alignSelf: "stretch",
      height: SIZE.controlHeight,
      paddingHorizontal: SPACE.md,
      borderRadius: RADIUS.pill,
      borderWidth: 1,
      borderColor: t.border,
      backgroundColor: t.surface,
      marginBottom: SPACE.lg,
      ...ELEVATION.card,
    },
    nameText: { ...TYPE.title, color: t.text, flexShrink: 1 },
    nameInput: { ...TYPE.title, color: t.text, flex: 1, padding: 0, textAlign: "center" },
    pencil: { color: t.textDim, fontSize: 16 },
    saveText: { ...TYPE.label, color: t.accent },

    statRow: { flexDirection: "row", alignItems: "center", gap: SPACE.md, alignSelf: "stretch", marginBottom: SPACE.md },
    statGlyph: { fontSize: 20, color: t.textDim, width: 26, textAlign: "center" },
    statBody: { flexShrink: 1 },
    statTitle: { ...TYPE.label, color: t.text },
    statSub: { ...TYPE.labelSm, color: t.textFaint, marginTop: 1 },

    friendsPanel: { flex: 1 },
    tabs: { flexDirection: "row", gap: SPACE.md, marginBottom: SPACE.md },
    tab: {
      flex: 1,
      height: SIZE.controlHeight,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: RADIUS.pill,
      borderWidth: 1,
      borderColor: t.border,
      backgroundColor: t.surface,
    },
    tabActive: { backgroundColor: t.surfaceRaised, borderColor: t.borderStrong },
    tabText: { ...TYPE.label, color: t.textDim },
    tabTextActive: { color: t.text },

    list: {
      flex: 1,
      borderRadius: RADIUS.panel,
      borderWidth: 1,
      borderColor: t.border,
      backgroundColor: t.surface,
    },
    listContent: { padding: SPACE.sm },
    friendRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: SPACE.md,
      paddingVertical: SPACE.sm,
      paddingHorizontal: SPACE.sm,
    },
    friendAvatar: {
      width: 44,
      height: SIZE.controlHeight,
      borderRadius: RADIUS.pill,
      backgroundColor: t.surfaceRaised,
      borderWidth: 1,
      borderColor: t.border,
    },
    friendName: { ...TYPE.label, color: t.text, flex: 1 },
    removeBtn: {
      paddingHorizontal: SPACE.md,
      height: 32,
      justifyContent: "center",
      borderRadius: RADIUS.pill,
      borderWidth: 1,
      borderColor: t.border,
      backgroundColor: t.bg,
    },
    removeText: { ...TYPE.labelSm, color: t.textDim },

    empty: { ...TYPE.body, color: t.textFaint, textAlign: "center", padding: SPACE.lg },
    emptyPane: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: RADIUS.panel,
      borderWidth: 1,
      borderColor: t.border,
      backgroundColor: t.surface,
    },
  });
