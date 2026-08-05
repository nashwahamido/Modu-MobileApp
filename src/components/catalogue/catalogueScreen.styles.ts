// Shared screen styling for the two catalogue surfaces (store, inventory) — one sheet so they stay pixel-identical. Only styling lives here — no state, no data, no handlers.

import { StyleSheet } from "react-native";
import { SPACE, TYPE } from "@/src/game/ui/theme";
import type { Theme } from "@/src/game/ui/theme";

export const makeStyles = (t: Theme) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: t.bg, paddingBottom: SPACE.md },
    center: { flex: 1, alignItems: "center", justifyContent: "center", gap: SPACE.md },
    note: { ...TYPE.label, color: t.accent, marginBottom: SPACE.sm },
    empty: { ...TYPE.body, color: t.textFaint, textAlign: "center", padding: SPACE.lg },
    grid: { flexDirection: "row", flexWrap: "wrap", gap: SPACE.md, paddingBottom: SPACE.xl },
  });
