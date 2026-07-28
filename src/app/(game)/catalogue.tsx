// catalogue for assembly task

import { useMemo, useState } from "react";
import { useRouter } from "expo-router";
import { StyleSheet,
  Image,
  Pressable,
  ScrollView,
  Text,
  useColorScheme,
  View,
} from "react-native";

// type
import { SCREEN_SIDE_MARGIN, SCREEN_VERTICAL_MARGIN, useSafeInsets } from "@/src/hooks/use-safe-insets";
import type { FurnitureMeta } from "@/src/game/core/type";
import { type Milestone } from "@/src/game/ui/loadingProgress";

// data
import { FURNITURE_METAS } from "@/src/game/content/furnitures/furnitures";
import { useRepos } from "@/src/data";
import { useCatalogRow, useCatalogStore } from "@/src/data/catalogStore";
import { brandFor } from "@/src/game/content/brands";
import { ChevronIcon, ClockIcon, StagesIcon } from "@/src/components/Icons";

// styling
import { RADIUS, SPACE, TYPE, ELEVATION, useStyles } from "@/src/game/ui/theme";
import { Button, GrainOverlay } from "@/src/game/ui/Button";
import { LoadingScreen } from "@/src/game/ui/LoadingScreen";
import type { Theme } from "@/src/game/ui/theme";

// The catalogue's copy is DB-authored.
// needs loading screen
function CatalogueLoading({ onBack }: { onBack: () => void }) {
  const styles = useStyles(makeStyles);
  const status = useCatalogStore((s) => s.status);
  // 0.35 from the first frame: the fetch is already in flight, so the bar opens in creep rather than a stall.
  const milestone: Milestone = status === "empty" ? 0.35 : 1;

  // Err overlaid.
  // TO-BE-FIXED:refresh() reports "error" only when it has NOTHING cached to fall back on, so a first-ever launch whose fetch never resolves sits at "empty" indefinitely; without this the player is stuck on a creeping bar with no route back to the room.
  return (
    <View style={styles.loadingWrap}>
      <LoadingScreen milestone={milestone} />
      <View style={styles.loadingBack}>
        <Button label="‹ Room" onPress={onBack} />
      </View>
    </View>
  );
}

