// The account list embedded in the auth screen — the SIGNED-OUT half of the pair, with
// AccountSwitcher (/settings) covering the signed-in half. Both read the same rosters.ts, so an account added to env shows up on each without further wiring.
//
// Embedded in the screen rather than floated over the app: during a demo this is what an attendee actually touches, so it has to look like part of the product. Themed with the app's own primitives for that reason — unlike ordinary dev tooling, which stays deliberately plain. Self-gating: renders null when no roster is live, so auth.tsx can mount it freely.
import { useState } from "react";
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated";
import Svg, { Defs, RadialGradient, Rect, Stop } from "react-native-svg";
import { router } from "expo-router";
import type { Href } from "expo-router";

import { Button } from "@/src/game/ui/system/Button";
import { RADIUS, SPACE, Theme, TYPE, useFixedStyles } from "@/src/game/ui/system/theme";
import { ENABLED_ROSTERS } from "./rosters";
import { personaFor } from "./showcase";
import { avatarCardForProfile } from "@/src/components/avatarAssets";

// The level badges, drawn in a card's top-right corner — the app's OWN level stars (ui/icons),
// the same art the profile and room already use, so a level reads identically everywhere.
const LEVEL_STARS: Record<number, number> = {
  1: require("@/src/assets/ui/icons/level-1.png"),
  2: require("@/src/assets/ui/icons/level-2.png"),
  3: require("@/src/assets/ui/icons/level-3.png"),
  4: require("@/src/assets/ui/icons/level-4.png"),
  5: require("@/src/assets/ui/icons/level-5.png"),
};

// A prepared account drops straight into its furnished room; a fresh one starts the questionnaire so the whole onboarding → tutorial run is on show.
const ESTABLISHED_ROUTE = "/room" as Href;
const FRESH_ROUTE = "/onboarding-questionnaire" as Href;

/** One character card. Its own component so each card owns its own scale value — a single shared
 *  one would grow all four whenever any of them was pressed. */
function ShowcaseCard({
  persona,
  disabled,
  onPress,
  styles,
}: {
  persona: ReturnType<typeof personaFor>;
  disabled: boolean;
  onPress: () => void;
  styles: ReturnType<typeof makeStyles>;
}) {
  const scale = useSharedValue(1);
  const lift = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const star = LEVEL_STARS[persona.level];
  return (
    <Animated.View style={lift}>
      <Pressable
        style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
        disabled={disabled}
        // Grows on touch and settles back on release: the card is a character being chosen, so the
        // press should feel like picking it up rather than like a button depressing.
        onPressIn={() => {
          scale.value = withSpring(1.06, { damping: 14, stiffness: 220 });
        }}
        onPressOut={() => {
          scale.value = withSpring(1, { damping: 14, stiffness: 220 });
        }}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`${persona.name}, level ${persona.level}`}
      >
        {/* White at the centre falling to cream at the rim: the character stands in a soft pool of
            light rather than on a flat panel. SVG because a RADIAL gradient has no RN equivalent. */}
        <Svg style={StyleSheet.absoluteFill} pointerEvents="none">
          <Defs>
            <RadialGradient id={`cardglow-${persona.profile}`} cx="50%" cy="40%" r="62%">
              <Stop offset="0" stopColor="#FFFFFF" />
              <Stop offset="0.55" stopColor="#F7F1E6" />
              <Stop offset="1" stopColor="#DCCFB8" />
            </RadialGradient>
          </Defs>
          <Rect x="0" y="0" width="100%" height="100%" fill={`url(#cardglow-${persona.profile})`} />
        </Svg>
        <View style={styles.cardArt}>
          <Image
            source={avatarCardForProfile(persona.profile)}
            style={styles.avatar}
            resizeMode="contain"
          />
        </View>
        <View style={styles.namePlate}>
          <Text style={styles.nameText} numberOfLines={1}>{persona.name}</Text>
        </View>
      </Pressable>
      {/* OUTSIDE the Pressable, on the wrapper: the card clips its own contents to stay rounded, so
          a badge that straddles the border has to be a sibling of the card rather than a child.
          pointerEvents none so the corner it covers still presses the card. */}
      {star ? (
        <View style={styles.levelStar} pointerEvents="none">
          <Image source={star} style={styles.levelStarImage} resizeMode="contain" />
        </View>
      ) : null}
    </Animated.View>
  );
}

