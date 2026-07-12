import { Link } from "expo-router";
import type { Href } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";

const authRoute = "/auth" as Href;

export default function Home() {
  return (
    <View style={styles.root}>
      <View style={styles.logoLockup}>
        <Text style={[styles.doodle, styles.greenDoodle]}>:)</Text>
        <Text style={styles.logo}>MODU</Text>
        <Text style={[styles.doodle, styles.blueDoodle]}>o</Text>
        <Text style={[styles.doodle, styles.pinkDoodle]}>+</Text>
      </View>
      <Text style={styles.subtitle}>Turning every piece into progress.</Text>
      <Link href={authRoute} asChild>
        <Pressable style={styles.primaryButton}>
          <Text style={styles.primaryButtonText}>Get started</Text>
        </Pressable>
      </Link>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f2eadb",
    paddingHorizontal: 28,
    gap: 22,
  },
  logoLockup: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: 120,
    width: "100%",
  },
  logo: {
    color: "#b9a486",
    fontSize: 76,
    fontWeight: "800",
    letterSpacing: 10,
  },
  doodle: {
    position: "absolute",
    fontSize: 26,
    fontWeight: "800",
  },
  greenDoodle: {
    left: "16%",
    top: 16,
    color: "#23856f",
    transform: [{ rotate: "-10deg" }],
  },
  blueDoodle: {
    right: "30%",
    top: 4,
    color: "#98b8ef",
    transform: [{ rotate: "16deg" }],
  },
  pinkDoodle: {
    left: "46%",
    bottom: 6,
    color: "#df9588",
    transform: [{ rotate: "8deg" }],
  },
  subtitle: {
    color: "#5f564b",
    fontSize: 17,
    fontWeight: "600",
    textAlign: "center",
  },
  primaryButton: {
    minWidth: 190,
    alignItems: "center",
    backgroundColor: "#2d2a26",
    borderRadius: 28,
    paddingHorizontal: 28,
    paddingVertical: 14,
  },
  primaryButtonText: {
    color: "#fff9ef",
    fontSize: 17,
    fontWeight: "800",
  },
});
