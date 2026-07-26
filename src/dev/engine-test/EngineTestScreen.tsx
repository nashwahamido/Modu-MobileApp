import { useEffect } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import {
  Radius,
  Spacing,
  Status,
  Surface,
  typeScale,
} from "./theme";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColorScheme } from "@/src/hooks/use-color-scheme";
import { useScreenOrientationLock } from "@/src/hooks/use-screen-orientation-lock";
import { useGameStore } from "@/src/game/core/store";
import { labelFor } from "@/src/game/core/presentation/labels";
import { instructionText } from "@/src/game/core/presentation/instructions";
import type {
  AssemblyMode,
  ClusterId,
  FurnitureId,
  PartId,
  TextLevel,
} from "@/src/game/core/type";
import {
  FURNITURE_METAS,
  isPlayable,
  loadFurnitureById,
} from "@/src/game/content/furnitures/furnitures";
import { OrientationLock } from "expo-screen-orientation";
import { availableInMode } from "@/src/game/core/evaluation/availability";
import {
  clusterLabel,
  currentStageForClusterFocus,
  focusableClusterIds,
  requiresClusterFocus,
} from "@/src/game/core/evaluation/clusters";

const LEVELS: TextLevel[] = ["standard", "simple"];
const TEST_DENSITY = 0.74;
const DEFAULT_FURNITURE_ID: FurnitureId = "dalfred-stool";

function loadHarnessFurniture(id: FurnitureId) {
  loadFurnitureById(id).then((f) => useGameStore.getState().loadFurniture(f));
}

