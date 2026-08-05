// The inventory, as a route — a (presentation) modal like the Shop, so it gets the same OS slide-up and the exact same page styling (the Shop route is its twin). Shows OWNED items with the shared chrome + tiles, straight from the backend catalog. Items with a room model offer "tap to place": start the shared placement store's ghost, then return to the room, whose scene renders it on the grid.
import { router } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { SCREEN_SIDE_MARGIN, SCREEN_VERTICAL_MARGIN } from "@/src/hooks/use-safe-insets";

import { Button } from "@/src/game/ui/Button";
import { SPACE, useStyles, useTheme } from "@/src/game/ui/theme";
import { nextSort, useCurrentUserId, useRepos, viewCatalogue } from "@/src/data";
import type { CategoryFilter, ShopCategory, ShopSort } from "@/src/data";
import { usePlacementStore } from "@/src/room/core/placement";
import { useRoomCatalogStore } from "@/src/room/core/placeableItems";
import { CatalogueChrome } from "@/src/components/catalogue/CatalogueChrome";
import { ItemCard } from "@/src/components/catalogue/ItemCard";
import { CatalogThumb } from "@/src/components/CatalogThumb";
import { makeStyles } from "@/src/components/catalogue/catalogueScreen.styles";

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
  // Subscribed so "tap to place" lights up the moment the placeable catalog syncs in.
  const roomItems = useRoomCatalogStore((s) => s.items);

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
        // De-dupe by id: built/bought disjointness is a DB convention, not a constraint, and a
        // shared id would render duplicate React keys. Built wins (it is the rarer acquisition).
        const merged = new Map<string, OwnedItem>();
        for (const item of [...built, ...bought]) {
          if (!merged.has(item.id)) merged.set(item.id, item);
        }
        setOwned([...merged.values()]);
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
    <View style={[styles.root, { paddingTop: SPACE.sm + Math.max(insets.top, SCREEN_VERTICAL_MARGIN), paddingLeft: SPACE.xl + Math.max(insets.left, SCREEN_SIDE_MARGIN), paddingRight: SPACE.xl + Math.max(insets.right, SCREEN_SIDE_MARGIN) }]}>
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
          {visible.map((item) => {
            // Only items the placeable catalog knows (an authored size + a room model) offer
            // placement; the rest stay passive rather than promising an invisible ghost.
            const placeable = roomItems[item.id] !== undefined;
            const place = () => {
              if (!usePlacementStore.getState().startPlacing(item.id)) return;
              router.dismissTo("/room");
            };
            return (
              <ItemCard
                key={item.id}
                name={item.name}
                price={item.price}
                owned
                // The tile shows the item's DEFAULT colour; the player picks a different one while
                // placing (the room's swatch row), not here — one item, one tile, whatever it owns.
                preview={<CatalogThumb source={item.source} itemId={item.id} size={82} />}
                status={placeable ? "tap to place" : "owned"}
                statusTone={placeable ? "action" : "muted"}
                onPress={placeable ? place : undefined}
              />
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}