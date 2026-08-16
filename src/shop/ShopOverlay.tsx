// shop, as a popup layer over the room rather than a route, so the scene stays mounted. Twin of InventoryOverlay, and separate on purpose: anything that must LOOK the same is a shared token or a shared helper, never a number copied between them. The conventions this file follows are listed at the top of game/ui/theme.ts. Read them before restyling.
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Animated, StyleSheet, Pressable, ScrollView, Text, View } from "react-native";

import { CloseIcon } from "@/src/components/Icons";
import { Button } from "@/src/game/ui/system/Button";
import { CREAM, CREAM_LIFT, useFixedStyles, useTheme, LEXEND } from "@/src/game/ui/system/theme";
import { useSlideUpPresentation } from "@/src/game/ui/system/slideUp";
import type { Theme } from "@/src/game/ui/system/theme";
import { isSurfaceCategory, useCurrentUserId, useRepos, viewCatalogue } from "@/src/data";
import type { ShopCategory, ShopItem, ShopItemId } from "@/src/data";
import { useProfileStore } from "@/src/data/player/profileStore";
import { useShopStore } from "@/src/data/shop/store";
import { useScreenInsets } from '@/src/hooks/use-safe-insets';
import { CategoryBoardTabs } from "@/src/components/CategoryBoardTabs";
import { ShopItemTile } from "./ShopItemTile";
import type { PurchaseBlock } from "./purchaseBlock";
import { PurchaseConfirmPopup } from "./PurchaseConfirmPopup";
import { PurchaseNoticePopup } from "./PurchaseNoticePopup";

// Fixed four columns; the tile width is solved from the measured row width
const GRID_COLUMNS = 4;
const GRID_GAP = 22;
// Side breathing room, subtracted before the columns are solved so tiles really do shrink
const GRID_EDGE = 22;

export function ShopOverlay({ onClose }: { onClose: () => void }) {
  const s = useFixedStyles(makeStyles);
  const t = useTheme();
  const safe = useScreenInsets();
  const repos = useRepos();
  const me = useCurrentUserId();
  const { sheetStyle, scrimStyle, requestClose } = useSlideUpPresentation(onClose);
  const items = useShopStore((c) => c.items);
  const owned = useShopStore((c) => c.owned);
  const status = useShopStore((c) => c.status);
  const loading = status === "loading" || status === "empty";
  const loadError = status === "error";
  const profile = useProfileStore((p) => p.profile);
  const coins = profile?.coins ?? 0;
  const level = profile?.level ?? 1;

  const [category, setCategory] = useState<ShopCategory>("fur");
  const [busyId, setBusyId] = useState<ShopItemId | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ item: ShopItem; block: PurchaseBlock } | null>(null);
  const [confirm, setConfirm] = useState<ShopItem | null>(null);
  const [gridWidth, setGridWidth] = useState(0);
  const tileWidth = Math.floor(
    (gridWidth - GRID_EDGE * 2 - GRID_GAP * (GRID_COLUMNS - 1)) / GRID_COLUMNS,
  );
  useEffect(() => {
    void useShopStore.getState().load(repos, me);
    void useProfileStore.getState().load(repos, me);
  }, [me, repos]);

  // Sorted by name
  const visible = useMemo(() => viewCatalogue(items, category, "name"), [items, category]);

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
        useShopStore.getState().markOwned(item.id);
        useProfileStore.getState().setCoins(res.coinsRemaining);
        setNote(`Bought ${item.name}`);
      } else if (res.reason === "level_locked" || res.reason === "insufficient_coins") {
        setNotice({ item, block: res.reason === "level_locked" ? "level" : "coins" });
      } else {
        setNote("You already own that.");
      }
    } catch (err) {
      
      console.warn("[shop] purchase failed:", (err as Error).message);
      setNote("Couldn't reach the shop. Nothing was charged — try again.");
    } finally {
      setBusyId(null);
    }
  };

  const padTop = 18 + safe.top;
  const padSide = 62 + safe.side;
  const padBottom = 18 + safe.bottom;

  return (
    <View style={s.layer}>

      <Animated.View style={[s.scrim, scrimStyle]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={requestClose} />
      </Animated.View>

      <Animated.View
        style={[s.panel, { top: padTop, bottom: padBottom, left: padSide, right: padSide }, sheetStyle]}
      >
        <CategoryBoardTabs category={category} onCategory={setCategory} />

        {note ? <Text style={s.note}>{note}</Text> : null}

        {loading ? (
          <View style={s.center}>
            <ActivityIndicator color={t.accent} />
          </View>
        ) : loadError ? (
          <View style={s.center}>
            <Text style={s.empty}>Couldn&apos;t load the shop. Check your connection.</Text>
            <Button
              label="Try again"
              variant="primary"
              onPress={() => void useShopStore.getState().reload(repos, me)}
            />
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
          
            {tileWidth > 0
              ? visible.map((item) => (
                  <ShopItemTile
                    key={item.id}
                    itemId={item.id}
                    name={item.name}
                    price={item.price}
                    width={tileWidth}
                    surface={isSurfaceCategory(item.category)}
                    owned={owned.has(item.id)}
                    lockLevel={level < item.minLevel ? item.minLevel : undefined}
                    onPress={() => requestBuy(item)}
                    disabled={owned.has(item.id) || busyId === item.id}
                  />
                ))
              : null}
          </ScrollView>
        )}
      </Animated.View>

      <Animated.View style={[s.close, { top: padTop - 16, right: padSide - 16 }, sheetStyle]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close the shop"
          hitSlop={12}
          style={s.closeHit}
          onPress={requestClose}
        >
          <CloseIcon size={22} color={CREAM.card} />
        </Pressable>
      </Animated.View>

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
    layer: {
      ...StyleSheet.absoluteFillObject,
      zIndex: 40,
    },
    // t.scrim: the same shading OverlaySheet uses so every popup dims the same way
    scrim: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: t.scrim,
    },
    // Same hairline as the room's bottom bar so the two surfaces share an edge
    panel: {
      position: "absolute",
      borderRadius: 28,
      borderWidth: 1.2,
      borderColor: "#544F4B",
      backgroundColor: CREAM.card,
      paddingTop: 18,
      paddingHorizontal: 22,
      overflow: "hidden",
      ...CREAM_LIFT.panel,
    },
    grid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: GRID_GAP,
      paddingHorizontal: GRID_EDGE,
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
      ...LEXEND.regular,
      fontSize: 14,
      color: t.textDim,
      textAlign: "center",
    },
    note: {
      marginBottom: 8,
      ...LEXEND.regular,
      fontSize: 13,
      color: CREAM.ink,
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
