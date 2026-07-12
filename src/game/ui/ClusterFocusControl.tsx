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
import { Theme, useStyles } from "@/src/game/ui/theme";
import type { ClusterId } from "@/src/game/core/type";

export function ClusterFocusControl() {
  const styles = useStyles(makeStyles);
  const furniture = useGameStore((s) => s.furniture);
  const completed = useGameStore((s) => s.completed);
  const activeCluster = useGameStore((s) => s.activeCluster);

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
        <View style={[styles.panel]}>
          <Text style={[styles.title]}>
            Choose a section to build
          </Text>
          <Text style={[styles.subtitle]}>
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
                    finished && styles.optionFinished,
                    !enabled && !finished && styles.optionLocked,
                  ]}
                >
                  <Text
                    style={[
                      styles.optionLabel,
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
    <View style={[styles.switcher]}>
      {/* <Text style={[styles.kicker]}>FOCUS</Text>
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
                selected && styles.chipSelected,
                finished && styles.chipFinished,
                !enabled && !finished && !selected && styles.chipDisabled,
              ]}
            >
              <Text
                style={[
                  styles.chipText,
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

const makeStyles = (t: Theme) =>
  StyleSheet.create({
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
    backgroundColor: t.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: t.border,
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
  title: {
    color: t.text,
    fontSize: 18,
    fontWeight: "800",
    letterSpacing: 0.2,
  },
  subtitle: { color: t.textDim, fontSize: 13, lineHeight: 18, marginBottom: 6 },
  optionList: { gap: 10 },
  option: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: 54,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: t.borderStrong,
    backgroundColor: t.surface,
    paddingHorizontal: 16,
  },
  optionFinished: { backgroundColor: t.success, borderColor: t.success },
  optionLocked: { opacity: 0.5 },
  optionLabel: { color: t.text, fontSize: 16, fontWeight: "800" },
  optionLabelFinished: { color: t.success },
  optionMeta: { color: t.accent, fontSize: 13, fontWeight: "800" },
  optionMetaFinished: { color: t.success },
  optionMetaLocked: { color: t.textFaint },

  switcher: {
    // Top-right, in the strip above the parts tray (tray starts at top:70). Kicker dropped so the compact chip row fits.
    position: "absolute",
    right: 14,
    top: 10,
    backgroundColor: t.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: t.border,
    paddingHorizontal: 10,
    paddingTop: 6,
    paddingBottom: 8,
    gap: 5,
    zIndex: 8,
    elevation: 8,
  },
  kicker: {
    color: t.textFaint,
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 1,
  },
  chipRow: { flexDirection: "row", gap: 6 },
  chip: {
    minHeight: 32,
    justifyContent: "center",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: t.borderStrong,
    backgroundColor: t.surface,
    paddingHorizontal: 12,
  },
  chipSelected: { backgroundColor: t.accent, borderColor: t.accent },
  chipFinished: { backgroundColor: t.success, borderColor: t.success },
  chipDisabled: { opacity: 0.42 },
  chipText: { color: t.text, fontSize: 12, fontWeight: "800" },
  chipTextSelected: { color: t.text },
  chipTextFinished: { color: t.success },

  textLight: { color: t.text },
  });
