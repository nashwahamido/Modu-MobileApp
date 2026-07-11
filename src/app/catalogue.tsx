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
import { brandFor } from "@/src/game/data/brands";
import type { FurnitureMeta } from "@/src/game/core/type";

const DIFFICULTY: Record<1 | 2 | 3, string> = { 1: "Easy", 2: "Medium", 3: "Hard" };

export default function CatalogueScreen() {
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

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#16162a" },
  content: { padding: 20, paddingTop: 64 },
  title: { color: "white", fontSize: 26, fontWeight: "700" },
  subtitle: { color: "rgba(255,255,255,0.5)", fontSize: 14, marginTop: 4, marginBottom: 20 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 14 },
  card: {
    flexBasis: "47%",
    flexGrow: 1,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  cardPressed: { backgroundColor: "rgba(255,255,255,0.12)" },
  thumbWrap: {
    height: 120,
    borderRadius: 12,
    backgroundColor: "rgba(0,0,0,0.2)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  thumb: { width: "80%", height: "80%" },
  name: { color: "white", fontSize: 17, fontWeight: "700" },
  brand: { color: "rgba(255,255,255,0.55)", fontSize: 12, marginTop: 2 },
  metaRow: { flexDirection: "row", alignItems: "center", marginTop: 8, flexWrap: "wrap" },
  metaText: { color: "rgba(255,255,255,0.75)", fontSize: 12, fontWeight: "600" },
  metaDot: { color: "rgba(255,255,255,0.35)", fontSize: 12, marginHorizontal: 6 },
});
