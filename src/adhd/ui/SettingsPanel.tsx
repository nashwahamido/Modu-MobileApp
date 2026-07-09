import { Pressable, StyleSheet, Switch, Text, View } from "react-native";

import { useGameStore } from "@/src/adhd/core/store";
import { FurnitureStyle, LightingChoice } from "@/src/adhd/core/type";

function Row({
  label,
  desc,
  value,
  onValueChange,
}: {
  label: string;
  desc: string;
  value: boolean;
  onValueChange: (v: boolean) => void;
}) {
  return (
    <View style={styles.row}>
      <View style={styles.rowText}>
        <Text style={styles.rowLabel}>{label}</Text>
        <Text style={styles.rowDesc}>{desc}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ false: "#c9c2b4", true: "#6f8a68" }}
        thumbColor="#fff"
      />
    </View>
  );
}

const STYLE_OPTIONS: { value: FurnitureStyle; label: string }[] = [
  { value: "realistic", label: "Hyper Realistic" },
  { value: "cozy", label: "Cozy" },
  { value: "cartoonish", label: "Cartoonish" },
];

const LIGHTING_OPTIONS: { value: LightingChoice; label: string }[] = [
  { value: "auto", label: "Auto" },
  { value: "studio", label: "Studio" },
  { value: "warm", label: "Warm" },
  { value: "soft", label: "Soft" },
  { value: "golden", label: "Golden" },
];

/** Compact arrow stepper: label on the left, "‹ Value ›" on the right. */
function Stepper({
  label,
  desc,
  value,
  options,
  onChange,
}: {
  label: string;
  desc?: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
}) {
  const idx = Math.max(
    0,
    options.findIndex((o) => o.value === value),
  );
  const go = (dir: number) =>
    onChange(options[(idx + dir + options.length) % options.length].value);
  return (
    <View style={styles.stepperRow}>
      <View style={styles.stepperText}>
        <Text style={styles.rowLabel}>{label}</Text>
        {desc ? <Text style={styles.rowDesc}>{desc}</Text> : null}
      </View>
      <View style={styles.stepper}>
        <Pressable onPress={() => go(-1)} style={styles.arrow} hitSlop={8}>
          <Text style={styles.arrowText}>‹</Text>
        </Pressable>
        <Text style={styles.stepperValue} numberOfLines={1}>
          {options[idx].label}
        </Text>
        <Pressable onPress={() => go(1)} style={styles.arrow} hitSlop={8}>
          <Text style={styles.arrowText}>›</Text>
        </Pressable>
      </View>
    </View>
  );
}

/**
 * Settings panel. The Focus / Hints / Auto-View accessibility toggles live as
 * on-screen chips; this panel holds display + other settings.
 */
export function SettingsPanel({ onClose }: { onClose: () => void }) {
  const settings = useGameStore((s) => s.settings);
  const setSettings = useGameStore((s) => s.setSettings);

  return (
    <View style={styles.backdrop} pointerEvents="box-none">
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      <View style={styles.panel}>
        <Text style={styles.title}>Settings</Text>
        <Stepper
          label="Style"
          desc="Table look & backdrop"
          value={settings.style}
          options={STYLE_OPTIONS}
          onChange={(v) => setSettings({ style: v as FurnitureStyle })}
        />
        <Stepper
          label="Lighting"
          desc="Auto = each style's natural rig"
          value={settings.lightingPreset}
          options={LIGHTING_OPTIONS}
          onChange={(v) => setSettings({ lightingPreset: v as LightingChoice })}
        />
        <Row
          label="Hints"
          desc="Show the ghost placement guides"
          value={settings.showHints}
          onValueChange={(v) => setSettings({ showHints: v })}
        />
        <Row
          label="Dark mode"
          desc="Use the dark background theme"
          value={settings.darkMode}
          onValueChange={(v) => setSettings({ darkMode: v })}
        />
        <Row
          label="Toon shader"
          desc="Cel-shaded calendula table, keeps the outline (test)"
          value={settings.toonShader}
          onValueChange={(v) => setSettings({ toonShader: v })}
        />
        <Pressable style={styles.done} onPress={onClose} hitSlop={8}>
          <Text style={styles.doneText}>Done</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(20,18,15,0.35)",
    alignItems: "center",
    justifyContent: "center",
  },
  panel: {
    width: 320,
    maxWidth: "86%",
    backgroundColor: "#f7f3ea",
    borderRadius: 18,
    padding: 18,
    gap: 6,
    shadowColor: "#000",
    shadowOpacity: 0.25,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  title: {
    fontSize: 17,
    fontWeight: "800",
    color: "#2e2a24",
    marginBottom: 6,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: "rgba(60,50,40,0.08)",
  },
  rowText: { flex: 1, paddingRight: 12 },
  rowLabel: { fontSize: 15, fontWeight: "700", color: "#2e2a24" },
  rowDesc: { fontSize: 12, color: "#7a7163", marginTop: 2 },
  styleBlock: { paddingVertical: 10 },
  segment: { flexDirection: "row", gap: 6, marginTop: 10 },
  segBtn: {
    flex: 1,
    minHeight: 46,
    borderRadius: 10,
    backgroundColor: "#ece6d8",
    borderWidth: 1,
    borderColor: "rgba(60,50,40,0.12)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  segBtnActive: { backgroundColor: "#6f8a68", borderColor: "#6f8a68" },
  segText: {
    fontSize: 11.5,
    fontWeight: "700",
    color: "#5a5346",
    textAlign: "center",
  },
  segTextActive: { color: "#fff" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 10 },
  chip: {
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 9,
    backgroundColor: "#ece6d8",
    borderWidth: 1,
    borderColor: "rgba(60,50,40,0.12)",
  },
  chipActive: { backgroundColor: "#6f8a68", borderColor: "#6f8a68" },
  chipText: { fontSize: 12.5, fontWeight: "700", color: "#5a5346" },
  chipTextActive: { color: "#fff" },
  stepperRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
  },
  stepperText: { flex: 1, paddingRight: 12 },
  stepper: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#ece6d8",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(60,50,40,0.12)",
  },
  arrow: { paddingHorizontal: 12, paddingVertical: 6 },
  arrowText: {
    fontSize: 20,
    fontWeight: "700",
    color: "#6f8a68",
    lineHeight: 22,
  },
  stepperValue: {
    minWidth: 88,
    textAlign: "center",
    fontSize: 13,
    fontWeight: "700",
    color: "#3a352c",
  },
  done: {
    marginTop: 12,
    alignSelf: "flex-end",
    backgroundColor: "#6f8a68",
    borderRadius: 12,
    paddingHorizontal: 18,
    paddingVertical: 9,
  },
  doneText: { color: "#fff", fontWeight: "700", fontSize: 14 },
});