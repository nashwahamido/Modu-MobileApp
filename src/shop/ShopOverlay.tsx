// The shop, as a popup layer over the room rather than a route, so the scene stays mounted
// The full-screen route at src/app/(presentation)/store.tsx still exists and is unchanged
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, StyleSheet, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { CloseIcon } from "@/src/components/Icons";
import { Button } from "@/src/game/ui/Button";
import { useStyles, useTheme } from "@/src/game/ui/theme";
import type { Theme } from "@/src/game/ui/theme";
import { useCurrentUserId, useRepos, viewCatalogue } from "@/src/data";
import type { ShopCategory, ShopItem, ShopItemId } from "@/src/data";
import { SCREEN_SIDE_MARGIN, SCREEN_VERTICAL_MARGIN } from "@/src/hooks/use-safe-insets";
import { ShopCategoryTabs } from "./ShopCategoryTabs";
import { ShopItemTile } from "./ShopItemTile";
import type { PurchaseBlock } from "./PurchaseNoticeDialog";
import { PurchaseConfirmPopup } from "./PurchaseConfirmPopup";
import { PurchaseNoticePopup } from "./PurchaseNoticePopup";

const TEXT_COLOR = "#231F20";
// Fixed four columns; the tile width is solved from the measured row width
const GRID_COLUMNS = 4;
const GRID_GAP = 22;
// Side breathing room, subtracted before the columns are solved so tiles really do shrink
const GRID_EDGE = 22;

