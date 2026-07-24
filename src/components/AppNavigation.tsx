// The hub's bottom bar. Rendered as the custom `tabBar` of app/(tabs)/_layout, so the active tab and navigation come from the navigator — not a hand-passed `active` prop. Settings/Profile are modal layers, not tabs, so they never appear here.
import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ELEVATION, RADIUS, Theme, useStyles } from "@/src/game/ui/theme";

// Route name (a file in app/(tabs)) -> how it shows in the bar. A route with no entry here is skipped.
const TAB_META: Record<string, { label: string; icon: string }> = {
  catalogue: { label: "Tasks", icon: "☷" },
  room: { label: "Room", icon: "▣" },
};

export function AppNavigation({ state, navigation }: BottomTabBarProps) {
  const styles = useStyles(makeStyles);
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
        {state.routes.map((route, index) => {
          const meta = TAB_META[route.name];
          if (!meta) return null;
          const selected = state.index === index;
          const onPress = () => {
            const event = navigation.emit({ type: "tabPress", target: route.key, canPreventDefault: true });
            if (!selected && !event.defaultPrevented) navigation.navigate(route.name as never);
          };
          return (
            <Pressable
              key={route.key}
              accessibilityRole="button"
              accessibilityLabel={meta.label}
              accessibilityState={{ selected }}
              onPress={onPress}
              style={({ pressed }) => [styles.tab, selected && styles.tabSelected, pressed && styles.tabPressed]}
            >
              <Text style={[styles.icon, selected && styles.iconSelected]}>{meta.icon}</Text>
              <Text style={[styles.label, selected && styles.labelSelected]}>{meta.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
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
      borderColor: t.border,
      borderRadius: RADIUS.panel,
      backgroundColor: t.surface,
      padding: 5,
      ...ELEVATION.card,
    },
    tab: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: 15,
      gap: 1,
    },
    tabSelected: { backgroundColor: t.accent },
    tabPressed: { opacity: 0.72 },
    icon: { color: t.textDim, fontSize: 18, fontWeight: "900", lineHeight: 20 },
    iconSelected: { color: t.onAccent },
    label: { color: t.textDim, fontSize: 10, fontWeight: "800" },
    labelSelected: { color: t.onAccent },
  });
