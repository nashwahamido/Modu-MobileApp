// The account list embedded in the auth screen — the SIGNED-OUT half of the pair, with
// AccountSwitcher (/settings) covering the signed-in half. Both read the same rosters.ts, so an
// account added to env shows up on each without further wiring.
//
// Embedded in the screen rather than floated over the app: during a demo this is what an attendee
// actually touches, so it has to look like part of the product. Themed with the app's own primitives
// for that reason — unlike ordinary dev tooling, which stays deliberately plain. Self-gating: renders
// null when no roster is live, so auth.tsx can mount it freely.
import { useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import type { Href } from "expo-router";

import { Button } from "@/src/game/ui/Button";
import { SPACE, Theme, TYPE, useStyles } from "@/src/game/ui/theme";
import { ENABLED_ROSTERS } from "./rosters";

// A prepared account drops straight into its furnished room; a fresh one starts the questionnaire so the whole onboarding → tutorial run is on show.
const ESTABLISHED_ROUTE = "/room" as Href;
const FRESH_ROUTE = "/onboarding-questionnaire" as Href;

export function AccountPicker() {
  const styles = useStyles(makeStyles);
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
          <View style={styles.dividerRow}>
            <View style={styles.divider} />
            <Text style={styles.dividerText}>{roster.pickerLabel}</Text>
            <View style={styles.divider} />
          </View>

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
    group: { gap: SPACE.md },
    dividerRow: { flexDirection: "row", alignItems: "center", gap: SPACE.sm, marginTop: SPACE.xs },
    divider: { flex: 1, height: 1, backgroundColor: t.border },
    dividerText: { ...TYPE.labelSm, color: t.textFaint },
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