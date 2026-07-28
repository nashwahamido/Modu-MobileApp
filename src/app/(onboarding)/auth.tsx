import { Link } from "expo-router";
import type { Href } from "expo-router";
import { StyleSheet, Image, Text, View } from "react-native";

import { Button } from "@/src/game/ui/Button";
import { AccountPicker } from "@/src/dev/AccountPicker";
import { SPACE, TYPE, useStyles } from "@/src/game/ui/theme";
import type { Theme } from "@/src/game/ui/theme";

const mascot = require("../../assets/images/mascot/mascot.png");
const createAccountRoute = "/create-account" as Href;
const loginRoute = "/create-account?mode=login" as Href;

export default function AuthScreen() {
  const styles = useStyles(makeStyles);
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
            <Button label="Create account" variant="primary" pill />
          </Link>
          <Link href={loginRoute} asChild>
            <Button label="Log in" pill />
          </Link>
          {/* Renders nothing unless a dev or showcase roster is live in this build. */}
          <AccountPicker />
        </View>
      </View>
    </View>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    root: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: t.bg,
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
      color: t.gold,
      fontSize: 44,
      fontWeight: "800",
      letterSpacing: 8,
    },
    copyBlock: {
      gap: SPACE.sm,
    },
    title: {
      ...TYPE.title,
      color: t.text,
      fontSize: 31,
      lineHeight: 36,
    },
    subtitle: {
      ...TYPE.body,
      color: t.textDim,
      fontSize: 16,
      fontWeight: "600",
      lineHeight: 22,
    },
    actions: {
      width: 300,
      gap: SPACE.md,
    },
  });
