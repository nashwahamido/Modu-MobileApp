// The inventory, as a route — a (presentation) modal like the Shop, so it gets the same OS
// slide-up and the exact same page styling (StoreScreen is its twin). Shows OWNED items with the
// shared chrome + tiles. Tapping the placeable item starts placement via the shared placement
// store and returns to the room, where the draggable furniture appears.
import { router } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { SPACE, Theme, TYPE, useStyles, useTheme } from "@/src/game/ui/theme";
import { nextSort, useCurrentUserId, useRepos, viewCatalogue } from "@/src/data";
import type { CategoryFilter, ShopItem, ShopSort } from "@/src/data";
import { PLACEABLE_ITEM_ID, usePlacementStore } from "@/src/room/placement";
import { Cabinet } from "@/src/room/Cabinet";
import { CatalogueChrome } from "./CatalogueChrome";
import { ItemCard } from "./ItemCard";

export default function InventoryScreen() {
  const styles = useStyles(makeStyles);
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const repos = useRepos();
  const me = useCurrentUserId();
  const startPlacing = usePlacementStore((s) => s.startPlacing);

  const [owned, setOwned] = useState<ShopItem[]>([]);
  const [coins, setCoins] = useState(0);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState<CategoryFilter>("all");
  const [sort, setSort] = useState<ShopSort>("name");

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
      const ownedSet = new Set(ownedIds);
      setOwned(catalogue.filter((i) => ownedSet.has(i.id)));
      setCoins(profile?.coins ?? 0);
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [me, repos]);

  const visible = useMemo(() => viewCatalogue(owned, category, sort), [owned, category, sort]);

  const place = (item: ShopItem) => {
    startPlacing(item.id);
    router.replace("/room");
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top + SPACE.sm, paddingLeft: Math.max(insets.left, SPACE.xl), paddingRight: Math.max(insets.right, SPACE.xl) }]}>
      <CatalogueChrome
        title="Inventory"
        backLabel="Room"
        onBack={() => router.replace("/room")}
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
      ) : visible.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.empty}>
            {owned.length === 0 ? "No items yet — visit the Shop to buy some." : "Nothing in this category."}
          </Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.grid}>
          {visible.map((item) => {
            const placeable = item.id === PLACEABLE_ITEM_ID;
            return (
              <ItemCard
                key={item.id}
                name={item.name}
                price={item.price}
                owned
                preview={placeable ? <Cabinet /> : undefined}
                status={placeable ? "tap to place" : "owned"}
                statusTone={placeable ? "action" : "muted"}
                onPress={placeable ? () => place(item) : undefined}
                disabled={!placeable}
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
    empty: { ...TYPE.body, color: t.textFaint, textAlign: "center", padding: SPACE.lg },
    grid: { flexDirection: "row", flexWrap: "wrap", gap: SPACE.md, paddingBottom: SPACE.xl },
  });
