// The Shop's purchase dialogs, per the mocks. PurchaseNoticeDialog is the "you can't buy this yet" notice: the item's price pill overlapping the preview well, the preview (a level star when level-locked, else the item's picture), the reason line, and a Close button.
// PurchaseConfirmDialog is the "Purchase X for N?" ask with Yes/No — shown before any coins move, so a stray tap on a card never buys anything.
import { ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";

import { CoinMedalIcon } from "@/src/components/Icons";
import { Button } from "@/src/game/ui/Button";
import { OverlaySheet } from "@/src/game/ui/OverlaySheet";
import { RADIUS, SPACE, TYPE, useStyles, useTheme } from "@/src/game/ui/theme";
import { LevelBadge } from "./LevelBadge";
import type { Theme } from "@/src/game/ui/theme";

// Why the purchase can't happen: the player's level is too low, or their coins are.
export type PurchaseBlock = "level" | "coins";

// Scalar props, not a ShopItem: these dialogs describe a name and a price, so they stay usable for
// anything priced (a bundle, a reward) and src/shop keeps no dependency on the data layer. The item's
// picture arrives the same way ItemCard takes it — as a node the caller builds — for that same reason.
export interface PurchaseNoticeDialogProps {
  name: string;
  price: number;
  minLevel: number;
  block: PurchaseBlock;
  // Centered in the well. A level block shows the level star INSTEAD, exactly as the tile does.
  preview?: ReactNode;
  onClose: () => void;
}

export function PurchaseNoticeDialog({ name, price, minLevel, block, preview, onClose }: PurchaseNoticeDialogProps) {
  const styles = useStyles(makeStyles);
  return (
    <OverlaySheet size="dialog" onClose={onClose}>
      <View style={styles.previewWrap}>
        <View style={styles.preview}>
          {block === "level" ? <LevelBadge level={minLevel} size={72} /> : preview}
        </View>
        <View style={styles.pricePill}>
          <CoinMedalIcon size={26} />
          <Text style={styles.priceText}>{price}</Text>
        </View>
      </View>
      <Text style={styles.message}>
        {block === "level" ? `Reach level ${minLevel} to unlock ` : "Not enough money to buy "}
        <Text style={styles.itemName}>{name}</Text>
      </Text>
      <Button label="Close" variant="primary" onPress={onClose} style={styles.close} />
    </OverlaySheet>
  );
}

export interface PurchaseConfirmDialogProps {
  name: string;
  price: number;
  preview?: ReactNode;
  onConfirm: () => void;
  onClose: () => void;
}

export function PurchaseConfirmDialog({ name, price, preview, onConfirm, onClose }: PurchaseConfirmDialogProps) {
  const styles = useStyles(makeStyles);
  const t = useTheme();
  return (
    <OverlaySheet size="dialog" onClose={onClose}>
      <View style={styles.preview}>{preview}</View>
      <View style={styles.confirmRow}>
        <Text style={styles.message}>
          Purchase <Text style={styles.itemName}>{name}</Text> for{" "}
        </Text>
        <View style={styles.inlinePricePill}>
          <CoinMedalIcon size={22} />
          <Text style={styles.priceText}>{price}</Text>
        </View>
        <Text style={styles.message}> ?</Text>
      </View>
      <View style={styles.buttonRow}>
        <Button label="Yes" variant="success" pill onPress={onConfirm} style={styles.choice} />
        <Button label="No" variant="primary" pill onPress={onClose} style={[styles.choice, { backgroundColor: t.danger }]} />
      </View>
    </OverlaySheet>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    // Extra top/left padding gives the pill room to overlap the well's corner, per the mock.
    previewWrap: { paddingTop: SPACE.md, paddingLeft: SPACE.md, alignSelf: "center" },
    preview: {
      width: 220,
      height: 180,
      borderRadius: RADIUS.control,
      backgroundColor: t.surfaceInset,
      borderWidth: 1,
      borderColor: t.border,
      alignItems: "center",
      justifyContent: "center",
    },
    pricePill: {
      position: "absolute",
      top: 0,
      left: 0,
      flexDirection: "row",
      alignItems: "center",
      gap: SPACE.xs,
      paddingRight: SPACE.sm,
      borderRadius: RADIUS.pill,
      backgroundColor: t.surface,
      borderWidth: 1,
      borderColor: t.border,
    },
    priceText: { ...TYPE.label, color: t.text },
    message: { ...TYPE.body, fontSize: 16, color: t.text, textAlign: "center", marginTop: SPACE.lg },
    itemName: { fontWeight: "800" },
    close: { marginTop: SPACE.lg, minWidth: 120 },
    // The confirm ask reads as one sentence with the price pill inline, so the row centers and wraps as a unit.
    confirmRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", flexWrap: "wrap" },
    inlinePricePill: {
      flexDirection: "row",
      alignItems: "center",
      gap: SPACE.xs,
      paddingRight: SPACE.sm,
      marginTop: SPACE.lg,
      borderRadius: RADIUS.pill,
      backgroundColor: t.surface,
      borderWidth: 1,
      borderColor: t.border,
    },
    buttonRow: { flexDirection: "row", gap: SPACE.xl, marginTop: SPACE.lg },
    choice: { minWidth: 88 },
  });