export default function EngineTestScreen() {
  useScreenOrientationLock(OrientationLock.LANDSCAPE);
  const insets = useSafeAreaInsets();

  const scheme = useColorScheme() ?? "light";
  const C = Surface[scheme];

  const furniture = useGameStore((s) => s.furniture);
  const settings = useGameStore((s) => s.settings);
  const examine = useGameStore((s) => s.examine);
  const activeCluster = useGameStore((s) => s.activeCluster);
  const completed = useGameStore((s) => s.completed);
  const mode = useGameStore((s) => s.mode);
  const heldActionId = useGameStore((s) => s.heldActionId);
  const fitState = useGameStore((s) => s.fitState);
  const matchedActionId = useGameStore((s) => s.matchedActionId);

  useEffect(() => {
    if (!useGameStore.getState().furniture) loadHarnessFurniture(DEFAULT_FURNITURE_ID);
  }, []);

  const store = useGameStore.getState();
  const level = settings.textLevel;
  const t = typeScale(Math.min(settings.fontScale, 1.15) * TEST_DENSITY);

  if (!furniture) return <View style={{ flex: 1, backgroundColor: C.bg }} />;

  const clusterIds = focusableClusterIds(furniture);
  const needsFocusChoice = requiresClusterFocus(furniture);
  const available = availableInMode(
    furniture,
    new Set(completed),
    mode,
    activeCluster,
  );
  const completedCount = completed.length;
  const totalCount = furniture.actions.length;
  const done = completedCount === totalCount && totalCount > 0;
  const pct = totalCount ? Math.round((completedCount / totalCount) * 100) : 0;
  const lastCompleted = completed[completed.length - 1];
  const stage = currentStageForClusterFocus(furniture, new Set(completed), activeCluster);
  const firstStructuralPart = Object.values(furniture.parts).find((part) => part.type === "structural");
  const examineText = examine
    ? examine.kind === "part"
      ? `part: ${examine.partId}`
      : `cluster: ${examine.cluster}`
    : "—";

  const clusterOf = (partId?: PartId, cluster?: ClusterId) =>
    cluster ?? (partId ? furniture.parts[partId]?.cluster : undefined) ?? "—";

  const chip = (text: string, bg: string, fg = "#fff") => (
    <View style={[styles.chip, { backgroundColor: bg }]}>
      <Text style={{ color: fg, fontSize: t.caption, fontWeight: "600" }}>{text}</Text>
    </View>
  );

  const stateRow = (label: string, value: string) => (
    <View style={[styles.stateRow, { backgroundColor: C.card, borderColor: C.border }]}>
      <Text style={{ color: C.muted, fontSize: t.caption, fontWeight: "700" }}>{label}</Text>
      <Text style={{ color: C.text, fontSize: t.body, fontWeight: "600" }}>{value}</Text>
    </View>
  );

  return (
    <ScrollView
      style={{ backgroundColor: C.bg }}
      contentContainerStyle={[
        styles.content,
        {
          paddingTop: insets.top + 8,
          paddingBottom: insets.bottom + 24,
          paddingLeft: insets.left + 12,
          paddingRight: insets.right + 12,
        },
      ]}
    >
      {}
      <Text style={{ color: C.text, fontSize: t.title, fontWeight: "800" }}>{furniture.meta.id}</Text>
      <View style={styles.chipRow}>
        {chip(`${completedCount}/${totalCount} steps`, C.primary, C.onPrimary)}
        {chip(`★ ${completedCount * furniture.xpPerStep} XP`, C.cardAlt, C.text)}
        {chip(`stage ${stage}`, C.cardAlt, C.text)}
      </View>
      <View style={[styles.bar, { backgroundColor: C.cardAlt }]}>
        <View style={{ width: `${pct}%`, height: "100%", borderRadius: Radius.pill, backgroundColor: Status.ready }} />
      </View>
      <View style={styles.stepControls}>
        <Pressable
          disabled={completedCount === 0}
          onPress={() => store.undoLastAction()}
          style={[
            styles.controlButton,
            {
              backgroundColor: completedCount === 0 ? C.cardAlt : C.card,
              borderColor: C.border,
              opacity: completedCount === 0 ? 0.55 : 1,
            },
          ]}>
          <Text style={{ color: completedCount === 0 ? C.muted : C.text, fontSize: t.body, fontWeight: "700" }}>
            Back step
          </Text>
        </Pressable>
        <Pressable onPress={() => store.reset()} style={[styles.controlButton, { backgroundColor: C.card, borderColor: Status.wrong }]}>
          <Text style={{ color: Status.wrong, fontSize: t.body, fontWeight: "700" }}>Reset</Text>
        </Pressable>
      </View>

      <Text style={[styles.h, { color: C.muted, fontSize: t.caption }]}>FURNITURE</Text>
      <View style={styles.compactRow}>
        {FURNITURE_METAS.map((meta) => {
          const selectable = isPlayable(meta.id);
          const selected = furniture.meta.id === meta.id;
          return (
            <Pressable
              key={meta.id}
              disabled={!selectable}
              onPress={() => loadHarnessFurniture(meta.id)}
              style={[
                styles.toggle,
                {
                  backgroundColor: selected ? C.primary : C.card,
                  borderColor: C.border,
                  opacity: selectable ? 1 : 0.48,
                },
              ]}
            >
              <Text
                style={{
                  color: selected ? C.onPrimary : C.text,
                  fontSize: t.body,
                  fontWeight: "700",
                }}
              >
                {meta.id}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {needsFocusChoice ? (
        <>
          <Text style={[styles.h, { color: C.muted, fontSize: t.caption }]}>FOCUS</Text>
          <View style={styles.compactRow}>
            {clusterIds.map((clusterId) => {
              const selected = activeCluster === clusterId;
              return (
                <Pressable
                  key={clusterId}
                  onPress={() => store.setActiveCluster(clusterId)}
                  style={[
                    styles.toggle,
                    {
                      backgroundColor: selected ? C.primary : C.card,
                      borderColor: C.border,
                    },
                  ]}
                >
                  <Text
                    style={{
                      color: selected ? C.onPrimary : C.text,
                      fontSize: t.body,
                      fontWeight: "700",
                    }}
                  >
                    {clusterLabel(furniture, clusterId)}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </>
      ) : null}

      {}
      <Text style={[styles.h, { color: C.muted, fontSize: t.caption }]}>
        {done ? "✓ BUILT!" : `AVAILABLE NOW — ${available.length}`}
      </Text>
      {done && (
        <Text style={{ color: Status.done, fontSize: t.step, fontWeight: "800", marginBottom: Spacing.xs }}>
          Assembled! +{furniture.xpBonusOnComplete} bonus XP 🎉
        </Text>
      )}
      {available.map((a) => {
        const cl = clusterOf(a.partId, a.cluster);
        const clusterColor = cl === "base" ? Status.discover : cl === "seat" ? Status.attention : C.muted;
        const grp = a.partId ? furniture.parts[a.partId]?.group : undefined;
        return (
          <Pressable
            key={a.actionId}
            onPress={() => store.completeAction(a.actionId)}
            style={[styles.card, { backgroundColor: C.card, borderColor: C.border }]}>
            <Text style={{ color: C.text, fontSize: t.step, fontWeight: "600" }}>
              {instructionText(furniture.instructions, a.actionId, level) || a.actionId}
            </Text>
            <Text style={{ color: clusterColor, fontSize: t.caption, fontWeight: "700", marginTop: 2 }}>
              {[
                cl,
                a.type.replace("Fastener", "").replace("Part", ""),
                grp ? labelFor(furniture.labels, grp, level) : undefined,
              ].filter(Boolean).join(" / ")}
            </Text>
          </Pressable>
        );
      })}

      {}
      <Text style={[styles.h, { color: C.muted, fontSize: t.caption }]}>INTERACTION STATE</Text>
      <View style={styles.stateGrid}>
        {stateRow("Furniture", furniture.meta.id)}
        {stateRow("Active cluster", activeCluster ?? "—")}
        {stateRow("Examining", examineText)}
        {stateRow("Held action", heldActionId ?? "—")}
        {stateRow("Fit state", matchedActionId ? `${fitState} → ${matchedActionId}` : fitState)}
        {stateRow("Last completed", lastCompleted ?? "—")}
      </View>
      <View style={styles.compactRow}>
        {firstStructuralPart ? (
          <Pressable
            onPress={() => store.examinePart(firstStructuralPart.partId)}
            style={[styles.toggle, { backgroundColor: C.card, borderColor: C.border }]}
          >
            <Text style={{ color: C.text, fontSize: t.body }}>
              examine {labelFor(furniture.labels, firstStructuralPart.group, level).toLowerCase()}
            </Text>
          </Pressable>
        ) : null}
      </View>

      {}
      <View style={[styles.settingsPanel, { backgroundColor: C.card, borderColor: C.border }]}>
        <Text style={[styles.h, { color: C.muted, fontSize: t.caption }]}>TEXT</Text>
        <View style={styles.compactRow}>
          {LEVELS.map((lv) => (
            <Pressable
              key={lv}
              onPress={() => store.setSettings({ textLevel: lv })}
              style={[styles.toggle, { backgroundColor: lv === level ? C.primary : C.card, borderColor: C.border }]}>
              <Text style={{ color: lv === level ? C.onPrimary : C.text, fontSize: t.body, fontWeight: "600" }}>{lv}</Text>
            </Pressable>
          ))}
          <Pressable
            onPress={() => store.setSettings({ audio: !settings.audio })}
            style={[styles.toggle, { backgroundColor: settings.audio ? C.primary : C.card, borderColor: C.border }]}>
            <Text style={{ color: settings.audio ? C.onPrimary : C.text, fontSize: t.body, fontWeight: "600" }}>audio</Text>
          </Pressable>
        </View>
        <Text style={[styles.h, { color: C.muted, fontSize: t.caption }]}>FONT {settings.fontScale.toFixed(2)}x</Text>
        <View style={styles.compactRow}>
          <Pressable onPress={() => store.setSettings({ fontScale: Math.max(0.8, +(settings.fontScale - 0.1).toFixed(2)) })} style={[styles.toggle, { backgroundColor: C.card, borderColor: C.border }]}>
            <Text style={{ color: C.text, fontSize: t.body, fontWeight: "700" }}>A−</Text>
          </Pressable>
          <Pressable onPress={() => store.setSettings({ fontScale: Math.min(2, +(settings.fontScale + 0.1).toFixed(2)) })} style={[styles.toggle, { backgroundColor: C.card, borderColor: C.border }]}>
            <Text style={{ color: C.text, fontSize: t.body, fontWeight: "700" }}>A+</Text>
          </Pressable>
        </View>
      </View>

    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: Spacing.md, paddingTop: Spacing.sm, paddingBottom: Spacing.lg },
  h: { marginTop: Spacing.sm, marginBottom: Spacing.xs, fontWeight: "700", letterSpacing: 0 },
  bar: { height: 6, borderRadius: Radius.pill, marginTop: Spacing.xs, overflow: "hidden" },
  chipRow: { flexDirection: "row", gap: Spacing.xs, marginTop: 2, alignItems: "center", flexWrap: "wrap" },
  chip: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: Radius.pill },
  compactRow: { flexDirection: "row", gap: Spacing.xs, marginTop: Spacing.xs, flexWrap: "wrap", alignItems: "center" },
  settingsPanel: {
    borderRadius: Radius.md,
    borderWidth: 1,
    marginTop: Spacing.sm,
    paddingHorizontal: Spacing.sm,
    paddingBottom: Spacing.xs,
  },
  stateGrid: { gap: Spacing.xs },
  stateRow: {
    minHeight: 36,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: Radius.md,
    borderWidth: 1,
    justifyContent: "center",
  },
  stepControls: { flexDirection: "row", gap: Spacing.xs, marginTop: Spacing.xs, flexWrap: "wrap" },
  controlButton: {
    minHeight: 38,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: Radius.md,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  toggle: { minHeight: 38, paddingHorizontal: Spacing.md, borderRadius: Radius.md, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  card: { minHeight: 42, paddingVertical: 7, paddingHorizontal: Spacing.md, borderRadius: Radius.md, borderWidth: 1, marginBottom: Spacing.xs },
});
