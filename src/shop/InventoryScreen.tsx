// The inventory, as a route — a (presentation) modal like the Shop, so it gets the same OS
// slide-up and the exact same page styling (StoreScreen is its twin). Shows OWNED items with the
// shared chrome + tiles. Tapping the placeable item starts placement via the shared placement
// store and returns to the room, where the draggable furniture appears.
import { router } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { RADIUS, SPACE, Theme, TYPE, useStyles, useTheme } from "@/src/game/ui/theme";
import { nextSort, useCurrentUserId, useRepos, viewCatalogue } from "@/src/data";
import type { CategoryFilter, ShopItem, ShopSort } from "@/src/data";
import { PLACEABLE_ITEM_ID, usePlacementStore } from "@/src/room/placement";
import {
  getTaskFurnitureImage,
  useTaskRewardInventory,
} from "@/src/room/taskRewardInventory";
import { Cabinet } from "@/src/room/Cabinet";
import { CatalogueChrome } from "./CatalogueChrome";
import { ItemCard } from "./ItemCard";

const mascot = require("@/src/assets/images/mascot/mascot.png");

export default function InventoryScreen() {
  const styles = useStyles(makeStyles);
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const repos = useRepos();
  const me = useCurrentUserId();
  const startPlacing = usePlacementStore((s) => s.startPlacing);
  const taskRewards = useTaskRewardInventory((s) => s.items);
  const guideItemId = useTaskRewardInventory((s) => s.guideItemId);
  const finishInventoryGuide = useTaskRewardInventory((s) => s.finishInventoryGuide);

  const [owned, setOwned] = useState<ShopItem[]>([]);
  const [coins, setCoins] = useState(0);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState<CategoryFilter>("all");
  const [sort, setSort] = useState<ShopSort>("name");
  const [selectedRewardId, setSelectedRewardId] = useState<string | null>(null);

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
  const selectedReward = taskRewards.find((item) => item.id === selectedRewardId);
  const guideReward = taskRewards.find((item) => item.id === guideItemId);
  const placeTaskReward = () => {
    if (!selectedReward) return;
    finishInventoryGuide();
    usePlacementStore.getState().startFirstPlacement(selectedReward.id, selectedReward.name);
    router.replace("/room");
  };
  const selectTaskReward = (itemId: string) => {
    setSelectedRewardId(itemId);
    if (itemId === guideItemId) {
      finishInventoryGuide();
    }
  };
  const inventoryEmpty = taskRewards.length === 0 && owned.length === 0;

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

      {guideReward ? (
        <View style={styles.guide}>
          <Image source={mascot} style={styles.guideMascot} resizeMode="contain" />
          <View style={styles.guideCopy}>
            <Text style={styles.guideTitle}>Here is your new {guideReward.name}</Text>
            <Text style={styles.guideBody}>
              Tap the highlighted card, then choose Place in room.
            </Text>
          </View>
        </View>
      ) : selectedReward ? (
        <View style={styles.placePrompt}>
          <View style={styles.placePromptCopy}>
            <Text style={styles.placePromptTitle}>{selectedReward.name} selected</Text>
            <Text style={styles.placePromptBody}>Ready to choose a spot in your room?</Text>
          </View>
          <Pressable
            style={({ pressed }) => [styles.placeButton, pressed && styles.placeButtonPressed]}
            onPress={placeTaskReward}
            accessibilityLabel={`Place ${selectedReward.name} in room`}
          >
            <Text style={styles.placeButtonKicker}>NEXT STEP</Text>
            <Text style={styles.placeButtonText}>Place in room</Text>
          </Pressable>
        </View>
      ) : null}

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={t.accent} />
        </View>
      ) : inventoryEmpty ? (
        <View style={styles.center}>
          <Text style={styles.empty}>
            {owned.length === 0 ? "No items yet — visit the Shop to buy some." : "Nothing in this category."}
          </Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.grid}>
          {taskRewards.map((item) => {
            const image = getTaskFurnitureImage(item.id);
            const highlighted = item.id === guideItemId;
            const selected = item.id === selectedRewardId;
            return (
              <ItemCard
                key={`task-reward-${item.id}`}
                name={item.name}
                owned
                preview={image ? <Image source={image} style={styles.rewardImage} resizeMode="contain" /> : undefined}
                status={selected ? "selected" : "tap to select"}
                statusTone="action"
                badge={highlighted ? "NEW" : undefined}
                highlighted={highlighted}
                selected={selected}
                dimmed={!!guideItemId && !highlighted}
                onPress={() => selectTaskReward(item.id)}
              />
            );
          })}
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
                dimmed={!!guideItemId}
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
    rewardImage: { width: "92%", height: "92%" },
    guide: {
      minHeight: 70,
      flexDirection: "row",
      alignItems: "center",
      gap: SPACE.md,
      marginBottom: SPACE.md,
      borderWidth: 2,
      borderColor: t.success,
      borderRadius: RADIUS.panel,
      backgroundColor: t.surface,
      paddingHorizontal: SPACE.md,
      paddingVertical: SPACE.sm,
      shadowColor: t.success,
      shadowOpacity: 0.24,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 3 },
    },
    guideMascot: { width: 54, height: 54, borderRadius: RADIUS.control },
    guideCopy: { flex: 1, gap: 2 },
    guideTitle: { ...TYPE.label, color: t.text },
    guideBody: { ...TYPE.body, color: t.textDim },
    placePrompt: {
      minHeight: 70,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: SPACE.lg,
      marginBottom: SPACE.md,
      borderRadius: RADIUS.panel,
      backgroundColor: t.surface,
      paddingHorizontal: SPACE.lg,
      paddingVertical: SPACE.sm,
    },
    placePromptCopy: { flex: 1, gap: 2 },
    placePromptTitle: { ...TYPE.label, color: t.text },
    placePromptBody: { ...TYPE.body, color: t.textDim },
    placeButton: {
      minWidth: 150,
      minHeight: 48,
      borderWidth: 3,
      borderColor: t.success,
      borderRadius: RADIUS.control,
      backgroundColor: t.surfaceRaised,
      alignItems: "center",
      justifyContent: "center",
    },
    placeButtonPressed: { transform: [{ scale: 0.97 }], backgroundColor: t.accentPressed },
    placeButtonKicker: {
      color: t.success,
      fontSize: 8,
      fontWeight: "900",
      letterSpacing: 0.6,
    },
    placeButtonText: { ...TYPE.label, color: t.text },
  });
