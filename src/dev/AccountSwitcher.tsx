// The account switcher, mounted inside the DEV panel (GmTestPanel) — the SIGNED-IN half of the pair,
// with AccountPicker (the auth screen) covering the signed-out half. Both read the same rosters.ts.
//
// This half is what makes the other reachable: nothing else in the app signs you out, so before it
// existed a switch meant clearing app storage.
//
// It lives in the dev panel rather than /settings because that is where the rest of the jump-to-a-state
// tooling already is, and because /settings is a real product screen — a sign-out button sitting in it
// is one stray tap away from a player, and one merge away from shipping. The panel is __DEV__-only at
// its mount point, so nothing here can reach a release build.
//
// Styled with the panel's own flat palette, not the app theme: it has to read as part of the panel,
// and the panel deliberately does not follow the product's surfaces.
import { useState } from "react";
import { StyleSheet, ActivityIndicator, Pressable, Text, View } from "react-native";
import { router } from "expo-router";
import type { Href } from "expo-router";

import { useAuth } from "@/src/hooks/useAuth";
import { SIGN_IN_ROUTE } from "@/src/hooks/useSessionGate";
import { purgeAnonymousAccounts, signOutAccount } from "./accounts";
import { ENABLED_ROSTERS } from "./rosters";

// A fresh account starts the questionnaire so the whole onboarding run is on show; a prepared one drops into its room.
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

/** onDone fires just before navigating, so the panel that owns this can close itself. */
export function AccountSwitcher({ onDone }: { onDone?: () => void }) {
  const { user } = useAuth();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // Purge is irreversible and one tap from "Start fresh", so it arms first and fires on the second tap.
  const [armed, setArmed] = useState(false);

  if (ENABLED_ROSTERS.length === 0) return null;

  // An anonymous session cannot purge (it would be deleting itself), and the server refuses anyway.
  const canPurge = Boolean(user) && !user?.is_anonymous;

  const purge = async () => {
    if (busy) return;
    if (!armed) {
      setArmed(true);
      return;
    }
    setArmed(false);
    setBusy("purge");
    setError(null);
    setNotice(null);
    try {
      const deleted = await purgeAnonymousAccounts();
      setNotice(`deleted ${deleted} anonymous account${deleted === 1 ? "" : "s"}`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  };

  // The panel floats above everything, so it can be open over a modal (/settings, /profile). Clearing that layer first is what makes replace() land on the root stack instead of swapping the modal.
  const leaveTo = (destination: Href) => {
    onDone?.();
    if (router.canDismiss()) router.dismissAll();
    router.replace(destination);
  };

  const run = async (key: string, action: () => Promise<void>, destination: Href) => {
    if (busy) return;
    setBusy(key);
    setError(null);
    try {
      await action();
      leaveTo(destination);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <View style={styles.root}>
      {ENABLED_ROSTERS.map((roster) => (
        <View key={roster.title}>
          <Text style={styles.section}>{roster.title}</Text>
          <Text style={styles.current}>{describeUser(user)}</Text>

          {roster.accounts.length === 0 ? (
            <Text style={styles.hint}>Set {roster.envVar} to list accounts here.</Text>
          ) : null}

          <View style={styles.grid}>
            {roster.accounts.map((account) => {
              const isCurrent = user?.email === account.email;
              return (
                <Pressable
                  key={account.email}
                  style={[styles.chip, isCurrent && styles.chipCurrent]}
                  disabled={busy !== null || isCurrent}
                  onPress={() => run(account.email, () => roster.signIn(account.email), ESTABLISHED_ROUTE)}
                >
                  <Text style={styles.chipLabel} numberOfLines={1}>
                    {account.label}
                  </Text>
                  {/* The account you are on stays listed rather than hidden, so the buttons never move under your finger. */}
                  <Text style={styles.chipNote}>{isCurrent ? "current" : "switch"}</Text>
                </Pressable>
              );
            })}

            <Pressable
              style={styles.chip}
              disabled={busy !== null}
              onPress={() => run(`${roster.title}:fresh`, roster.startFresh, FRESH_ROUTE)}
            >
              <Text style={styles.chipLabel}>Start fresh</Text>
              <Text style={styles.chipNote}>new anonymous</Text>
            </Pressable>

            {/* Sign out is roster-agnostic, but it belongs beside the accounts it undoes. */}
            <Pressable
              style={styles.chip}
              disabled={busy !== null}
              onPress={() => run("out", signOutAccount, SIGN_IN_ROUTE as Href)}
            >
              <Text style={[styles.chipLabel, styles.signOut]}>Sign out</Text>
              <Text style={styles.chipNote}>to login</Text>
            </Pressable>

            {/* Cleans up after "Start fresh", which leaves a real auth user behind on every tap. */}
            <Pressable
              style={[styles.chip, armed && styles.chipArmed]}
              disabled={busy !== null || !canPurge}
              onPress={purge}
            >
              <Text style={[styles.chipLabel, styles.signOut]}>{armed ? "Sure?" : "Purge anon"}</Text>
              <Text style={styles.chipNote}>
                {canPurge ? (armed ? "tap to delete" : "delete fresh accts") : "sign in first"}
              </Text>
            </Pressable>
          </View>
        </View>
      ))}

      {busy ? <ActivityIndicator style={styles.spinner} /> : null}
      {notice ? <Text style={styles.notice}>{notice}</Text> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: "#d8cdbb",
    gap: 6,
  },
  section: {
    color: "#231F20",
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  current: {
    color: "#665f55",
    fontSize: 10,
    fontWeight: "700",
    marginTop: 2,
    marginBottom: 6,
  },
  hint: { color: "#665f55", fontSize: 10, fontWeight: "700", marginBottom: 6 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    width: "31.7%",
    minHeight: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#d8cdbb",
    backgroundColor: "#FBF8F3",
    paddingHorizontal: 9,
    paddingVertical: 8,
    justifyContent: "center",
  },
  chipCurrent: { backgroundColor: "#EFE7DA", opacity: 0.6 },
  // Armed = the next tap deletes. Red border rather than a dialog: the panel is dev chrome, and a
  // modal over it would be the heaviest thing on the screen.
  chipArmed: { borderColor: "#9A3B2F", backgroundColor: "#F6E5E1" },
  chipLabel: { color: "#231F20", fontSize: 12, fontWeight: "900" },
  chipNote: { color: "#665f55", fontSize: 9, fontWeight: "700", marginTop: 3 },
  signOut: { color: "#9A3B2F" },
  spinner: { marginTop: 6, alignSelf: "flex-start" },
  notice: { color: "#4E6B3A", fontSize: 10, fontWeight: "700", marginTop: 6 },
  error: { color: "#9A3B2F", fontSize: 10, fontWeight: "700", marginTop: 6 },
});
