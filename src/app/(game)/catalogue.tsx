// catalogue for assembly task

import { useRouter } from "expo-router";
import {
  Image,
  Pressable,
  ScrollView,
  Text,
  useColorScheme,
  View,
} from "react-native";

// type
import type { FurnitureMeta } from "@/src/game/core/type";
import { type Milestone } from "@/src/game/ui/loadingProgress";

// data
import { FURNITURE_METAS } from "@/src/game/content/furnitures/furnitures";
import { useRepos } from "@/src/data";
import { useCatalogRow, useCatalogStore } from "@/src/data/catalogStore";
import { brandFor } from "@/src/game/content/brands";

// styling
import { makeStyles } from "./catalogue.styles";
import { useStyles } from "@/src/game/ui/theme";
import { Button } from "@/src/game/ui/Button";
import { LoadingScreen } from "@/src/game/ui/LoadingScreen";

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
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Button label="‹ Room" onPress={() => router.back()} />
          <View>
            <Text style={styles.title}>Choose a build</Text>
            <Text style={styles.subtitle}>
              {items.length} furniture available
            </Text>
          </View>
        </View>
        <View style={styles.grid}>
          {items.map((m) => (
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
