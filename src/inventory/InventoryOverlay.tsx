// The inventory, as a popup layer over the room rather than a route, so the scene stays mounted. Twin of ShopOverlay, and separate on purpose: anything that must LOOK the same is a shared token or a shared helper, never a number copied between them. The conventions this file follows are listed at the top of game/ui/theme.ts. Read them before restyling.
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Animated, StyleSheet, Pressable, ScrollView, Text, View } from "react-native";

import { CloseIcon } from "@/src/components/Icons";
import { Button } from "@/src/game/ui/system/Button";
import { CREAM, CREAM_LIFT, useFixedStyles, useTheme, LEXEND } from "@/src/game/ui/system/theme";
import { useSlideUpPresentation } from "@/src/game/ui/system/slideUp";
import type { Theme } from "@/src/game/ui/system/theme";
import { useCatalogStore } from "@/src/data/catalog/buildStore";
import { useShopStore } from "@/src/data/shop/store";
import { isSurfaceCategory, useCurrentUserId, useRepos, viewCatalogue } from "@/src/data";
import type { ShopCategory } from "@/src/data";
import { GRID_EDGE, usePopupInsets } from '@/src/components/popupInsets';
import { useRoomCatalogStore } from "@/src/room/core/placeableItems";
import { usePlacementStore } from "@/src/room/core/placement";
import { CategoryBoardTabs } from "@/src/components/CategoryBoardTabs";
import { InventoryItemTile } from "./InventoryItemTile";
import type { OwnedItem } from "./ownedItem";


const GRID_COLUMNS = 4;
const GRID_GAP = 22;

export function InventoryOverlay({ onClose }: { onClose: () => void }) {
  const s = useFixedStyles(makeStyles);
  const t = useTheme();
  const repos = useRepos();
  const me = useCurrentUserId();
  const { sheetStyle, scrimStyle, requestClose } = useSlideUpPresentation(onClose);
  const catalogRows = useCatalogStore((c) => c.rows);
  const roomItems = useRoomCatalogStore((r) => r.items);
  const boughtCatalogue = useShopStore((c) => c.items);
  const ownedIds = useShopStore((c) => c.owned);
  const shopStatus = useShopStore((c) => c.status);
  const [built, setBuilt] = useState<OwnedItem[] | null>(null);
  const [builtError, setBuiltError] = useState(false);
  const loading = built === null || shopStatus === "loading" || shopStatus === "empty";
  const loadError = builtError || shopStatus === "error";
  const [category, setCategory] = useState<ShopCategory>("fur");
  const [gridWidth, setGridWidth] = useState(0);
  const tileWidth = Math.floor(
    (gridWidth - GRID_EDGE * 2 - GRID_GAP * (GRID_COLUMNS - 1)) / GRID_COLUMNS,
  );

  const [reloadKey, setReloadKey] = useState(0);
  useEffect(() => {
    void useShopStore.getState().load(repos, me);
  }, [me, repos, reloadKey]);

  useEffect(() => {
    let alive = true;
    setBuiltError(false);
    (async () => {
      try {
        const items = await repos.builds.listCompletedItems(me);
        if (!alive) return;
        setBuilt(
          items.map((i) => ({ id: i.id, name: i.name, category: i.category, source: "built" as const })),
        );
      } catch (err) {
        console.warn("[inventory] could not load the built items:", (err as Error).message);
        if (alive) {
          setBuiltError(true);
          setBuilt([]);
        }
      }
    })();
    return () => {
      alive = false;
    };
  }, [me, repos, reloadKey]);

 
  const owned = useMemo<OwnedItem[]>(() => {
    const bought: OwnedItem[] = boughtCatalogue
      .filter((i) => ownedIds.has(i.id))
      // source comes from the ITEM, not from the fact that this list is the bought half: a dev build merges workshop drafts here, and their assets live under room/workshop/. Absent still reads as "bought", which is every published row.
      .map((i) => ({ id: i.id, name: i.name, category: i.category, price: i.price, source: i.source ?? ("bought" as const) }));
    // De-dupe by id: a shared id would render duplicate React keys. Built wins, being rarer
    const merged = new Map<string, OwnedItem>();
    for (const item of [...(built ?? []), ...bought]) {
      if (!merged.has(item.id)) merged.set(item.id, item);
    }
    return [...merged.values()];
  }, [boughtCatalogue, ownedIds, built]);

  const visible = useMemo(() => viewCatalogue(owned, category, "name"), [owned, category]);

  const place = (id: string) => {
    if (!usePlacementStore.getState().startPlacing(id)) return;
    requestClose();
  };

  // A surface item covers the room rather than standing in it, so there is no ghost to reveal and no placement to start — the room simply repaints. The sheet stays OPEN, unlike place(): trying finishes is a browsing activity, and closing after every tap would make comparing two wallpapers mean reopening the inventory between them.
  const applySurface = (item: { id: string; category: ShopCategory }) => {
    usePlacementStore.getState().setFinish(item.category === "floor" ? "floor" : "wall", item.id);
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
                    itemId={item.id}
                    source={item.source}
                    name={item.name}
                    width={tileWidth}
                    surface={isSurfaceCategory(item.category)}
                    ikea={catalogRows[item.id]?.brand === "IKEA"}
                    placeable={isSurfaceCategory(item.category) || roomItems[item.id] !== undefined}
                    onPress={() => (isSurfaceCategory(item.category) ? applySurface(item) : place(item.id))}
                  />
                ))
              : null}
          </ScrollView>
        )}
      </Animated.View>

      <Animated.View style={[s.close, { top: padTop - 16, right: padSide - 16 }, sheetStyle]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close the inventory"
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

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    // Above every room HUD layer so the popup owns the screen while it is up
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
    closeHit: {
      ...StyleSheet.absoluteFillObject,
      alignItems: "center",
      justifyContent: "center",
    },
  });
