// The player's profile hub: their card (avatar, level, editable nickname, stats) beside a friends list. Reads/writes entirely through the repo seam (src/data), so it works on fixtures today and swaps to Supabase untouched.
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

// The "/N" denominator for items assembled: the same buildable set the catalogue counts.
const TOTAL_BUILDS = FURNITURE_METAS.length;

type FriendsTab = "friends" | "requests";

/** "an ambitious newbie" -> "An Ambitious Newbie". The titles are authored lowercase, and a rank
 *  reads as a rank when it is capitalised like one. */
/** The avatar recommendation's backdrop, so the two "who you are" screens share a look. */
/** Shared with the avatar recommendation screen — the two are the same moment either side of
 *  onboarding ("this is who you are"), so they wear the same art rather than each tuning a ramp. */
const backdrop = require("@/src/assets/ui/profile-backdrop.jpg");

/** What shows for the frame before the artwork decodes, and behind it if the asset ever fails to
 *  load. Sampled from the art's own open area so the swap is invisible rather than a flash. */
const BG_FALLBACK = "#E9E6DF";

/** The screen's own margins, before any device inset is added on top. */
const GUTTER_H = 28;
/** The lift under every cream surface on this screen — the search field, both tabs, the list and the
 *  name pill.
 *
 *  Lifted from the catalogue's own local SHADOW, and written as `boxShadow` for the same reason it is
 *  there: RN 0.81 renders boxShadow on ANDROID with a real colour and alpha, where `elevation`
 *  ignores shadowColor/shadowOpacity entirely and draws its own soft grey ramp. The remaining keys
 *  are the iOS fallback for the old architecture. Darker: raise the alpha. Softer: raise the blur. */
const PANEL_SHADOW = {
  // 0.40 -> 0.12, and the blur widened 4 -> 10. At two fifths alpha over a four-pixel blur this was a
  // hard dark band under every cream surface rather than a lift — five of them stacked down the
  // screen, so the whole page read as harsh. A wide, faint shadow reads as height; a tight, dark one
  // reads as an outline.
  boxShadow: "0px 4px 10px rgba(0,0,0,0.12)",
  shadowColor: "#000",
  // The iOS fallback, matched to the same weight rather than left at its old 0.8.
  shadowOpacity: 0.14,
  shadowRadius: 8,
  shadowOffset: { width: 0, height: 3 },
  // Android's own ramp, for the old architecture where boxShadow is not honoured. Down with the rest.
  elevation: 3,
} as const;

/** How far the friends column starts below the top of the screen. It clears the avatar's own top
 *  (GUTTER_V + the card's SPACE.lg = 30) and then some, so the column reads as deliberately set
 *  down rather than as almost-aligned. One number to retune the whole right-hand stack. */
const PANEL_LEAD = 32;

/** The back arrow's drawn size. 26 is what the questionnaire and the avatar screen give the same
 *  asset, so the glyph reads at one weight wherever the app offers a way back. */
const BACK_ICON = 26;

/** The empty padding inside the back button, taken back off its position.
 *
 *  The button is a 44pt touch target around a 26pt icon, so putting its BOX on the gutter would
 *  leave the ICON — the only part anyone can see — sitting 9pt further in than every other edge on
 *  the screen. Optical alignment: what lines up is the paint, not the hit area. Derived from the two
 *  sizes rather than typed as a number, so it follows if either changes. */
const BACK_INSET = (SIZE.controlHeight - BACK_ICON) / 2;
/** How tall the friends list may get before it scrolls: four rows plus its own padding.
 *  A row is the 34pt avatar with 4pt above and below, and listContent adds SPACE.sm each end. */
