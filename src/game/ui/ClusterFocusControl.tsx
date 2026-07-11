import * as Haptics from "expo-haptics";
import { Pressable, StyleSheet, Text, View } from "react-native";
import {
  clusterComplete,
  clusterLabel,
  clusterPrereqsMet,
  focusableClusterIds,
  requiresClusterFocus,
} from "@/src/game/core/evaluation/clusters";
import { useGameStore } from "@/src/game/core/store";
import type { ClusterId } from "@/src/game/core/type";

export function ClusterFocusControl() {
  const furniture = useGameStore((s) => s.furniture);
  const completed = useGameStore((s) => s.completed);
  const activeCluster = useGameStore((s) => s.activeCluster);
  const dark = useGameStore((s) => s.theme === "dark");

  if (!furniture || !requiresClusterFocus(furniture)) return null;

  const done = new Set(completed);
  const clusters = focusableClusterIds(furniture);
  const choosing = !activeCluster;

  const selectCluster = (clusterId: ClusterId) => {
    useGameStore.getState().setActiveCluster(clusterId);
    Haptics.selectionAsync();
  };

  if (choosing) {
    return (
      <View style={styles.scrim}>
        <View style={[styles.panel, dark && styles.panelDark]}>
          <Text style={[styles.title, dark && styles.textLight]}>
            Choose a section to build
          </Text>
          <Text style={[styles.subtitle, dark && styles.subtitleDark]}>
            Work on one sub-assembly at a time — you can switch whenever you like.
          </Text>
          <View style={styles.optionList}>
            {clusters.map((clusterId) => {
              const finished = clusterComplete(furniture, clusterId, done);
              const enabled =
                !finished && clusterPrereqsMet(furniture, clusterId, done);
              return (
                <Pressable
                  key={clusterId}
                  disabled={!enabled}
                  onPress={() => selectCluster(clusterId)}
                  style={[
                    styles.option,
                    dark && styles.optionDark,
                    finished && styles.optionFinished,
                    !enabled && !finished && styles.optionLocked,
                  ]}
                >
                  <Text
                    style={[
                      styles.optionLabel,
                      dark && styles.textLight,
                      finished && styles.optionLabelFinished,
                    ]}
                  >
                    {clusterLabel(furniture, clusterId)}
                  </Text>
                  <Text
                    style={[
                      styles.optionMeta,
                      finished && styles.optionMetaFinished,
                      !enabled && !finished && styles.optionMetaLocked,
                    ]}
                  >
                    {finished ? "✓ Done" : enabled ? "Build  ›" : "Locked"}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.switcher, dark && styles.switcherDark]}>
      {/* <Text style={[styles.kicker, dark && styles.kickerDark]}>FOCUS</Text>
      NOTE: Compact: no "FOCUS" kicker — the cluster chips are self-explanatory. */}
      <View style={styles.chipRow}>
        {clusters.map((clusterId) => {
          const selected = activeCluster === clusterId;
          const finished = clusterComplete(furniture, clusterId, done);
          const enabled =
            !finished && clusterPrereqsMet(furniture, clusterId, done);
          return (
            <Pressable
              key={clusterId}
              disabled={!enabled && !selected}
              onPress={() => selectCluster(clusterId)}
              style={[
                styles.chip,
                dark && styles.chipDark,
                selected && styles.chipSelected,
                finished && styles.chipFinished,
                !enabled && !finished && !selected && styles.chipDisabled,
              ]}
            >
              <Text
                style={[
                  styles.chipText,
                  dark && styles.textLight,
                  selected && styles.chipTextSelected,
                  finished && !selected && styles.chipTextFinished,
                ]}
              >
                {finished
                  ? `✓ ${clusterLabel(furniture, clusterId)}`
                  : clusterLabel(furniture, clusterId)}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  scrim: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    zIndex: 20,
    elevation: 20,
  },
  panel: {
    width: "100%",
    maxWidth: 340,
    backgroundColor: "#fffdfa",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(60,50,40,0.14)",
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 16,
    gap: 6,
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 10 },
    elevation: 12,
  },
  panelDark: {
    backgroundColor: "#1b2230",
    borderColor: "rgba(255,255,255,0.14)",
  },
  title: {
    color: "#2e2a24",
    fontSize: 18,
    fontWeight: "800",
    letterSpacing: 0.2,
  },
  subtitle: { color: "#7c7064", fontSize: 13, lineHeight: 18, marginBottom: 6 },
  subtitleDark: { color: "#9aa4b4" },
  optionList: { gap: 10 },
  option: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: 54,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(60,50,40,0.16)",
    backgroundColor: "#f7f3ec",
    paddingHorizontal: 16,
  },
  optionDark: {
    backgroundColor: "#232c3c",
    borderColor: "rgba(255,255,255,0.12)",
  },
  optionFinished: { backgroundColor: "#e3f6ea", borderColor: "#37c871" },
  optionLocked: { opacity: 0.5 },
  optionLabel: { color: "#2e2a24", fontSize: 16, fontWeight: "800" },
  optionLabelFinished: { color: "#2a7d4f" },
  optionMeta: { color: "#2458d3", fontSize: 13, fontWeight: "800" },
  optionMetaFinished: { color: "#37c871" },
  optionMetaLocked: { color: "#9a8f82" },

  switcher: {
    // Top-right, in the strip above the parts tray (tray starts at top:70). Kicker dropped so the compact chip row fits.
    position: "absolute",
    right: 14,
    top: 10,
    backgroundColor: "rgba(255,255,255,0.9)",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(60,50,40,0.14)",
    paddingHorizontal: 10,
    paddingTop: 6,
    paddingBottom: 8,
    gap: 5,
    zIndex: 8,
    elevation: 8,
  },
  switcherDark: {
    backgroundColor: "rgba(22,30,44,0.9)",
    borderColor: "rgba(255,255,255,0.16)",
  },
  kicker: {
    color: "#9a8f82",
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 1,
  },
  kickerDark: { color: "#8b93a3" },
  chipRow: { flexDirection: "row", gap: 6 },
  chip: {
    minHeight: 32,
    justifyContent: "center",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(60,50,40,0.16)",
    backgroundColor: "#fffdfa",
    paddingHorizontal: 12,
  },
  chipDark: {
    backgroundColor: "rgba(255,255,255,0.06)",
    borderColor: "rgba(255,255,255,0.14)",
  },
  chipSelected: { backgroundColor: "#2458d3", borderColor: "#2458d3" },
  chipFinished: { backgroundColor: "#e3f6ea", borderColor: "#37c871" },
  chipDisabled: { opacity: 0.42 },
  chipText: { color: "#2e2a24", fontSize: 12, fontWeight: "800" },
  chipTextSelected: { color: "#fff" },
  chipTextFinished: { color: "#2a7d4f" },

  textLight: { color: "#eef1f6" },
});
