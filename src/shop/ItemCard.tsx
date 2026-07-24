// A shop/inventory item tile: a bordered card with a price+owned row, a preview well, the item
// name, and a status line. One source of truth so the Shop grid and the Inventory grid render
// identical cards — pass a custom `preview` (e.g. a real furniture sprite) when there is one.
import { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { CoinMedalIcon } from "@/src/components/Icons";
import { RADIUS, SPACE, Theme, TYPE, useStyles } from "@/src/game/ui/theme";

// Colour of the status line: "action" = a tappable prompt (buy / place), "muted" = a passive state.
type StatusTone = "action" | "muted";

export interface ItemCardProps {
  name: string;
  // Coin price shown top-left. Omit to hide the price row (unless `owned` still needs the tick).
  price?: number;
  // Shows a check top-right.
  owned?: boolean;
  // Small line under the name — "buy", "need coins", "owned", "tap to place".
  status?: string;
  statusTone?: StatusTone;
  // Custom preview content, centered in the well. Defaults to an empty well.
  preview?: ReactNode;
  onPress?: () => void;
  disabled?: boolean;
}

export function ItemCard({ name, price, owned, status, statusTone = "muted", preview, onPress, disabled }: ItemCardProps) {
  const styles = useStyles(makeStyles);
  return (
    <Pressable style={styles.card} onPress={onPress} disabled={disabled} accessibilityLabel={name}>
      {price != null || owned ? (
        <View style={styles.topRow}>
          {price != null ? (
            <View style={styles.pricePill}>
              <CoinMedalIcon size={18} />
              <Text style={styles.priceText}>{price}</Text>
            </View>
          ) : (
            <View />
          )}
          {owned ? <Text style={styles.ownedTick}>✓</Text> : null}
        </View>
      ) : null}
      <View style={styles.preview}>{preview}</View>
      <Text style={styles.name} numberOfLines={1}>
        {name}
      </Text>
      {status ? (
        <Text style={[styles.status, statusTone === "action" ? styles.statusAction : styles.statusMuted]}>{status}</Text>
      ) : null}
    </Pressable>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    // surfaceRaised = "a card sitting on a panel", so the tile reads as lifted on both the Shop
    // page (bg) and the Inventory panel (surface).
    card: { width: 168, borderRadius: RADIUS.panel, borderWidth: 1, borderColor: t.border, backgroundColor: t.surfaceRaised, padding: SPACE.md },
    topRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: 20, marginBottom: SPACE.sm },
    pricePill: { flexDirection: "row", alignItems: "center", gap: SPACE.xs },
    priceText: { ...TYPE.labelSm, color: t.text },
    ownedTick: { color: t.success, fontSize: 16, fontWeight: "900" },
    preview: { height: 90, borderRadius: RADIUS.control, backgroundColor: t.surfaceInset, alignItems: "center", justifyContent: "center", overflow: "hidden" },
    name: { ...TYPE.label, color: t.text, marginTop: SPACE.sm },
    status: { ...TYPE.labelSm, marginTop: SPACE.xs },
    statusAction: { color: t.accent },
    statusMuted: { color: t.textFaint },
  });
