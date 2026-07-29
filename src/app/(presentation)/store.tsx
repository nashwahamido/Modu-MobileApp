// The shop. Browse the catalogue by category/sort and buy items with coins. Reads the catalogue,
// the player's coin balance and their owned items through the repo seam (src/data), and buys
// through repos.store.purchase — so it runs on fixtures today and on Supabase when the flag flips.
// Twin of the Inventory route — the two catalogue surfaces share one set of components and one stylesheet (src/shop).
import { router } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { SCREEN_SIDE_MARGIN, SCREEN_VERTICAL_MARGIN } from "@/src/hooks/use-safe-insets";

import { Button } from "@/src/game/ui/Button";
import { SPACE, useStyles, useTheme } from "@/src/game/ui/theme";
import { nextSort, useCurrentUserId, useRepos, viewCatalogue } from "@/src/data";
import type { CategoryFilter, ShopItem, ShopItemId, ShopSort } from "@/src/data";
import { CatalogueChrome } from "@/src/shop/CatalogueChrome";
import { ItemCard } from "@/src/shop/ItemCard";
import { CatalogThumb } from "@/src/components/CatalogThumb";
import { PurchaseConfirmDialog, PurchaseNoticeDialog, PurchaseBlock } from "@/src/shop/PurchaseNoticeDialog";
import { makeStyles } from "@/src/shop/catalogueScreen.styles";

export default function StoreScreen() {
  const styles = useStyles(makeStyles);
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const repos = useRepos();
  const me = useCurrentUserId();

  const [items, setItems] = useState<ShopItem[]>([]);
  const [owned, setOwned] = useState<Set<ShopItemId>>(new Set());
  const [coins, setCoins] = useState(0);
  const [level, setLevel] = useState(1);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState<CategoryFilter>("all");
  const [sort, setSort] = useState<ShopSort>("name");
  const [busyId, setBusyId] = useState<ShopItemId | null>(null);
  const [note, setNote] = useState<string | null>(null);
  // The catalogue read failed. Distinct from "loaded and empty", which is a legitimate state.
  const [loadError, setLoadError] = useState(false);
  // Bumped by "Try again" to re-run the load effect.
  const [reloadKey, setReloadKey] = useState(0);
  // The "can't buy this" dialog — set when a locked/unaffordable card is tapped (or the server refuses).
  const [notice, setNotice] = useState<{ item: ShopItem; block: PurchaseBlock } | null>(null);
  // The "Purchase X for N?" dialog — set when a buyable card is tapped; Yes runs the purchase.
  const [confirm, setConfirm] = useState<ShopItem | null>(null);

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
        // The repos THROW on any Postgrest error, so this is the ordinary failure path, not an exotic
        // one. Without it the spinner below would run forever on a dropped connection.
        console.warn("[store] could not load the shop:", (err as Error).message);
        if (alive) setLoadError(true);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [me, repos, reloadKey]);

  const visible = useMemo(() => viewCatalogue(items, category, sort), [items, category, sort]);

  // A card tap: explain a block, or ask for confirmation. Nothing is bought until the Yes.
  const requestBuy = (item: ShopItem) => {
    if (owned.has(item.id) || busyId) return;
    // Known blocks are caught locally with the notice dialog — no server round-trip needed.
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
        // The server is authoritative — if it refuses despite the local check, show the same dialog.
        setNotice({ item, block: res.reason === "level_locked" ? "level" : "coins" });
      } else {
        setNote("You already own that.");
      }
    } catch (err) {
      // A THROW is a transport/permission failure, not a refusal — purchase() returns its refusals.
      // Say so rather than leaving the card spinning: coins are only ever deducted server-side, so
      // nothing was spent.
      console.warn("[store] purchase failed:", (err as Error).message);
      setNote("Couldn't reach the shop. Nothing was charged — try again.");
    } finally {
      // In the finally, so a failure can't strand the card disabled forever.
      setBusyId(null);
    }
  };

  return (
    <View style={[styles.root, { paddingTop: SPACE.sm + Math.max(insets.top, SCREEN_VERTICAL_MARGIN), paddingLeft: SPACE.xl + Math.max(insets.left, SCREEN_SIDE_MARGIN), paddingRight: SPACE.xl + Math.max(insets.right, SCREEN_SIDE_MARGIN) }]}>
      <CatalogueChrome
        title="Shop"
        backLabel="Room"
        onBack={() => router.dismissTo("/room")}
        coins={coins}
        category={category}
        onCategory={setCategory}
        sort={sort}
        onSort={() => setSort(nextSort(sort))}
      />

      {note ? <Text style={styles.note}>{note}</Text> : null}

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={t.accent} />
        </View>
      ) : loadError ? (
        <View style={styles.center}>
          <Text style={styles.empty}>Couldn&apos;t load the shop. Check your connection.</Text>
          <Button label="Try again" variant="primary" onPress={() => setReloadKey((k) => k + 1)} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.grid}>
          {visible.map((item) => {
            const isOwned = owned.has(item.id);
            const locked = level < item.minLevel;
            return (
              <ItemCard
                key={item.id}
                name={item.name}
                price={item.price}
                owned={isOwned}
                // Level-locked → the tile shows a level star; no inline status. Everything stays
                // tappable, and the tap explains a block (or asks to confirm) via the dialogs below.
                lockLevel={locked ? item.minLevel : undefined}
                // Every shop row is an item_buy row, so the picture always comes from the buy subtree;
                // a level-locked tile shows the star instead (ItemCard's own rule).
                preview={<CatalogThumb source="bought" itemId={item.id} size={82} />}
                onPress={() => requestBuy(item)}
                disabled={isOwned || busyId === item.id}
              />
            );
          })}
        </ScrollView>
      )}

      {notice ? (
        <PurchaseNoticeDialog
          name={notice.item.name}
          price={notice.item.price}
          minLevel={notice.item.minLevel}
          block={notice.block}
          // Bigger than the tile's: the dialog's well is the item's close-up.
          preview={<CatalogThumb source="bought" itemId={notice.item.id} size={152} />}
          onClose={() => setNotice(null)}
        />
      ) : null}
      {confirm ? (
        <PurchaseConfirmDialog
          name={confirm.name}
          price={confirm.price}
          preview={<CatalogThumb source="bought" itemId={confirm.id} size={152} />}
          onConfirm={() => buy(confirm)}
          onClose={() => setConfirm(null)}
        />
      ) : null}
    </View>
  );
}