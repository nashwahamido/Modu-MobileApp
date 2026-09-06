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

const SettingsSize = createContext<{ k: number; wide: boolean }>({ k: 1, wide: false });

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

export function useSettingsStyles() {
  return useScaledStyles(makeSettingsStyles, useContext(SettingsSize).k);
}

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
  segBtnTight: { flex: 0, minWidth: 92, paddingHorizontal: 12 },
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
  meterRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: t.surfaceRaised,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: t.border,
  },
  meter: { flexDirection: "row", alignItems: "flex-end", gap: 2, height: 18, paddingHorizontal: 2 },
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
