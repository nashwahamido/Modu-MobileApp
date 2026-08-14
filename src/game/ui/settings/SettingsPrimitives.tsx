// The row vocabulary every settings surface is built from, and the styles they share. Visual language adopted from the on-release engine: a compact arrow Stepper (‹ Value ›) for multi-choice settings, Switch rows for booleans.
//
// Split out of SettingsControls so the two panels — the tabbed /settings screen and the reduced in-build gear panel — compose the SAME rows instead of each carrying a copy that can drift.
import { StyleSheet, Pressable, Switch, Text, View } from "react-native";
import { useFixedStyles, useTheme, FONT } from "@/src/game/ui/system/theme";
import type { Theme } from "@/src/game/ui/system/theme";

export function Stepper<T extends string>({
  label,
  desc,
  value,
  options,
  onChange,
}: {
  label: string;
  desc?: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  const styles = useFixedStyles(makeSettingsStyles);
  const idx = Math.max(0, options.findIndex((o) => o.value === value));
  const go = (dir: number) =>
    onChange(options[(idx + dir + options.length) % options.length].value);
  return (
    <View style={styles.stepperRow}>
      <View style={styles.rowText}>
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

/** Two/N pills in a row (the "old" segmented style) — clearer than arrows for a small option set. */
export function Segmented<T extends string>({
  label,
  desc,
  value,
  options,
  onChange,
}: {
  label: string;
  desc?: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  const styles = useFixedStyles(makeSettingsStyles);
  return (
    <View style={styles.segBlock}>
      <Text style={styles.rowLabel}>{label}</Text>
      {desc ? <Text style={styles.rowDesc}>{desc}</Text> : null}
      <View style={styles.segRow}>
        {options.map((o) => {
          const active = o.value === value;
          return (
            <Pressable
              key={o.value}
              onPress={() => onChange(o.value)}
              hitSlop={4}
              style={[styles.segBtn, active && styles.segBtnActive]}
            >
              <Text
                style={[styles.segText, active && styles.segTextActive]}
                numberOfLines={1}
              >
                {o.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

/** Auto-pick the control: pills for a small set (<3), arrow stepper for more. */
export function Choice<T extends string>(props: {
  label: string;
  desc?: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return props.options.length < 3 ? <Segmented {...props} /> : <Stepper {...props} />;
}

export function Row({
  label,
  desc,
  value,
  onValueChange,
}: {
  label: string;
  desc?: string;
  value: boolean;
  onValueChange: (v: boolean) => void;
}) {
  const styles = useFixedStyles(makeSettingsStyles);
  const t = useTheme();
  return (
    <View style={styles.switchRow}>
      <View style={styles.rowText}>
        <Text style={styles.rowLabel}>{label}</Text>
        {desc ? <Text style={styles.rowDesc}>{desc}</Text> : null}
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ false: t.surfaceInset, true: t.accent }}
        thumbColor={value ? t.onAccent : t.surface}
        ios_backgroundColor={t.surfaceInset}
      />
    </View>
  );
}

export function SectionHeader({ children }: { children: string }) {
  const styles = useFixedStyles(makeSettingsStyles);
  return <Text style={styles.section}>{children}</Text>;
}

/** A row that ACTS rather than storing a value — Restart assembly, Log out, Delete account. `tone` picks the label colour: "danger" for the destructive ones, "text" for the rest. */
export function ActionRow({
  label,
  desc,
  onPress,
  disabled = false,
  tone = "danger",
}: {
  label: string;
  desc?: string;
  onPress: () => void;
  disabled?: boolean;
  tone?: "danger" | "text";
}) {
  const styles = useFixedStyles(makeSettingsStyles);
  return (
    <Pressable
      style={[styles.actionRow, disabled && styles.actionRowIdle]}
      onPress={onPress}
      disabled={disabled}
      hitSlop={6}
    >
      <Text style={[styles.actionText, tone === "text" && styles.actionTextQuiet]}>
        {label}
      </Text>
      {desc ? <Text style={styles.actionDesc}>{desc}</Text> : null}
    </Pressable>
  );
}

export const makeSettingsStyles = (t: Theme) =>
  StyleSheet.create({
  list: { gap: 2 },
  section: {
    fontFamily: FONT, fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.5,
    textTransform: "uppercase",
    color: t.gold,
    marginTop: 16,
    marginBottom: 4,
  },
  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: t.border,
  },
  stepperRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: t.border,
  },
  rowText: { flex: 1, paddingRight: 12 },
  rowLabel: { fontFamily: FONT, fontSize: 15, fontWeight: "700", color: t.text },
  rowDesc: { fontFamily: FONT, fontSize: 12, color: t.textDim, marginTop: 2 },
  stepper: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: t.surfaceRaised,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: t.border,
  },
  segBlock: {
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: t.border,
  },
  segRow: { flexDirection: "row", gap: 6, marginTop: 8 },
  segBtn: {
    flex: 1,
    minHeight: 40,
    borderRadius: 10,
    backgroundColor: t.surfaceRaised,
    borderWidth: 1,
    borderColor: t.border,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6,
  },
  // Active segment = ACCENT, not success green. Green means a step is DONE; a chosen setting is a live selection, which is what the accent means.
  segBtnActive: { backgroundColor: t.accent, borderColor: t.accent },
  segText: { fontFamily: FONT, fontSize: 12.5, fontWeight: "700", color: t.textDim, textAlign: "center" },
  segTextActive: { color: t.onAccent },
  arrow: { paddingHorizontal: 12, paddingVertical: 6 },
  arrowText: { fontFamily: FONT, fontSize: 20, fontWeight: "700", color: t.accent, lineHeight: 22 },
  stepperValue: {
    minWidth: 92,
    textAlign: "center",
    fontFamily: FONT, fontSize: 13,
    fontWeight: "700",
    color: t.text,
  },
  fontStepper: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: t.surfaceRaised,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: t.border,
  },
  fontBtn: { paddingHorizontal: 12, paddingVertical: 6 },
  actionRow: {
    backgroundColor: t.surfaceRaised,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: t.border,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginTop: 4,
  },
  actionRowIdle: { opacity: 0.45 },
  actionText: { fontFamily: FONT, fontSize: 15, fontWeight: "700", color: t.danger },
  actionTextQuiet: { color: t.text },
  actionDesc: { fontFamily: FONT, fontSize: 12, color: t.textDim, marginTop: 2 },
  });
