// Presentation for create-account. Only styling lives here — no state, no data, no handlers.

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
      paddingVertical: 20,
    },
    panel: {
      width: "100%",
      maxWidth: 980,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 36,
    },
    intro: {
      flex: 1,
      maxWidth: 470,
      flexDirection: "row",
      alignItems: "center",
      gap: 18,
    },
    mascot: {
      width: 92,
      height: 92,
      borderRadius: 22,
    },
    copy: {
      flex: 1,
      gap: SPACE.sm,
    },
    brand: {
      color: t.gold,
      fontSize: 32,
      fontWeight: "900",
      letterSpacing: 7,
    },
    title: {
      ...TYPE.title,
      color: t.text,
      fontSize: 30,
      fontWeight: "900",
      lineHeight: 35,
    },
    subtitle: {
      ...TYPE.body,
      color: t.textDim,
      fontSize: 15,
      fontWeight: "700",
      lineHeight: 21,
    },
    form: {
      width: 340,
      gap: SPACE.md,
    },
    segmented: {
      flexDirection: "row",
      borderRadius: 24,
      backgroundColor: t.surfaceInset,
      padding: SPACE.xs,
    },
    segment: {
      flex: 1,
      alignItems: "center",
      borderRadius: 20,
      paddingVertical: 9,
    },
    activeSegment: {
      backgroundColor: t.surface,
    },
    segmentText: {
      ...TYPE.label,
      color: t.textDim,
      fontSize: 15,
      fontWeight: "900",
    },
    activeSegmentText: {
      color: t.text,
    },
    emailGroup: {
      gap: 10,
    },
    input: {
      borderColor: t.borderStrong,
      borderRadius: 18,
      borderWidth: 2,
      color: t.text,
      fontSize: 16,
      fontWeight: "700",
      paddingHorizontal: SPACE.lg,
      paddingVertical: SPACE.md,
    },
    disabledButton: {
      opacity: 0.58,
    },
    errorText: {
      ...TYPE.labelSm,
      color: t.danger,
      fontWeight: "800",
      lineHeight: 16,
    },
    statusText: {
      ...TYPE.labelSm,
      color: t.success,
      fontWeight: "800",
      lineHeight: 16,
    },
    dividerRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
    },
    divider: {
      flex: 1,
      height: 1,
      backgroundColor: t.border,
    },
    dividerText: {
      color: t.textDim,
      fontSize: 13,
      fontWeight: "800",
    },
    methodList: {
      gap: 9,
    },
    methodButton: {
      minHeight: 46,
      flexDirection: "row",
      alignItems: "center",
      borderColor: t.borderStrong,
      borderRadius: 23,
      borderWidth: 2,
      paddingHorizontal: 14,
      gap: SPACE.md,
    },
    methodMark: {
      width: 26,
      height: 26,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: 13,
      backgroundColor: t.surfaceRaised,
    },
    methodMarkText: {
      ...TYPE.labelSm,
      color: t.text,
      fontSize: 13,
      fontWeight: "900",
    },
    methodText: {
      ...TYPE.label,
      color: t.text,
      fontSize: 15,
      fontWeight: "900",
    },
    prototypeNote: {
      ...TYPE.labelSm,
      color: t.textDim,
      fontWeight: "700",
      lineHeight: 16,
      textAlign: "center",
    },
  });
