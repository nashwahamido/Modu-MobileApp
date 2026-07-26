// The in-app account switcher, mounted at the bottom of /settings. Swaps between the prepared test
// accounts from inside a live session, which is the piece ShowcaseAccounts cannot cover: that one is
// the SIGNED-OUT picker on the auth screen, and nothing in the app signs you out, so without this a
// switch meant clearing app storage.
//
// Self-gating on SHOWCASE_ENABLED, exactly like ShowcaseAccounts, so settings.tsx can mount it
// unconditionally — a build with EXPO_PUBLIC_SHOWCASE unset renders nothing.
//
// Styled after SettingsControls rather than the auth screen: this is dev tooling sharing a scroll
// view with the real settings, so it should read as one more section, not as product surface.
import { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import type { Href } from "expo-router";

import { SPACE, Theme, useStyles } from "@/src/game/ui/theme";
import { useAuth } from "@/src/hooks/useAuth";
import { SIGN_IN_ROUTE } from "@/src/hooks/useSessionGate";
import {
  SHOWCASE_ACCOUNTS,
  SHOWCASE_ENABLED,
  signInToShowcaseAccount,
  signOutShowcase,
  startFreshShowcaseAccount,
} from "./showcase";

// A fresh account starts the questionnaire so the whole onboarding run is on show; the same routes ShowcaseAccounts uses.
const ESTABLISHED_ROUTE = "/room" as Href;
const FRESH_ROUTE = "/onboarding-questionnaire" as Href;

// How the signed-in account is named back to you. Anonymous sessions have no email, so they fall back
// to the username the fresh-account path seeded and then to a short uid — enough to tell two apart.
function describeUser(user: { id: string; email?: string; user_metadata?: Record<string, unknown> } | null): string {
  if (!user) return "signed out";
  if (user.email) return user.email;
  const username = user.user_metadata?.username;
  const name = typeof username === "string" ? username : "anonymous";
  return `${name} (${user.id.slice(0, 8)})`;
}

export function AccountSwitcher() {
  const styles = useStyles(makeStyles);
  const { user } = useAuth();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!SHOWCASE_ENABLED) return null;

  // Settings is a (presentation) modal over the room. A switch pops back to the room it is already
  // sitting on — the HUD and the modal screens all read on focus, so the new account's data lands
  // without a remount. Leaving the session (fresh account, sign out) instead has to clear the modal
  // layer first: replace() from inside a modal would only replace the modal itself.
  const leaveTo = (destination: Href) => {
    if (router.canDismiss()) router.dismissAll();
    router.replace(destination);
  };

  const run = async (key: string, action: () => Promise<void>, go: () => void) => {
    if (busy) return;
    setBusy(key);
    setError(null);
    try {
      await action();
      go();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <View style={styles.root}>
      <Text style={styles.section}>Account (dev)</Text>
      <Text style={styles.current}>Signed in as {describeUser(user)}</Text>

      {SHOWCASE_ACCOUNTS.length === 0 ? (
        <Text style={styles.hint}>Set EXPO_PUBLIC_SHOWCASE_ACCOUNTS to list accounts here.</Text>
      ) : null}

      {SHOWCASE_ACCOUNTS.map((account) => {
        const isCurrent = user?.email === account.email;
        return (
          <Pressable
            key={account.email}
            style={[styles.row, isCurrent && styles.rowCurrent]}
            disabled={busy !== null || isCurrent}
            onPress={() =>
              run(account.email, () => signInToShowcaseAccount(account.email), () => router.dismissTo(ESTABLISHED_ROUTE))
            }
          >
            <Text style={[styles.rowLabel, isCurrent && styles.rowLabelCurrent]}>{account.label}</Text>
            <Text style={[styles.rowMeta, isCurrent && styles.rowLabelCurrent]}>
              {isCurrent ? "current" : "switch"}
            </Text>
          </Pressable>
        );
      })}

      <Pressable
        style={styles.row}
        disabled={busy !== null}
        onPress={() => run("fresh", startFreshShowcaseAccount, () => leaveTo(FRESH_ROUTE))}
      >
        <Text style={styles.rowLabel}>Start fresh</Text>
        <Text style={styles.rowMeta}>new anonymous account</Text>
      </Pressable>

      <Pressable
        style={styles.row}
        disabled={busy !== null}
        onPress={() => run("out", signOutShowcase, () => leaveTo(SIGN_IN_ROUTE as Href))}
      >
        <Text style={[styles.rowLabel, styles.signOut]}>Sign out</Text>
        <Text style={styles.rowMeta}>back to the login screen</Text>
      </Pressable>

      {busy ? <ActivityIndicator style={styles.spinner} /> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    root: { marginTop: SPACE.md },
    // Matches SettingsControls' SectionHeader so the block reads as one more settings section.
    section: {
      fontSize: 12,
      fontWeight: "800",
      letterSpacing: 0.5,
      textTransform: "uppercase",
      color: t.gold,
      marginTop: 16,
      marginBottom: 4,
    },
    current: { fontSize: 12, color: t.textDim, marginBottom: 4 },
    hint: { fontSize: 12, color: t.textFaint, paddingVertical: 10 },
    row: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingVertical: 12,
      borderTopWidth: 1,
      borderTopColor: t.border,
    },
    // The account you are already on stays listed rather than hidden — the list is then the same
    // length every time, so the button you want is always in the same place.
    rowCurrent: { opacity: 0.5 },
    rowLabel: { flex: 1, paddingRight: 12, fontSize: 15, fontWeight: "700", color: t.text },
    rowLabelCurrent: { color: t.textDim },
    rowMeta: { fontSize: 12, color: t.textDim },
    signOut: { color: t.danger },
    spinner: { marginTop: SPACE.xs },
    error: { fontSize: 12, color: t.danger, marginTop: SPACE.xs },
  });
