import { useRouter } from "expo-router";
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useColorScheme,
  View,
} from "react-native";

import { FURNITURE_METAS } from "@/src/game/content/furnitures/furnitures";
import { useRepos } from "@/src/data";
import { useCatalogRow, useCatalogStore } from "@/src/data/catalogStore";
import { Button } from "@/src/game/ui/Button";
import { LoadingScreen } from "@/src/game/ui/LoadingScreen";
import { type Milestone } from "@/src/game/ui/loadingProgress";
import { ELEVATION, RADIUS, SPACE, Theme, TYPE, useStyles} from "@/src/game/ui/theme";
import { brandFor } from "@/src/game/content/brands";
import type { FurnitureMeta } from "@/src/game/core/type";

// The catalogue's copy is DB-authored, so there is nothing truthful to render until it lands. Same treatment as every other wait — LoadingScreen owns the look.
function CatalogueLoading({ onBack }: { onBack: () => void }) {
  const styles = useStyles(makeStyles);
  const status = useCatalogStore((s) => s.status);
  // 0.35 from the first frame: the fetch is already in flight, so the bar opens in creep rather than a stall.
  const milestone: Milestone = status === "empty" ? 0.35 : 1;

  // The way out, overlaid rather than passed as `actions` — LoadingScreen renders those only in the
  // error state, and the assembly loader shares it. refresh() reports "error" only when it has NOTHING
  // cached to fall back on, so a first-ever launch whose fetch never resolves sits at "empty"
  // indefinitely; without this the player is stuck on a creeping bar with no route back to the room.
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
  const scheme = useColorScheme();
  const repos = useRepos();
  const status = useCatalogStore((s) => s.status);
  // Every entry in the catalog, tutorial included — it is a real buildable piece a player owns and places like any other.
  const items = FURNITURE_METAS;

  // Hold the grid until the catalogue is in memory: the bundle knows the artwork and the counts, but not a single word of copy.
  if (status === "empty") return <CatalogueLoading onBack={() => router.back()} />;

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
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Button label="‹ Room" onPress={() => router.back()} />
          <View>
            <Text style={styles.title}>Choose a build</Text>
            <Text style={styles.subtitle}>{items.length} furniture available</Text>
          </View>
        </View>
        <View style={styles.grid}>
          {items.map((m) => (
            <FurnitureCard
              key={m.id}
              meta={m}
              dark={scheme === "dark"}
              // Straight to the build. The experience/profile is set by onboarding (and adjustable in Settings) — not a per-item chooser.
              onPress={() => router.push({ pathname: "/play", params: { id: m.id } })}
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
  return (
    <Pressable
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
      onPress={onPress}
    >
      <View style={styles.thumbWrap}>
        <Image source={thumb} style={styles.thumb} resizeMode="contain" />
      </View>
      <Text style={styles.name}>{row?.name ?? "…"}</Text>
      <Text style={styles.brand}>
        {row
          ? `${brandFor(row.brand).name}${row.type ? ` · ${row.type}` : ""}`
          : " "}
      </Text>
      <View style={styles.metaRow}>
        <Text style={styles.metaText}>{meta.partCount} parts</Text>
        <Text style={styles.metaDot}>·</Text>
        {/* "stage" is what the build map calls a cluster to the player, so the card matches the word they meet next. */}
        <Text style={styles.metaText}>
          {meta.clusterCount} {meta.clusterCount === 1 ? "stage" : "stages"}
        </Text>
        {row && row.durationMin > 0 ? (
          <>
            <Text style={styles.metaDot}>·</Text>
            <Text style={styles.metaText}>~{row.durationMin} min</Text>
          </>
        ) : null}
      </View>
    </Pressable>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: t.bg },
    loadingWrap: { flex: 1 },
    // Matches the grid header's inset so the button doesn't jump when the catalogue lands.
    loadingBack: { position: "absolute", top: 56, left: SPACE.xl },
    content: { padding: SPACE.xl, paddingTop: 56 },
    header: {
      flexDirection: "row",
      alignItems: "center",
      gap: SPACE.lg,
      marginBottom: SPACE.xl,
    },
    title: { fontSize: 28, fontWeight: "800", color: t.text },
    subtitle: {
      ...TYPE.body,
      color: t.textDim,
      marginTop: SPACE.xs,
    },
    grid: { flexDirection: "row", flexWrap: "wrap", gap: SPACE.lg },
    card: {
      flexBasis: "47%",
      flexGrow: 1,
      backgroundColor: t.surface,
      borderRadius: RADIUS.panel,
      padding: SPACE.lg,
      borderWidth: StyleSheet.hairlineWidth * 2,
      borderColor: t.border,
      ...ELEVATION.card,
    },
    cardPressed: { backgroundColor: t.surfaceRaised },
    thumbWrap: {
      height: 120,
      borderRadius: RADIUS.control,
      // Inset, like every other groove in the palette — the thumbnail sits IN the card.
      backgroundColor: t.surfaceInset,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: SPACE.md,
    },
    thumb: { width: "80%", height: "80%" },
    name: { fontSize: 17, fontWeight: "700", color: t.text },
    brand: {
      ...TYPE.labelSm,
      fontWeight: "500",
      color: t.textDim,
      marginTop: 2,
    },
    metaRow: {
      flexDirection: "row",
      alignItems: "center",
      marginTop: SPACE.sm,
      flexWrap: "wrap",
    },
    metaText: { ...TYPE.labelSm, color: t.textDim },
    metaDot: { color: t.textFaint, fontSize: 12, marginHorizontal: 6 },
  });