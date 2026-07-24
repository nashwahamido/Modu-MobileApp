// The shared header + filter bar for catalogue surfaces (Shop, Inventory): a back button on the
// left, a centered title, an optional coin balance on the right, then a row of category tabs and
// a tap-to-cycle sort pill. Both surfaces render this so their chrome is identical, not lookalike.
import { ScrollView, StyleSheet, Text, View } from "react-native";

import { CoinMedalIcon } from "@/src/components/Icons";
import { Button } from "@/src/game/ui/Button";
import { RADIUS, SPACE, Theme, TYPE, useStyles } from "@/src/game/ui/theme";
import { CATEGORY_FILTERS, SORT_LABELS } from "@/src/data";
import type { CategoryFilter, ShopSort } from "@/src/data";

export interface CatalogueChromeProps {
  title: string;
  // Left button — label and handler (e.g. "Room" → close / navigate back to the room).
  backLabel: string;
  onBack: () => void;
  // Coin balance shown top-right. Omit to hide it.
  coins?: number;
  category: CategoryFilter;
  onCategory: (category: CategoryFilter) => void;
  sort: ShopSort;
  // Advance the sort to the next mode (see nextSort in the data module).
  onSort: () => void;
}

export function CatalogueChrome({ title, backLabel, onBack, coins, category, onCategory, sort, onSort }: CatalogueChromeProps) {
  const styles = useStyles(makeStyles);
  return (
    <View>
      <View style={styles.header}>
        <View style={styles.side}>
          <Button label={`‹ ${backLabel}`} onPress={onBack} />
        </View>
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        <View style={[styles.side, styles.sideRight]}>
          {coins != null ? (
            <View style={styles.coinPill}>
              <CoinMedalIcon size={22} />
              <Text style={styles.coinText}>{coins}</Text>
            </View>
          ) : null}
        </View>
      </View>

      <View style={styles.bar}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs}>
          {CATEGORY_FILTERS.map((c) => (
            <Text
              key={c}
              onPress={() => onCategory(c)}
              style={[styles.tab, c === category ? styles.tabActive : null, c === category ? styles.tabTextActive : styles.tabText]}
            >
              {c}
            </Text>
          ))}
        </ScrollView>
        <Text style={styles.sort} onPress={onSort}>
          Sort: {SORT_LABELS[sort]}
        </Text>
      </View>
    </View>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    header: { flexDirection: "row", alignItems: "center", marginBottom: SPACE.md },
    // Equal-width sides keep the title optically centered regardless of button/coin widths.
    side: { flex: 1, alignItems: "flex-start" },
    sideRight: { alignItems: "flex-end" },
    title: { ...TYPE.title, fontSize: 22, color: t.text, textAlign: "center" },
    coinPill: { flexDirection: "row", alignItems: "center", gap: SPACE.xs, paddingHorizontal: SPACE.md, height: 38, borderRadius: RADIUS.pill, borderWidth: 1, borderColor: t.border, backgroundColor: t.surface },
    coinText: { ...TYPE.label, color: t.text },

    bar: { flexDirection: "row", alignItems: "center", gap: SPACE.sm, marginBottom: SPACE.md },
    tabs: { flexDirection: "row", gap: SPACE.sm, paddingRight: SPACE.sm },
    tab: { overflow: "hidden", paddingHorizontal: SPACE.md, height: 34, lineHeight: 34, borderRadius: RADIUS.pill, borderWidth: 1, borderColor: t.border, backgroundColor: t.surface, textTransform: "capitalize", ...TYPE.labelSm },
    tabActive: { backgroundColor: t.surfaceRaised, borderColor: t.borderStrong },
    tabText: { color: t.textDim },
    tabTextActive: { color: t.text },
    sort: { overflow: "hidden", paddingHorizontal: SPACE.md, height: 34, lineHeight: 34, borderRadius: RADIUS.pill, borderWidth: 1, borderColor: t.border, backgroundColor: t.surface, color: t.textDim, ...TYPE.labelSm },
  });
