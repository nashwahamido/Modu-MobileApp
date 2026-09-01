import { useState } from "react";
import { ActivityIndicator, Image, StyleSheet, Text, View } from "react-native";
import { Pressable } from "@/src/components/Pressable";
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated";
import Svg, { Defs, RadialGradient, Rect, Stop } from "react-native-svg";
import { router } from "expo-router";
import type { Href } from "expo-router";

import { Button } from "@/src/game/ui/system/Button";
import { RADIUS, SPACE, Theme, TYPE, useFixedStyles } from "@/src/game/ui/system/theme";
import { ENABLED_ROSTERS } from "./rosters";
import { personaFor } from "./showcase";
import { getCurrentSession } from "@/src/services/auth";
import { getLatestOnboardingMode, getSelectedAvatarMode } from "@/src/services/onboarding";
import { useGameStore } from "@/src/game/core/store";
import type { ProfileId } from "@/src/game/core/profile";
import { avatarCardForProfile } from "@/src/components/avatarAssets";

const LEVEL_STARS: Record<number, number> = {
  1: require("@/src/assets/ui/icons/lvl-1.png"),
  2: require("@/src/assets/ui/icons/lvl-2.png"),
  3: require("@/src/assets/ui/icons/lvl-3.png"),
  4: require("@/src/assets/ui/icons/lvl-4.png"),
  5: require("@/src/assets/ui/icons/lvl-5.png"),
};

const ESTABLISHED_ROUTE = "/room" as Href;
const FRESH_ROUTE = "/voice-intro" as Href;

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
      {star ? (
        <View style={styles.levelStar} pointerEvents="none">
          <Image source={star} style={styles.levelStarImage} resizeMode="contain" />
        </View>
      ) : null}
    </Animated.View>
  );
}

async function applySignedInProfile(): Promise<void> {
  try {
    const session = await getCurrentSession();
    const userId = session?.user?.id;
    if (!userId) return;
    const mode = (await getSelectedAvatarMode(userId)) ?? (await getLatestOnboardingMode(userId));
    if (mode && PROFILE_IDS.has(mode as ProfileId)) {
      useGameStore.getState().applyProfile(mode as ProfileId);
    }
  } catch {
  }
}

const PROFILE_IDS = new Set<ProfileId>(["visual", "momentum", "clearPath", "control"]);

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
      await applySignedInProfile();
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
          {roster.showcase ? null : (
            <View style={styles.dividerRow}>
              <View style={styles.divider} />
              <Text style={styles.dividerText}>{roster.pickerLabel}</Text>
              <View style={styles.divider} />
            </View>
          )}

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
    cardRow: { flexDirection: "row", justifyContent: "center", alignItems: "center", gap: SPACE.md },
    card: {
      width: 148,
      borderRadius: RADIUS.panel,
      backgroundColor: "#DCCFB8",
      borderWidth: 2,
      borderColor: t.border,
      overflow: "hidden",
      alignItems: "center",
    },
    cardPressed: { borderColor: t.accent, backgroundColor: t.surfaceRaised },
    cardArt: { width: "100%", aspectRatio: 1, alignItems: "center", justifyContent: "flex-end", overflow: "hidden" },
    avatar: { width: "100%", height: "100%" },
    levelStar: { position: "absolute", top: -12, left: -12, width: 42, height: 42, zIndex: 2 },
    levelStarImage: { width: "100%", height: "100%" },
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