export function AccountPicker() {
  const styles = useFixedStyles(makeStyles);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (ENABLED_ROSTERS.length === 0) return null;

  const run = async (key: string, action: () => Promise<void>, destination: Href) => {
    if (busy) return;
    setBusy(key);
    setError(null);
    try {
      await action();
      router.replace(destination);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <View style={styles.root}>
      {ENABLED_ROSTERS.map((roster) => (
        <View key={roster.title} style={styles.group}>
          {/* The showcase roster carries its line BELOW the cards, next to Start Fresh — the
              characters introduce themselves, so a heading above them was saying it twice. The dev
              roster keeps its divider: that list needs naming. */}
          {roster.showcase ? null : (
            <View style={styles.dividerRow}>
              <View style={styles.divider} />
              <Text style={styles.dividerText}>{roster.pickerLabel}</Text>
              <View style={styles.divider} />
            </View>
          )}

          {/* SHOWCASE reads as part of the product — a row of characters to pick from, the way a
              game offers players — while DEV stays a plain list of buttons, because it is tooling
              and dressing it up would only make it harder to tell the two rosters apart. */}
          {roster.showcase ? (
            <>
              <View style={styles.cardRow}>
                {roster.accounts.map((account, i) => (
                  <ShowcaseCard
                    key={account.email}
                    persona={personaFor(account, i)}
                    disabled={busy !== null}
                    styles={styles}
                    onPress={() => run(account.email, () => roster.signIn(account.email), ESTABLISHED_ROUTE)}
                  />
                ))}
              </View>

              {/* One line, under the cards: the characters ARE the demo accounts, so the sentence
                  names what they were and hands off to the alternative in the same breath. */}
              {roster.accounts.length > 0 ? (
                <Text style={styles.orText}>Try a demo account, or</Text>
              ) : null}
              <View style={styles.freshRow}>
                <Button
                  label="Start Fresh"
                  pill
                  disabled={busy !== null}
                  onPress={() => run(`${roster.title}:fresh`, roster.startFresh, FRESH_ROUTE)}
                />
              </View>
            </>
          ) : (
            <>
              <Button
                label="Start fresh"
                pill
                disabled={busy !== null}
                onPress={() => run(`${roster.title}:fresh`, roster.startFresh, FRESH_ROUTE)}
              />

              {roster.accounts.map((account) => (
                <Button
                  key={account.email}
                  label={account.label}
                  pill
                  disabled={busy !== null}
                  onPress={() => run(account.email, () => roster.signIn(account.email), ESTABLISHED_ROUTE)}
                />
              ))}
            </>
          )}

          {roster.accounts.length === 0 ? (
            <Text style={styles.hint}>Set {roster.envVar} to list accounts here.</Text>
          ) : null}
        </View>
      ))}

      {/* Out of the layout entirely, hanging below the column. Mounting the spinner inline pushed
          the whole stack up — the screen centres this block vertically, so any height added at the
          bottom moves everything. Reserving the space fixed the jump but spent the height
          permanently; absolute costs nothing at rest and nothing on press. */}
      <View style={styles.statusSlot}>
        {busy ? <ActivityIndicator /> : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}
      </View>
    </View>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    root: { gap: SPACE.md },
    // The character row. Fixed-width cards rather than flex: four portraits should be the same size
    // as each other, not sized by how much room is left over.
    cardRow: { flexDirection: "row", justifyContent: "center", alignItems: "center", gap: SPACE.md },
    card: {
      width: 148,
      borderRadius: RADIUS.panel,
      // The SVG gradient paints the face; this is only what shows in the rounded corners it cannot
      // reach, so it matches the gradient's OUTER stop rather than its centre.
      backgroundColor: "#DCCFB8",
      borderWidth: 2,
      borderColor: t.border,
      // Hidden, and it must stay hidden: the SVG gradient is a square Rect, so this clip is what
      // gives the card its rounded corners. The level badge therefore hangs OUTSIDE this view —
      // see the wrapper in ShowcaseCard.
      overflow: "hidden",
      alignItems: "center",
    },
    cardPressed: { borderColor: t.accent, backgroundColor: t.surfaceRaised },
    // Tall portrait window, like a character-select cell: the avatar stands in it full length.
    // SQUARE, to match the card art's own canvas: a square asset in a square window fills it exactly,
    // so the baseline baked into the art IS the bottom of this window. A taller window would
    // letterbox the art and reintroduce the floating the assets were built to remove.
    cardArt: { width: "100%", aspectRatio: 1, alignItems: "center", justifyContent: "flex-end", overflow: "hidden" },
    avatar: { width: "100%", height: "100%" },
    // Straddling the card's top-left corner, positioned against the WRAPPER (see ShowcaseCard).
    levelStar: { position: "absolute", top: -12, left: -12, width: 42, height: 42, zIndex: 2 },
    levelStarImage: { width: "100%", height: "100%" },
    // The name sits on its own plate at the foot of the card, which is the button's face.
    namePlate: {
      width: "100%",
      paddingVertical: 7,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: t.surfaceRaised,
      borderTopWidth: 1,
      borderTopColor: t.border,
    },
    nameText: { ...TYPE.label, fontSize: 16, color: t.text, textAlign: "center" },
    // Between ink and faint: it is a caption under the cards, not a heading — readable on the blue
    // without competing with the characters above it or the button below.
    orText: { ...TYPE.label, color: t.textDim, textAlign: "center" },
    freshRow: { alignSelf: "center", minWidth: 220 },
    group: { gap: SPACE.md },
    dividerRow: { flexDirection: "row", alignItems: "center", gap: SPACE.sm, marginTop: SPACE.xs },
    divider: { flex: 1, height: 1, backgroundColor: t.border },
    dividerText: { ...TYPE.label, color: t.text },
    hint: { ...TYPE.labelSm, color: t.textFaint, textAlign: "center" },
    statusSlot: {
      position: "absolute",
      top: "100%",
      left: 0,
      right: 0,
      alignItems: "center",
      justifyContent: "center",
      paddingTop: 6,
    },
    spinner: { marginTop: SPACE.xs },
    error: { ...TYPE.labelSm, color: t.danger, textAlign: "center" },
  });