// The row vocabulary every settings surface is built from, and the styles they share. Visual language adopted from the on-release engine: a compact arrow Stepper (‹ Value ›) for multi-choice settings, Switch rows for booleans.
//
// Split out of SettingsControls so the two panels — the tabbed /settings screen and the reduced in-build gear panel — compose the SAME rows instead of each carrying a copy that can drift.
import { createContext, useContext, type ReactNode } from "react";
import {
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";
import { Pressable } from "@/src/components/Pressable";
import { useScaledStyles, useTheme, FONT } from "@/src/game/ui/system/theme";
import type { Theme } from "@/src/game/ui/system/theme";

/**
 * The SIZE of the panel these rows are sitting in, published by the panel itself.
 *
 * The rows are shared by two surfaces — the tabbed /settings screen and the in-build gear popup — and
 * only one of them grows on a tablet. A context rather than a prop on every row: the sections between
 * the panel and the rows compose them by name (`<Row/>`, `<Choice/>`) and would otherwise each have to
 * thread a number through that they have no other use for.
 *
 * DEFAULTS TO THE PHONE SIZE, so a surface that says nothing is drawn exactly as it was authored.
 */
const SettingsSize = createContext<{ k: number; wide: boolean }>({ k: 1, wide: false });

/**
 * Draws the rows inside it at the panel's own scale.
 *
 * `wide` is a separate question from `k`, and both are the panel's to answer: `k` is how much bigger
 * everything is drawn, `wide` is whether the card has enough width for a Segmented row to put its
 * pills BESIDE its label instead of under it.
 */
export function SettingsSizeScope({
  k,
  wide,
  children,
}: {
  k: number;
  wide: boolean;
  children: ReactNode;
}) {
  return <SettingsSize.Provider value={{ k, wide }}>{children}</SettingsSize.Provider>;
}

/** The row sheet at the panel's scale. Every settings row reads its styles through this rather than through useFixedStyles, so one scope resizes the whole list. */
export function useSettingsStyles() {
  return useScaledStyles(makeSettingsStyles, useContext(SettingsSize).k);
}

/** Is there room to set a row's control beside its label rather than under it? */
export function useSettingsWide(): boolean {
  return useContext(SettingsSize).wide;
}

export function Stepper<T extends string>({
  label,
  desc,
  value,
  options,
  onChange,
  disabled = false,
}: {
  label: string;
  desc?: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  disabled?: boolean;
}) {
  const styles = useSettingsStyles();
  const idx = Math.max(0, options.findIndex((o) => o.value === value));
  const go = (dir: number) =>
    onChange(options[(idx + dir + options.length) % options.length].value);
  return (
    <View style={[styles.stepperRow, disabled && styles.controlIdle]}>
      <View style={styles.rowText}>
        <Text style={styles.rowLabel}>{label}</Text>
        {desc ? <Text style={styles.rowDesc}>{desc}</Text> : null}
      </View>
      <View style={styles.stepper}>
        <Pressable
          onPress={() => go(-1)}
          style={styles.arrow}
          hitSlop={8}
          disabled={disabled}
          accessibilityState={{ disabled }}
        >
          <Text style={styles.arrowText}>‹</Text>
        </Pressable>
        <Text style={styles.stepperValue} numberOfLines={1}>
          {options[idx].label}
        </Text>
        <Pressable
          onPress={() => go(1)}
          style={styles.arrow}
          hitSlop={8}
          disabled={disabled}
          accessibilityState={{ disabled }}
        >
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
  disabled = false,
}: {
  label: string;
  desc?: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  disabled?: boolean;
}) {
  const styles = useSettingsStyles();
  // ON A WIDE CARD THE PILLS COME UP BESIDE THE LABEL, which is the shape every other row already has — a switch and a stepper both sit on the right — so the list reads as one column of controls rather than as rows that sometimes break to a second line. It is also the only way the extra width reaches the LABEL: pills that stay full-width simply grow into it, and two options spread across a tablet card read as buttons rather than as a choice between them.
  const wide = useSettingsWide();
  const pills = options.map((o) => {
    const active = o.value === value;
    return (
      <Pressable
        key={o.value}
        onPress={() => onChange(o.value)}
        hitSlop={4}
        disabled={disabled}
        accessibilityState={{ selected: active, disabled }}
        style={[styles.segBtn, wide && styles.segBtnTight, active && styles.segBtnActive]}
      >
        <Text
          style={[styles.segText, active && styles.segTextActive]}
          numberOfLines={1}
        >
          {o.label}
        </Text>
      </Pressable>
    );
  });
  if (wide) {
    return (
      <View style={[styles.stepperRow, disabled && styles.controlIdle]}>
        <View style={styles.rowText}>
          <Text style={styles.rowLabel}>{label}</Text>
          {desc ? <Text style={styles.rowDesc}>{desc}</Text> : null}
        </View>
        <View style={styles.segRowTight}>{pills}</View>
      </View>
    );
  }
  return (
    <View style={[styles.segBlock, disabled && styles.controlIdle]}>
      <Text style={styles.rowLabel}>{label}</Text>
      {desc ? <Text style={styles.rowDesc}>{desc}</Text> : null}
      <View style={styles.segRow}>{pills}</View>
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
  disabled?: boolean;
}) {
  return props.options.length < 3 ? <Segmented {...props} /> : <Stepper {...props} />;
}

export function Row({
  label,
  desc,
  value,
  onValueChange,
  disabled = false,
}: {
  label: string;
  desc?: string;
  value: boolean;
  onValueChange: (v: boolean) => void;
  /** Greyed and unresponsive, but still READ: a setting that has no effect right now is better shown inert with its reason in `desc` than removed, because a row that vanishes leaves the player hunting for a switch that is not there. Same 0.45 opacity ActionRow uses, so "inert" looks the same everywhere in this panel. */
  disabled?: boolean;
}) {
  const styles = useSettingsStyles();
  const t = useTheme();
  return (
    <View style={[styles.switchRow, disabled && styles.actionRowIdle]}>
      <View style={styles.rowText}>
        <Text style={styles.rowLabel}>{label}</Text>
        {desc ? <Text style={styles.rowDesc}>{desc}</Text> : null}
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        disabled={disabled}
        trackColor={{ false: t.surfaceInset, true: t.accent }}
        thumbColor={value ? t.onAccent : t.surface}
        ios_backgroundColor={t.surfaceInset}
      />
    </View>
  );
}

export function SectionHeader({ children }: { children: string }) {
  const styles = useSettingsStyles();
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
  const styles = useSettingsStyles();
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
  // The wide card's version: no marginTop, because the pills are beside the label rather than under it, and no stretch — the row is only as wide as the pills need.
  segRowTight: { flexDirection: "row", gap: 6 },
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
  // Beside the label instead of filling the row: sized to its own text, with the stepper's minWidth as a floor so the pills, the arrow steppers and the switches all start on the same line down the right of the card.
  segBtnTight: { flex: 0, minWidth: 92, paddingHorizontal: 12 },
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
  // The music meter, in the same shell as the text-size stepper so the two rows read as one family.
  meterRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: t.surfaceRaised,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: t.border,
  },
  meter: { flexDirection: "row", alignItems: "flex-end", gap: 2, height: 18, paddingHorizontal: 2 },
  // A rung that is BELOW the level stays visible but unlit — an empty gap would read as a broken
  // meter rather than as headroom.
  meterBar: {
    width: 4,
    height: "100%",
    borderRadius: 2,
    backgroundColor: t.surfaceInset,
  },
  meterBarOn: { backgroundColor: t.accent },
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
  controlIdle: { opacity: 0.45 },
  actionText: { fontFamily: FONT, fontSize: 15, fontWeight: "700", color: t.danger },
  actionTextQuiet: { color: t.text },
  actionDesc: { fontFamily: FONT, fontSize: 12, color: t.textDim, marginTop: 2 },
  });