export default function CatalogueScreen() {
  const styles = useStyles(makeStyles);
  const router = useRouter();
  const safe = useSafeInsets();
  // The catalogue rows carry the display copy; the bundle only knows ids and counts. Reading
  // the whole map here (not per-card) is what lets the category filter exist at all.
  const rows = useCatalogStore((st) => st.rows);
  const [category, setCategory] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  // Every distinct furniture_types.name in the catalogue, in stable alphabetical order.
  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const r of Object.values(rows)) if (r.type) set.add(r.type);
    return [...set].sort();
  }, [rows]);
  const scheme = useColorScheme();
  const repos = useRepos();
  const status = useCatalogStore((s) => s.status);
  // Every entry in the catalog
  const items = FURNITURE_METAS;

  // Hold the grid until the catalogue is in memory: the bundle knows the artwork and the counts, but not a single word of copy.
  if (status === "empty")
    return <CatalogueLoading onBack={() => router.back()} />;

  if (status === "error") {
    return (
      <LoadingScreen
        milestone={0.35}
        errorMessage="Couldn't load the catalogue."
        actions={
          <>
            <Button
              label="Try again"
              onPress={() => void useCatalogStore.getState().refresh(repos)}
            />
            <Button label="‹ Room" onPress={() => router.back()} />
          </>
        }
      />
    );
  }

  return (
    <View style={styles.root}>
      {/* Same clay grain as every surface in the app, laid over the screen background. */}
      <GrainOverlay radius={0} />
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingLeft: SPACE.xl + Math.max(safe.raw.left, SCREEN_SIDE_MARGIN), paddingRight: SPACE.xl + Math.max(safe.raw.right, SCREEN_SIDE_MARGIN), paddingTop: SPACE.xl + Math.max(safe.raw.top, SCREEN_VERTICAL_MARGIN) },
        ]}
      >
        <View style={styles.header}>
          {/* Home, not "back": the room IS the hub, and the player may have arrived here from anywhere. */}
          <Pressable
            style={({ pressed }) => [styles.homeBtn, pressed && styles.pressedSurface]}
            onPress={() => router.dismissTo("/room")}
            accessibilityRole="button"
            accessibilityLabel="Back to your room"
            hitSlop={8}
          >
            <Image
              source={require("@/src/assets/ui/icons/icon-home.png")}
              style={styles.homeIcon}
              resizeMode="contain"
            />
          </Pressable>
          <Text style={styles.title}>PICK AN ITEM TO ASSEMBLE</Text>
          <View style={styles.headerSpacer} />
          {/* Category filter. The list hangs off this pill so it can't push the grid down. */}
          <View style={styles.pickerWrap}>
            <Pressable
              style={({ pressed }) => [styles.picker, pressed && styles.pressedSurface]}
              onPress={() => setPickerOpen((o) => !o)}
              accessibilityRole="button"
              accessibilityLabel="Filter by category"
            >
              <Text style={styles.pickerText}>{category ?? "All categories"}</Text>
              <ChevronIcon size={22} color={INK} up={pickerOpen} />
            </Pressable>
            {pickerOpen ? (
              <View style={styles.pickerMenu}>
                {[null, ...categories].map((c) => (
                  <Pressable
                    key={c ?? "all"}
                    style={({ pressed }) => [styles.pickerItem, pressed && styles.pressedSurface]}
                    onPress={() => {
                      setCategory(c);
                      setPickerOpen(false);
                    }}
                  >
                    <Text style={[styles.pickerItemText, c === category && styles.pickerItemActive]}>
                      {c ?? "All categories"}
                    </Text>
                  </Pressable>
                ))}
              </View>
            ) : null}
          </View>
        </View>
        <View style={styles.grid}>
          {items
            .filter((m) => !category || rows[m.id]?.type === category)
            .map((m) => (
            <FurnitureCard
              key={m.id}
              meta={m}
              dark={scheme === "dark"}
              // Straight to the build. The experience/profile is set by onboarding (and adjustable in Settings) — not a per-item chooser.
              onPress={() =>
                router.push({ pathname: "/play", params: { id: m.id } })
              }
            />
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

function FurnitureCard({
  meta,
  dark,
  onPress,
}: {
  meta: FurnitureMeta;
  dark: boolean;
  onPress: () => void;
}) {
  const styles = useStyles(makeStyles);
  // `dark` survives here for the ARTWORK, not the styling: each meta ships a light and a dark thumbnail, and that choice can't come from a colour token.
  const thumb =
    (dark ? meta.thumbnail.dark : meta.thumbnail.light) ?? meta.thumbnail.light;
  // Name, brand, type and duration are DB-authored; the bundle only knows the id, the artwork and the counts it derives. Undefined until the catalogue loads.
  const row = useCatalogRow(meta.id);
  const brand = row ? brandFor(row.brand) : null;
  return (
    <Pressable
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
      onPress={onPress}
    >
      <View style={styles.cardBody}>
        <View style={styles.thumbWrap}>
          <Image source={thumb} style={styles.thumb} resizeMode="contain" />
        </View>
        <View style={styles.cardCopy}>
          <View style={styles.nameRow}>
            <Text style={styles.name} numberOfLines={2}>{row?.name ?? "…"}</Text>
            {brand ? (
              <Image source={brand.logo} style={styles.brandLogo} resizeMode="contain" />
            ) : null}
          </View>
          {/* Stages and time only — part count is build detail the player does not choose on. */}
          <View style={styles.statRow}>
            <StagesIcon size={22} color={INK} />
            <Text style={styles.statText}>
              {meta.clusterCount} {meta.clusterCount === 1 ? "stage" : "stages"}
            </Text>
          </View>
          {row && row.durationMin > 0 ? (
            <View style={styles.statRow}>
              <ClockIcon size={22} color={INK} />
              <Text style={styles.statText}>{row.durationMin} mins</Text>
            </View>
          ) : null}
        </View>
      </View>
      {/* The card is pressable end to end; Start is the visible affordance, not a second target. */}
      <View style={styles.startBtn} pointerEvents="none">
        <Text style={styles.startText}>Start ›</Text>
      </View>
    </Pressable>
  );
}

/** The single text colour for this screen (wireframe ink). */
const INK = "#231F20";

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    // Screen palette, per the wireframe. Held here rather than in theme.ts so the rest of the
    // app keeps its own tokens until these are promoted deliberately. INK is every text on the
    // screen — one colour, no dimmed secondary tier, so the hierarchy comes from size/weight.
    root: { flex: 1, backgroundColor: "#F3ECE0" },
    loadingWrap: { flex: 1 },
    // Matches the grid header's inset so the button doesn't jump when the catalogue lands.
    loadingBack: { position: "absolute", top: 56, left: SPACE.xl },
    content: { padding: SPACE.xl, paddingTop: 56 },
    header: {
      flexDirection: "row",
      alignItems: "center",
      gap: SPACE.md,
      marginBottom: SPACE.xl,
      // The dropdown hangs out of this row; without this its menu is clipped by the ScrollView.
      zIndex: 10,
    },
    headerSpacer: { flex: 1 },
    homeBtn: {
      width: 44,
      height: 44,
      borderRadius: RADIUS.control,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: "#FBF8F3",
      borderWidth: 1,
      borderColor: t.border,
      ...ELEVATION.card,
    },
    homeIcon: { width: 28, height: 28 },
    pressedSurface: { backgroundColor: t.surfaceRaised },
    pickerWrap: { position: "relative", zIndex: 20 },
    picker: {
      flexDirection: "row",
      alignItems: "center",
      gap: SPACE.sm,
      height: 44,
      paddingHorizontal: SPACE.lg,
      borderRadius: RADIUS.pill,
      backgroundColor: "#FBF8F3",
      borderWidth: 1,
      borderColor: t.border,
      ...ELEVATION.card,
    },
    pickerText: { ...TYPE.label, color: INK },
    pickerMenu: {
      position: "absolute",
      top: 48,
      right: 0,
      minWidth: 190,
      paddingVertical: SPACE.xs,
      borderRadius: RADIUS.control,
      backgroundColor: "#FBF8F3",
      borderWidth: 1,
      borderColor: t.border,
      ...ELEVATION.card,
    },
    pickerItem: { paddingVertical: SPACE.sm, paddingHorizontal: SPACE.lg },
    pickerItemText: { ...TYPE.body, color: INK },
    pickerItemActive: { color: INK, fontWeight: "700" },
    // Uppercase, tracked-out: this is a screen label, not a page title competing with the cards.
    title: { fontSize: 17, fontWeight: "800", color: INK, letterSpacing: 0.5 },
    subtitle: {
      ...TYPE.body,
      color: INK,
      marginTop: SPACE.xs,
    },
    // space-between with a 48% card is what makes the two columns REACH both edges — a fixed
    // width computed from the padding left dead space on the right whenever the two disagreed.
    grid: {
      flexDirection: "row",
      flexWrap: "wrap",
      justifyContent: "space-between",
      rowGap: SPACE.lg,
    },
    card: {
      width: "48%",
      backgroundColor: "#FBF8F3",
      borderRadius: RADIUS.panel,
      padding: SPACE.lg,
      borderWidth: StyleSheet.hairlineWidth * 2,
      borderColor: t.border,
      ...ELEVATION.card,
    },
    cardPressed: { backgroundColor: t.surfaceRaised },
    cardBody: { flexDirection: "row", gap: SPACE.md },
    thumbWrap: {
      width: 118,
      height: 118,
      borderRadius: RADIUS.control,
      // Inset, like every other groove in the palette — the thumbnail sits IN the card.
      backgroundColor: t.surfaceInset,
      alignItems: "center",
      justifyContent: "center",
    },
    thumb: { width: "82%", height: "82%" },
    cardCopy: { flex: 1, gap: SPACE.xs },
    // Centre, not flex-start: the logo now matches the title's cap height, so aligning on the
    // text baseline row is what makes the pair read as one line.
    nameRow: { flexDirection: "row", alignItems: "center", gap: SPACE.sm },
    name: { flex: 1, fontSize: 17, fontWeight: "700", color: INK },
    brandLogo: { width: 54, height: 24 },
    // the pill reads as a label rather than as a status the player has to act on.
    statRow: { flexDirection: "row", alignItems: "center", gap: SPACE.sm },
    statText: { ...TYPE.body, color: INK },
    startBtn: {
      alignSelf: "flex-end",
      marginTop: SPACE.md,
      paddingHorizontal: SPACE.lg,
      height: 36,
      justifyContent: "center",
      borderRadius: RADIUS.pill,
      backgroundColor: "#8D7BA8",
    },
    startText: { ...TYPE.label, color: "#FFFFFF" },
  });