// eslint-disable-next-line @typescript-eslint/no-unused-vars -- restored with the buttons below
import { Link, router } from "expo-router";
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- restored with the buttons below
import type { Href } from "expo-router";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { Pressable, StyleSheet, Image, Text, View } from "react-native";

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- restored with the buttons below
import { Button } from "@/src/game/ui/system/Button";
import { AccountPicker } from "@/src/dev/AccountPicker";
import { FONT, SPACE, useStyles } from "@/src/game/ui/system/theme";
import { SCREEN_SIDE_MARGIN, SCREEN_VERTICAL_MARGIN, useSafeInsets } from "@/src/hooks/use-safe-insets";
import type { Theme } from "@/src/game/ui/system/theme";
import { SceneBackdrop } from "@/src/game/ui/backdrop/SceneBackdrop";

const backdrop = require("@/src/assets/ui/profile-backdrop.jpg");

const BG_SOLID = "#E9E6DF";
const SLOGAN_INK = "#595551";

const BACK_ARROW = require("@/src/assets/ui/icons/arrow-back.png");

export default function AuthScreen() {
  const styles = useStyles(makeStyles);
  const safe = useSafeInsets();

  const onBack = () => {
    if (router.canDismiss()) router.dismissTo("/");
    else router.replace("/");
  };
  return (
    <SceneBackdrop
      source={backdrop}
      style={[
        styles.root,
        {
          paddingLeft: 42 + Math.max(safe.raw.left, SCREEN_SIDE_MARGIN),
          paddingRight: 42 + Math.max(safe.raw.right, SCREEN_SIDE_MARGIN),
          paddingTop: 22 + Math.max(safe.raw.top, SCREEN_VERTICAL_MARGIN),
          paddingBottom: 22 + Math.max(safe.raw.bottom, SCREEN_VERTICAL_MARGIN),
        },
      ]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Back to the start screen"
        hitSlop={10}
        onPress={onBack}
        style={({ pressed }) => [
          styles.back,
          {
            top: 22 + Math.max(safe.raw.top, SCREEN_VERTICAL_MARGIN),
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
          </View>
        </View>
        <View style={styles.actions}>
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
      paddingBottom: 110,
    },
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
      minWidth: 0,
      gap: 18,
    },
    mascot: {
      width: 82,
      height: 82,
      borderRadius: 20,
      flexShrink: 0,
    },
    wordmark: {
      flexShrink: 1,
      width: 230,
      aspectRatio: 600 / 133,
    },
    slogan: {
      color: SLOGAN_INK,
      fontFamily: FONT,
      fontSize: 30,
      fontWeight: "900",
      letterSpacing: 0.2,
      textAlign: "center",
    },
    actions: {
      width: "100%",
      alignItems: "center",
      gap: SPACE.md,
    },
  });