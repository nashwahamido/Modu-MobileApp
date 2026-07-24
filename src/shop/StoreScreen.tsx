// The shop. Browse the catalogue by category/sort and buy items with coins. Reads the catalogue,
// the player's coin balance and their owned items through the repo seam (src/data), and buys
// through repos.store.purchase — so it runs on fixtures today and on Supabase when the flag flips.
// Colocated with InventoryScreen so the two catalogue surfaces share one set of components.
import { router } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { SPACE, Theme, TYPE, useStyles, useTheme } from "@/src/game/ui/theme";
import { nextSort, useCurrentUserId, useRepos, viewCatalogue } from "@/src/data";
import type { CategoryFilter, ShopItem, ShopItemId, ShopSort } from "@/src/data";
import { CatalogueChrome } from "./CatalogueChrome";
import { ItemCard } from "./ItemCard";

export default function StoreScreen() {
  const styles = useStyles(makeStyles);
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const repos = useRepos();
  const me = useCurrentUserId();

  const [items, setItems] = useState<ShopItem[]>([]);
  const [owned, setOwned] = useState<Set<ShopItemId>>(new Set());
  const [coins, setCoins] = useState(0);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState<CategoryFilter>("all");
  const [sort, setSort] = useState<ShopSort>("name");
  const [busyId, setBusyId] = useState<ShopItemId | null>(null);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    (async () => {
      const [catalogue, ownedIds, profile] = await Promise.all([
        repos.store.listItems(),
        repos.store.listOwned(me),
        repos.profiles.get(me),
      ]);
      if (!alive) return;
      setItems(catalogue);
      setOwned(new Set(ownedIds));
      setCoins(profile?.coins ?? 0);
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [me, repos]);

  const visible = useMemo(() => viewCatalogue(items, category, sort), [items, category, sort]);

  const buy = async (item: ShopItem) => {
    if (owned.has(item.id) || busyId) return;
    setBusyId(item.id);
    setNote(null);
    const res = await repos.store.purchase(me, item.id);
    if (res.ok) {
      setOwned((prev) => new Set(prev).add(item.id));
      setCoins(res.coinsRemaining);
      setNote(`Bought ${item.name}`);
    } else {
      setNote(res.reason === "already_owned" ? "You already own that." : "Not enough coins.");
    }
    setBusyId(null);
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top + SPACE.sm, paddingLeft: Math.max(insets.left, SPACE.xl), paddingRight: Math.max(insets.right, SPACE.xl) }]}>
      <CatalogueChrome
        title="Shop"
        backLabel="Room"
        onBack={() => router.replace("/room")}
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
      ) : (
        <ScrollView contentContainerStyle={styles.grid}>
          {visible.map((item) => {
            const isOwned = owned.has(item.id);
            const affordable = coins >= item.price;
            return (
              <ItemCard
                key={item.id}
                name={item.name}
                price={item.price}
                owned={isOwned}
                status={busyId === item.id ? "…" : isOwned ? "owned" : affordable ? "buy" : "need coins"}
                statusTone={!isOwned && affordable ? "action" : "muted"}
                onPress={() => buy(item)}
                disabled={isOwned || busyId === item.id}
              />
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: t.bg, paddingBottom: SPACE.md },
    center: { flex: 1, alignItems: "center", justifyContent: "center" },
    note: { ...TYPE.label, color: t.accent, marginBottom: SPACE.sm },
    grid: { flexDirection: "row", flexWrap: "wrap", gap: SPACE.md, paddingBottom: SPACE.xl },
  });
