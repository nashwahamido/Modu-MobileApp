// shop, as a popup layer over the room rather than a route, so the scene stays mounted. Twin of InventoryOverlay, and separate on purpose: anything that must LOOK the same is a shared token or a shared helper, never a number copied between them. The conventions this file follows are listed at the top of game/ui/theme.ts. Read them before restyling.
import {
  useEffect,
  useMemo,
  useState } from "react";
import { ActivityIndicator,
  Animated,
  StyleSheet,
  ScrollView,
  Text,
  View,
} from "react-native";
import { Pressable } from "@/src/components/Pressable";

import { CloseIcon } from "@/src/components/Icons";
import { Button } from "@/src/game/ui/system/Button";
import { CREAM, CREAM_LIFT, useFixedStyles, useTheme, LEXEND } from "@/src/game/ui/system/theme";
import { useSlideUpPresentation } from "@/src/game/ui/system/slideUp";
import type { Theme } from "@/src/game/ui/system/theme";
import { isSurfaceCategory, useCurrentUserId, useRepos, viewCatalogue } from "@/src/data";
import type { ShopCategory, ShopItem, ShopItemId } from "@/src/data";
import { useProfileStore } from "@/src/data/player/profileStore";
import { useShopStore } from "@/src/data/shop/store";
import { GRID_EDGE, PANEL_EDGE, usePopupInsets } from '@/src/components/popupInsets';
import { CategoryBoardTabs } from "@/src/components/CategoryBoardTabs";
import { ShopItemTile } from "./ShopItemTile";
import type { PurchaseBlock } from "./purchaseBlock";
import { PurchaseConfirmPopup } from "./PurchaseConfirmPopup";
import { PurchaseNoticePopup } from "./PurchaseNoticePopup";
import { PurchasedPopup } from "./PurchasedPopup";
import { usePlacementStore } from "@/src/room/core/placement";
import { warmItemModel } from "./ItemSpinPreview";

// Fixed four columns; the tile width is solved from the measured row width
const GRID_COLUMNS = 4;
const GRID_GAP = 22;
// Side breathing room, subtracted before the columns are solved so tiles really do shrink
// How long a transient message stays up
const NOTE_MS = 2400;

export function ShopOverlay({ onClose }: { onClose: () => void }) {
  const s = useFixedStyles(makeStyles);
  const t = useTheme();
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
  // The just-bought item, while the player chooses where it goes
  const [purchased, setPurchased] = useState<ShopItem | null>(null);
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

  // Probe the models of whatever is on screen, so the purchase preview does not spend a round trip discovering the URL after the popup is already up. One HEAD per item per session; the answer is cached at module scope.
  useEffect(() => {
    for (const item of visible) warmItemModel(item.id);
  }, [visible]);

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
        setPurchased(item);
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

  // Every message this screen shows is transient — it reports what just happened and then gets out of the way, rather than pushing the grid down for as long as the popup stays open.
  useEffect(() => {
    if (note === null) return;
    const t = setTimeout(() => setNote(null), NOTE_MS);
    return () => clearTimeout(t);
  }, [note]);

  // Leaves the shop and starts placing. startPlacing refuses an item with no room model, in which case the piece simply stays in the inventory and the player is told so.
  const placeInRoom = (item: ShopItem) => {
    setPurchased(null);
    if (usePlacementStore.getState().startPlacing(item.id)) {
      requestClose();
      return;
    }
    setNote(`${item.name} is in your inventory`);
  };

  const keepInInventory = (item: ShopItem) => {
    setPurchased(null);
    setNote(`${item.name} is in your inventory`);
  };

  // Proportional on a tablet, the authored points on a phone — see components/popupInsets.
  const { padTop, padSide, padBottom } = usePopupInsets();

  return (
    <View style={s.layer}>

      <Animated.View style={[s.scrim, scrimStyle]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={requestClose} />
      </Animated.View>

      <Animated.View
        style={[s.panel, { top: padTop, bottom: padBottom, left: padSide, right: padSide }, sheetStyle]}
      >
        <CategoryBoardTabs category={category} onCategory={setCategory} />

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
                    source={item.source}
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
          itemId={notice.item.id}
          surface={isSurfaceCategory(notice.item.category)}
          name={notice.item.name}
          price={notice.item.price}
          minLevel={notice.item.minLevel}
          block={notice.block}
          onClose={() => setNotice(null)}
        />
      ) : null}
      {purchased ? (
        <PurchasedPopup
          name={purchased.name}
          onRoom={() => placeInRoom(purchased)}
          onInventory={() => keepInInventory(purchased)}
          onClose={() => keepInInventory(purchased)}
        />
      ) : null}
      {/* Floating, and over everything: it has to be readable after a popup closes, and it must not move the grid */}
      {note ? (
        <View style={s.noteWrap} pointerEvents="none">
          <Text style={s.note}>{note}</Text>
        </View>
      ) : null}
      {confirm ? (
        <PurchaseConfirmPopup
          itemId={confirm.id}
          surface={isSurfaceCategory(confirm.category)}
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
      backgroundColor: CREAM.card,
      paddingTop: 18,
      paddingHorizontal: PANEL_EDGE,
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
    noteWrap: {
      position: "absolute",
      left: 0,
      right: 0,
      bottom: 46,
      zIndex: 70,
      alignItems: "center",
    },
    // A dark chip, not ink on cream: it floats over a cream panel and has to be found without being hunted for
    note: {
      paddingHorizontal: 16,
      paddingVertical: 8,
      borderRadius: 16,
      overflow: "hidden",
      backgroundColor: CREAM.darkChip,
      ...LEXEND.regular,
      fontSize: 13,
      color: CREAM.card,
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
