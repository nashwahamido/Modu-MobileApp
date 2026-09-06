import { router } from "expo-router";
import { useEffect, useState } from "react";
import { StyleSheet, ActivityIndicator, Image, ScrollView, Text, TextInput, View } from "react-native";
import { Pressable } from "@/src/components/Pressable";
import { useScreenInsets } from '@/src/hooks/use-safe-insets';

import { Button } from "@/src/game/ui/system/Button";
import { avatarForProfile } from "@/src/components/avatarAssets";
import { RADIUS, TYPE, SPACE, useStyles, useTheme, useUiScale, SIZE } from "@/src/game/ui/system/theme";
import { FURNITURE_METAS } from "@/src/game/content/furnitures/furnitures";
import { useCurrentUserId, useRepos } from "@/src/data";
import type { FriendRequest, Profile } from "@/src/data";
import type { Theme } from "@/src/game/ui/system/theme";
import { SceneBackdrop } from "@/src/game/ui/backdrop/SceneBackdrop";
import { ASSEMBLE_ICON, STAR_ICON, levelIcon } from "@/src/components/iconAssets";
import { titleCase } from "@/src/data/player/levels";

const TOTAL_BUILDS = FURNITURE_METAS.length;

type FriendsTab = "friends" | "requests";

const backdrop = require("@/src/assets/ui/profile-backdrop.jpg");

const BG_FALLBACK = "#E9E6DF";

const GUTTER_H = 28;
const PANEL_SHADOW = {
  boxShadow: "0px 4px 10px rgba(0,0,0,0.12)",
  shadowColor: "#000",
  shadowOpacity: 0.14,
  shadowRadius: 8,
  shadowOffset: { width: 0, height: 3 },
  elevation: 3,
} as const;

const PANEL_LEAD = 32;

const BACK_ICON = 26;

const BACK_INSET = (SIZE.controlHeight - BACK_ICON) / 2;
const LIST_MAX = 4 * (34 + 8) + 8 * 2;
const GUTTER_V = 14;

