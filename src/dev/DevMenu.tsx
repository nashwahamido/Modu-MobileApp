import {
  useState } from "react";
import { StyleSheet,
  Text,
  View,
} from "react-native";
import { Pressable } from "@/src/components/Pressable";
import { actionCluster } from "@/src/game/core/evaluation/clusters";
import { useGameStore } from "@/src/game/core/store";
import { useFixedStyles } from "@/src/game/ui/system/theme";
import type { Theme } from "@/src/game/ui/system/theme";
import { SHOWCASE_ENABLED } from "@/src/dev/showcase";

export function DevMenu() {
  const styles = useFixedStyles(makeStyles);
  const [open, setOpen] = useState(false);
  const activeCluster = useGameStore((s) => s.activeCluster);

  const finishCluster = () => {
    const store = useGameStore.getState();
    const furniture = store.furniture;
    if (!furniture || !store.activeCluster) return;
    if (store.heldActionId) store.cancelHeld();
    const cluster = store.activeCluster;
    const cap = furniture.actions.length * 2;
    for (let i = 0; i < cap; i++) {
      const s = useGameStore.getState();
      const next = s
        .available()
        .find(
          (a) =>
            a.type !== "combineClusters" &&
            actionCluster(furniture, a) === cluster,
        );
      if (!next) break;
      s.completeAction(next.actionId);
    }
    setOpen(false);
  };

  const toCombine = () => {
    const store = useGameStore.getState();
    const furniture = store.furniture;
    if (!furniture) return;
    if (store.heldActionId) store.cancelHeld();
    const cap = furniture.actions.length * 2;
    for (let i = 0; i < cap; i++) {
      const s = useGameStore.getState();
      const next = s.available().find((a) => a.type !== "combineClusters");
      if (!next) break;
      s.completeAction(next.actionId);
    }
    setOpen(false);
  };

  const toCamLock = () => {
    const store = useGameStore.getState();
    const furniture = store.furniture;
    if (!furniture || !furniture.actions.some((a) => a.actionId.includes("cam"))) return;
    if (store.heldActionId) store.cancelHeld();
    const cap = furniture.actions.length * 2;
    for (let i = 0; i < cap; i++) {
      const s = useGameStore.getState();
      const avail = s.available();
      if (avail.some((a) => a.actionId.includes("cam"))) break;
      const next = avail.find((a) => a.type !== "combineClusters");
      if (!next) break;
      s.completeAction(next.actionId);
    }
    setOpen(false);
  };

  const toDrawerTest = () => {
    const store = useGameStore.getState();
    const furniture = store.furniture;
    const testIds = new Set(Object.values(furniture?.pushOpen?.testActionIds ?? {}));
    if (!furniture || testIds.size === 0) return;
    if (store.heldActionId) store.cancelHeld();
    const cap = furniture.actions.length * 2;
    for (let i = 0; i < cap; i++) {
      const s = useGameStore.getState();
      const next = s.available().find((a) => !testIds.has(a.actionId));
      if (!next) break;
      s.completeAction(next.actionId);
    }
    setOpen(false);
  };

  if (!__DEV__ || SHOWCASE_ENABLED) return null;
  return (
    <View style={styles.wrap} pointerEvents="box-none">
      {open ? (
        <>
          <Pressable style={styles.item} onPress={toCombine}>
            <Text style={styles.itemText} numberOfLines={1}>
              to combine
            </Text>
          </Pressable>
          <Pressable style={styles.item} onPress={toCamLock}>
            <Text style={styles.itemText} numberOfLines={1}>
              to cam lock
            </Text>
          </Pressable>
          <Pressable style={styles.item} onPress={toDrawerTest}>
            <Text style={styles.itemText} numberOfLines={1}>
              to drawer test
            </Text>
          </Pressable>
          <Pressable
            style={[styles.item, !activeCluster && styles.itemDisabled]}
            disabled={!activeCluster}
            onPress={finishCluster}
          >
            <Text style={styles.itemText} numberOfLines={1}>
              finish cluster
            </Text>
          </Pressable>
        </>
      ) : null}
      <Pressable
        style={[styles.fab, open && styles.fabOpen]}
        onPress={() => setOpen((v) => !v)}
        accessibilityLabel="Developer tools"
      >
        <Text style={styles.fabText}>{open ? "✕" : "dev"}</Text>
      </Pressable>
    </View>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    wrap: { flexDirection: "row", alignItems: "center", gap: 8 },
    fab: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: t.scrim,
      opacity: 0.4,
      alignItems: "center",
      justifyContent: "center",
    },
    fabOpen: { backgroundColor: t.accent, opacity: 1 },
    fabText: { color: t.onAccent, fontSize: 11, fontWeight: "800" },
    item: {
      backgroundColor: t.scrim,
      borderRadius: 14,
      paddingHorizontal: 14,
      paddingVertical: 8,
    },
    itemDisabled: { opacity: 0.4 },
    itemText: { color: t.onAccent, fontSize: 13, fontWeight: "700" },
  });
