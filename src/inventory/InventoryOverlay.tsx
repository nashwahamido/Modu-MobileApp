// The inventory, as a popup layer over the room rather than a route, so the scene stays mounted. Twin of ShopOverlay, and separate on purpose: anything that must LOOK the same is a shared token or a shared helper, never a number copied between them. The conventions this file follows are listed at the top of game/ui/theme.ts. Read them before restyling.
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Animated, StyleSheet, Pressable, ScrollView, Text, View } from "react-native";

import { CloseIcon } from "@/src/components/Icons";
import { Button } from "@/src/game/ui/system/Button";
import { CREAM, CREAM_LIFT, useStyles, useTheme, LEXEND } from "@/src/game/ui/system/theme";
import { useSlideUpPresentation } from "@/src/game/ui/system/slideUp";
import type { Theme } from "@/src/game/ui/system/theme";
import { useCatalogStore } from "@/src/data/catalog/buildStore";
import { useShopStore } from "@/src/data/shop/store";
import { isSurfaceCategory, useCurrentUserId, useRepos, viewCatalogue } from "@/src/data";
import type { ShopCategory } from "@/src/data";
import { useScreenInsets } from '@/src/hooks/use-safe-insets';
import { useRoomCatalogStore } from "@/src/room/core/placeableItems";
import { usePlacementStore } from "@/src/room/core/placement";
import { InventoryCategoryTabs } from "./InventoryCategoryTabs";
import { InventoryItemTile } from "./InventoryItemTile";
import type { OwnedItem } from "./ownedItem";

// Fixed four columns; the tile width is solved from the measured row width
const GRID_COLUMNS = 4;
const GRID_GAP = 22;
// Side breathing room, subtracted before the columns are solved so tiles really do shrink
const GRID_EDGE = 22;

export function InventoryOverlay({ onClose }: { onClose: () => void }) {
  const s = useStyles(makeStyles);
  const t = useTheme();
  const safe = useScreenInsets();
  const repos = useRepos();
  const me = useCurrentUserId();
  // Slides up over the room and dims it, the way this surface did when it was a (presentation) route. requestClose replaces every direct onClose call, so the sheet is off-screen before the parent unmounts it.
  const { sheetStyle, scrimStyle, requestClose } = useSlideUpPresentation(onClose);
  const catalogRows = useCatalogStore((c) => c.rows);
  // SUBSCRIBED, not read through getRoomItem(): the placeable catalog is fetched at startup and lands mid-session. A non-reactive read left every tile stuck on "cannot be placed yet" until something else happened to re-render this popup.
  const roomItems = useRoomCatalogStore((r) => r.items);
  // The purchasable catalogue and the owned-id set are shared with the shop popup (src/data/shop/store). So this popup no longer re-fetches reference data the shop already has, and a purchase there shows up here.
  const boughtCatalogue = useShopStore((c) => c.items);
  const ownedIds = useShopStore((c) => c.owned);
  const shopStatus = useShopStore((c) => c.status);

  // The BUILT half is this popup's own read: it changes when a build finishes, which is not something the shop's data has any reason to know about.
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
        // The repos throw, so this is the ordinary failure path, not an exotic one
        console.warn("[inventory] could not load the built items:", (err as Error).message);
        if (alive) {
          setBuiltError(true);
          // Not null, or the spinner outlives the failure and the error state never renders
          setBuilt([]);
        }
      }
    })();
    return () => {
      alive = false;
    };
  }, [me, repos, reloadKey]);

  // Derived, not stored: both halves are already state, and keeping a third copy in sync with them was what let two versions of this list drift apart in the first place.
  const owned = useMemo<OwnedItem[]>(() => {
    const bought: OwnedItem[] = boughtCatalogue
      .filter((i) => ownedIds.has(i.id))
      .map((i) => ({ id: i.id, name: i.name, category: i.category, price: i.price, source: "bought" as const }));
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
    // Slides away rather than vanishing, so the ghost is revealed by the sheet leaving.
    requestClose();
  };

  // A surface item covers the room rather than standing in it, so there is no ghost to reveal and no placement to start — the room simply repaints. The sheet stays OPEN, unlike place(): trying finishes is a browsing activity, and closing after every tap would make comparing two wallpapers mean reopening the inventory between them.
  const applySurface = (item: { id: string; category: ShopCategory }) => {
    usePlacementStore.getState().setFinish(item.category === "floor" ? "floor" : "wall", item.id);
  };

  const padTop = 18 + safe.top;
  // safe.side, not left or right: the panel is centred, so both edges take the LARGER inset or it sits off-centre
  const padSide = 62 + safe.side;
  const padBottom = 18 + safe.bottom;

  return (
    <View style={s.layer}>
      {/* The dim fades in with the sheet. The Pressable is a child rather than the scrim itself, because an animated opacity belongs on a View. */}
      <Animated.View style={[s.scrim, scrimStyle]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={requestClose} />
      </Animated.View>

      <Animated.View
        style={[s.panel, { top: padTop, bottom: padBottom, left: padSide, right: padSide }, sheetStyle]}
      >
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

      {/* Outside the panel so it can straddle the corner, as in the mockup. Rides the same slide, or it would pop in against a moving sheet. */}
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
    // t.scrim: the same shading OverlaySheet uses, so every popup dims the same way
    scrim: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: t.scrim,
    },
    panel: {
      position: "absolute",
      borderRadius: 28,
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
      ...LEXEND.regular,
      fontSize: 14,
      color: t.textDim,
      textAlign: "center",
    },
    // The animated wrapper: it carries the position, the disc and the shadow, and rides the sheet's slide.
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
