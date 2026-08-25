// eslint-disable-next-line @typescript-eslint/no-unused-vars -- restored with the buttons below
import { Link, router } from "expo-router";
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- restored with the buttons below
import type { Href } from "expo-router";
// `Image` and `Text` are unused while the brand block is commented out — both come back with it,
// so they are kept imported and silenced rather than removed and re-added during the rebuild.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { Pressable, StyleSheet, Image, Text, View } from "react-native";

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- restored with the buttons below
import { Button } from "@/src/game/ui/system/Button";
import { AccountPicker } from "@/src/dev/AccountPicker";
import { FONT, SPACE, useStyles } from "@/src/game/ui/system/theme";
import { SCREEN_SIDE_MARGIN, SCREEN_VERTICAL_MARGIN, useSafeInsets } from "@/src/hooks/use-safe-insets";
import type { Theme } from "@/src/game/ui/system/theme";
import { SceneBackdrop } from "@/src/game/ui/backdrop/SceneBackdrop";


// ─────────────────────────────────────────────────────────────────────────────
// REBUILD IN PROGRESS. The mascot, the wordmark, the "Everyone Can Build!" line and the Create
// account / Log in buttons are COMMENTED OUT, not deleted, while this screen is redesigned — the markup, the styles
// and the imports they need are all still here, so restoring any piece is uncommenting it.
//
// NOTE: with both buttons out there is no route past this screen for a normal player. The dev
// AccountPicker still signs in on a dev build, so the app stays reachable meanwhile.
// ─────────────────────────────────────────────────────────────────────────────

/** The same art as the profile and avatar-recommendation screens: this is where the four characters
 *  are chosen, so it belongs with the other two "who you are" moments rather than on a field of its own. */
const backdrop = require("@/src/assets/ui/profile-backdrop.jpg");

/** What shows for the frame before the artwork decodes, and behind it if the asset ever fails to load.
 *
 *  It replaces a flat #A9BFD9 that was chosen for brand art which is currently COMMENTED OUT above —
 *  the blue was there to stop a white mascot vanishing into cream. If that block is restored and the
 *  mascot reads faint against this art, that is the reason, and the fix is the art rather than the fallback. */
const BG_SOLID = "#E9E6DF";
const SLOGAN_INK = "#595551";

/** THE ONBOARDING ARROW, the same PNG the questionnaire's own nav uses, at the same 26pt. There is a
 *  second back glyph in the app — the `BackIcon` SVG in components/Icons — but that one belongs to
 *  the room and visit HUDs, where it sits on a cream chip among other chips. This screen is part of
 *  the onboarding run, so it takes onboarding's arrow, and a player moving between these screens
 *  sees one mark rather than two.
 *
 *  Bare, with no disc behind it, for the same reason: the questionnaire's arrows are bare, and the
 *  54x42 hit area is the questionnaire's too. */
const BACK_ARROW = require("@/src/assets/ui/icons/arrow-back.png");

// const mascot = require("../../assets/images/mascot/mascot.png");
// const wordmark = require("../../assets/ui/brand/logo-modu.png");
// const createAccountRoute = "/create-account" as Href;
// const loginRoute = "/create-account?mode=login" as Href;

export default function AuthScreen() {
  const styles = useStyles(makeStyles);
  const safe = useSafeInsets();

  // BACK TO THE LANDING PAGE, and specifically to the one already under this screen rather than a
  // fresh copy of it. `dismissTo` unwinds the stack to "/" if it is there — which it is whenever the
  // player arrived by tapping Choose Account or Home — so the landing animation does not replay and
  // the stack does not grow a "/" → /auth → "/" chain that Android's own back button would then walk
  // through one screen at a time.
  //
  // The fallback matters because this screen is ALSO where the session gate bounces an unauthorised
  // deep link, and in that case there is no landing page underneath to return to. `replace` puts one
  // there instead of leaving Back dead.
  const onBack = () => {
    if (router.canDismiss()) router.dismissTo("/");
    else router.replace("/");
  };
  return (
    // The artwork is the screen ROOT, through SceneBackdrop (an ImageBackground) — a bare
    // <Image absoluteFill> scales the same file differently and renders it zoomed.
    <SceneBackdrop
      source={backdrop}
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
      {/* OUTSIDE `content`, which is centred and would carry this into the middle of the screen with
          the cards. Positioned against the root's own padding so it sits in the top-left gutter the
          screen already reserves, clear of the picker at every width. */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Back to the start screen"
        hitSlop={10}
        onPress={onBack}
        style={({ pressed }) => [
          styles.back,
          {
            top: 22 + Math.max(safe.raw.top, SCREEN_VERTICAL_MARGIN),
            // HARD AGAINST THE SCREEN'S OWN GUTTER. It used to carry an extra 42pt inboard, which
            // put it level with the content column and reading as part of it rather than as chrome.
            // A back control belongs in the corner.
            //
            // No extra inset beyond the safe-area floor: the 54pt box centres a 26pt arrow, so there
            // is already 14pt of slack inside it — the glyph lands about 28pt from the edge while
            // the tap target itself stays clear of a landscape cutout.
            left: Math.max(safe.raw.left, SCREEN_SIDE_MARGIN),
          },
          pressed && styles.backPressed,
        ]}
      >
        <Image source={BACK_ARROW} style={styles.backArrow} resizeMode="contain" />
      </Pressable>

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
    </SceneBackdrop>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    root: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: BG_SOLID,
      // The content is vertically centred, so extra padding at the FOOT lifts the whole block —
      // cards, caption and Start Fresh together — without moving any of them relative to each other.
      paddingBottom: 110,
    },
    // Absolute, so it never joins the centred column's layout and never shifts the cards.
    // 54x42 is the questionnaire's own `navButton` box — the arrow is 26pt and the rest is tap area.
    back: {
      position: "absolute",
      width: 54,
      height: 42,
      alignItems: "center",
      justifyContent: "center",
      zIndex: 2,
    },
    backArrow: { width: 26, height: 26 },
    backPressed: { opacity: 0.35 },
    content: {
      width: "100%",
      maxWidth: 980,
      // COLUMN while the brand block is commented out: as a row it kept a 300pt actions column
      // pinned right and an empty intro column left, which is what pushed the demo cards off centre.
      // Restore flexDirection:"row" + justifyContent:"space-between" when the brand block returns.
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
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
      // Was a fixed 300 for the two buttons; the demo cards need the full width to centre in.
      width: "100%",
      alignItems: "center",
      gap: SPACE.md,
    },
  });