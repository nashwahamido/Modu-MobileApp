// The player's profile hub: their card (avatar, level, editable nickname, stats) beside a friends list. Reads/writes entirely through the repo seam (src/data), so it works on fixtures today and swaps to Supabase untouched.
import { router } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import type { ImageSourcePropType } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Button } from "@/src/game/ui/Button";
import { SettingsIcon, StarIcon } from "@/src/components/Icons";
import { ELEVATION, RADIUS, SPACE, Theme, TYPE, useStyles, useTheme } from "@/src/game/ui/theme";
import { FURNITURE_METAS } from "@/src/game/content/furnitures/furnitures";
import type { ProfileId } from "@/src/game/core/profile";
import { useCurrentUserId, useRepos } from "@/src/data";
import type { Profile } from "@/src/data";

// The "/N" denominator for items assembled: the same buildable set the catalogue counts.
const TOTAL_BUILDS = FURNITURE_METAS.filter((m) => !m.engineOnly).length;

// avatarMode -> avatar image, mirroring avatar-recommendation. Falls back to "control" when unset.
const AVATARS: Record<ProfileId, ImageSourcePropType> = {
  visual: require("../../assets/images/avatars/lumi.jpg"),
  momentum: require("../../assets/images/avatars/sparky.jpg"),
  clearPath: require("../../assets/images/avatars/ciara.jpg"),
  control: require("../../assets/images/avatars/felix.jpg"),
};
const avatarFor = (mode: ProfileId | null): ImageSourcePropType => AVATARS[mode ?? "control"];

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
  const [tab, setTab] = useState<FriendsTab>("friends");
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

  useEffect(() => {
    let alive = true;
    setLoading(true);
    (async () => {
      const p = await repos.profiles.get(me);
      const edges = await repos.friends.list(me);
      const cards = await repos.profiles.getMany(edges.map((e) => e.userId));
      if (!alive) return;
      setProfile(p);
      setFriends(cards);
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [me, repos]);

  const saveName = async () => {
    const name = draft.trim();
    setEditing(false);
    if (!profile || !name || name === profile.username) return;
    const next = await repos.profiles.update(me, { username: name });
    setProfile(next);
  };

  const removeFriend = async (id: string) => {
    // Optimistic: drop the row, then persist. The repo is the source of truth on next load.
    setFriends((list) => list.filter((f) => f.userId !== id));
    await repos.friends.remove(me, id);
  };

  if (loading || !profile) {
    return (
      <View style={[styles.root, styles.center]}>
        <ActivityIndicator color={t.accent} />
      </View>
    );
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top + SPACE.sm, paddingLeft: Math.max(insets.left, SPACE.xl), paddingRight: Math.max(insets.right, SPACE.xl) }]}>
      <View style={styles.header}>
        <Pressable style={styles.settingsLink} onPress={() => router.push("/settings")} hitSlop={8}>
          <SettingsIcon size={24} color={t.textDim} />
          <Text style={styles.settingsText}>Account & App settings</Text>
          <Text style={styles.caret}>›</Text>
        </Pressable>
        <Button label="Home" onPress={() => router.replace("/room")} />
      </View>

      <View style={styles.body}>
        <View style={styles.profileCard}>
          <View style={styles.avatarWrap}>
            <Image source={avatarFor(profile.avatarMode)} style={styles.avatar} />
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
                  <Image source={avatarFor(f.avatarMode)} style={styles.friendAvatar} />
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
    center: { alignItems: "center", justifyContent: "center" },
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
      height: 46,
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
      height: 42,
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
      height: 44,
      borderRadius: 22,
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
