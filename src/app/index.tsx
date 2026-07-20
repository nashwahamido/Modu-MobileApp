// Home. The workbench palette: a warm near-black, one lavender action, everything else quiet.
import { Link } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { StyleSheet, Text, View } from "react-native";

import { Button } from "@/src/game/ui/Button";
import { SPACE, Theme, TYPE, useStyles} from "@/src/game/ui/theme";

// The home screen sits outside a build, so it doesn't read the store's theme — it IS the

export default function App() {
  const styles = useStyles(makeStyles);
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Modu</Text>
      <Text style={styles.sub}>Build furniture, step by step</Text>

      <View style={styles.actions}>
        <Link href="/catalogue" asChild>
          {/* The ONE primary action on the screen. */}
          <Button label="Start building" variant="primary" pill />
        </Link>
        <Link href="/settings" asChild>
          <Button label="Settings" pill />
        </Link>
      </View>

      {__DEV__ && (
        <View style={styles.devRow}>
          <Link href="/engine-test" asChild>
            <Button label="engine test (dev)" variant="ghost" small />
          </Link>
          {/* REFERENCE ONLY — Nashwa's original engine, untouched. Delete this link
              together with src/adhd + play-adhd.tsx (merge plan Phase 7). */}
          <Link href="/play-adhd" asChild>
            <Button label="adhd original (ref)" variant="ghost" small />
          </Link>
        </View>
      )}
      <StatusBar style="light" />
    </View>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: t.bg,
    alignItems: "center",
    justifyContent: "center",
  },
  title: { fontSize: 34, fontWeight: "800", color: t.text, letterSpacing: 0.5 },
  sub: { ...TYPE.body, color: t.textDim, marginTop: SPACE.sm },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACE.lg,
    marginTop: 36,
  },
  devRow: { marginTop: SPACE.xl, flexDirection: "row", gap: SPACE.md },
  });