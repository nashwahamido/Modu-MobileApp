import { Link } from "expo-router";
import type { Href } from "expo-router";
import { StyleSheet, Image, Text, View } from "react-native";

import { Button } from "@/src/game/ui/Button";
import { AccountPicker } from "@/src/dev/AccountPicker";
import { SPACE, TYPE, useStyles, FONT } from "@/src/game/ui/theme";
import { useSafeInsets } from "@/src/hooks/use-safe-insets";
import type { Theme } from "@/src/game/ui/theme";

import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";

/** This screen's backdrop. Deliberately its own pair rather than a shared token: each screen can
 *  be retuned without touching the others. Keep root.backgroundColor equal to BG_FROM — that is
 *  what shows for the frame before the SVG paints. */
const BG_FROM = "#8D7BA8";
const BG_TO = "#A9BFD9";

const mascot = require("../../assets/images/mascot/mascot.png");
const createAccountRoute = "/create-account" as Href;
const loginRoute = "/create-account?mode=login" as Href;

export default function AuthScreen() {
  const styles = useStyles(makeStyles);
  const safe = useSafeInsets();
  return (
    <View style={[styles.root, { paddingLeft: safe.left, paddingRight: safe.right }]}>
      {/* Diagonal, so neither end of the ramp sits flat behind a whole column of content. */}
      <Svg style={StyleSheet.absoluteFill} pointerEvents="none">
        <Defs>
          <LinearGradient id="authBg" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={BG_FROM} />
            <Stop offset="1" stopColor={BG_TO} />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#authBg)" />
      </Svg>
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
      backgroundColor: BG_FROM,
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
      fontFamily: FONT, fontSize: 44,
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