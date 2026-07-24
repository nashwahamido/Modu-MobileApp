import { useRouter } from "expo-router";
import type { Href } from "expo-router";
import { useState } from "react";
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { useGameStore } from "@/src/game/core/store";
import { Theme, useStyles } from "@/src/game/ui/theme";
import { usePlacementStore } from "@/src/room/placement";
import { useTaskRewardInventory } from "@/src/room/taskRewardInventory";

const mascot = require("@/src/assets/images/mascot/mascot.png");

/** Coins per completed step. Mirrors ClusterFocusControl — see the note there: there is no wallet or shop in the data model, so this is a placeholder RATE, not a typed-in number. */
const COINS_PER_STEP = 3;

/**
 * The finished-build screen.
 * Coins and XP are computed from the build. The completed furniture can either
 * enter the guided room placement immediately or be collected from Inventory later.
 */
export function BuildComplete() {
  const styles = useStyles(makeStyles);
  const router = useRouter();
  const furniture = useGameStore((s) => s.furniture);
  const completed = useGameStore((s) => s.completed);
  const undoLastAction = useGameStore((s) => s.undoLastAction);
  const redoLastAction = useGameStore((s) => s.redoLastAction);
  const dismissed = useGameStore((s) => s.doneDismissed);
  const [savedToInventory, setSavedToInventory] = useState(false);

  if (!furniture) return null;
  const total = furniture.actions.length;
  const isDone = total > 0 && completed.length >= total;
  if (!isDone || dismissed) return null;

  const coins = total * COINS_PER_STEP;
  const xp = total * furniture.xpPerStep;
  const reward = {
    id: String(furniture.meta.id),
    name: furniture.meta.name,
  };
  // Carry the completed task furniture into the room and begin its first placement flow.
  const placeInRoom = () => {
    useTaskRewardInventory.getState().grant(reward);
    useTaskRewardInventory.getState().finishInventoryGuide();
    usePlacementStore.getState().startFirstPlacement(
      reward.id,
      reward.name,
    );
    router.replace("/room" as Href);
  };
  const storeInInventory = () => {
    useTaskRewardInventory.getState().grant(reward);
    useTaskRewardInventory.getState().startInventoryGuide(reward.id);
    setSavedToInventory(true);
  };
  const goToInventory = () => router.replace("/inventory" as Href);

  return (
    <View style={styles.scrim}>
      <View style={styles.card}>
        {/* The wireframe's two round buttons. Read as undo/redo, which is exactly what they
            can be here: a way back into the build if the player wants to change something
            after seeing it finished. */}
        <View style={styles.historyRow}>
          <Pressable
            style={styles.roundBtn}
            onPress={() => {
              useGameStore.getState().setDoneDismissed(true);
              undoLastAction();
            }}
            hitSlop={8}
            accessibilityLabel="Undo the last step"
          >
            <Text style={styles.roundGlyph}>↺</Text>
          </Pressable>
          <Pressable
            style={styles.roundBtn}
            // Clears the dismiss so redoing the final step brings this screen back — it
            // was dismissed to get INTO the build, not to hide the result permanently.
            onPress={() => {
              useGameStore.getState().setDoneDismissed(false);
              redoLastAction();
            }}
            hitSlop={8}
            accessibilityLabel="Redo the last step"
          >
            <Text style={styles.roundGlyph}>↻</Text>
          </Pressable>
        </View>

        <View style={styles.congratulations}>
          <Image source={mascot} style={styles.mascot} resizeMode="contain" />
          <View style={styles.congratulationsCopy}>
            <Text style={styles.title}>
              {savedToInventory ? "Saved to your inventory!" : "Your first furniture is ready!"}
            </Text>
            <Text style={styles.message}>
              {savedToInventory
                ? `Your ${furniture.meta.name} is safe. Let me show you where to find it.`
                : `Congratulations! You earned ${furniture.meta.name}. Let\u2019s place it in your room.`}
            </Text>
          </View>
        </View>

        {savedToInventory ? (
          <View style={styles.savedActions}>
            <Pressable
              style={({ pressed }) => [
                styles.inventoryGuideAction,
                pressed && styles.primaryActionPressed,
              ]}
              onPress={goToInventory}
              accessibilityLabel="Go to inventory"
            >
              <Text style={styles.inventoryGuideKicker}>NEXT STEP</Text>
              <Text style={styles.inventoryGuideText}>Go to inventory</Text>
            </Pressable>
            <Pressable
              style={styles.laterAction}
              onPress={() => router.replace("/room" as Href)}
              accessibilityLabel="Go to the room later"
            >
              <Text style={styles.laterActionText}>Maybe later</Text>
            </Pressable>
          </View>
        ) : <ScrollView
          contentContainerStyle={styles.body}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.mainRow}>
            {/* The finished piece. */}
            <View style={styles.preview}>
              <Image
                source={furniture.meta.thumbnail.light}
                style={styles.previewImg}
                resizeMode="contain"
              />
            </View>

            <View style={styles.panels}>
              <View style={styles.panel}>
                <Text style={styles.panelKicker}>COMPLETION REWARD:</Text>
                <View style={styles.rewardRow}>
                  <View style={styles.rewardItem}>
                    <Text style={styles.coinGlyph}>★</Text>
                    <Text style={styles.rewardText}>+ {coins} coins</Text>
                  </View>
                  <View style={styles.rewardItem}>
                    <Image
                      source={furniture.meta.thumbnail.light}
                      style={styles.rewardFurniture}
                      resizeMode="contain"
                    />
                    <Text style={styles.rewardText}>furniture unlocked</Text>
                  </View>
                </View>
              </View>

              <View style={styles.panel}>
                <Text style={styles.panelKicker}>TOTAL EXPERIENCE GAINED</Text>
                <Text style={styles.xpText}>
                  +{xp} <Text style={styles.xpStar}>★</Text>
                </Text>
              </View>
            </View>
          </View>

          <View style={styles.actionsRow}>
            <Pressable
              style={({ pressed }) => [
                styles.action,
                styles.primaryAction,
                pressed && styles.primaryActionPressed,
              ]}
              onPress={placeInRoom}
              accessibilityLabel="Place it in the room"
            >
              <Text style={styles.primaryActionKicker}>NEXT STEP</Text>
              <View style={styles.primaryActionContent}>
                <Text style={styles.primaryActionGlyph}>⌂</Text>
                <Text style={styles.primaryActionText}>Place it in my room</Text>
              </View>
            </Pressable>
            <Pressable
              style={styles.action}
              onPress={storeInInventory}
              accessibilityLabel="Store it in your inventory"
            >
              <Text style={styles.actionGlyph}>▤</Text>
              <Text style={styles.actionText}>store in inventory</Text>
            </Pressable>
          </View>
        </ScrollView>}
      </View>
    </View>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    scrim: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: t.scrim,
      alignItems: "center",
      justifyContent: "center",
      padding: 12,
      zIndex: 45,
    },
    // Same shell as the build map: literal cream, purple rim.
    card: {
      width: "100%",
      maxWidth: 620,
      maxHeight: "96%",
      backgroundColor: "#E3DACD",
      borderRadius: 22,
      borderWidth: 2,
      borderColor: t.accent,
      paddingTop: 14,
      paddingBottom: 14,
      paddingHorizontal: 22,
    },

    historyRow: { position: "absolute", top: 12, left: 16, flexDirection: "row", gap: 8 },
    roundBtn: {
      width: 34,
      height: 34,
      borderRadius: 17,
      backgroundColor: t.surface,
      alignItems: "center",
      justifyContent: "center",
    },
    roundGlyph: { fontSize: 17, fontWeight: "800", color: t.accent },

    title: {
      fontSize: 19,
      fontWeight: "800",
      color: t.accent,
    },
    congratulations: {
      flexDirection: "row",
      alignItems: "center",
      alignSelf: "center",
      width: "78%",
      minHeight: 58,
      gap: 10,
      marginBottom: 10,
    },
    mascot: {
      width: 54,
      height: 54,
      borderRadius: 12,
    },
    congratulationsCopy: {
      flex: 1,
      gap: 3,
    },
    message: {
      color: t.textDim,
      fontSize: 11,
      lineHeight: 15,
      fontWeight: "600",
    },
    body: { paddingBottom: 2 },

    mainRow: { flexDirection: "row", gap: 16, marginBottom: 12 },
    preview: {
      flex: 1.15,
      height: 148,
      backgroundColor: t.surface,
      borderRadius: 10,
      borderWidth: StyleSheet.hairlineWidth * 2,
      borderColor: t.border,
      alignItems: "center",
      justifyContent: "center",
    },
    previewImg: { width: "80%", height: "80%" },

    panels: { flex: 1, gap: 10 },
    panel: {
      backgroundColor: t.surface,
      borderRadius: 12,
      borderWidth: StyleSheet.hairlineWidth * 2,
      borderColor: t.border,
      paddingVertical: 10,
      paddingHorizontal: 12,
      alignItems: "center",
    },
    panelKicker: {
      fontSize: 9.5,
      fontWeight: "800",
      letterSpacing: 0.5,
      color: t.textDim,
      marginBottom: 8,
    },
    rewardRow: { flexDirection: "row", gap: 18 },
    rewardItem: { alignItems: "center", gap: 4, maxWidth: 84 },
    coinGlyph: { fontSize: 22, color: t.gold },
    rewardFurniture: {
      width: 26,
      height: 26,
    },
    rewardText: {
      fontSize: 10,
      fontWeight: "700",
      color: t.text,
      textAlign: "center",
    },
    xpText: { fontSize: 17, fontWeight: "800", color: t.text },
    xpStar: { color: t.accent },

    actionsRow: { flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 30 },
    savedActions: {
      minHeight: 176,
      alignItems: "center",
      justifyContent: "center",
      gap: 12,
    },
    inventoryGuideAction: {
      minWidth: 230,
      minHeight: 64,
      borderRadius: 14,
      borderWidth: 3,
      borderColor: t.success,
      backgroundColor: t.surface,
      alignItems: "center",
      justifyContent: "center",
      shadowColor: t.success,
      shadowOpacity: 0.3,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 4 },
    },
    inventoryGuideKicker: {
      color: t.success,
      fontSize: 9,
      fontWeight: "900",
      letterSpacing: 0.7,
    },
    inventoryGuideText: {
      color: t.text,
      fontSize: 17,
      fontWeight: "900",
    },
    laterAction: {
      minWidth: 120,
      minHeight: 38,
      alignItems: "center",
      justifyContent: "center",
    },
    laterActionText: {
      color: t.textDim,
      fontSize: 12,
      fontWeight: "700",
    },
    action: { minWidth: 138, minHeight: 54, alignItems: "center", justifyContent: "center", gap: 4 },
    primaryAction: {
      minWidth: 190,
      minHeight: 58,
      borderWidth: 3,
      borderColor: t.success,
      borderRadius: 14,
      backgroundColor: t.success,
      paddingHorizontal: 16,
      paddingVertical: 7,
      shadowColor: t.success,
      shadowOpacity: 0.34,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 3 },
    },
    primaryActionPressed: {
      transform: [{ scale: 0.97 }],
      opacity: 0.9,
    },
    primaryActionKicker: {
      color: t.onSuccess,
      fontSize: 8,
      lineHeight: 10,
      fontWeight: "900",
      letterSpacing: 0.8,
    },
    primaryActionContent: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 7,
    },
    primaryActionGlyph: { fontSize: 23, color: t.onSuccess },
    primaryActionText: {
      color: t.onSuccess,
      fontSize: 12,
      lineHeight: 15,
      fontWeight: "900",
      textAlign: "center",
    },
    actionGlyph: { fontSize: 24, color: t.text },
    actionText: {
      fontSize: 11,
      fontWeight: "700",
      color: t.text,
      textAlign: "center",
    },
  });
