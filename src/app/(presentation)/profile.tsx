// The player's profile hub: their card (avatar, level, editable nickname, stats) beside a friends list. Reads/writes entirely through the repo seam (src/data), so it works on fixtures today and swaps to Supabase untouched.
import { router } from "expo-router";
import { useEffect, useState } from "react";
import { StyleSheet, ActivityIndicator, Image, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useScreenInsets } from '@/src/hooks/use-safe-insets';

import { Button } from "@/src/game/ui/system/Button";
import { SettingsIcon, StarIcon } from "@/src/components/Icons";
import { avatarForProfile } from "@/src/components/avatarAssets";
import { RADIUS, TYPE, ELEVATION, SPACE, useFixedStyles, useTheme, SIZE } from "@/src/game/ui/system/theme";
import { FURNITURE_METAS } from "@/src/game/content/furnitures/furnitures";
import { useCurrentUserId, useRepos } from "@/src/data";
import type { FriendRequest, Profile } from "@/src/data";
import type { Theme } from "@/src/game/ui/system/theme";

// The "/N" denominator for items assembled: the same buildable set the catalogue counts.
const TOTAL_BUILDS = FURNITURE_METAS.length;

type FriendsTab = "friends" | "requests";

export default function ProfileScreen() {
  const styles = useFixedStyles(makeStyles);
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
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [outgoing, setOutgoing] = useState<string[]>([]);
  const [incoming, setIncoming] = useState<Profile[]>([]);
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  // null = nothing searched yet; "none" = searched and nobody has that name.
  const [result, setResult] = useState<Profile | "none" | null>(null);
  // The name actually submitted to runSearch, separate from the live `query` box, so the "no such player" message can't be edited out from under an in-flight search.
  const [searched, setSearched] = useState("");

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setLoadError(false);
    (async () => {
      try {
        // The profile and the friend EDGES are independent; only the friend CARDS depend on the edges. Kept out of the request lists' Promise.all below on purpose: this pair genuinely IS the profile, so its failure is what the loadError screen below exists for.
        const [p, edges] = await Promise.all([repos.profiles.get(me), repos.friends.list(me)]);

        // The request lists are an additive panel on top of the profile, not the profile itself, so a missing friend_requests table (the migration isn't applied yet) or any other failure here is swallowed rather than thrown into the catch below — the requests tab just shows no requests instead of taking the avatar, level, nickname editing, stats and friends list down with it.
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
        // The repos THROW on any Postgrest error, and the guard below renders a spinner whenever profile is null — so without this the screen hangs on a dropped connection.
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
      // The username column is NOT NULL + UNIQUE, so a collision is an ordinary outcome here, not an exceptional one. Leaving `profile` untouched reverts the field to the stored name.
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
      // Put them back. Without the rollback the friend stays gone on screen but is still in the DB, so the list silently disagrees with the backend until the next load.
      console.warn("[profile] could not remove the friend:", (err as Error).message);
      setFriends(previous);
    }
  };

  const runSearch = async () => {
    const name = query.trim();
    if (!name) return;
    // Captured now, not read later from `query`, since the box keeps accepting edits while the request is in flight.
    setSearched(name);
    setSearching(true);
    try {
      const found = await repos.profiles.findByUsername(name);
      setResult(found ?? "none");
    } catch (err) {
      // A search that throws is a connection problem, not "no such player" — saying "no player called X" would be a lie.
      console.warn("[profile] search failed:", (err as Error).message);
      setResult(null);
    } finally {
      setSearching(false);
    }
  };

  const sendRequest = async (toId: string) => {
    // Functional updates both ways, not the captured `outgoing` closure: two rapid sends racing on the same snapshot would have the second overwrite the first's addition instead of appending to it, silently dropping a request.
    setOutgoing((list) => [...list, toId]);
    try {
      await repos.friendRequests.send(me, toId);
    } catch (err) {
      console.warn("[profile] could not send the request:", (err as Error).message);
      setOutgoing((list) => list.filter((id) => id !== toId));
    }
  };

  const acceptRequest = async (requesterId: string) => {
    // Optimistic on both lists: one accept changes the inbox AND the friends list.
    const card = incoming.find((c) => c.userId === requesterId);
    setIncoming((list) => list.filter((c) => c.userId !== requesterId));
    // Guarded against a friend already present: the crossed-request case (A and B each request the other, one accept already made them friends) would otherwise append the same card twice, producing a duplicate row, a duplicate React key, an off-by-one "My friends (N)", and a remove that filters both copies while only deleting one.
    if (card) setFriends((list) => (list.some((f) => f.userId === card.userId) ? list : [...list, card]));
    try {
      await repos.friendRequests.accept(me, requesterId);
    } catch (err) {
      // Accept is ambiguous on failure in a way reject/remove are not: the RPC may have already committed the friendship before its response was lost, so rolling back the two lists locally would tell the player the accept failed while they are in fact friends, and a re-tap would then hit "no pending friend request" forever, wedging the row. Reloading resolves the UI to the server's truth instead of guessing.
      console.warn("[profile] could not accept the request:", (err as Error).message);
      setReloadKey((k) => k + 1);
    }
  };

  const rejectRequest = async (requesterId: string) => {
    // Captures just the removed card, not the whole list, so the rollback below re-inserts precisely this row through a functional update instead of overwriting the current list with a stale full-list snapshot that could clobber a concurrent reject's already-successful removal.
    const card = incoming.find((c) => c.userId === requesterId);
    setIncoming((list) => list.filter((c) => c.userId !== requesterId));
    try {
      await repos.friendRequests.withdraw(requesterId, me);
    } catch (err) {
      console.warn("[profile] could not reject the request:", (err as Error).message);
      if (card) setIncoming((list) => (list.some((c) => c.userId === requesterId) ? list : [...list, card]));
    }
  };

  // Drops a leftover request from someone who is now already a friend — the crossed-request case, where A and B each requested the other and one accept already made them friends — so the requests tab never offers a meaningless Accept on a pair that's already mutual.
  const pendingIncoming = incoming.filter((c) => !friends.some((f) => f.userId === c.userId));

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
    <View style={[styles.root, { paddingTop: SPACE.sm + safe.top, paddingLeft: SPACE.xl + safe.left, paddingRight: SPACE.xl + safe.right }]}>
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
          <View style={styles.searchRow}>
            <TextInput
              value={query}
              onChangeText={(text) => {
                setQuery(text);
                // Clearing the box drops the stale result card too, so an emptied search doesn't keep showing a player who no longer matches anything typed.
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
            {/* Disabled while in flight, not just relabelled: without this a double-tap on "…" fires a second concurrent search. */}
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
                // Catches the case where this player already sent US a request: without this branch the "add friend" fallthrough below would fire a second, opposite-direction request instead of pointing them at the accept flow that already exists in the requests tab, and accepting from here would mean duplicating that tab's two-list optimistic rollback.
                <Text style={styles.searchNote}>Already sent you a request — check Friend requests</Text>
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
                My friends ({friends.length})
              </Text>
            </Pressable>
            <Pressable
              style={[styles.tab, tab === "requests" && styles.tabActive]}
              onPress={() => setTab("requests")}
            >
              <Text style={[styles.tabText, tab === "requests" && styles.tabTextActive]}>
                Friend requests ({pendingIncoming.length})
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
            <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
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
    searchRow: { flexDirection: "row", alignItems: "center", gap: SPACE.sm, marginBottom: SPACE.md },
    searchInput: {
      ...TYPE.label,
      color: t.text,
      flex: 1,
      height: SIZE.controlHeight,
      paddingHorizontal: SPACE.md,
      borderRadius: RADIUS.pill,
      borderWidth: 1,
      borderColor: t.border,
      backgroundColor: t.surface,
    },
    searchNote: { ...TYPE.labelSm, color: t.textFaint, paddingHorizontal: SPACE.sm },
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
