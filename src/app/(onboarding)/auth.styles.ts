// Presentation for auth. Only styling lives here — no state, no data, no handlers.

import { StyleSheet } from "react-native";
import { SPACE, TYPE } from "@/src/game/ui/theme";
import type { Theme } from "@/src/game/ui/theme";

export const makeStyles = (t: Theme) =>
  StyleSheet.create({
    root: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: t.bg,
      paddingHorizontal: 42,
      paddingVertical: 22,
    },
    content: {
      width: "100%",
      maxWidth: 980,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 36,
    },
    intro: {
      flex: 1,
      maxWidth: 560,
      gap: 18,
    },
    header: {
      flexDirection: "row",
      alignItems: "center",
      gap: 18,
    },
    mascot: {
      width: 82,
      height: 82,
      borderRadius: 20,
    },
    brand: {
      color: t.gold,
      fontSize: 44,
      fontWeight: "800",
      letterSpacing: 8,
    },
    copyBlock: {
      gap: SPACE.sm,
    },
    title: {
      ...TYPE.title,
      color: t.text,
      fontSize: 31,
      lineHeight: 36,
    },
    subtitle: {
      ...TYPE.body,
      color: t.textDim,
      fontSize: 16,
      fontWeight: "600",
      lineHeight: 22,
    },
    actions: {
      width: 300,
      gap: SPACE.md,
    },
  });
