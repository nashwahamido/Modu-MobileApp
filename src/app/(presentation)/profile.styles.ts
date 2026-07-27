// Presentation for profile. Only styling lives here — no state, no data, no handlers.

import { StyleSheet } from "react-native";
import { RADIUS, SPACE, TYPE, ELEVATION } from "@/src/game/ui/theme";
import type { Theme } from "@/src/game/ui/theme";

export const makeStyles = (t: Theme) =>
  StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: t.bg,
      paddingBottom: SPACE.md,
    },
    center: { alignItems: "center", justifyContent: "center", gap: SPACE.md },
    errorText: { ...TYPE.body, color: t.textFaint, textAlign: "center", padding: SPACE.lg },
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: SPACE.md,
    },
    settingsLink: { flexDirection: "row", alignItems: "center", gap: SPACE.sm },
    settingsText: { ...TYPE.label, color: t.textDim },
    caret: { color: t.textDim, fontSize: 20, fontWeight: "800" },

    body: { flex: 1, flexDirection: "row", gap: SPACE.xl },

    profileCard: {
      width: 300,
      alignItems: "center",
      paddingTop: SPACE.sm,
    },
    avatarWrap: { width: 150, height: 150, marginBottom: SPACE.md },
    avatar: {
      width: 150,
      height: 150,
      borderRadius: 75,
      borderWidth: 2,
      borderColor: t.border,
      backgroundColor: t.surfaceRaised,
    },
    levelBadge: { position: "absolute", top: -6, left: -6, alignItems: "center", justifyContent: "center" },
    levelText: { position: "absolute", color: t.onAccent, fontSize: 13, fontWeight: "900" },

    nameRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: SPACE.sm,
      alignSelf: "stretch",
      height: 46,
      paddingHorizontal: SPACE.md,
      borderRadius: RADIUS.pill,
      borderWidth: 1,
      borderColor: t.border,
      backgroundColor: t.surface,
      marginBottom: SPACE.lg,
      ...ELEVATION.card,
    },
    nameText: { ...TYPE.title, color: t.text, flexShrink: 1 },
    nameInput: { ...TYPE.title, color: t.text, flex: 1, padding: 0, textAlign: "center" },
    pencil: { color: t.textDim, fontSize: 16 },
    saveText: { ...TYPE.label, color: t.accent },

    statRow: { flexDirection: "row", alignItems: "center", gap: SPACE.md, alignSelf: "stretch", marginBottom: SPACE.md },
    statGlyph: { fontSize: 20, color: t.textDim, width: 26, textAlign: "center" },
    statBody: { flexShrink: 1 },
    statTitle: { ...TYPE.label, color: t.text },
    statSub: { ...TYPE.labelSm, color: t.textFaint, marginTop: 1 },

    friendsPanel: { flex: 1 },
    tabs: { flexDirection: "row", gap: SPACE.md, marginBottom: SPACE.md },
    tab: {
      flex: 1,
      height: 42,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: RADIUS.pill,
      borderWidth: 1,
      borderColor: t.border,
      backgroundColor: t.surface,
    },
    tabActive: { backgroundColor: t.surfaceRaised, borderColor: t.borderStrong },
    tabText: { ...TYPE.label, color: t.textDim },
    tabTextActive: { color: t.text },

    list: {
      flex: 1,
      borderRadius: RADIUS.panel,
      borderWidth: 1,
      borderColor: t.border,
      backgroundColor: t.surface,
    },
    listContent: { padding: SPACE.sm },
    friendRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: SPACE.md,
      paddingVertical: SPACE.sm,
      paddingHorizontal: SPACE.sm,
    },
    friendAvatar: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: t.surfaceRaised,
      borderWidth: 1,
      borderColor: t.border,
    },
    friendName: { ...TYPE.label, color: t.text, flex: 1 },
    removeBtn: {
      paddingHorizontal: SPACE.md,
      height: 32,
      justifyContent: "center",
      borderRadius: RADIUS.pill,
      borderWidth: 1,
      borderColor: t.border,
      backgroundColor: t.bg,
    },
    removeText: { ...TYPE.labelSm, color: t.textDim },

    empty: { ...TYPE.body, color: t.textFaint, textAlign: "center", padding: SPACE.lg },
    emptyPane: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: RADIUS.panel,
      borderWidth: 1,
      borderColor: t.border,
      backgroundColor: t.surface,
    },
  });
