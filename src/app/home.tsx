import { router } from "expo-router";
import type { Href } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AppNavigation } from "@/src/components/AppNavigation";
import { useGameStore } from "@/src/game/core/store";

const actions: {
  title: string;
  description: string;
  action: string;
  route: Href;
  resume?: boolean;
}[] = [
  {
    title: "Choose your next task",
    description: "Browse available furniture and start a guided build.",
    action: "View tasks",
    route: "/catalogue" as Href,
  },
  {
    title: "Continue building",
    description: "Return to the current assembly workspace.",
    action: "Open build",
    route: "/play" as Href,
    resume: true,
  },
  {
    title: "Visit your room",
    description: "Place completed furniture and arrange your space.",
    action: "Open room",
    route: "/room" as Href,
  },
];

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const currentFurnitureId = useGameStore((state) => state.furniture?.meta.id);

  return (
    <View
      style={[
        styles.root,
        {
          paddingTop: Math.max(insets.top, 18),
          paddingLeft: Math.max(insets.left, 28),
          paddingRight: Math.max(insets.right, 28),
        },
      ]}
    >
      <View style={styles.header}>
        <View>
          <Text style={styles.eyebrow}>MODU</Text>
          <Text style={styles.title}>What would you like to do?</Text>
          <Text style={styles.subtitle}>Pick up where you left off or start something new.</Text>
        </View>
        <Pressable onPress={() => router.push("/settings" as Href)} style={styles.settingsShortcut}>
          <Text style={styles.settingsShortcutText}>Settings</Text>
        </Pressable>
      </View>

      <View style={styles.cards}>
        {actions.map((item, index) => (
          <Pressable
            key={item.title}
            onPress={() => {
              if (item.resume && currentFurnitureId) {
                router.replace({ pathname: "/play", params: { id: currentFurnitureId } });
                return;
              }
              router.replace(item.route);
            }}
            style={({ pressed }) => [
              styles.card,
              index === 0 && styles.primaryCard,
              pressed && styles.cardPressed,
            ]}
          >
            <Text style={[styles.cardIndex, index === 0 && styles.primaryCardText]}>0{index + 1}</Text>
            <Text style={[styles.cardTitle, index === 0 && styles.primaryCardText]}>{item.title}</Text>
            <Text style={[styles.cardDescription, index === 0 && styles.primaryCardDescription]}>
              {item.description}
            </Text>
            <Text style={[styles.cardAction, index === 0 && styles.primaryCardText]}>{item.action} →</Text>
          </Pressable>
        ))}
      </View>

      <AppNavigation active="home" />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#F3ECE0",
    paddingBottom: 82,
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
  },
  eyebrow: { color: "#8FA876", fontSize: 13, fontWeight: "900", letterSpacing: 2 },
  title: { marginTop: 5, color: "#231F20", fontSize: 30, fontWeight: "900" },
  subtitle: { marginTop: 5, color: "#665f55", fontSize: 14, fontWeight: "600" },
  settingsShortcut: {
    borderRadius: 16,
    backgroundColor: "#FBF8F3",
    paddingHorizontal: 18,
    paddingVertical: 11,
    borderWidth: 1,
    borderColor: "#d8cdbb",
  },
  settingsShortcutText: { color: "#665f55", fontSize: 13, fontWeight: "800" },
  cards: { flex: 1, flexDirection: "row", alignItems: "stretch", gap: 16, marginTop: 22 },
  card: {
    flex: 1,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "#d8cdbb",
    backgroundColor: "#FBF8F3",
    padding: 20,
  },
  primaryCard: { backgroundColor: "#8FA876", borderColor: "#8FA876" },
  cardPressed: { opacity: 0.78 },
  cardIndex: { color: "#A97480", fontSize: 12, fontWeight: "900", letterSpacing: 1 },
  cardTitle: { marginTop: 18, color: "#231F20", fontSize: 21, fontWeight: "900" },
  cardDescription: { marginTop: 8, color: "#665f55", fontSize: 13, fontWeight: "600", lineHeight: 19 },
  cardAction: { marginTop: "auto", color: "#6f8a68", fontSize: 14, fontWeight: "900" },
  primaryCardText: { color: "#FBF8F3" },
  primaryCardDescription: { color: "rgba(251,248,243,0.82)" },
});
