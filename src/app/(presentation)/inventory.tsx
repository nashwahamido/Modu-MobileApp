// The inventory, as a route — a (presentation) modal like the Shop, so it gets the same OS slide-up and the exact same page styling (the Shop route is its twin). Shows OWNED items with the shared chrome + tiles, straight from the backend catalog. Placement is not wired here yet: there is no per-item room model, so a "tap to place" would be a promise nothing can keep.
import { router } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Button } from "@/src/game/ui/Button";
import { SPACE, Theme, TYPE, useStyles, useTheme } from "@/src/game/ui/theme";
import { nextSort, useCurrentUserId, useRepos, viewCatalogue } from "@/src/data";
import type { CategoryFilter, ShopCategory, ShopSort } from "@/src/data";
import { CatalogueChrome } from "@/src/shop/CatalogueChrome";
import { ItemCard } from "@/src/shop/ItemCard";

// What the inventory owns = user_build (built furniture, described by item_build) ∪ user_buy (bought items, described by item_buy). Both halves get their name and category from the backend; built furniture has no price because it is earned. One shape for both.
type OwnedItem = { id: string; name: string; category: ShopCategory; price?: number; source: "built" | "bought" };

export default function InventoryScreen() {
  const styles = useStyles(makeStyles);
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const repos = useRepos();
  const me = useCurrentUserId();

  const [owned, setOwned] = useState<OwnedItem[]>([]);
  const [coins, setCoins] = useState(0);
  const [loading, setLoading] = useState(true);
  // The read failed — distinct from "loaded and genuinely empty", which has its own copy below.
  const [loadError, setLoadError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [category, setCategory] = useState<CategoryFilter>("all");
  const [sort, setSort] = useState<ShopSort>("name");

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setLoadError(false);
    (async () => {
      try {
        const [catalogue, ownedIds, builtItems, profile] = await Promise.all([
          repos.store.listItems(),
          repos.store.listOwned(me),
          repos.builds.listCompletedItems(me),
          repos.profiles.get(me),
        ]);
        if (!alive) return;
        const ownedSet = new Set(ownedIds);
        const bought: OwnedItem[] = catalogue
          .filter((i) => ownedSet.has(i.id))
          .map((i) => ({ id: i.id, name: i.name, category: i.category, price: i.price, source: "bought" }));
        // Built furniture: name and category come from the backend catalog, same as the bought half.
        const built: OwnedItem[] = builtItems.map((i) => ({
          id: i.id,
          name: i.name,
          category: i.category,
          source: "built" as const,
        }));
        setOwned([...built, ...bought]);
        setCoins(profile?.coins ?? 0);
      } catch (err) {
        // The repos THROW on any Postgrest error. Without this the spinner runs forever and the
        // player reads it as "you own nothing".
        console.warn("[inventory] could not load:", (err as Error).message);
        if (alive) setLoadError(true);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [me, repos, reloadKey]);

  const visible = useMemo(() => viewCatalogue(owned, category, sort), [owned, category, sort]);

  return (
    <View style={[styles.root, { paddingTop: insets.top + SPACE.sm, paddingLeft: Math.max(insets.left, SPACE.xl), paddingRight: Math.max(insets.right, SPACE.xl) }]}>
      <CatalogueChrome
        title="Inventory"
        backLabel="Room"
        onBack={() => router.dismissTo("/room")}
        coins={coins}
        category={category}
        onCategory={setCategory}
        sort={sort}
        onSort={() => setSort(nextSort(sort))}
      />

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={t.accent} />
        </View>
      ) : loadError ? (
        <View style={styles.center}>
          <Text style={styles.empty}>Couldn&apos;t load your inventory. Check your connection.</Text>
          <Button label="Try again" variant="primary" onPress={() => setReloadKey((k) => k + 1)} />
        </View>
      ) : visible.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.empty}>
            {owned.length === 0 ? "No items yet — visit the Shop to buy some." : "Nothing in this category."}
          </Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.grid}>
          {visible.map((item) => (
            <ItemCard
              key={item.id}
              name={item.name}
              price={item.price}
              owned
              status="owned"
            />
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: t.bg, paddingBottom: SPACE.md },
    center: { flex: 1, alignItems: "center", justifyContent: "center", gap: SPACE.md },
    empty: { ...TYPE.body, color: t.textFaint, textAlign: "center", padding: SPACE.lg },
    grid: { flexDirection: "row", flexWrap: "wrap", gap: SPACE.md, paddingBottom: SPACE.xl },
  });