const LIST_MAX = 4 * (34 + 8) + 8 * 2;
/** Was 4 — a seventh of the horizontal gutter, so the search field and the home icon sat almost on
 *  the glass while the sides had a generous 28. Landscape has less height to give than width, so
 *  this stays smaller than GUTTER_H; it just stops being a hairline. The left column's stack is
 *  330pt tall against the 356 this leaves, so the room is there to spend. */
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
  // The avatar is the one thing here worth more pixels on a tablet — it is the player's own face on
  // their own page. The card follows so the name and stats keep their proportions; nothing else
  // on the screen scales.
  const uiScale = useUiScale();
  const avatarSize = Math.round(150 * uiScale);
  const cardWidth = Math.round(250 * uiScale);
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

  // Below the guard, so `profile` is known. Null past the last numbered star, which is what switches
  // the badge to the plain star with the level drawn as text.
  const levelStar = levelIcon(profile.level);

  return (
    // The artwork is the screen ROOT, through SceneBackdrop — an ImageBackground, never an
    // <Image absoluteFill>, which scales the same file differently and renders it zoomed (see the
    // note at the top of SceneBackdrop.tsx). It also keeps the art UNPADDED: an absolute child is
    // inset by its parent's padding, so drawing the background inside the padded root below would
    // leave a border of flat colour all round and read as a frame rather than as the background.
    <SceneBackdrop source={backdrop} style={styles.screen}>
      <View
      style={[
        styles.root,
        {
          // A gutter of its own on every edge, with the device inset ADDED to it. The bottom edge had
          // none at all, so the friends list ran under the gesture bar; the sides were a spacing
          // token that read as nothing once the card and the panel filled the row.
          // No safe.top here. This screen is presented MODALLY, so it already begins below the
          // system bars — adding the inset again was clearing the same obstacle twice. In landscape
          // a cutout sits on the SIDES, which the left and right insets below still handle.
          paddingTop: GUTTER_V,
          paddingBottom: GUTTER_V + safe.bottom,
          paddingLeft: GUTTER_H + safe.left,
          paddingRight: GUTTER_H + safe.right,
        },
      ]}
    >
      <View style={[styles.header, { top: GUTTER_V, left: GUTTER_H + safe.left - BACK_INSET }]}>
        {/* The drawn arrow head, the same asset the questionnaire and the avatar screen use — a "<"
            glyph is a less-than sign that happens to look like an arrow, and it renders differently
            in every font.
            dismissTo, not replace: pops back to the room already under the modal so it never
            remounts. The DESTINATION has not changed with the icon; only what it looks like has. */}
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
            {/* The numbered star ARTWORK, not a drawn star with a number typed over it — the same
                rule RoomTopStats follows, so a player's level looks identical in the room and on
                their profile. Past the last numbered star the artwork runs out, and only then does
                the plain star carry the level as text. */}
            <View style={styles.levelBadge}>
              <Image
                source={levelStar ?? STAR_ICON}
                style={styles.levelStar}
                resizeMode="contain"
              />
              {levelStar ? null : <Text style={styles.levelText}>{profile.level}</Text>}
            </View>
            {/* Straddling the avatar's lower edge, so the rank reads as belonging TO the face above
                it rather than as the first line of a list below it. */}
            {/* An anchor WIDER THAN THE AVATAR, with the pill centred in it and still sized by its
                own text. The pill used to be the absolute child itself, which capped its width at the
                150pt avatar — 102pt of that once the padding is taken — so a two-word rank wrapped.
                The anchor is the only thing that stretches; the badge inside it hugs its label. */}
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

          {/* The two stats are ONE block, centred as a block. Left-aligned rows stretched across the
              card sat hard against its left edge under a centred avatar and a centred name, so the
              column read as two different layouts stacked. Inside the block they stay left-aligned,
              which is what keeps the two icons on a common edge and the numbers scannable. */}
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
              // Android hides the bar the moment a scroll ends, so a bounded list looks like a full
              // one until you touch it. persistentScrollbar keeps it drawn, which is the only cue
              // that there is more list below the fold. No-op on iOS, where the prop is ignored.
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
              // Android hides the bar the moment a scroll ends, so a bounded list looks like a full
              // one until you touch it. persistentScrollbar keeps it drawn, which is the only cue
              // that there is more list below the fold. No-op on iOS, where the prop is ignored.
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
    // Full bleed, never padded: this is what the gradient measures against, and its colour is the
    // gradient's first stop so the frame before the SVG paints is a settling rather than a flash.
    screen: { flex: 1, backgroundColor: BG_FALLBACK },
    root: { flex: 1 },
    center: { alignItems: "center", justifyContent: "center", gap: SPACE.md },
    errorText: { ...TYPE.body, color: t.textFaint, textAlign: "center", padding: SPACE.lg },
    // OUT OF THE FLOW. As a row it cost 44pt of button plus a 12pt margin before the card could
    // start — 56pt of empty band across the top for one small icon. Absolute, it sits in the corner
    // it always sat in and the content begins at the top of the screen.
    // The gutter is given EXPLICITLY at the call site, from the same two constants the root pads
    // itself with. `top: 0, left: 0` put the house within a few points of the screen edge while the
    // search field beside it sat 28 in — an absolute child here resolves against the border box,
    // not the padding box, so it was outside the margins the rest of the screen keeps.
    header: {
      position: "absolute",
      zIndex: 5,
    },
    // The bare icon, no chip. On the artwork a bordered cream pill reads as a button parked on top
    // of it; the arrow alone is unmistakable and lets the background run behind it. hitSlop keeps
    // the touch target at size even though the paint no longer shows it.
    backButton: {
      width: SIZE.controlHeight,
      height: SIZE.controlHeight,
      alignItems: "center",
      justifyContent: "center",
    },
    // 26, matching the nav arrows on the questionnaire and the avatar screen — the same glyph at the
    // same weight wherever it appears. The house it replaced was 22, which is why BACK_INSET is
    // derived from this number rather than left at the old one.
    backIcon: { width: BACK_ICON, height: BACK_ICON },

    // Tighter gap and a narrower card, so the friends list starts further left. SPACE.xl between two
    // columns on a phone is a corridor; the panel is better off with the width.
    body: { flex: 1, flexDirection: "row", gap: SPACE.md, minWidth: 0 },

    profileCard: {
      alignItems: "center",
      // The one column that wanted to come DOWN: the face and its details read better with a little
      // air above them, where the list beside it reads better starting high.
      paddingTop: SPACE.lg,
    },
    // The badge hangs off the bottom edge, so the wrap must not clip and needs room beneath it for
    // the overhang before the name starts.
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
    // 44 where the drawn star was 40: the artwork leaves ~7% of its canvas empty on each axis, so a
    // matched box would have drawn it smaller than the vector it replaced.
    levelStar: { width: 44, height: 44 },
    levelText: { position: "absolute", color: t.onAccent, fontSize: 13, fontWeight: "900" },

    nameRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: SPACE.sm,
      // Hugs the name rather than spanning the card: stretched, a five-letter nickname sat in a
      // 300pt pill and read as an empty input field waiting to be filled.
      alignSelf: "center",
      maxWidth: "100%",
      height: SIZE.controlHeight,
      paddingHorizontal: SPACE.md,
      borderRadius: RADIUS.pill,
      borderWidth: 1,
      borderColor: t.border,
      backgroundColor: t.surface,
      marginBottom: SPACE.lg,
      // PANEL_SHADOW, not ELEVATION.card: the shared scale sets shadowOpacity and elevation, neither of which Android honours — so on device that pill had no shadow at all while the rest of the screen now does.
      ...PANEL_SHADOW,
    },
    nameText: { ...TYPE.title, color: t.text, flexShrink: 1 },
    // The INPUT keeps a working width — a field that shrank to its text would be unusable to type in.
    nameInput: { ...TYPE.title, color: t.text, minWidth: 140, padding: 0, textAlign: "center" },
    pencil: { color: t.textDim, fontSize: 16 },
    saveText: { ...TYPE.label, color: t.accent },

    // Centred under the face, sized by its own content. `alignSelf: "stretch"` on the ROWS is what
    // used to push them to the card's left edge; the block carries the centring now and the rows
    // fill it, so the two icons still share a left edge as they always did.
    statList: { alignSelf: "center", marginTop: SPACE.xs },
    statRow: { flexDirection: "row", alignItems: "center", gap: SPACE.md, alignSelf: "stretch", marginBottom: SPACE.md },
    // Wider than the 26 the row's other glyph gets, because the artwork carries its own margin: it
    // fills 67% of its canvas, so 36 draws about 24pt of mark — level with the heart beside it
    // rather than a third smaller than it.
    statIcon: { width: 36, height: 36 },
    statGlyph: { fontSize: 20, color: t.textDim, width: 26, textAlign: "center" },
    statBody: { flexShrink: 1 },
    statTitle: { ...TYPE.label, color: t.text },
    // Straddles the avatar's lower edge and reaches 60pt past it on each side, so the pill inside has
    // 270pt to grow into rather than 150. It has no background of its own — it is room, not a shape.
    titleBadgeAnchor: {
      position: "absolute",
      bottom: -12,
      left: -60,
      right: -60,
      alignItems: "center",
    },
    titleBadge: {
      alignItems: "center",
      // 24 a side, which is what the removed star and its gap used to occupy — put back as air on
      // both sides rather than as a mark on one.
      paddingHorizontal: SPACE.xl,
      paddingVertical: 3,
      borderRadius: RADIUS.pill,
      backgroundColor: t.surface,
      // PANEL_SHADOW, the same lift every other cream surface on this page carries — the name pill,
      // the stat panels, the friends card. Without it this badge sat flat against the avatar while
      // everything around it floated. NOT ELEVATION.card: the shared scale drives shadowOpacity and
      // elevation, neither of which Android honours here, so it would have read as no shadow at all
      // on device (see the note on PANEL_SHADOW).
      ...PANEL_SHADOW,
    },
    // ONE LINE, always — the rank is a label, and a two-line pill under a face reads as a caption.
    titleBadgeText: { ...TYPE.labelSm, color: t.text, letterSpacing: 0.3, textAlign: "center" },
    // Filled, and red: an outline heart reads as "not yet liked", the opposite of a count received.
    heartGlyph: { color: "#C2544B" },

    // minWidth 0 is what lets a flex child shrink BELOW its content. Without it the panel refuses to
    // go narrower than its widest row, the body row grows past the screen, and the padding around it
    // is pushed off the edges — which reads as no margins at all rather than as an overflow.
    // Starts level with the AVATAR, not with the top of the screen. The profile card takes SPACE.lg
    // above the face; without the same lead here the search field began a row higher than the
    // portrait beside it, and the two columns read as though they had been pasted in separately.
    friendsPanel: { flex: 1, minWidth: 0, paddingTop: PANEL_LEAD },
    searchRow: { flexDirection: "row", alignItems: "center", gap: SPACE.sm, marginBottom: SPACE.sm },
    searchInput: {
      ...TYPE.labelSm,
      color: t.text,
      flex: 1,
      // controlHeightSm, not controlHeight. This column is a list of names with a filter above it —
      // none of it is a primary action, and at 44pt each row and control was claiming the space the
      // list itself wants. Still clears the touch minimum.
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

    // BOUNDED, not flex:1. Filling the panel's leftover height made the list run the full drop of
    // the screen with five names in it and a field of empty cream beneath them. It now shrinks to
    // its content and stops at LIST_MAX — about four rows — so a short list is short and a long one
    // scrolls. flexShrink lets it give way if the panel above it ever grows.
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
      // A roll call, not a set of cards: at SPACE.sm each name took ~50pt for one line of text, and
      // more names visible without scrolling is the only thing this list is for.
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