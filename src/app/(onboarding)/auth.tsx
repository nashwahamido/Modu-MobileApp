// eslint-disable-next-line @typescript-eslint/no-unused-vars -- restored with the buttons below
import { Link } from "expo-router";
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- restored with the buttons below
import type { Href } from "expo-router";
// `Image` and `Text` are unused while the brand block is commented out — both come back with it.
import { StyleSheet, Image, Text, View } from "react-native";

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- restored with the buttons below
import { Button } from "@/src/game/ui/system/Button";
import { AccountPicker } from "@/src/dev/AccountPicker";
import { FONT, SPACE, useStyles } from "@/src/game/ui/system/theme";
import { SCREEN_SIDE_MARGIN, SCREEN_VERTICAL_MARGIN, useSafeInsets } from "@/src/hooks/use-safe-insets";
import type { Theme } from "@/src/game/ui/system/theme";


// ─────────────────────────────────────────────────────────────────────────────
// REBUILD IN PROGRESS. The mascot, the wordmark, the "Everyone Can Build!" line and the Create
// account / Log in buttons are COMMENTED OUT, not deleted, while this screen is redesigned — the markup, the styles
// and the imports they need are all still here, so restoring any piece is uncommenting it.
//
// NOTE: with both buttons out there is no route past this screen for a normal player. The dev
// AccountPicker still signs in on a dev build, so the app stays reachable meanwhile.
// ─────────────────────────────────────────────────────────────────────────────

/** Flat, not a ramp. The brand art decides it: the mascot is white and the wordmark is dark taupe,
 *  so a cream backdrop would swallow the mascot whole (1.01:1) while the blue keeps both readable
 *  and lets the cream buttons carry the contrast instead. */
const BG_SOLID = "#A9BFD9";
const SLOGAN_INK = "#595551";

// const mascot = require("../../assets/images/mascot/mascot.png");
// const wordmark = require("../../assets/ui/brand/logo-modu.png");
// const createAccountRoute = "/create-account" as Href;
// const loginRoute = "/create-account?mode=login" as Href;

export default function AuthScreen() {
  const styles = useStyles(makeStyles);
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
            {/* <Image source={mascot} style={styles.mascot} /> */}
            {/* <Image source={wordmark} style={styles.wordmark} resizeMode="contain" /> */}
          </View>
          {/* <Text style={styles.slogan}>Everyone Can Build!</Text> */}
        </View>
        <View style={styles.actions}>
          {/*
          <Link href={createAccountRoute} asChild>
            <Button label="Create account" variant="primary" pill />
          </Link>
          <Link href={loginRoute} asChild>
            <Button label="Log in" pill />
          </Link>
          */}
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
      backgroundColor: BG_SOLID,
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
      alignItems: "center",
    },
    header: {
      flexDirection: "row",
      alignItems: "center",
      // No alignSelf: stretch. The row hugs its contents as it always did; minWidth 0 is all that is
      // needed to let the wordmark give way when the column is too tight for it.
      minWidth: 0,
      gap: 18,
    },
    mascot: {
      width: 82,
      height: 82,
      borderRadius: 20,
      // The mascot holds its size; the wordmark is the one that gives way.
      flexShrink: 0,
    },
    // Height derived from the art's 4.51 aspect, so the wordmark can never be stretched.
    // flexShrink, not a fixed width. The brand row is mascot 82 + gap 18 + this, and the column it
    // sits in is only what is left after the 300pt action stack — about 332pt on a phone. At a rigid
    // 230 the row totals 330 with nothing to give, so the images were squeezed to nothing rather
    // than the wordmark simply coming in a little narrower. maxWidth keeps it from growing past its
    // drawn size on a screen that has room.
    wordmark: {
      // flexShrink alone. width:"100%" made the mark claim the whole column and the row read as
      // stretched on a phone — shrinking is about what it gives up when space is short, not about
      // what it takes when space is free.
      flexShrink: 1,
      width: 230,
      // The art is 600x133, and aspectRatio keeps the height following whatever width survives the
      // shrink — a fixed height here would letterbox it the moment the width gave way.
      aspectRatio: 600 / 133,
    },
    // One line under the wordmark, so the brand block reads as logo + promise and nothing else. Fixed ink, not t.text: the backdrop is a fixed blue, so a theme-driven colour would turn this bone in dark mode and land at 1.78:1 on it.
    slogan: {
      color: SLOGAN_INK,
      fontFamily: FONT,
      fontSize: 30,
      fontWeight: "900",
      letterSpacing: 0.2,
      textAlign: "center",
    },
    actions: {
      width: 300,
      gap: SPACE.md,
    },
  });