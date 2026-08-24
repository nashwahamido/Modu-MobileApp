// Who to visit. A layer over the hub rather than a route, the way the shop and inventory are, so the room stays mounted and lit behind the scrim and dismissing costs nothing.
//
// TRIPLET with ShopOverlay and InventoryOverlay, and framed exactly like them: the same panel insets,
// the same cream card, the same floating close chip, the same slide-up, and the same plank across the
// top. It used to be the generic dark OverlaySheet, which made the one popup you reach from the same
// bar look like it belonged to another app. Anything that must LOOK the same is a shared token or a
// shared helper (popupInsets, popupBoard, slideUp) — never a number copied out of the twins.
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

// The avatar's well: the item tiles' frame fill and radius, so a friend row and a shop tile are cut
// from the same material.
const AVATAR = 46;
// The level star, drawn at the size the shop's coin badge is — these two are the app's two "a number
// on a piece of artwork" badges and they should read as one component.
const STAR = 38;

export function FriendPickerOverlay({ onClose }: { onClose: () => void }) {
  const s = useFixedStyles(makeStyles);
  // The rows are fixed points inside a panel that grows with the screen, so on a tablet they would sit
  // small in a much larger card. useTileScale is the twins' answer to exactly that, and sharing it is
  // what keeps a friend's name the same size as an item's.
  const k = useTileScale();
  const r = useScaledStyles(makeRowStyles, k);
  const t = useTheme();
  const repos = useRepos();
  const me = useCurrentUserId();
  const { sheetStyle, scrimStyle, requestClose } = useSlideUpPresentation(onClose);
  // Proportional on a tablet, the authored points on a phone — see components/popupInsets.
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
    requestClose();
    router.push(`/visit?ownerId=${encodeURIComponent(ownerId)}` as Href);
  };

  return (
    <View style={s.layer}>
      <Animated.View style={[s.scrim, scrimStyle]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={requestClose} />
      </Animated.View>

      <Animated.View
        style={[s.panel, { top: padTop, bottom: padBottom, left: padSide, right: padSide }, sheetStyle]}
      >
        {/* NO PLANK HERE. The shop and the inventory wear one because it is the mount for their
            category tabs — it exists to carry six discs. This popup has nothing to switch between, so
            the same board behind a title was a large shape with no job, and it swamped the panel. The
            heading sits directly on the cream instead. */}
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
                  {/* The numbered artwork where it exists; past the last one the blank star carries the
                      level as text — the same fallback the shop's lock badge uses. */}
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

      <Animated.View style={[s.close, { top: padTop - 16, right: padSide - 16 }, sheetStyle]}>
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

// The frame: identical to the twins', because it IS the twins' frame.
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
    // CREAM.inkDim, not the theme's textDim the twins use: this panel is theme-invariant cream, and
    // textDim is not — in dark mode it resolves to a stone grey that reads weakly against it.
    empty: {
      ...LEXEND.regular,
      fontSize: 14,
      color: CREAM.inkDim,
      textAlign: "center",
    },
    // The animated wrapper
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
    // The Pressable inside it. Fills the disc so the whole circle is tappable, and re-centres the cross because the icon is now a grandchild.
    closeHit: {
      ...StyleSheet.absoluteFillObject,
      alignItems: "center",
      justifyContent: "center",
    },
  });

// The rows, which scale on a tablet where the frame above does not.
const makeRowStyles = (_t: Theme) =>
  StyleSheet.create({
    // Centred over the list, on the panel's own cream
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
    // GRID_EDGE, so a row starts where a tile's leftmost column does and the board above spans both
    list: {
      paddingHorizontal: GRID_EDGE,
      paddingTop: 20,
      paddingBottom: 24,
      gap: 12,
    },
    // A tile's material: the same fill, the same corner, the same lift off the panel, and no outline —
    // these surfaces are told apart from the panel's cream by their FILL.
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
    // The avatar sits in a well of the panel's own cream, so the artwork reads as mounted on the row
    // rather than printed on it
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
    // The item name tab's type, so a friend and a piece of furniture are named the same way
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
