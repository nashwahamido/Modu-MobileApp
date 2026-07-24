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
  highlighted?: boolean;
  selected?: boolean;
  dimmed?: boolean;
  badge?: string;
}

export function ItemCard({
  name,
  price,
  owned,
  status,
  statusTone = "muted",
  preview,
  onPress,
  disabled,
  highlighted,
  selected,
  dimmed,
  badge,
}: ItemCardProps) {
  const styles = useStyles(makeStyles);
  return (
    <Pressable
      style={({ pressed }) => [
        styles.card,
        highlighted && styles.cardHighlighted,
        selected && styles.cardSelected,
        dimmed && styles.cardDimmed,
        pressed && !disabled && styles.cardPressed,
      ]}
      onPress={onPress}
      disabled={disabled}
      accessibilityLabel={name}
    >
      {badge ? <Text style={styles.badge}>{badge}</Text> : null}
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
    cardHighlighted: {
      borderWidth: 3,
      borderColor: t.success,
      shadowColor: t.success,
      shadowOpacity: 0.34,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 4 },
    },
    cardSelected: {
      borderWidth: 3,
      borderColor: t.accent,
      backgroundColor: t.surface,
    },
    cardDimmed: { opacity: 0.42 },
    cardPressed: { transform: [{ scale: 0.98 }] },
    badge: {
      position: "absolute",
      zIndex: 2,
      right: 8,
      top: 8,
      borderRadius: 9,
      overflow: "hidden",
      backgroundColor: t.success,
      color: t.onSuccess,
      fontSize: 9,
      fontWeight: "900",
      paddingHorizontal: 7,
      paddingVertical: 3,
    },
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
