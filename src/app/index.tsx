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

      <View style={styles.actions}>
        <Link href="/auth" asChild>
          {/* The ONE primary action on the screen: first-run onboarding (auth → questionnaire → avatar → home). */}
          <Button label="New User" variant="primary" pill />
        </Link>
        <Link href="/room" asChild>
          <Button label="Home" pill />
        </Link>
      </View>

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
    paddingHorizontal: 28,
    gap: 22,
  },
  title: { fontSize: 34, fontWeight: "800", color: t.text, letterSpacing: 0.5 },
  sub: { ...TYPE.body, color: t.textDim, marginTop: SPACE.sm },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACE.lg,
    marginTop: 36,
  },
  });
