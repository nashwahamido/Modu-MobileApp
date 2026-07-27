// Presentation for room. Only styling lives here — no state, no data, no handlers.

import { StyleSheet } from "react-native";

// Static sheet on purpose: the error boundary is a class component and cannot call the useStyles hook.
export const styles = StyleSheet.create({
  fallback: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    backgroundColor: "#F3ECE0",
    padding: 28,
  },
  title: { color: "#231F20", fontSize: 22, fontWeight: "900", textAlign: "center" },
  message: { color: "#665f55", fontSize: 14, fontWeight: "700", textAlign: "center" },
});
