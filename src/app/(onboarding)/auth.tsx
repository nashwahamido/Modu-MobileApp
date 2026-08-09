import { Link } from "expo-router";
import type { Href } from "expo-router";
import { StyleSheet, Image, Text, View } from "react-native";

import { Button } from "@/src/game/ui/system/Button";
import { AccountPicker } from "@/src/dev/AccountPicker";
import { FONT, SPACE, useStyles, useUiScale } from "@/src/game/ui/system/theme";
import { SCREEN_SIDE_MARGIN, SCREEN_VERTICAL_MARGIN, useSafeInsets } from "@/src/hooks/use-safe-insets";
import type { Theme } from "@/src/game/ui/system/theme";


/** Flat, not a ramp. The brand art decides it: the mascot is white and the wordmark is dark taupe,
 *  so a cream backdrop would swallow the mascot whole (1.01:1) while the blue keeps both readable
 *  and lets the cream buttons carry the contrast instead. */
const BG_SOLID = "#A9BFD9";
const SLOGAN_INK = "#595551";

const mascot = require("../../assets/images/mascot/mascot.png");
const wordmark = require("../../assets/ui/brand/logo-modu.png");
const createAccountRoute = "/create-account" as Href;
const loginRoute = "/create-account?mode=login" as Href;

export default function AuthScreen() {
  const scale = useUiScale();
  const styles = useStyles(makeStyles, scale);
  const safe = useSafeInsets();
  return (
    <View
      style={[
        styles.root,
        {
          // ADD to the layout's own padding, never replace it. `paddingLeft` overrides the sheet's `paddingHorizontal` outright, so passing the bare inset here silently cut the screen's 42pt gutter down to the 14pt floor.
          paddingLeft: 42 + Math.max(safe.raw.left, SCREEN_SIDE_MARGIN),
          paddingRight: 42 + Math.max(safe.raw.right, SCREEN_SIDE_MARGIN),
          paddingTop: 22 + Math.max(safe.raw.top, SCREEN_VERTICAL_MARGIN),
          paddingBottom: 22 + Math.max(safe.raw.bottom, SCREEN_VERTICAL_MARGIN),
        },
      ]}
    >
      <View style={styles.content}>
        <View style={styles.intro}>
          <View style={styles.header}>
            <Image source={mascot} style={styles.mascot} />
            <Image source={wordmark} style={styles.wordmark} resizeMode="contain" />
          </View>
          <Text style={styles.slogan}>Everyone Can Build!</Text>
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

// k is the device UI scale (see useUiScale): these layouts are authored in phone points,
// and a tablet needs the same proportions at a larger size, not the same numbers.
const makeStyles = (t: Theme, k: number) =>
  StyleSheet.create({
    root: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: BG_SOLID,
    },
    content: {
      width: "100%",
      maxWidth: Math.round(980 * k),
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: Math.round(36 * k),
    },
    intro: {
      flex: 1,
      maxWidth: Math.round(560 * k),
      gap: Math.round(18 * k),
      alignItems: "center",
    },
    header: {
      flexDirection: "row",
      alignItems: "center",
      gap: Math.round(18 * k),
    },
    mascot: {
      width: Math.round(82 * k),
      height: Math.round(82 * k),
      borderRadius: Math.round(20 * k),
    },
    // Height derived from the art's 4.51 aspect, so the wordmark can never be stretched.
    wordmark: { width: Math.round(230 * k), height: Math.round(230 * k) / 4.51 },
    // One line under the wordmark, so the brand block reads as logo + promise and nothing else. Fixed ink, not t.text: the backdrop is a fixed blue, so a theme-driven colour would turn this bone in dark mode and land at 1.78:1 on it.
    slogan: {
      color: SLOGAN_INK,
      fontFamily: FONT,
      fontSize: Math.round(30 * k),
      fontWeight: "900",
      letterSpacing: 0.2,
      textAlign: "center",
    },
    actions: {
      width: Math.round(300 * k),
      gap: SPACE.md,
    },
  });