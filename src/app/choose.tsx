// "Choose your experience" — a fork in the road before building.
//
// Reached from the catalogue when a furniture item has more than one workflow
// available (currently only LACK: Standard vs Focus Mode). Other items skip
// this screen and go straight to /play.
//
// NOTE: this is deliberately a simple two-option chooser. It's the seam where
// later we'll swap in per-user personalization to pick a workflow automatically.
import { useLocalSearchParams, useRouter } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";

export default function ChooseExperience() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  return (
    <View style={styles.root}>
      <Text style={styles.title}>Choose your experience</Text>
      <Text style={styles.sub}>Two ways to build this one.</Text>

      <View style={styles.options}>
        <Pressable
          style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
          onPress={() => router.replace({ pathname: "/play", params: { id } })}
        >
          <Text style={styles.cardTitle}>Standard</Text>
          <Text style={styles.cardDesc}>
            The classic step-by-step build.
          </Text>
        </Pressable>

        <Pressable
          style={({ pressed }) => [
            styles.card,
            styles.cardAccent,
            pressed && styles.cardPressed,
          ]}
          onPress={() => router.replace("/play-adhd")}
        >
          <Text style={styles.cardTitle}>Focus Mode</Text>
          <Text style={styles.cardDesc}>
            A calmer, ADHD-friendly flow with richer visuals and lighting.
          </Text>
        </Pressable>
      </View>

      <Pressable onPress={() => router.back()} style={styles.back} hitSlop={12}>
        <Text style={styles.backText}>← Back</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#16162a",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  title: { color: "white", fontSize: 26, fontWeight: "700" },
  sub: { color: "rgba(255,255,255,0.5)", fontSize: 14, marginTop: 8 },
  options: {
    flexDirection: "row",
    gap: 16,
    marginTop: 32,
    flexWrap: "wrap",
    justifyContent: "center",
  },
  card: {
    width: 260,
    backgroundColor: "#20203a",
    borderRadius: 18,
    padding: 20,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  cardAccent: {
    backgroundColor: "#2a2550",
    borderColor: "#5b6cff",
  },
  cardPressed: { opacity: 0.8 },
  cardTitle: { color: "white", fontSize: 18, fontWeight: "700" },
  cardDesc: {
    color: "rgba(255,255,255,0.6)",
    fontSize: 13,
    marginTop: 8,
    lineHeight: 18,
  },
  back: { marginTop: 32 },
  backText: { color: "rgba(255,255,255,0.5)", fontSize: 15 },
});
