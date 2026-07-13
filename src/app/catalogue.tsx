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

import { FURNITURE_METAS } from "@/src/game/data/furnitures/furnitures";
import { Panel } from "@/src/game/ui/Button";
import { ELEVATION, RADIUS, SPACE, Theme, TYPE, useStyles} from "@/src/game/ui/theme";
import { brandFor } from "@/src/game/data/brands";
import type { FurnitureMeta } from "@/src/game/core/type";

const DIFFICULTY: Record<1 | 2 | 3, string> = { 1: "Easy", 2: "Medium", 3: "Hard" };


export default function CatalogueScreen() {
  const styles = useStyles(makeStyles);
  const router = useRouter();
  const scheme = useColorScheme();
  // Only furniture with a real 3D model — engine-only entries stay hidden.
  const items = FURNITURE_METAS.filter((m) => !m.engineOnly);

  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Choose a build</Text>
        <Text style={styles.subtitle}>{items.length} furniture available</Text>
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
  // `dark` survives here for the ARTWORK, not the styling: each meta ships a light and a
  // dark thumbnail, and that choice can't come from a colour token.
  const thumb = (dark ? meta.thumbnail.dark : meta.thumbnail.light) ?? meta.thumbnail.light;
  return (
    <Pressable
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
      onPress={onPress}
    >
      <View style={styles.thumbWrap}>
        <Image source={thumb} style={styles.thumb} resizeMode="contain" />
      </View>
      <Text style={styles.name}>{meta.name}</Text>
      <Text style={styles.brand}>
        {brandFor(meta.brand).name} · {meta.category}
      </Text>
      <View style={styles.metaRow}>
        <Text style={styles.metaText}>{DIFFICULTY[meta.difficulty]}</Text>
        <Text style={styles.metaDot}>·</Text>
        <Text style={styles.metaText}>{meta.partCount} parts</Text>
        <Text style={styles.metaDot}>·</Text>
        <Text style={styles.metaText}>~{meta.duration} min</Text>
      </View>
    </Pressable>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
  root: { flex: 1, backgroundColor: t.bg },
  content: { padding: SPACE.xl, paddingTop: 56 },
  title: { fontSize: 28, fontWeight: "800", color: t.text },
  subtitle: {
    ...TYPE.body,
    color: t.textDim,
    marginTop: SPACE.xs,
    marginBottom: SPACE.xl,
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
  brand: { ...TYPE.labelSm, fontWeight: "500", color: t.textDim, marginTop: 2 },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: SPACE.sm,
    flexWrap: "wrap",
  },
  metaText: { ...TYPE.labelSm, color: t.textDim },
  metaDot: { color: t.textFaint, fontSize: 12, marginHorizontal: 6 },
  });