// The inventory, as a popup layer over the room rather than a route
// The full-screen route at src/app/(presentation)/inventory.tsx still exists and is unchanged - FIX THAT (for shop too?)
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, StyleSheet, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { CloseIcon } from "@/src/components/Icons";
import { Button } from "@/src/game/ui/Button";
import { useStyles, useTheme, LEXEND } from "@/src/game/ui/theme";
import type { Theme } from "@/src/game/ui/theme";
import { useCatalogStore } from "@/src/data/catalogStore";
import { useCurrentUserId, useRepos, viewCatalogue } from "@/src/data";
import type { ShopCategory } from "@/src/data";
import { SCREEN_SIDE_MARGIN, SCREEN_VERTICAL_MARGIN } from "@/src/hooks/use-safe-insets";
import { getRoomItem } from "@/src/room/core/placeableItems";
import { usePlacementStore } from "@/src/room/core/placement";
import { InventoryCategoryTabs } from "./InventoryCategoryTabs";
import { InventoryItemTile } from "./InventoryItemTile";

const GRID_COLUMNS = 4;
const GRID_GAP = 22;
const GRID_EDGE = 22;

type OwnedItem = { id: string; name: string; category: ShopCategory; source: "built" | "bought" };

export function InventoryOverlay({ onClose }: { onClose: () => void }) {
  const s = useStyles(makeStyles);
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const repos = useRepos();
  const me = useCurrentUserId();
  const catalogRows = useCatalogStore((c) => c.rows);

  const [owned, setOwned] = useState<OwnedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [category, setCategory] = useState<ShopCategory>("fur");
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
        const [catalogue, ownedIds, builtItems] = await Promise.all([
          repos.store.listItems(),
          repos.store.listOwned(me),
          repos.builds.listCompletedItems(me),
        ]);
        if (!alive) return;
        const ownedSet = new Set(ownedIds);
        const bought: OwnedItem[] = catalogue
          .filter((i) => ownedSet.has(i.id))
          .map((i) => ({ id: i.id, name: i.name, category: i.category, source: "bought" as const }));
        const built: OwnedItem[] = builtItems.map((i) => ({
          id: i.id,
          name: i.name,
          category: i.category,
          source: "built" as const,
        }));
        // De-dupe by id: a shared id would render duplicate React keys. Built wins, being rarer
        const merged = new Map<string, OwnedItem>();
        for (const item of [...built, ...bought]) {
          if (!merged.has(item.id)) merged.set(item.id, item);
        }
        setOwned([...merged.values()]);
      } catch (err) {
        // The repos throw, so this is the ordinary failure path, not an exotic one
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

  const visible = useMemo(() => viewCatalogue(owned, category, "name"), [owned, category]);

  const place = (id: string) => {
    if (!usePlacementStore.getState().startPlacing(id)) return;
    onClose();
  };

  const padTop = 18 + Math.max(insets.top, SCREEN_VERTICAL_MARGIN);
  const padSide = 62 + Math.max(Math.max(insets.left, insets.right), SCREEN_SIDE_MARGIN);
  const padBottom = 18 + Math.max(insets.bottom, SCREEN_VERTICAL_MARGIN);

  return (
    <View style={s.layer}>
      <Pressable style={s.scrim} onPress={onClose} />

      <View style={[s.panel, { top: padTop, bottom: padBottom, left: padSide, right: padSide }]}>
        <InventoryCategoryTabs category={category} onCategory={setCategory} rightInset={GRID_EDGE} />

        {loading ? (
          <View style={s.center}>
            <ActivityIndicator color={t.accent} />
          </View>
        ) : loadError ? (
          <View style={s.center}>
            <Text style={s.empty}>Couldn&apos;t load your inventory. Check your connection.</Text>
            <Button label="Try again" variant="primary" onPress={() => setReloadKey((k) => k + 1)} />
          </View>
        ) : visible.length === 0 ? (
          <View style={s.center}>
            <Text style={s.empty}>
              {owned.length === 0
                ? "Nothing here yet. Buy something in the shop, or build one."
                : "Nothing in this category."}
            </Text>
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
                  <InventoryItemTile
                    key={item.id}
                    name={item.name}
                    width={tileWidth}
                    ikea={catalogRows[item.id]?.brand === "IKEA"}
                    placeable={getRoomItem(item.id) !== null}
                    onPress={() => place(item.id)}
                  />
                ))
              : null}
          </ScrollView>
        )}
      </View>

    
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Close the inventory"
        hitSlop={12}
        style={[s.close, { top: padTop - 16, right: padSide - 16 }]}
        onPress={onClose}
      >
        <CloseIcon size={22} color="#FBFAF3" />
      </Pressable>
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
