import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { useGameStore } from "@/src/game/core/store";
import { Theme, useStyles } from "@/src/game/ui/theme";
import { GrainOverlay } from "@/src/game/ui/Button";
import { useRepos } from "@/src/data";
import { useCatalogRow } from "@/src/data/catalogStore";

/**
 * The finished-build screen.
 * The coins and XP shown are the catalog's configured reward (item_build) — the same source the
 * grant uses — so the display can't drift from what's awarded. The "succulent plant" reward is from
 * the wireframe and has nothing behind it yet — no item model.
 * Both action buttons go to the inventory: the built piece appears there now, and placement is not
 * wired yet, so "place in the room now!" has nothing to place. They stay separate buttons so the
 * placement route can be restored to the first one without touching the layout.
 */
export function BuildComplete() {
  const styles = useStyles(makeStyles);
  const router = useRouter();
  const repos = useRepos();
  const furniture = useGameStore((s) => s.furniture);
  const completed = useGameStore((s) => s.completed);
  const undoLastAction = useGameStore((s) => s.undoLastAction);
  const redoLastAction = useGameStore((s) => s.redoLastAction);
  const dismissed = useGameStore((s) => s.doneDismissed);
  const [reward, setReward] = useState({ coins: 0, xp: 0 });

  const furnitureId = furniture?.meta.id ?? null;
  // Display copy is DB-authored; the bundle knows only the id and the artwork.
  const catalogRow = useCatalogRow(furnitureId);
  useEffect(() => {
    if (!furnitureId) return;
    let alive = true;
    repos.builds
      .buildReward(furnitureId)
      .then((r) => alive && setReward(r))
      // Showing zero beats an uncaught rejection — the grant is server-side regardless. Matches BuildMap.
      .catch((err) => console.warn("[BuildComplete] reward lookup failed", err));
    return () => {
      alive = false;
    };
  }, [furnitureId, repos]);

  if (!furniture) return null;
  const total = furniture.actions.length;
  const isDone = total > 0 && completed.length >= total;
  if (!isDone || dismissed) return null;

  const { coins, xp } = reward;
  // BOTH buttons land on the inventory, where the finished piece now shows up (user_build joined to
  // the catalog). They stay two buttons because they will diverge again once placement is wired —
  // "place in the room now!" is meant to drop straight into placing, which nothing can do yet.
  //
  // Two steps, not a plain replace("/inventory"). The (presentation) group is a MODAL layer that
  // floats over whatever scene is beneath it, and every other entry into it is a push from the room —
  // inventory's own back button is dismissTo("/room") and needs the room to actually be there.
  // Replacing play (rather than pushing) also drops the finished build off the back stack, and the
  // room remount is what makes the new piece show up in it.
  const goToInventory = () => {
    router.replace("/room");
    router.push("/inventory");
  };

  return (
    <View style={styles.scrim}>
      <View style={styles.card}>
        <GrainOverlay radius={22} />
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

        <Text style={styles.title}>{catalogRow ? `${catalogRow.name} assembled!` : "Assembled!"}</Text>

        <ScrollView
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
                    {/* Placeholder art: there is no item model to draw from. */}
                    <View style={styles.itemBox} />
                    <Text style={styles.rewardText}>succulent plant</Text>
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
              style={styles.action}
              onPress={goToInventory}
              accessibilityLabel="Place it in the room"
            >
              <Image
                source={require("@/src/assets/ui/icons/icon-home.png")}
                style={styles.actionIcon}
                resizeMode="contain"
              />
              <Text style={styles.actionText}>place in the room now!</Text>
            </Pressable>
            <Pressable
              style={styles.action}
              onPress={goToInventory}
              accessibilityLabel="Store it in your inventory"
            >
              <Text style={styles.actionGlyph}>▤</Text>
              <Text style={styles.actionText}>store in inventory</Text>
            </Pressable>
          </View>
        </ScrollView>
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
      textAlign: "center",
      marginBottom: 12,
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
    itemBox: {
      width: 26,
      height: 26,
      borderRadius: 4,
      borderWidth: StyleSheet.hairlineWidth * 2,
      borderColor: t.borderStrong,
      backgroundColor: t.surfaceInset,
    },
    rewardText: {
      fontSize: 10,
      fontWeight: "700",
      color: t.text,
      textAlign: "center",
    },
    xpText: { fontSize: 17, fontWeight: "800", color: t.text },
    xpStar: { color: t.accent },

    actionsRow: { flexDirection: "row", justifyContent: "center", gap: 44 },
    action: { alignItems: "center", gap: 4, maxWidth: 150 },
    actionGlyph: { fontSize: 24, color: t.text },
  actionIcon: { width: 40, height: 40, marginBottom: 4 },
    actionText: {
      fontSize: 11,
      fontWeight: "700",
      color: t.text,
      textAlign: "center",
    },
  });