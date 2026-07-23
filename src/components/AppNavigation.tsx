import { router } from "expo-router";
import type { Href } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export type AppNavigationTab = "home" | "tasks" | "room" | "settings";

const TABS: {
  id: AppNavigationTab;
  label: string;
  icon: string;
  route: Href;
}[] = [
  { id: "home", label: "Home", icon: "⌂", route: "/home" as Href },
  { id: "tasks", label: "Tasks", icon: "☷", route: "/catalogue" as Href },
  { id: "room", label: "Room", icon: "▣", route: "/room" as Href },
  { id: "settings", label: "Settings", icon: "⚙", route: "/settings" as Href },
];

export function AppNavigation({ active }: { active: AppNavigationTab }) {
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[
        styles.shell,
        {
          bottom: Math.max(insets.bottom, 8),
          paddingLeft: Math.max(insets.left, 8),
          paddingRight: Math.max(insets.right, 8),
        },
      ]}
      pointerEvents="box-none"
    >
      <View style={styles.bar}>
        {TABS.map((tab) => {
          const selected = tab.id === active;
          return (
            <Pressable
              key={tab.id}
              accessibilityLabel={tab.label}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              onPress={() => {
                if (selected) return;
                router.replace(tab.route);
              }}
              style={({ pressed }) => [
                styles.tab,
                selected && styles.tabSelected,
                pressed && styles.tabPressed,
              ]}
            >
              <Text style={[styles.icon, selected && styles.iconSelected]}>{tab.icon}</Text>
              <Text style={[styles.label, selected && styles.labelSelected]}>{tab.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    position: "absolute",
    left: 0,
    right: 0,
    zIndex: 100,
    alignItems: "center",
  },
  bar: {
    width: "100%",
    maxWidth: 520,
    height: 58,
    flexDirection: "row",
    alignItems: "stretch",
    borderWidth: 1,
    borderColor: "rgba(102,95,85,0.18)",
    borderRadius: 20,
    backgroundColor: "rgba(251,248,243,0.97)",
    padding: 5,
    shadowColor: "#231F20",
    shadowOpacity: 0.14,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
  },
  tab: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 15,
    gap: 1,
  },
  tabSelected: { backgroundColor: "#8FA876" },
  tabPressed: { opacity: 0.72 },
  icon: { color: "#80766c", fontSize: 18, fontWeight: "900", lineHeight: 20 },
  iconSelected: { color: "#FBF8F3" },
  label: { color: "#665f55", fontSize: 10, fontWeight: "800" },
  labelSelected: { color: "#FBF8F3" },
});
