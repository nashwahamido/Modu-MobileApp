import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { actionCluster } from "@/src/game/core/evaluation/clusters";
import { useGameStore } from "@/src/game/core/store";
import { Theme, useStyles } from "@/src/game/ui/theme";

/** DEV-only round drawer button: tap to fan out developer shortcuts. First occupant: finish the focused cluster in one click (drives the REAL store action-by-action, so gates/cascades/celebration all fire — only the gestures are skipped). More tools land here later; the whole thing is stripped from release builds by the __DEV__ guard. */
/** Where the menu anchors. Default flows inline (play.tsx's right-anchored togglesRow, fan opens left). "roomFloat" self-positions as a floating overlay above the home-room rotate controls, fanning upward. */
type DevMenuPlacement = "inline" | "roomFloat";

export function DevMenu({ placement = "inline" }: { placement?: DevMenuPlacement } = {}) {
  const styles = useStyles(makeStyles);
  const [open, setOpen] = useState(false);
  const activeCluster = useGameStore((s) => s.activeCluster);

  const finishCluster = () => {
    const store = useGameStore.getState();
    const furniture = store.furniture;
    if (!furniture || !store.activeCluster) return;
    if (store.heldActionId) store.cancelHeld();
    const cluster = store.activeCluster;
    // legality is re-derived after every completion, so this can never complete a step the player couldn't have reached; the cap is a runaway guard, not a target
    const cap = furniture.actions.length * 2;
    for (let i = 0; i < cap; i++) {
      const s = useGameStore.getState();
      // never eat a combineClusters: finishing the LAST cluster makes its own combine available mid-loop, and swallowing it here would skip the very combine stage this button exists to test
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

  // Fast-forward the REAL store through every build step until only combineClusters remain the frontier — lands right at the combine stage with the tray cards up.
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

  // Fast-forward the REAL store until the first cam-lock action reaches the frontier — lands right before inserting the EKET rear cams. No-op on furnitures without cam parts.
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

  // Fast-forward the REAL store (builds, combines and all) until the first push-latch test beat is the frontier — the quickest way to iterate on the drawer test interaction.
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

  if (!__DEV__) return null;
  return (
    <View
      style={[styles.wrap, placement === "roomFloat" && styles.wrapRoomFloat]}
      pointerEvents="box-none"
    >
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
    // Default (play.tsx): flows inside the right-anchored togglesRow; the fan opens INLINE to the button's left (the row grows leftward without shifting the neighbours). An absolute fan was width-clamped to the 36px circle by Yoga and wrapped its label vertically.
    wrap: { flexDirection: "row", alignItems: "center", gap: 8 },
    // roomFloat (RoomExperience): floats above the bottom-left rotate controls without taking a layout slot. box-none (on the wrap) lets taps fall through the gaps; column-reverse pins the fab to the bottom and fans the items UPWARD, clear of the controls below. Left edge lines up with the rotate control group (left:24); bottom clears its 44px height (bottom:78).
    wrapRoomFloat: {
      position: "absolute",
      left: 24,
      bottom: 132,
      zIndex: 20,
      flexDirection: "column-reverse",
      alignItems: "flex-start",
    },
    fab: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: t.scrim,
      alignItems: "center",
      justifyContent: "center",
    },
    fabOpen: { backgroundColor: t.accent },
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
