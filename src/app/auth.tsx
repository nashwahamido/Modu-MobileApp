import { Link } from "expo-router";
import type { Href } from "expo-router";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";

const mascot = require("../assets/mascot/mascot.png");
const createAccountRoute = "/create-account" as Href;
const loginRoute = "/create-account?mode=login" as Href;

export default function AuthScreen() {
  return (
    <View style={styles.root}>
      <View style={styles.content}>
        <View style={styles.intro}>
          <View style={styles.header}>
            <Image source={mascot} style={styles.mascot} />
            <Text style={styles.brand}>MODU</Text>
          </View>
          <View style={styles.copyBlock}>
            <Text style={styles.title}>Start your assembly journey.</Text>
            <Text style={styles.subtitle}>
              Create an account to get your personalized guiding avatar!
            </Text>
          </View>
        </View>
        <View style={styles.actions}>
          <Link href={createAccountRoute} asChild>
            <Pressable style={styles.primaryButton}>
              <Text style={styles.primaryButtonText}>Create account</Text>
            </Pressable>
          </Link>
          <Link href={loginRoute} asChild>
            <Pressable style={styles.secondaryButton}>
              <Text style={styles.secondaryButtonText}>Log in</Text>
            </Pressable>
          </Link>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fffaf0",
    paddingHorizontal: 42,
    paddingVertical: 22,
  },
  content: {
    width: "100%",
    maxWidth: 980,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 36,
  },
  intro: {
    flex: 1,
    maxWidth: 560,
    gap: 18,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 18,
  },
  mascot: {
    width: 82,
    height: 82,
    borderRadius: 20,
  },
  brand: {
    color: "#b9a486",
    fontSize: 44,
    fontWeight: "800",
    letterSpacing: 8,
  },
  copyBlock: {
    gap: 8,
  },
  title: {
    color: "#26231f",
    fontSize: 31,
    fontWeight: "800",
    lineHeight: 36,
  },
  subtitle: {
    color: "#746a5d",
    fontSize: 16,
    fontWeight: "600",
    lineHeight: 22,
  },
  actions: {
    width: 300,
    gap: 12,
  },
  primaryButton: {
    alignItems: "center",
    backgroundColor: "#2d2a26",
    borderRadius: 28,
    paddingVertical: 14,
  },
  primaryButtonText: {
    color: "#fff9ef",
    fontSize: 17,
    fontWeight: "800",
  },
  secondaryButton: {
    alignItems: "center",
    borderColor: "#d9cdbc",
    borderRadius: 28,
    borderWidth: 2,
    paddingVertical: 12,
  },
  secondaryButtonText: {
    color: "#2d2a26",
    fontSize: 17,
    fontWeight: "800",
  },
});