export default function ProfileScreen() {
  const styles = useStyles(makeStyles);
  const t = useTheme();
  const safe = useScreenInsets();
  const repos = useRepos();
  const me = useCurrentUserId();

  const [profile, setProfile] = useState<Profile | null>(null);
  const [friends, setFriends] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [tab, setTab] = useState<FriendsTab>("friends");
  const uiScale = useUiScale();
  const avatarSize = Math.round(150 * uiScale);
  const cardWidth = Math.round(250 * uiScale);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [outgoing, setOutgoing] = useState<string[]>([]);
  const [incoming, setIncoming] = useState<Profile[]>([]);
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [result, setResult] = useState<Profile | "none" | null>(null);
  const [searched, setSearched] = useState("");

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setLoadError(false);
    (async () => {
      try {
        const [p, edges] = await Promise.all([repos.profiles.get(me), repos.friends.list(me)]);

        let sent: FriendRequest[] = [];
        let received: FriendRequest[] = [];
        try {
          [sent, received] = await Promise.all([repos.friendRequests.listOutgoing(me), repos.friendRequests.listIncoming(me)]);
        } catch (err) {
          console.warn("[profile] could not load friend requests:", (err as Error).message);
        }

        const senderIds = received.map((r) => r.fromId);
        const cards = await repos.profiles.getMany([...edges.map((e) => e.userId), ...senderIds]);
        if (!alive) return;
        const byId = new Map(cards.map((c) => [c.userId, c]));
        setProfile(p);
        setFriends(edges.map((e) => byId.get(e.userId)).filter((c): c is Profile => Boolean(c)));
        setOutgoing(sent.map((r) => r.toId));
        setIncoming(senderIds.map((id) => byId.get(id)).filter((c): c is Profile => Boolean(c)));
      } catch (err) {
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
      console.warn("[profile] could not save the name:", (err as Error).message);
    }
  };

  const removeFriend = async (id: string) => {
    const previous = friends;
    setFriends((list) => list.filter((f) => f.userId !== id));
    try {
      await repos.friends.remove(me, id);
    } catch (err) {
      console.warn("[profile] could not remove the friend:", (err as Error).message);
      setFriends(previous);
    }
  };

  const runSearch = async () => {
    const name = query.trim();
    if (!name) return;
    setSearched(name);
    setSearching(true);
    try {
      const found = await repos.profiles.findByUsername(name);
      setResult(found ?? "none");
    } catch (err) {
      console.warn("[profile] search failed:", (err as Error).message);
      setResult(null);
    } finally {
      setSearching(false);
    }
  };

  const sendRequest = async (toId: string) => {
    setOutgoing((list) => [...list, toId]);
    try {
      await repos.friendRequests.send(me, toId);
    } catch (err) {
      console.warn("[profile] could not send the request:", (err as Error).message);
      setOutgoing((list) => list.filter((id) => id !== toId));
    }
  };

  const acceptRequest = async (requesterId: string) => {
    const card = incoming.find((c) => c.userId === requesterId);
    setIncoming((list) => list.filter((c) => c.userId !== requesterId));
    if (card) setFriends((list) => (list.some((f) => f.userId === card.userId) ? list : [...list, card]));
    try {
      await repos.friendRequests.accept(me, requesterId);
    } catch (err) {
      console.warn("[profile] could not accept the request:", (err as Error).message);
      setReloadKey((k) => k + 1);
    }
  };

  const rejectRequest = async (requesterId: string) => {
    const card = incoming.find((c) => c.userId === requesterId);
    setIncoming((list) => list.filter((c) => c.userId !== requesterId));
    try {
      await repos.friendRequests.withdraw(requesterId, me);
    } catch (err) {
      console.warn("[profile] could not reject the request:", (err as Error).message);
      if (card) setIncoming((list) => (list.some((c) => c.userId === requesterId) ? list : [...list, card]));
    }
  };

  const pendingIncoming = incoming.filter((c) => !friends.some((f) => f.userId === c.userId));

  if (!loading && loadError && !profile) {
    return (
      <View style={[styles.root, styles.center]}>
        <Text style={styles.errorText}>Couldn&apos;t load your profile. Check your connection.</Text>
        <Button label="Try again" variant="primary" onPress={() => setReloadKey((k) => k + 1)} />
        <Button
          label="Home"
          onPress={() => router.dismissTo("/room")}
        />
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

  const levelStar = levelIcon(profile.level);

  return (
    <SceneBackdrop source={backdrop} style={styles.screen}>
      <View
      style={[
        styles.root,
        {
          paddingTop: GUTTER_V,
          paddingBottom: GUTTER_V + safe.bottom,
          paddingLeft: GUTTER_H + safe.left,
          paddingRight: GUTTER_H + safe.right,
        },
      ]}
    >
      <View style={[styles.header, { top: GUTTER_V, left: GUTTER_H + safe.left - BACK_INSET }]}>
        <Pressable
          style={styles.backButton}
          onPress={() => router.dismissTo("/room")}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Back to your room"
        >
          <Image
            source={require("@/src/assets/ui/icons/arrow-back.png")}
            style={styles.backIcon}
            resizeMode="contain"
          />
        </Pressable>
      </View>

      <View style={styles.body}>
        <View style={[styles.profileCard, { width: cardWidth }]}>
          <View style={[styles.avatarWrap, { width: avatarSize, height: avatarSize }]}>
            <Image
              source={avatarForProfile(profile.avatarMode)}
              style={[styles.avatar, { width: avatarSize, height: avatarSize, borderRadius: avatarSize / 2 }]}
            />
            <View style={styles.levelBadge}>
              <Image
                source={levelStar ?? STAR_ICON}
                style={styles.levelStar}
                resizeMode="contain"
              />
              {levelStar ? null : <Text style={styles.levelText}>{profile.level}</Text>}
            </View>
            <View style={styles.titleBadgeAnchor} pointerEvents="none">
              <View style={styles.titleBadge}>
                <Text style={styles.titleBadgeText} numberOfLines={1}>
                  {titleCase(profile.title ?? "newcomer")}
                </Text>
              </View>
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

          <View style={styles.statList}>
          <View style={styles.statRow}>
            <Image
              source={ASSEMBLE_ICON}
              style={styles.statIcon}
              resizeMode="contain"
            />
            <View style={styles.statBody}>
              <Text style={styles.statTitle}>
                {profile.itemsAssembled}/{TOTAL_BUILDS} Assemblies
              </Text>
            </View>
          </View>

          <View style={styles.statRow}>
            <Text style={[styles.statGlyph, styles.heartGlyph]}>♥</Text>
            <View style={styles.statBody}>
              <Text style={styles.statTitle}>{profile.likes} Likes</Text>
            </View>
          </View>
          </View>
        </View>

        <View style={styles.friendsPanel}>
          <View style={styles.searchRow}>
            <TextInput
              value={query}
              onChangeText={(text) => {
                setQuery(text);
                if (!text) setResult(null);
              }}
              style={styles.searchInput}
              placeholder="Find a player by name"
              placeholderTextColor={t.textFaint}
              autoCapitalize="none"
              returnKeyType="search"
              onSubmitEditing={runSearch}
              maxLength={24}
            />
            <Button label={searching ? "…" : "Find"} variant="primary" onPress={runSearch} disabled={searching} />
          </View>

          {result === "none" ? (
            <Text style={styles.searchNote}>No player called “{searched}”.</Text>
          ) : result ? (
            <View style={styles.friendRow}>
              <Image source={avatarForProfile(result.avatarMode)} style={styles.friendAvatar} />
              <Text style={styles.friendName} numberOfLines={1}>
                {result.username ?? "Builder"}
              </Text>
              {result.userId === me ? (
                <Text style={styles.searchNote}>That&apos;s you.</Text>
              ) : friends.some((f) => f.userId === result.userId) ? (
                <Text style={styles.searchNote}>Already friends</Text>
              ) : incoming.some((c) => c.userId === result.userId) ? (
                <Text style={styles.searchNote}>Already sent you a request — check Friend Requests</Text>
              ) : outgoing.includes(result.userId) ? (
                <Text style={styles.searchNote}>Requested</Text>
              ) : (
                <Pressable style={styles.removeBtn} onPress={() => sendRequest(result.userId)} hitSlop={6}>
                  <Text style={styles.removeText}>add friend</Text>
                </Pressable>
              )}
            </View>
          ) : null}

          <View style={styles.tabs}>
            <Pressable
              style={[styles.tab, tab === "friends" && styles.tabActive]}
              onPress={() => setTab("friends")}
            >
              <Text style={[styles.tabText, tab === "friends" && styles.tabTextActive]}>
                My Friends ({friends.length})
              </Text>
            </Pressable>
            <Pressable
              style={[styles.tab, tab === "requests" && styles.tabActive]}
              onPress={() => setTab("requests")}
            >
              <Text style={[styles.tabText, tab === "requests" && styles.tabTextActive]}>
                Friend Requests ({pendingIncoming.length})
              </Text>
            </Pressable>
          </View>

          {tab === "friends" ? (
            <ScrollView
              style={styles.list}
              contentContainerStyle={styles.listContent}
              showsVerticalScrollIndicator
              persistentScrollbar
            >
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
            <ScrollView
              style={styles.list}
              contentContainerStyle={styles.listContent}
              showsVerticalScrollIndicator
              persistentScrollbar
            >
              {pendingIncoming.map((c) => (
                <View key={c.userId} style={styles.friendRow}>
                  <Image source={avatarForProfile(c.avatarMode)} style={styles.friendAvatar} />
                  <Text style={styles.friendName} numberOfLines={1}>
                    {c.username ?? "Builder"}
                  </Text>
                  <Pressable style={styles.acceptBtn} onPress={() => acceptRequest(c.userId)} hitSlop={6}>
                    <Text style={styles.acceptText}>accept</Text>
                  </Pressable>
                  <Pressable style={styles.removeBtn} onPress={() => rejectRequest(c.userId)} hitSlop={6}>
                    <Text style={styles.removeText}>reject</Text>
                  </Pressable>
                </View>
              ))}
              {pendingIncoming.length === 0 && <Text style={styles.empty}>No friend requests yet.</Text>}
            </ScrollView>
          )}
        </View>
        </View>
      </View>
    </SceneBackdrop>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: BG_FALLBACK },
    root: { flex: 1 },
    center: { alignItems: "center", justifyContent: "center", gap: SPACE.md },
    errorText: { ...TYPE.body, color: t.textFaint, textAlign: "center", padding: SPACE.lg },
    header: {
      position: "absolute",
      zIndex: 5,
    },
    backButton: {
      width: SIZE.controlHeight,
      height: SIZE.controlHeight,
      alignItems: "center",
      justifyContent: "center",
    },
    backIcon: { width: BACK_ICON, height: BACK_ICON },

    body: { flex: 1, flexDirection: "row", gap: SPACE.md, minWidth: 0 },

    profileCard: {
      alignItems: "center",
      paddingTop: SPACE.lg,
    },
    avatarWrap: { width: 150, height: 150, marginBottom: SPACE.lg },
    avatar: {
      width: 150,
      height: 150,
      borderRadius: 75,
      borderWidth: 2,
      borderColor: t.border,
      backgroundColor: t.surfaceRaised,
    },
    levelBadge: { position: "absolute", top: -6, left: -6, alignItems: "center", justifyContent: "center" },
    levelStar: { width: 44, height: 44 },
    levelText: { position: "absolute", color: t.onAccent, fontSize: 13, fontWeight: "900" },

    nameRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: SPACE.sm,
      alignSelf: "center",
      maxWidth: "100%",
      height: SIZE.controlHeight,
      paddingHorizontal: SPACE.md,
      borderRadius: RADIUS.pill,
      borderWidth: 1,
      borderColor: t.border,
      backgroundColor: t.surface,
      marginBottom: SPACE.lg,
      ...PANEL_SHADOW,
    },
    nameText: { ...TYPE.title, color: t.text, flexShrink: 1 },
    nameInput: { ...TYPE.title, color: t.text, minWidth: 140, padding: 0, textAlign: "center" },
    pencil: { color: t.textDim, fontSize: 16 },
    saveText: { ...TYPE.label, color: t.accent },

    statList: { alignSelf: "center", marginTop: SPACE.xs },
    statRow: { flexDirection: "row", alignItems: "center", gap: SPACE.md, alignSelf: "stretch", marginBottom: SPACE.md },
    statIcon: { width: 36, height: 36 },
    statGlyph: { fontSize: 20, color: t.textDim, width: 26, textAlign: "center" },
    statBody: { flexShrink: 1 },
    statTitle: { ...TYPE.label, color: t.text },
    titleBadgeAnchor: {
      position: "absolute",
      bottom: -12,
      left: -60,
      right: -60,
      alignItems: "center",
    },
    titleBadge: {
      alignItems: "center",
      paddingHorizontal: SPACE.xl,
      paddingVertical: 3,
      borderRadius: RADIUS.pill,
      backgroundColor: t.surface,
      ...PANEL_SHADOW,
    },
    titleBadgeText: { ...TYPE.labelSm, color: t.text, letterSpacing: 0.3, textAlign: "center" },
    heartGlyph: { color: "#C2544B" },

    friendsPanel: { flex: 1, minWidth: 0, paddingTop: PANEL_LEAD },
    searchRow: { flexDirection: "row", alignItems: "center", gap: SPACE.sm, marginBottom: SPACE.sm },
    searchInput: {
      ...TYPE.labelSm,
      color: t.text,
      flex: 1,
      height: SIZE.controlHeightSm,
      paddingHorizontal: SPACE.md,
      borderRadius: RADIUS.pill,
      borderWidth: 1,
      borderColor: t.border,
      backgroundColor: t.surface,
      ...PANEL_SHADOW,
    },
    searchNote: { ...TYPE.labelSm, color: t.textFaint, paddingHorizontal: SPACE.sm },
    tabs: { flexDirection: "row", gap: SPACE.sm, marginBottom: SPACE.sm },
    tab: {
      flex: 1,
      height: SIZE.controlHeightSm,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: RADIUS.pill,
      borderWidth: 1,
      borderColor: t.border,
      backgroundColor: t.surface,
      ...PANEL_SHADOW,
    },
    tabActive: { backgroundColor: t.surfaceRaised, borderColor: t.borderStrong },
    tabText: { ...TYPE.label, color: t.textDim },
    tabTextActive: { color: t.text },

    list: {
      flexGrow: 0,
      flexShrink: 1,
      maxHeight: LIST_MAX,
      borderRadius: RADIUS.panel,
      borderWidth: 1,
      borderColor: t.border,
      backgroundColor: t.surface,
      ...PANEL_SHADOW,
    },
    listContent: { padding: SPACE.sm },
    friendRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: SPACE.md,
      minWidth: 0,
      paddingVertical: 4,
      paddingHorizontal: SPACE.sm,
    },
    friendAvatar: {
      width: 34,
      height: 34,
      borderRadius: RADIUS.pill,
      backgroundColor: t.surfaceRaised,
      borderWidth: 1,
      borderColor: t.border,
    },
    friendName: { ...TYPE.label, color: t.text, flex: 1, minWidth: 0 },
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
    acceptBtn: {
      paddingHorizontal: SPACE.md,
      height: 32,
      justifyContent: "center",
      borderRadius: RADIUS.pill,
      borderWidth: 1,
      borderColor: t.accent,
      backgroundColor: t.accent,
    },
    acceptText: { ...TYPE.labelSm, color: t.onAccent },

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