// Styling for catalogue.tsx

import { StyleSheet } from "react-native";
import { RADIUS, SPACE, TYPE, ELEVATION } from "@/src/game/ui/theme";
import type { Theme } from "@/src/game/ui/theme";

export const makeStyles = (t: Theme) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: t.bg },
    loadingWrap: { flex: 1 },
    // Matches the grid header's inset so the button doesn't jump when the catalogue lands.
    loadingBack: { position: "absolute", top: 56, left: SPACE.xl },
    content: { padding: SPACE.xl, paddingTop: 56 },
    header: {
      flexDirection: "row",
      alignItems: "center",
      gap: SPACE.lg,
      marginBottom: SPACE.xl,
    },
    title: { fontSize: 28, fontWeight: "800", color: t.text },
    subtitle: {
      ...TYPE.body,
      color: t.textDim,
      marginTop: SPACE.xs,
    },
    grid: { flexDirection: "row", flexWrap: "wrap", gap: SPACE.lg },
    card: {
      flexBasis: "47%",
      flexGrow: 1,
      backgroundColor: t.surface,
      borderRadius: RADIUS.panel,
      padding: SPACE.lg,
      borderWidth: StyleSheet.hairlineWidth * 2,
      borderColor: t.border,
      ...ELEVATION.card,
    },
    cardPressed: { backgroundColor: t.surfaceRaised },
    thumbWrap: {
      height: 120,
      borderRadius: RADIUS.control,
      // Inset, like every other groove in the palette — the thumbnail sits IN the card.
      backgroundColor: t.surfaceInset,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: SPACE.md,
    },
    thumb: { width: "80%", height: "80%" },
    name: { fontSize: 17, fontWeight: "700", color: t.text },
    brand: {
      ...TYPE.labelSm,
      fontWeight: "500",
      color: t.textDim,
      marginTop: 2,
    },
    metaRow: {
      flexDirection: "row",
      alignItems: "center",
      marginTop: SPACE.sm,
      flexWrap: "wrap",
    },
    metaText: { ...TYPE.labelSm, color: t.textDim },
    metaDot: { color: t.textFaint, fontSize: 12, marginHorizontal: 6 },
  });
