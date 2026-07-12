// This is the homepage of modu

import { Link } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Pressable, StyleSheet, Text, View } from 'react-native';

export default function App() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Modu</Text>
      <Text style={styles.sub}>Build furniture, step by step</Text>
      <View style={styles.actions}>
        <Link href="/auth" asChild>
          <Pressable
            style={({ pressed }) => [
              styles.button,
              pressed && styles.buttonPressed,
            ]}
          >
            <Text style={styles.buttonText}>Get started</Text>
          </Pressable>
        </Link>
        <Link href="/catalogue" asChild>
          <Pressable
            style={({ pressed }) => [
              styles.settingsLink,
              pressed && styles.settingsLinkPressed,
            ]}
          >
            <Text style={styles.settingsLinkText}>Browse catalogue</Text>
          </Pressable>
        </Link>
        <Link href="/settings" asChild>
          <Pressable
            style={({ pressed }) => [
              styles.settingsLink,
              pressed && styles.settingsLinkPressed,
            ]}
          >
            <Text style={styles.settingsLinkText}>Settings</Text>
          </Pressable>
        </Link>
      </View>
      {__DEV__ && (
        <View style={styles.devRow}>
          <Link href="/engine-test" asChild>
            <Pressable style={styles.devLink}>
              <Text style={styles.devLinkText}>engine test (dev)</Text>
            </Pressable>
          </Link>
          {/* REFERENCE ONLY — Nashwa's original engine, untouched. Delete this link together with src/adhd + play-adhd.tsx (merge plan Phase 7). */}
          <Link href="/play-adhd" asChild>
            <Pressable style={styles.devLink}>
              <Text style={styles.devLinkText}>adhd original (ref)</Text>
            </Pressable>
          </Link>
        </View>
      )}
      <StatusBar style="light" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#16162a",
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    color: "white",
    fontSize: 28,
    fontWeight: "600",
  },
  sub: {
    color: "rgba(255,255,255,0.5)",
    fontSize: 14,
    marginTop: 8,
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 24,
    marginTop: 36,
  },
  button: {
    backgroundColor: "#5b6cff",
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 28,
  },
  buttonPressed: {
    backgroundColor: "#4a59d9",
  },
  buttonText: {
    color: "white",
    fontSize: 16,
    fontWeight: "700",
  },
  settingsLink: {
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.25)",
  },
  settingsLinkPressed: { backgroundColor: "rgba(255,255,255,0.08)" },
  settingsLinkText: {
    color: "rgba(255,255,255,0.85)",
    fontSize: 15,
    fontWeight: "600",
  },
  devRow: {
    marginTop: 28,
    flexDirection: "row",
    gap: 16,
  },
  devLink: {
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  devLinkText: {
    color: "rgba(255,255,255,0.35)",
    fontSize: 12,
    textDecorationLine: "underline",
  },
});