export function ShopOverlay({ onClose }: { onClose: () => void }) {
  const s = useStyles(makeStyles);
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const repos = useRepos();
  const me = useCurrentUserId();

  const [items, setItems] = useState<ShopItem[]>([]);
  const [owned, setOwned] = useState<Set<ShopItemId>>(new Set());
  const [coins, setCoins] = useState(0);
  const [level, setLevel] = useState(1);
  const [loading, setLoading] = useState(true);
  // Distinct from "loaded and empty", which is a legitimate state.
  const [loadError, setLoadError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [category, setCategory] = useState<ShopCategory>("fur");
  const [busyId, setBusyId] = useState<ShopItemId | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ item: ShopItem; block: PurchaseBlock } | null>(null);
  const [confirm, setConfirm] = useState<ShopItem | null>(null);
  // Measured, since the panel's inset varies per device.
  const [gridWidth, setGridWidth] = useState(0);
  const tileWidth = Math.floor(
    (gridWidth - GRID_EDGE * 2 - GRID_GAP * (GRID_COLUMNS - 1)) / GRID_COLUMNS,
  );

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setLoadError(false);
    (async () => {
      try {
        const [catalogue, ownedIds, profile] = await Promise.all([
          repos.store.listItems(),
          repos.store.listOwned(me),
          repos.profiles.get(me),
        ]);
        if (!alive) return;
        setItems(catalogue);
        setOwned(new Set(ownedIds));
        setCoins(profile?.coins ?? 0);
        setLevel(profile?.level ?? 1);
      } catch (err) {
        // The repos throw, so this is the ordinary failure path, not an exotic one
        console.warn("[shop] could not load the shop:", (err as Error).message);
        if (alive) setLoadError(true);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [me, repos, reloadKey]);

  // Sorted by name: the popup has no sort control, so one stable order it is
  const visible = useMemo(() => viewCatalogue(items, category, "name"), [items, category]);

  // A tap explains a block or asks to confirm. Nothing is bought on the tap itself
  const requestBuy = (item: ShopItem) => {
    if (owned.has(item.id) || busyId) return;
    if (level < item.minLevel) return setNotice({ item, block: "level" });
    if (coins < item.price) return setNotice({ item, block: "coins" });
    setConfirm(item);
  };

  const buy = async (item: ShopItem) => {
    setConfirm(null);
    if (owned.has(item.id) || busyId) return;
    setBusyId(item.id);
    setNote(null);
    try {
      const res = await repos.store.purchase(me, item.id);
      if (res.ok) {
        setOwned((prev) => new Set(prev).add(item.id));
        setCoins(res.coinsRemaining);
        setNote(`Bought ${item.name}`);
      } else if (res.reason === "level_locked" || res.reason === "insufficient_coins") {
        // The server is authoritative, so echo its refusal
        setNotice({ item, block: res.reason === "level_locked" ? "level" : "coins" });
      } else {
        setNote("You already own that.");
      }
    } catch (err) {
      // A throw is transport, not a refusal. Coins move server-side, so nothing was spent
      console.warn("[shop] purchase failed:", (err as Error).message);
      setNote("Couldn't reach the shop. Nothing was charged — try again.");
    } finally {
      setBusyId(null);
    }
  };

  const padTop = 18 + Math.max(insets.top, SCREEN_VERTICAL_MARGIN);
  // Wider than the vertical inset, so the room still reads down both sides
  const padSide = 62 + Math.max(Math.max(insets.left, insets.right), SCREEN_SIDE_MARGIN);
  const padBottom = 18 + Math.max(insets.bottom, SCREEN_VERTICAL_MARGIN);

  return (
    <View style={s.layer}>
      {/* Also closes; Unlabelled since the cross is the labelled affordance */}
      <Pressable style={s.scrim} onPress={onClose} />

      <View style={[s.panel, { top: padTop, bottom: padBottom, left: padSide, right: padSide }]}>
        <ShopCategoryTabs category={category} onCategory={setCategory} rightInset={GRID_EDGE} />

        {note ? <Text style={s.note}>{note}</Text> : null}

        {loading ? (
          <View style={s.center}>
            <ActivityIndicator color={t.accent} />
          </View>
        ) : loadError ? (
          <View style={s.center}>
            <Text style={s.empty}>Couldn&apos;t load the shop. Check your connection.</Text>
            <Button label="Try again" variant="primary" onPress={() => setReloadKey((k) => k + 1)} />
          </View>
        ) : visible.length === 0 ? (
          <View style={s.center}>
            <Text style={s.empty}>Nothing here yet. Try another category.</Text>
          </View>
        ) : (
          <ScrollView
            contentContainerStyle={s.grid}
            showsVerticalScrollIndicator
            onLayout={(e) => setGridWidth(e.nativeEvent.layout.width)}
          >
            {/* Held back until the row is measured, or the grid lays out wrong then reflows */}
            {tileWidth > 0
              ? visible.map((item) => (
                  <ShopItemTile
                    key={item.id}
                    name={item.name}
                    price={item.price}
                    width={tileWidth}
                    owned={owned.has(item.id)}
                    lockLevel={level < item.minLevel ? item.minLevel : undefined}
                    onPress={() => requestBuy(item)}
                    disabled={owned.has(item.id) || busyId === item.id}
                  />
                ))
              : null}
          </ScrollView>
        )}
      </View>

      {/* Outside the panel so it can straddle the corner, as in the mockup*/}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Close the shop"
        hitSlop={12}
        style={[s.close, { top: padTop - 16, right: padSide - 16 }]}
        onPress={onClose}
      >
        <CloseIcon size={22} color="#FBFAF3" />
      </Pressable>

      {notice ? (
        <PurchaseNoticePopup
          name={notice.item.name}
          price={notice.item.price}
          minLevel={notice.item.minLevel}
          block={notice.block}
          onClose={() => setNotice(null)}
        />
      ) : null}
      {confirm ? (
        <PurchaseConfirmPopup
          name={confirm.name}
          price={confirm.price}
          onConfirm={() => buy(confirm)}
          onClose={() => setConfirm(null)}
        />
      ) : null}
    </View>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    // Above every room HUD layer so the popup owns the screen while it is up
    layer: {
      ...StyleSheet.absoluteFillObject,
      zIndex: 40,
    },
    // t.scrim: the same shading OverlaySheet uses, so every popup dims the same way
    scrim: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: t.scrim,
    },
    panel: {
      position: "absolute",
      borderRadius: 28,
      backgroundColor: "#FBFAF3",
      paddingTop: 18,
      paddingHorizontal: 22,
      overflow: "hidden",
      shadowColor: "#929292",
      shadowOpacity: 0.22,
      shadowRadius: 18,
      shadowOffset: { width: 0, height: 4 },
      elevation: 6,
    },
    grid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: GRID_GAP,
      paddingHorizontal: GRID_EDGE,
      // Inside the scroll content so it scrolls away instead of leaving a fixed band
      paddingTop: 20,
      paddingBottom: 24,
    },
    center: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      gap: 14,
    },
    empty: {
      fontFamily: "Lexend_400Regular",
      fontSize: 14,
      color: t.textDim,
      textAlign: "center",
    },
    note: {
      marginBottom: 8,
      fontFamily: "Lexend_400Regular",
      fontSize: 13,
      color: TEXT_COLOR,
    },
    close: {
      position: "absolute",
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: "#3D3A38",
      shadowColor: "#000",
      shadowOpacity: 0.2,
      shadowRadius: 6,
      shadowOffset: { width: 0, height: 2 },
      elevation: 6,
    },
  });
