// Presentation for settings. Only styling lives here — no state, no data, no handlers.

import { StyleSheet } from "react-native";
import { SPACE, TYPE } from "@/src/game/ui/theme";
import type { Theme } from "@/src/game/ui/theme";

export const makeStyles = (t: Theme) =>
  StyleSheet.create({
  root: { flex: 1, backgroundColor: t.bg },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingBottom: SPACE.md,
    borderBottomWidth: StyleSheet.hairlineWidth * 2,
    borderBottomColor: t.border,
  },
  back: { minWidth: 64 },
  // The back affordance is the only pressable thing in the header, so it carries the
  // accent — nothing else here should look tappable.
  backText: { ...TYPE.label, fontSize: 16, color: t.accent },
  title: { ...TYPE.title, color: t.text },
  scroll: { paddingTop: SPACE.sm },
  });
